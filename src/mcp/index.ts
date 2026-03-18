import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Database path: ~/.bugpack/data/ (shared with server)
const DATA_DIR = path.join(os.homedir(), '.bugpack', 'data')
const DB_PATH = path.join(DATA_DIR, 'bugpack.db')
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')

// Map file extension to MIME type
const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', html: 'text/html', md: 'text/markdown',
  json: 'application/json', xml: 'application/xml', zip: 'application/zip',
}
function extToMime(ext: string): string {
  return MIME_MAP[ext] || 'application/octet-stream'
}

function getDb() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database not found: ${DB_PATH}, please start BugPack Server first`)
  }
  return new Database(DB_PATH, { readonly: true })
}

const server = new McpServer({
  name: 'bugpack',
  version: '1.0.0',
})

// Find project ID by project name
function findProjectId(db: Database.Database, projectName?: string): string | null {
  if (!projectName) return null
  const project: any = db.prepare('SELECT id FROM projects WHERE name = ?').get(projectName)
  return project?.id || null
}

// Find bug by bug_number + project (number is unique within project)
function findBug(db: Database.Database, bugNumber: number, projectName?: string): any {
  if (projectName) {
    const projectId = findProjectId(db, projectName)
    if (projectId) {
      return db.prepare('SELECT * FROM bugs WHERE number = ? AND project_id = ?').get(bugNumber, projectId)
    }
    return null
  }
  // No project name: return first match (backward compatible)
  return db.prepare('SELECT * FROM bugs WHERE number = ?').get(bugNumber)
}

// Get project name
function getProjectName(db: Database.Database, projectId: string): string {
  const project: any = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId)
  return project?.name || ''
}

// ---- list_bugs: list all bugs to fix ----
server.tool(
  'list_bugs',
  'List all bugs grouped by project. Filter by project name or status',
  {
    status: z.string().optional().describe('Filter by status: pending/annotating/generated/fixed/closed'),
    project: z.string().optional().describe('Filter by project name'),
  },
  async ({ status, project }) => {
    const db = getDb()
    try {
    const conditions: string[] = []
    const params: any[] = []

    const validStatuses = ['pending', 'annotating', 'generated', 'fixed', 'closed']
    if (status) {
      if (!validStatuses.includes(status)) {
        return { content: [{ type: 'text', text: `Invalid status: ${status}` }] }
      }
      conditions.push('b.status = ?')
      params.push(status)
    }
    if (project) {
      const projectId = findProjectId(db, project)
      if (!projectId) {
        return { content: [{ type: 'text', text: `Project "${project}" not found` }] }
      }
      conditions.push('b.project_id = ?')
      params.push(projectId)
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''
    const query = `
      SELECT b.id, b.number, b.title, b.status, b.priority, b.project_id, b.created_at,
        (SELECT COUNT(*) FROM screenshots WHERE bug_id = b.id) as screenshot_count
      FROM bugs b${where}
      ORDER BY b.project_id, b.number DESC
    `
    const bugs = db.prepare(query).all(...params) as any[]

    if (bugs.length === 0) {
      return { content: [{ type: 'text', text: 'No bugs found' }] }
    }

    // Group by project
    const groups: Record<string, { name: string; bugs: any[] }> = {}
    for (const b of bugs) {
      if (!groups[b.project_id]) {
        groups[b.project_id] = { name: getProjectName(db, b.project_id), bugs: [] }
      }
      groups[b.project_id]!.bugs.push(b)
    }

    const lines: string[] = []
    for (const group of Object.values(groups)) {
      lines.push(`## ${group.name || 'Uncategorized'}`)
      for (const b of group.bugs) {
        lines.push(`  #${String(b.number).padStart(3, '0')} [${b.status}] [${b.priority}] ${b.title} (${b.screenshot_count} screenshots)`)
      }
      lines.push('')
    }

    return {
      content: [{ type: 'text', text: lines.join('\n').trim() }],
    }
    } finally {
      db.close()
    }
  }
)

