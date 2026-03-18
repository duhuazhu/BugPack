import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuid } from 'uuid'
import { db, UPLOADS_DIR } from '../db.js'

export const bugsRouter = Router()

// Safe JSON parse
function safeJsonParse(str: string | null | undefined, fallback: any = []) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// Get the project upload directory for a bug
function getProjectUploadsDir(bugId: string): string {
  const bug: any = db.prepare('SELECT project_id FROM bugs WHERE id = ?').get(bugId)
  const projectId = bug?.project_id || 'default'
  const project: any = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId)
  const projectName = (project?.name || 'default').replace(/[<>:"/\\|?*]/g, '_')
  const dir = path.join(UPLOADS_DIR, projectName)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// File upload config
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = getProjectUploadsDir(req.params.id as string)
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png'
    cb(null, `${uuid()}${ext}`)
  },
})
const ALLOWED_MIMES = [
  // Images
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain', 'text/csv', 'text/html', 'text/markdown',
  // Data
  'application/json', 'application/xml', 'text/xml',
  // Archives (for logs etc.)
  'application/zip',
]
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIMES.includes(file.mimetype))
  },
})

// ---- List all bugs ----
bugsRouter.get('/', (req, res) => {
  const projectId = (req.query.project_id as string) || undefined
  const sql = projectId
    ? `SELECT b.*, (SELECT COUNT(*) FROM screenshots WHERE bug_id = b.id) as screenshot_count FROM bugs b WHERE b.project_id = ? ORDER BY b.created_at DESC`
    : `SELECT b.*, (SELECT COUNT(*) FROM screenshots WHERE bug_id = b.id) as screenshot_count FROM bugs b ORDER BY b.created_at DESC`
  const bugs = projectId ? db.prepare(sql).all(projectId) : db.prepare(sql).all()

  // Get screenshots for each bug
  const getScreenshots = db.prepare('SELECT * FROM screenshots WHERE bug_id = ? ORDER BY sort_order')

  const result = bugs.map((bug: any) => ({
    ...bug,
    relatedFiles: safeJsonParse(bug.related_files, []),
    screenshots: getScreenshots.all(bug.id).map((s: any) => ({
      id: s.id,
      url: `/uploads/${s.filename}`,
      name: s.name,
      annotated: !!s.annotated,
      annotations: safeJsonParse(s.annotations, []),
    })),
  }))

  res.json(result)
})

// ---- Get single bug ----
bugsRouter.get('/:id', (req, res) => {
  const bug: any = db.prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id)
  if (!bug) return res.status(404).json({ error: 'Bug not found' })

  const screenshots = db.prepare('SELECT * FROM screenshots WHERE bug_id = ? ORDER BY sort_order').all(bug.id)

  res.json({
    ...bug,
    relatedFiles: safeJsonParse(bug.related_files, []),
    screenshots: screenshots.map((s: any) => ({
      id: s.id,
      url: `/uploads/${s.filename}`,
      name: s.name,
      annotated: !!s.annotated,
      annotations: safeJsonParse(s.annotations, []),
    })),
  })
})

