import { Router } from 'express'
import crypto from 'crypto'
import { db } from '../db.js'

export const zentaoRouter = Router()

// Clean URL: strip trailing /my.html, /index.html, / etc.
function cleanUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  // Strip trailing .html/.php page path
  url = url.replace(/\/[^/]*\.(html|php)$/i, '')
  return url
}

// Get Zentao config
function getZentaoConfig() {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('zentao%') as { key: string; value: string }[]
  const config: Record<string, string> = {}
  for (const row of rows) config[row.key] = row.value
  return {
    url: cleanUrl(config.zentaoUrl || ''),
    // HTTP Basic Auth (company gateway auth)
    httpUser: config.zentaoHttpUser || '',
    httpPass: config.zentaoHttpPass || '',
    // Zentao system account
    account: config.zentaoAccount || '',
    password: config.zentaoPassword || '',
    productId: config.zentaoProductId || '',
  }
}

// Build Basic Auth header (company gateway auth)
function makeBasicHeaders(httpUser: string, httpPass: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (httpUser) {
    headers.Authorization = `Basic ${Buffer.from(`${httpUser}:${httpPass}`).toString('base64')}`
  }
  return headers
}

// Request timeout (15s)
const TIMEOUT = 15000

// Get token
async function getToken(baseUrl: string, account: string, password: string, httpUser: string, httpPass: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api.php/v1/tokens`, {
    method: 'POST',
    headers: makeBasicHeaders(httpUser, httpPass, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ account, password }),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  const text = await res.text().catch(() => '')
  let json: any = null
  try { json = JSON.parse(text) } catch {}
  if (!res.ok || json?.error) {
    const msg = json?.error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  if (!json?.token) throw new Error('Zentao did not return a token')
  return json.token
}

// Zentao API request
async function zentaoFetch(baseUrl: string, token: string, path: string, httpUser: string, httpPass: string) {
  const headers = makeBasicHeaders(httpUser, httpPass, { Token: token })
  const res = await fetch(`${baseUrl}/api.php/v1${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`Zentao request failed: HTTP ${res.status}`)
  return res.json()
}