// ---- get_bug_context: get full bug context ----
server.tool(
  'get_bug_context',
  'Get full bug context (annotated screenshots + fix instructions) for AI repair',
  {
    bug_id: z.string().optional().describe('Bug ID'),
    bug_number: z.number().optional().describe('Bug number within project, e.g. 1, 2, 3'),
    project: z.string().optional().describe('Project name to locate bug number within'),
  },
  async ({ bug_id, bug_number, project }) => {
    const db = getDb()
    try {
    let bug: any
    if (bug_id) {
      bug = db.prepare('SELECT * FROM bugs WHERE id = ?').get(bug_id)
    } else if (bug_number) {
      bug = findBug(db, bug_number, project)
    }

    if (!bug) {
      return { content: [{ type: 'text', text: 'Bug not found' }] }
    }

    const screenshots = db.prepare('SELECT * FROM screenshots WHERE bug_id = ? ORDER BY sort_order').all(bug.id) as any[]
    const projectName = getProjectName(db, bug.project_id)

    let relatedFiles: string[] = []
    try { relatedFiles = JSON.parse(bug.related_files || '[]') } catch { /* ignore */ }

    // Generate structured Markdown
    const lines: string[] = []
    const projectPrefix = projectName ? `[${projectName}] ` : ''
    lines.push(`# ${projectPrefix}Bug #${String(bug.number).padStart(3, '0')}: ${bug.title}`)
    lines.push('')

    if (bug.description) {
      lines.push('## Description')
      lines.push(bug.description)
      lines.push('')
      if (bug.description.includes('## History')) {
        lines.push('**Note:** History is sorted chronologically. The latest comments reflect the current issue to fix — earlier comments may already be resolved. Focus on the most recent entries.')
        lines.push('')
      }
    }

    if (screenshots.length > 0) {
      lines.push('## Screenshots')
      lines.push('')
    }

    if (bug.page_path || bug.device || bug.browser) {
      lines.push('## Environment')
      if (bug.page_path) lines.push(`- Page: ${bug.page_path}`)
      if (bug.device) lines.push(`- Device: ${bug.device}`)
      if (bug.browser) lines.push(`- Browser: ${bug.browser}`)
      lines.push('')
    }

    if (relatedFiles.length > 0) {
      lines.push('## Related Files')
      relatedFiles.forEach((f: string) => lines.push(`- ${f}`))
      lines.push('')
    }

    lines.push(`## Priority`)
    lines.push(bug.priority)

    // Build response content (text + images)
    const content: any[] = [{ type: 'text', text: lines.join('\n') }]

    // Attach evidence files
    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
    const MAX_BASE64_SIZE = 5 * 1024 * 1024 // 5MB, larger images use path
    for (const ss of screenshots) {
      const annotatedPath = ss.annotated_filename ? path.join(UPLOADS_DIR, ss.annotated_filename) : ''
      const originalPath = path.join(UPLOADS_DIR, ss.filename)
      const filePath = (annotatedPath && fs.existsSync(annotatedPath)) ? annotatedPath : originalPath
      if (!fs.existsSync(filePath)) continue

      const ext = path.extname(filePath).slice(1).toLowerCase()
      const fileSize = fs.statSync(filePath).size

      if (IMAGE_EXTS.includes(ext) && fileSize <= MAX_BASE64_SIZE) {
        const data = fs.readFileSync(filePath)
        const mimeType = extToMime(ext)
        content.push({ type: 'image', data: data.toString('base64'), mimeType })
      } else {
        content.push({ type: 'text', text: `[${ss.name}] ${filePath}` })
      }
    }

    return { content }
    } finally {
      db.close()
    }
  }
)

