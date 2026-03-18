import { Router } from 'express'
import crypto from 'crypto'
import { db } from '../db.js'

export const tapdRouter = Router()

// Get TAPD config
function getTapdConfig() {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('tapd%') as { key: string; value: string }[]
  const config: Record<string, string> = {}
  for (const row of rows) config[row.key] = row.value
  return {
    apiUser: config.tapdApiUser || '',
    apiPassword: config.tapdApiPassword || '',
    workspaceId: config.tapdWorkspaceId || '',
  }
}

// Build Basic Auth header
function makeHeaders(apiUser: string, apiPassword: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${apiUser}:${apiPassword}`).toString('base64')}`,
  }
}

// Request timeout (15s)
const TIMEOUT = 15000

// TAPD API request
async function tapdFetch(apiUser: string, apiPassword: string, path: string) {
  const headers = makeHeaders(apiUser, apiPassword)
  const res = await fetch(`https://api.tapd.cn${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`TAPD request failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }
  const json = await res.json() as any
  if (json.status !== 1) {
    throw new Error(json.info || 'TAPD API returned error')
  }
  return json.data
}

// Test connection
tapdRouter.post('/test', async (req, res) => {
  try {
    const { apiUser, apiPassword } = req.body
    if (!apiUser || !apiPassword) {
      return res.json({ ok: false, error: 'Please enter API credentials' })
    }
    const headers = makeHeaders(apiUser, apiPassword)
    const testRes = await fetch('https://api.tapd.cn/quickstart/testauth', { headers, signal: AbortSignal.timeout(TIMEOUT) })
    if (!testRes.ok) {
      if (testRes.status === 401) throw new Error('Invalid API credentials')
      throw new Error(`HTTP ${testRes.status}`)
    }
    const json = await testRes.json() as any
    if (json.status !== 1) throw new Error(json.info || 'Authentication failed')
    res.json({ ok: true })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get project (workspace) list
// TAPD project list API requires company_id; use configured workspace_id instead
tapdRouter.get('/workspaces', async (_req, res) => {
  try {
    const config = getTapdConfig()
    if (!config.apiUser) return res.json({ ok: false, error: 'TAPD API account not configured' })
    if (!config.workspaceId) return res.json({ ok: false, error: 'Please set TAPD workspace ID in settings' })
    // Return configured workspace directly, skip project selection
    res.json({ ok: true, workspaces: [{ id: config.workspaceId, name: `Project #${config.workspaceId}` }] })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get bug list
tapdRouter.get('/bugs', async (_req, res) => {
  try {
    const config = getTapdConfig()
    if (!config.apiUser) return res.json({ ok: false, error: 'TAPD not configured' })
    if (!config.workspaceId) return res.json({ ok: false, error: 'Please select a project first' })

    const data = await tapdFetch(
      config.apiUser, config.apiPassword,
      `/bugs?workspace_id=${config.workspaceId}&limit=100&order=created desc`
    )

    const bugs = (data || []).map((item: any) => {
      const b = item.Bug || item
      return {
        id: b.id,
        title: b.title,
        severity: b.severity || '',
        priority: b.priority_label || b.priority || '',
        status: b.status || '',
        reporter: b.reporter || '',
        currentOwner: b.current_owner || '',
        created: b.created || '',
      }
    })

    res.json({ ok: true, bugs, total: bugs.length })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get single bug details
tapdRouter.get('/bugs/:id', async (req, res) => {
  try {
    const config = getTapdConfig()
    if (!config.apiUser) return res.json({ ok: false, error: 'TAPD not configured' })
    const data = await tapdFetch(
      config.apiUser, config.apiPassword,
      `/bugs?workspace_id=${config.workspaceId}&id=${req.params.id}`
    )
    const bug = data?.[0]?.Bug || null
    res.json({ ok: true, bug })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Import bug from TAPD into BugPack
tapdRouter.post('/import/:id', async (req, res) => {
  try {
    const config = getTapdConfig()
    if (!config.apiUser) return res.json({ ok: false, error: 'TAPD not configured' })

    // Get bug details
    const bugData = await tapdFetch(
      config.apiUser, config.apiPassword,
      `/bugs?workspace_id=${config.workspaceId}&id=${req.params.id}`
    )
    const tapdBug = bugData?.[0]?.Bug
    if (!tapdBug) return res.json({ ok: false, error: 'Bug not found' })

    const projectId = req.body.projectId || ''
    const bugId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Get next number
    const last = db.prepare('SELECT MAX(number) as maxNum FROM bugs WHERE project_id = ?').get(projectId) as any
    const number = (last?.maxNum || 0) + 1

    // Description: strip HTML tags
    const rawDesc = (tapdBug.description || '').replace(/<[^>]+>/g, '')
    const desc = `[Imported from TAPD #${tapdBug.id}]\n\n${tapdBug.title}\n\n${rawDesc}`.trim()

    // Priority mapping
    const priLabel = (tapdBug.priority_label || tapdBug.priority || '').toLowerCase()
    let priority = 'medium'
    if (priLabel.includes('紧急') || priLabel.includes('urgent') || priLabel.includes('high')) priority = 'high'
    else if (priLabel.includes('低') || priLabel.includes('low')) priority = 'low'

    db.prepare(`INSERT INTO bugs (id, number, title, description, status, priority, page_path, device, browser, related_files, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, '', '', '', '[]', ?, ?, ?)`).run(
      bugId, number, tapdBug.title, desc, priority, projectId, now, now
    )

    // Download image attachments
    const { writeFileSync, mkdirSync } = await import('fs')
    const pathMod = await import('path')
    const { UPLOADS_DIR } = await import('../db.js')

    const project: any = projectId ? db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) : null
    const projectName = (project?.name || 'default').replace(/[<>:"/\\|?*]/g, '_')
    const projectDir = pathMod.join(UPLOADS_DIR, projectName)
    mkdirSync(projectDir, { recursive: true })

    let imgIndex = 0

    // Save image helper
    const saveImage = (buffer: Buffer, ext: string, name: string) => {
      const fname = `${bugId}-${imgIndex}.${ext}`
      const filePath = pathMod.join(projectDir, fname)
      writeFileSync(filePath, buffer)
      const relPath = `${projectName}/${fname}`
      const ssId = crypto.randomUUID()
      db.prepare(`INSERT INTO screenshots (id, bug_id, filename, original_name, name, annotated, sort_order, annotations, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, '[]', ?)`).run(
        ssId, bugId, relPath, fname, name, imgIndex, now
      )
      imgIndex++
    }

    // Get temporary download link via get_image API
    const downloadViaGetImage = async (imagePath: string, name: string) => {
      const imgData = await tapdFetch(
        config.apiUser, config.apiPassword,
        `/files/get_image?workspace_id=${config.workspaceId}&image_path=${encodeURIComponent(imagePath)}`
      )
      const downloadUrl = imgData?.Attachment?.download_url
      if (!downloadUrl) return false
      // download_url is a temporary link (300s), no auth needed
      const imgRes = await fetch(downloadUrl)
      if (!imgRes.ok) return false
      const contentType = (imgRes.headers.get('content-type') || '').toLowerCase()
      if (!contentType.startsWith('image')) return false
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      if (buffer.length > 20 * 1024 * 1024) return false // Skip images over 20MB
      const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'png'
      saveImage(buffer, ext, name)
      return true
    }

    // 1) Extract /tfl/ path images from description HTML, download via get_image API
    const descHtml = tapdBug.description || ''
    const tflRegex = /(?:src=["']|")(\/tfl\/[^"']+)["']/gi
    let match
    while ((match = tflRegex.exec(descHtml)) !== null) {
      try {
        await downloadViaGetImage(match[1]!, `Screenshot ${imgIndex + 1}`)
      } catch {
        // Skip
      }
    }

    // 2) Get bug attachment list, download using filename path
    try {
      const attData = await tapdFetch(
        config.apiUser, config.apiPassword,
        `/attachments?workspace_id=${config.workspaceId}&entry_id=${req.params.id}&limit=50`
      )
      for (const item of (attData || [])) {
        const att = item.Attachment || item
        const filename = (att.filename || '').toLowerCase()
        if (!filename.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/)) continue
        try {
          // Try downloading via get_image using attachment filename
          const success = await downloadViaGetImage(att.filename, att.filename || `Screenshot ${imgIndex + 1}`)
          if (!success) {
            // Fallback: try common TAPD file path
            await downloadViaGetImage(`/tfl/pictures/${att.filename}`, att.filename || `Screenshot ${imgIndex + 1}`)
          }
        } catch {
          // skip
        }
      }
    } catch {
      // Attachment fetch failure does not block import
    }

    res.json({ ok: true, bugId, number })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Sync status back to TAPD (close bug)
tapdRouter.post('/resolve/:id', async (req, res) => {
  try {
    const config = getTapdConfig()
    if (!config.apiUser) return res.json({ ok: false, error: 'TAPD not configured' })
    const headers = makeHeaders(config.apiUser, config.apiPassword)

    const apiRes = await fetch('https://api.tapd.cn/bugs', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        workspace_id: config.workspaceId,
        id: req.params.id,
        status: 'resolved',
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status}`)
    const json = await apiRes.json() as any
    if (json.status !== 1) throw new Error(json.info || 'Update failed')
    res.json({ ok: true })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})