// ---- Create bug ----
bugsRouter.post('/', (req, res) => {
  const id = uuid()
  const { title = '', description = '', priority = 'medium', pagePath = '', device = '', browser = '', project_id = 'default' } = req.body

  const maxNum: any = db.prepare('SELECT MAX(number) as n FROM bugs WHERE project_id = ?').get(project_id)
  const number = (maxNum?.n || 0) + 1

  db.prepare(`
    INSERT INTO bugs (id, number, title, description, priority, page_path, device, browser, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, number, title, description, priority, pagePath, device, browser, project_id)

  const bug = db.prepare('SELECT * FROM bugs WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ ...bug, relatedFiles: [], screenshots: [] })
})

// ---- Batch update status ----
bugsRouter.patch('/batch/status', (req, res) => {
  const { ids, status } = req.body as { ids: string[]; status: string }
  if (!Array.isArray(ids) || !status) return res.status(400).json({ error: 'Invalid parameters' })
  const stmt = db.prepare("UPDATE bugs SET status = ?, updated_at = datetime('now') WHERE id = ?")
  const updateAll = db.transaction(() => {
    for (const id of ids) stmt.run(status, id)
  })
  updateAll()
  res.json({ ok: true })
})

// ---- Batch delete ----
bugsRouter.post('/batch/delete', (req, res) => {
  const { ids } = req.body as { ids: string[] }
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Invalid parameters' })
  const deleteAll = db.transaction(() => {
    for (const id of ids) {
      const screenshots: any[] = db.prepare('SELECT filename, annotated_filename FROM screenshots WHERE bug_id = ?').all(id)
      for (const ss of screenshots) {
        const filePath = path.join(UPLOADS_DIR, ss.filename)
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore file deletion error */ }
        if (ss.annotated_filename) {
          const annotatedPath = path.join(UPLOADS_DIR, ss.annotated_filename)
          try { if (fs.existsSync(annotatedPath)) fs.unlinkSync(annotatedPath) } catch { /* ignore file deletion error */ }
        }
      }
      db.prepare('DELETE FROM screenshots WHERE bug_id = ?').run(id)
      db.prepare('DELETE FROM bugs WHERE id = ?').run(id)
    }
  })
  deleteAll()
  res.json({ ok: true })
})

// ---- Update bug ----
bugsRouter.patch('/:id', (req, res) => {
  const bug: any = db.prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id)
  if (!bug) return res.status(404).json({ error: 'Bug not found' })

  const { title, description, status, priority, pagePath, device, browser, relatedFiles } = req.body

  const updates: string[] = []
  const values: any[] = []

  if (title !== undefined) { updates.push('title = ?'); values.push(title) }
  if (description !== undefined) { updates.push('description = ?'); values.push(description) }
  if (status !== undefined) { updates.push('status = ?'); values.push(status) }
  if (priority !== undefined) { updates.push('priority = ?'); values.push(priority) }
  if (pagePath !== undefined) { updates.push('page_path = ?'); values.push(pagePath) }
  if (device !== undefined) { updates.push('device = ?'); values.push(device) }
  if (browser !== undefined) { updates.push('browser = ?'); values.push(browser) }
  if (relatedFiles !== undefined) { updates.push('related_files = ?'); values.push(JSON.stringify(relatedFiles)) }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')")
    values.push(req.params.id)
    db.prepare(`UPDATE bugs SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }

  // Return full bug data (with screenshots and relatedFiles)
  const updated: any = db.prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id)
  const screenshots = db.prepare('SELECT * FROM screenshots WHERE bug_id = ? ORDER BY sort_order').all(req.params.id)
  res.json({
    ...updated,
    relatedFiles: safeJsonParse(updated.related_files, []),
    screenshots: screenshots.map((s: any) => ({
      id: s.id,
      url: `/uploads/${s.filename}`,
      name: s.name,
      annotated: !!s.annotated,
      annotations: safeJsonParse(s.annotations, []),
    })),
  })
})