// Test connection
zentaoRouter.post('/test', async (req, res) => {
  try {
    const { url, account, password, httpUser, httpPass } = req.body
    const base = cleanUrl(url)
    const token = await getToken(base, account, password, httpUser || '', httpPass || '')
    res.json({ ok: true, token })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get project list (for selection)
zentaoRouter.get('/products', async (_req, res) => {
  try {
    const config = getZentaoConfig()
    if (!config.url) return res.json({ ok: false, error: 'Zentao URL not configured' })
    const token = await getToken(config.url, config.account, config.password, config.httpUser, config.httpPass)
    const data = await zentaoFetch(config.url, token, '/projects?limit=100', config.httpUser, config.httpPass) as any
    // Return project list (reuse 'products' field name for frontend compatibility)
    res.json({ ok: true, products: (data.projects || []).map((p: any) => ({ id: p.id, name: p.name })) })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get bug list (by project ID, filter to current user)
zentaoRouter.get('/bugs', async (_req, res) => {
  try {
    const config = getZentaoConfig()
    if (!config.url) return res.json({ ok: false, error: 'Zentao URL not configured' })
    if (!config.productId) return res.json({ ok: false, error: 'Please select a project first' })
    const token = await getToken(config.url, config.account, config.password, config.httpUser, config.httpPass)
    const data = await zentaoFetch(config.url, token, `/projects/${config.productId}/bugs?limit=200`, config.httpUser, config.httpPass) as any
    // Filter bugs assigned to current user
    const allBugs = data.bugs || []
    const myBugs = allBugs.filter((b: any) => {
      const assigned = b.assignedTo
      const account = typeof assigned === 'string' ? assigned : assigned?.account
      return account === config.account
    })
    res.json({ ok: true, bugs: myBugs, total: allBugs.length })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get single bug details (raw data for debugging image fields)
zentaoRouter.get('/bugs/:id', async (req, res) => {
  try {
    const config = getZentaoConfig()
    if (!config.url) return res.json({ ok: false, error: 'Zentao not configured' })
    const token = await getToken(config.url, config.account, config.password, config.httpUser, config.httpPass)
    const data = await zentaoFetch(config.url, token, `/bugs/${req.params.id}`, config.httpUser, config.httpPass)
    res.json({ ok: true, bug: data })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Import bug from Zentao into BugPack
zentaoRouter.post('/import/:id', async (req, res) => {
  try {
    const config = getZentaoConfig()
    if (!config.url) return res.json({ ok: false, error: 'Zentao not configured' })
    const token = await getToken(config.url, config.account, config.password, config.httpUser, config.httpPass)
    const data = await zentaoFetch(config.url, token, `/bugs/${req.params.id}`, config.httpUser, config.httpPass) as any
    const projectId = req.body.projectId || ''
    const bugId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Get next number
    const last = db.prepare('SELECT MAX(number) as maxNum FROM bugs WHERE project_id = ?').get(projectId) as any
    const number = (last?.maxNum || 0) + 1

    // Build description
    const steps = data.steps ? data.steps.replace(/<[^>]+>/g, '') : ''
    let desc = `[Imported from Zentao #${data.id}]\n\n${data.title}\n\n${steps}`.trim()

    // Append history/comments from bug detail, collect comment image fileIDs
    const commentFileIds: string[] = []
    try {
      const actionList = data.actions || []
      if (Array.isArray(actionList) && actionList.length > 0) {
        const historyLines: string[] = ['\n\n---\n## History']
        for (const act of actionList) {
          const time = act.date || ''
          const actor = act.actor || ''
          const action = act.action || ''
          const rawComment = act.comment || ''
          // Extract image fileIDs from comment HTML
          const fidRegex = /fileID=(\d+)/g
          let fidMatch
          while ((fidMatch = fidRegex.exec(rawComment)) !== null) {
            if (fidMatch[1]) commentFileIds.push(fidMatch[1])
          }
          const comment = rawComment.replace(/<[^>]+>/g, '').trim()
          let line = `- **${time}** ${actor} ${action}`
          if (comment) line += `\n  > ${comment}`
          historyLines.push(line)
        }
        desc += historyLines.join('\n')
      }
    } catch {
      // History parse failed, skip
    }

    // Priority mapping: Zentao 1=Highest 2=High 3=Medium 4=Low -> BugPack high/medium/low
    const priMap: Record<number, string> = { 1: 'high', 2: 'high', 3: 'medium', 4: 'low' }
    const priority = priMap[data.pri] || 'medium'

    db.prepare(`INSERT INTO bugs (id, number, title, description, status, priority, page_path, device, browser, related_files, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, '', '', '', '[]', ?, ?, ?)`).run(
      bugId, number, data.title, desc, priority, projectId, now, now
    )

    // Download images: extract inline images from steps HTML + file attachments
    const { writeFileSync, mkdirSync } = await import('fs')
    const pathMod = await import('path')
    const { UPLOADS_DIR } = await import('../db.js')

    // Get project upload directory (consistent with bugs route)
    const project: any = projectId ? db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) : null
    const projectName = (project?.name || 'default').replace(/[<>:"/\\|?*]/g, '_')
    const projectDir = pathMod.join(UPLOADS_DIR, projectName)
    mkdirSync(projectDir, { recursive: true })

    const fileHeaders = makeBasicHeaders(config.httpUser, config.httpPass, { Token: token })
    let imgIndex = 0

    // Save image helper
    const saveImage = (buffer: Buffer, ext: string, name: string) => {
      const fname = `${bugId}-${imgIndex}.${ext}`
      const filePath = pathMod.join(projectDir, fname)
      writeFileSync(filePath, buffer)
      // Store path relative to UPLOADS_DIR
      const relPath = `${projectName}/${fname}`
      const ssId = crypto.randomUUID()
      db.prepare(`INSERT INTO screenshots (id, bug_id, filename, original_name, name, annotated, sort_order, annotations, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, '[]', ?)`).run(
        ssId, bugId, relPath, fname, name, imgIndex, now
      )
      imgIndex++
    }

    // 1) Extract images from steps (via fileID parameter)
    const stepsHtml = data.steps || ''
    // Match fileID=number pattern (Zentao standard image reference)
    const fileIdRegex = /fileID=(\d+)/g
    const seenFileIds = new Set<string>()
    let match
    while ((match = fileIdRegex.exec(stepsHtml)) !== null) {
      const fileId = match[1] ?? ''
      if (!fileId || seenFileIds.has(fileId)) continue
      seenFileIds.add(fileId)
      try {
        // Use Zentao standard file download API
        const imgUrl = `${config.url}/api.php?m=file&f=read&fileID=${fileId}`
        const imgRes = await fetch(imgUrl, { headers: fileHeaders })
        if (!imgRes.ok) continue
        const contentType = imgRes.headers.get('content-type') || ''
        if (!contentType.startsWith('image/')) continue
        const contentLength = parseInt(imgRes.headers.get('content-length') || '0')
        if (contentLength > 20 * 1024 * 1024) continue // Skip images over 20MB
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        if (buffer.length > 20 * 1024 * 1024) continue
        const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'png'
        saveImage(buffer, ext, `Screenshot ${imgIndex + 1}`)
      } catch {
        // Skip
      }
    }

    // 2) Images from history/comments
    for (const fileId of commentFileIds) {
      if (seenFileIds.has(fileId)) continue
      seenFileIds.add(fileId)
      try {
        const imgUrl = `${config.url}/api.php?m=file&f=read&fileID=${fileId}`
        const imgRes = await fetch(imgUrl, { headers: fileHeaders })
        if (!imgRes.ok) continue
        const contentType = imgRes.headers.get('content-type') || ''
        if (!contentType.startsWith('image/')) continue
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        if (buffer.length > 20 * 1024 * 1024) continue
        const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'png'
        saveImage(buffer, ext, `Screenshot ${imgIndex + 1}`)
      } catch {
        // Skip
      }
    }

    // 3) Images from file attachments
    if (data.files && Array.isArray(data.files)) {
      for (const file of data.files) {
        if (!file.pathname) continue
        const ext = (file.extension || '').toLowerCase()
        if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) continue
        try {
          const fileUrl = `${config.url}/data/upload/${file.pathname}`
          const fileRes = await fetch(fileUrl, { headers: fileHeaders })
          if (!fileRes.ok) continue
          const buffer = Buffer.from(await fileRes.arrayBuffer())
          if (buffer.length > 20 * 1024 * 1024) continue // Skip images over 20MB
          saveImage(buffer, ext, file.title || `Screenshot ${imgIndex + 1}`)
        } catch {
          // Skip
        }
      }
    }

    res.json({ ok: true, bugId, number })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Sync status back to Zentao (resolve bug)
zentaoRouter.post('/resolve/:id', async (req, res) => {
  try {
    const config = getZentaoConfig()
    if (!config.url) return res.json({ ok: false, error: 'Zentao not configured' })
    const token = await getToken(config.url, config.account, config.password, config.httpUser, config.httpPass)
    const headers = makeBasicHeaders(config.httpUser, config.httpPass, { 'Content-Type': 'application/json', Token: token })
    const apiRes = await fetch(`${config.url}/api.php/v1/bugs/${req.params.id}/resolve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ resolution: req.body.resolution || 'fixed' }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status}`)
    res.json({ ok: true })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})
