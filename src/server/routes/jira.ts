import { Router } from 'express'
import crypto from 'crypto'
import { db } from '../db.js'

export const jiraRouter = Router()

// Get Jira config
function getJiraConfig() {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('jira%') as { key: string; value: string }[]
  const config: Record<string, string> = {}
  for (const row of rows) config[row.key] = row.value
  return {
    url: (config.jiraUrl || '').replace(/\/+$/, ''),
    email: config.jiraEmail || '',
    token: config.jiraToken || '',
    projectKey: config.jiraProjectKey || '',
  }
}

// Build Basic Auth header (Jira Cloud: email + API Token)
function makeHeaders(email: string, token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

// Request timeout (15s)
const TIMEOUT = 15000

// Jira API request (v3)
async function jiraFetch(baseUrl: string, email: string, token: string, path: string) {
  const headers = makeHeaders(email, token)
  const res = await fetch(`${baseUrl}/rest/api/3${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Jira request failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }
  return res.json()
}

// Test connection
jiraRouter.post('/test', async (req, res) => {
  try {
    const { url, email, token } = req.body
    const baseUrl = (url || '').replace(/\/+$/, '')
    if (!baseUrl || !email || !token) {
      return res.json({ ok: false, error: 'Please fill in all Jira configuration fields' })
    }
    // Test by fetching current user
    const data = await jiraFetch(baseUrl, email, token, '/myself') as any
    res.json({ ok: true, user: data.displayName || data.emailAddress })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get project list
jiraRouter.get('/projects', async (_req, res) => {
  try {
    const config = getJiraConfig()
    if (!config.url) return res.json({ ok: false, error: 'Jira URL not configured' })
    const data = await jiraFetch(config.url, config.email, config.token, '/project') as any[]
    res.json({
      ok: true,
      projects: data.map((p: any) => ({ id: p.id, key: p.key, name: p.name })),
    })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get bug list (JQL: bugs assigned to current user)
jiraRouter.get('/bugs', async (_req, res) => {
  try {
    const config = getJiraConfig()
    if (!config.url) return res.json({ ok: false, error: 'Jira URL not configured' })
    if (!config.projectKey) return res.json({ ok: false, error: 'Please select a project first' })

    const jql = `project = "${config.projectKey}" AND assignee = currentUser() AND issuetype = Bug AND statusCategory != Done ORDER BY created DESC`
    const data = await jiraFetch(
      config.url, config.email, config.token,
      `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,priority,status,reporter,created,attachment,description`
    ) as any

    const bugs = (data.issues || []).map((issue: any) => ({
      id: issue.id,
      key: issue.key,
      title: issue.fields.summary,
      priority: issue.fields.priority?.name || '',
      priorityId: issue.fields.priority?.id || '',
      status: issue.fields.status?.name || '',
      statusCategory: issue.fields.status?.statusCategory?.key || '',
      reporter: issue.fields.reporter?.displayName || '',
      created: issue.fields.created || '',
      hasAttachments: (issue.fields.attachment || []).length > 0,
    }))

    res.json({ ok: true, bugs, total: data.total || bugs.length })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get single issue details
jiraRouter.get('/bugs/:key', async (req, res) => {
  try {
    const config = getJiraConfig()
    if (!config.url) return res.json({ ok: false, error: 'Jira not configured' })
    const data = await jiraFetch(config.url, config.email, config.token, `/issue/${req.params.key}?fields=summary,description,priority,status,attachment,reporter,created`)
    res.json({ ok: true, issue: data })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Import bug from Jira into BugPack
jiraRouter.post('/import/:key', async (req, res) => {
  try {
    const config = getJiraConfig()
    if (!config.url) return res.json({ ok: false, error: 'Jira not configured' })

    const data = await jiraFetch(
      config.url, config.email, config.token,
      `/issue/${req.params.key}?fields=summary,description,priority,status,attachment`
    ) as any

    const fields = data.fields
    const projectId = req.body.projectId || ''
    const bugId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Get next number
    const last = db.prepare('SELECT MAX(number) as maxNum FROM bugs WHERE project_id = ?').get(projectId) as any
    const number = (last?.maxNum || 0) + 1

    // Description: strip simple Jira markup
    const rawDesc = fields.description || ''
    const desc = `[Imported from Jira ${data.key}]\n\n${fields.summary}\n\n${rawDesc}`.trim()

    // Priority mapping: Jira Highest/High -> high, Medium -> medium, Low/Lowest -> low
    const priName = (fields.priority?.name || '').toLowerCase()
    let priority = 'medium'
    if (priName.includes('high') || priName.includes('critical') || priName.includes('blocker')) priority = 'high'
    else if (priName.includes('low') || priName.includes('trivial')) priority = 'low'

    db.prepare(`INSERT INTO bugs (id, number, title, description, status, priority, page_path, device, browser, related_files, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, '', '', '', '[]', ?, ?, ?)`).run(
      bugId, number, fields.summary, desc, priority, projectId, now, now
    )

    // Download image attachments
    const { writeFileSync, mkdirSync } = await import('fs')
    const pathMod = await import('path')
    const { UPLOADS_DIR } = await import('../db.js')

    const project: any = projectId ? db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) : null
    const projectName = (project?.name || 'default').replace(/[<>:"/\\|?*]/g, '_')
    const projectDir = pathMod.join(UPLOADS_DIR, projectName)
    mkdirSync(projectDir, { recursive: true })

    const headers = makeHeaders(config.email, config.token)
    let imgIndex = 0

    const attachments = fields.attachment || []
    for (const att of attachments) {
      const mimeType = (att.mimeType || '').toLowerCase()
      if (!mimeType.startsWith('image/')) continue
      try {
        const imgRes = await fetch(att.content, { headers })
        if (!imgRes.ok) continue
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        if (buffer.length > 20 * 1024 * 1024) continue // Skip images over 20MB
        const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : mimeType.includes('gif') ? 'gif' : 'png'
        const fname = `${bugId}-${imgIndex}.${ext}`
        const filePath = pathMod.join(projectDir, fname)
        writeFileSync(filePath, buffer)
        const relPath = `${projectName}/${fname}`
        const ssId = crypto.randomUUID()
        db.prepare(`INSERT INTO screenshots (id, bug_id, filename, original_name, name, annotated, sort_order, annotations, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, '[]', ?)`).run(
          ssId, bugId, relPath, att.filename || fname, att.filename || `Screenshot ${imgIndex + 1}`, imgIndex, now
        )
        imgIndex++
      } catch {
        // Skip failed downloads
      }
    }

    res.json({ ok: true, bugId, number })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Sync status back to Jira (mark Issue as Done)
jiraRouter.post('/resolve/:key', async (req, res) => {
  try {
    const config = getJiraConfig()
    if (!config.url) return res.json({ ok: false, error: 'Jira not configured' })
    const headers = makeHeaders(config.email, config.token)

    // Get available transitions
    const transRes = await fetch(`${config.url}/rest/api/3/issue/${req.params.key}/transitions`, { headers, signal: AbortSignal.timeout(TIMEOUT) })
    if (!transRes.ok) throw new Error(`HTTP ${transRes.status}`)
    const transData = await transRes.json() as any

    // Find Done/Resolved type transition
    const doneTrans = (transData.transitions || []).find((t: any) =>
      t.to?.statusCategory?.key === 'done' ||
      /done|resolved|完成|关闭/i.test(t.name)
    )
    if (!doneTrans) {
      return res.json({ ok: false, error: 'No available done transition found' })
    }

    const doRes = await fetch(`${config.url}/rest/api/3/issue/${req.params.key}/transitions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ transition: { id: doneTrans.id } }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!doRes.ok) throw new Error(`HTTP ${doRes.status}`)
    res.json({ ok: true })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})