// ---- Delete bug ----
bugsRouter.delete('/:id', (req, res) => {
  const bug: any = db.prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id)
  if (!bug) return res.status(404).json({ error: 'Bug not found' })

  // Delete associated screenshot files from disk
  const screenshots: any[] = db.prepare('SELECT filename, annotated_filename FROM screenshots WHERE bug_id = ?').all(req.params.id)
  for (const ss of screenshots) {
    const filePath = path.join(UPLOADS_DIR, ss.filename)
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore file deletion error */ }
    if (ss.annotated_filename) {
      const annotatedPath = path.join(UPLOADS_DIR, ss.annotated_filename)
      try { if (fs.existsSync(annotatedPath)) fs.unlinkSync(annotatedPath) } catch { /* ignore file deletion error */ }
    }
  }

  db.prepare('DELETE FROM screenshots WHERE bug_id = ?').run(req.params.id)
  db.prepare('DELETE FROM bugs WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ---- Upload screenshot ----
bugsRouter.post('/:id/screenshots', upload.single('file'), (req, res) => {
  const bug: any = db.prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id)
  if (!bug) return res.status(404).json({ error: 'Bug not found' })
  if (!req.file) return res.status(400).json({ error: 'No file selected' })

  const id = uuid()
  const maxOrder: any = db.prepare('SELECT MAX(sort_order) as n FROM screenshots WHERE bug_id = ?').get(req.params.id)
  const sortOrder = (maxOrder?.n || 0) + 1
  const name = req.body.name || req.file.originalname

  // Calculate path relative to UPLOADS_DIR
  const relPath = path.relative(UPLOADS_DIR, req.file.path).replace(/\\/g, '/')

  db.prepare(`
    INSERT INTO screenshots (id, bug_id, filename, original_name, name, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, relPath, req.file.originalname, name, sortOrder)

  res.status(201).json({
    id,
    url: `/uploads/${relPath}`,
    name,
    annotated: false,
    annotations: [],
  })
})

// ---- Paste screenshot (Base64) ----
bugsRouter.post('/:id/screenshots/paste', (req, res) => {
  const bug: any = db.prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id)
  if (!bug) return res.status(404).json({ error: 'Bug not found' })

  const { dataUrl, name = 'Pasted screenshot' } = req.body
  if (!dataUrl) return res.status(400).json({ error: 'Missing image data' })

  // Parse base64
  const matches = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/)
  if (!matches) return res.status(400).json({ error: 'Invalid image format' })

  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
  const buffer = Buffer.from(matches[2], 'base64')
  const filename = `${uuid()}.${ext}`
  const projectDir = getProjectUploadsDir(req.params.id)

  const fullPath = path.join(projectDir, filename)
  const relPath = path.relative(UPLOADS_DIR, fullPath).replace(/\\/g, '/')
  if (relPath.includes('..')) return res.status(400).json({ error: 'Invalid file path' })

  fs.writeFileSync(fullPath, buffer)

  const id = uuid()
  const maxOrder: any = db.prepare('SELECT MAX(sort_order) as n FROM screenshots WHERE bug_id = ?').get(req.params.id)
  const sortOrder = (maxOrder?.n || 0) + 1

  db.prepare(`
    INSERT INTO screenshots (id, bug_id, filename, original_name, name, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, relPath, 'paste.png', name, sortOrder)

  res.status(201).json({
    id,
    url: `/uploads/${relPath}`,
    name,
    annotated: false,
    annotations: [],
  })
})

// ---- Update screenshot ----
bugsRouter.patch('/:bugId/screenshots/:ssId', (req, res) => {
  const { name, annotated, annotations } = req.body
  if (name !== undefined) {
    db.prepare('UPDATE screenshots SET name = ? WHERE id = ? AND bug_id = ?').run(name, req.params.ssId, req.params.bugId)
  }
  if (annotated !== undefined) {
    db.prepare('UPDATE screenshots SET annotated = ? WHERE id = ? AND bug_id = ?').run(annotated ? 1 : 0, req.params.ssId, req.params.bugId)
  }
  if (annotations !== undefined) {
    db.prepare('UPDATE screenshots SET annotations = ? WHERE id = ? AND bug_id = ?').run(JSON.stringify(annotations), req.params.ssId, req.params.bugId)
  }
  res.json({ ok: true })
})

// ---- Save annotated render image ----
bugsRouter.post('/:bugId/screenshots/:ssId/annotated-image', (req, res) => {
  const { dataUrl } = req.body as { dataUrl: string }
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image data' })
  }

  const ss: any = db.prepare('SELECT filename, annotated_filename FROM screenshots WHERE id = ? AND bug_id = ?')
    .get(req.params.ssId, req.params.bugId)
  if (!ss) return res.status(404).json({ error: 'Screenshot not found' })

  // Parse base64
  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!matches || !matches[1] || !matches[2]) return res.status(400).json({ error: 'Cannot parse image data' })
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
  const buffer = Buffer.from(matches[2], 'base64')

  // Save to same directory as original image
  const dir = path.dirname(path.join(UPLOADS_DIR, ss.filename))
  const baseName = path.basename(ss.filename, path.extname(ss.filename))
  const annotatedFilename = path.dirname(ss.filename) + '/' + baseName + '_annotated.' + ext
  const annotatedPath = path.join(UPLOADS_DIR, annotatedFilename)

  // Path security check
  const relCheck = path.relative(UPLOADS_DIR, annotatedPath)
  if (relCheck.includes('..')) return res.status(400).json({ error: 'Invalid file path' })

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(annotatedPath, buffer)

  db.prepare('UPDATE screenshots SET annotated_filename = ? WHERE id = ? AND bug_id = ?')
    .run(annotatedFilename, req.params.ssId, req.params.bugId)

  res.json({ ok: true, annotatedFilename })
})

// ---- Reorder screenshots ----
bugsRouter.put('/:bugId/screenshots/reorder', (req, res) => {
  const { order } = req.body as { order: string[] }
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  const stmt = db.prepare('UPDATE screenshots SET sort_order = ? WHERE id = ? AND bug_id = ?')
  const updateAll = db.transaction(() => {
    for (let i = 0; i < order.length; i++) {
      stmt.run(i, order[i], req.params.bugId)
    }
  })
  updateAll()
  res.json({ ok: true })
})

// ---- Delete screenshot ----
bugsRouter.delete('/:bugId/screenshots/:ssId', (req, res) => {
  const ss: any = db.prepare('SELECT filename, annotated_filename FROM screenshots WHERE id = ? AND bug_id = ?').get(req.params.ssId, req.params.bugId)
  if (ss) {
    const filePath = path.join(UPLOADS_DIR, ss.filename)
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore file deletion error */ }
    if (ss.annotated_filename) {
      const annotatedPath = path.join(UPLOADS_DIR, ss.annotated_filename)
      try { if (fs.existsSync(annotatedPath)) fs.unlinkSync(annotatedPath) } catch { /* ignore file deletion error */ }
    }
  }
  db.prepare('DELETE FROM screenshots WHERE id = ? AND bug_id = ?').run(req.params.ssId, req.params.bugId)
  res.json({ ok: true })
})