// ---- get_bug_screenshot: get bug screenshot ----
server.tool(
  'get_bug_screenshot',
  'Get annotated screenshot of a bug',
  {
    bug_number: z.number().describe('Bug number within project'),
    screenshot_index: z.number().optional().describe('Screenshot index (0-based), defaults to first'),
    project: z.string().optional().describe('Project name'),
  },
  async ({ bug_number, screenshot_index = 0, project }) => {
    const db = getDb()
    let bug: any
    let screenshots: any[]
    try {
      bug = findBug(db, bug_number, project)
      if (!bug) {
        return { content: [{ type: 'text', text: 'Bug not found' }] }
      }
      screenshots = db.prepare('SELECT * FROM screenshots WHERE bug_id = ? ORDER BY sort_order').all(bug.id) as any[]
    } finally {
      db.close()
    }

    const ss = screenshots[screenshot_index]
    if (!ss) {
      return { content: [{ type: 'text', text: `Screenshot #${screenshot_index} not found` }] }
    }

    // Prefer annotated render image
    const annotatedPath = ss.annotated_filename ? path.join(UPLOADS_DIR, ss.annotated_filename) : ''
    const originalPath = path.join(UPLOADS_DIR, ss.filename)
    const filePath = (annotatedPath && fs.existsSync(annotatedPath)) ? annotatedPath : originalPath
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text', text: 'File not found' }] }
    }

    const ext = path.extname(filePath).slice(1).toLowerCase()
    const label = `Bug #${String(bug.number).padStart(3, '0')} - ${ss.name}${ss.annotated_filename ? ' (annotated)' : ''}`
    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
    const fileSize = fs.statSync(filePath).size

    if (IMAGE_EXTS.includes(ext) && fileSize <= 5 * 1024 * 1024) {
      const data = fs.readFileSync(filePath)
      const mimeType = extToMime(ext)
      return {
        content: [
          { type: 'text', text: label },
          { type: 'image', data: data.toString('base64'), mimeType },
        ],
      }
    } else {
      return {
        content: [
          { type: 'text', text: `${label}\n${filePath}` },
        ],
      }
    }
  }
)

// ---- mark_bug_status: update status ----
server.tool(
  'mark_bug_status',
  'Update bug status (pending/fixed/closed etc.)',
  {
    bug_number: z.number().describe('Bug number within project'),
    status: z.enum(['pending', 'annotating', 'generated', 'fixed', 'closed']).describe('New status'),
    project: z.string().optional().describe('Project name'),
  },
  async ({ bug_number, status, project }) => {
    const dbPath = path.join(DATA_DIR, 'bugpack.db')
    const db = new Database(dbPath)
    try {
      const bug: any = findBug(db, bug_number, project)
      if (!bug) {
        return { content: [{ type: 'text', text: 'Bug not found' }] }
      }
      db.prepare("UPDATE bugs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, bug.id)
      const projectName = getProjectName(db, bug.project_id)
      const prefix = projectName ? `[${projectName}] ` : ''
      return {
        content: [{ type: 'text', text: `${prefix}Bug #${String(bug_number).padStart(3, '0')} status updated to: ${status}` }],
      }
    } finally {
      db.close()
    }
  }
)

// ---- add_fix_note: add fix notes ----
server.tool(
  'add_fix_note',
  'Add fix notes to bug description after AI repair',
  {
    bug_number: z.number().describe('Bug number within project'),
    note: z.string().describe('Fix notes'),
    project: z.string().optional().describe('Project name'),
  },
  async ({ bug_number, note, project }) => {
    const dbPath = path.join(DATA_DIR, 'bugpack.db')
    const db = new Database(dbPath)
    try {
      const bug: any = findBug(db, bug_number, project)
      if (!bug) {
        return { content: [{ type: 'text', text: 'Bug not found' }] }
      }

      const newDesc = bug.description
        ? `${bug.description}\n\n---\n## Fix Notes\n${note}`
        : `## Fix Notes\n${note}`

      db.prepare("UPDATE bugs SET description = ?, updated_at = datetime('now') WHERE id = ?").run(newDesc, bug.id)
      const projectName = getProjectName(db, bug.project_id)
      const prefix = projectName ? `[${projectName}] ` : ''
      return {
        content: [{ type: 'text', text: `${prefix}Fix notes added to Bug #${String(bug_number).padStart(3, '0')}` }],
      }
    } finally {
      db.close()
    }
  }
)

// Start
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => { console.error('MCP server failed to start:', err); process.exit(1) })
