import { Router } from 'express'
import crypto from 'crypto'
import { db } from '../db.js'

export const linearRouter = Router()

// Get Linear config
function getLinearConfig() {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('linear%') as { key: string; value: string }[]
  const config: Record<string, string> = {}
  for (const row of rows) config[row.key] = row.value
  return {
    token: config.linearToken || '',
    teamId: config.linearTeamId || '',
  }
}

// Request timeout (15s)
const TIMEOUT = 15000

// Linear GraphQL request
async function linearQuery(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  const json = await res.json() as any
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || 'Linear GraphQL error')
  }
  return json.data
}

// Test connection
linearRouter.post('/test', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.json({ ok: false, error: 'Please enter API Key' })
    const data = await linearQuery(token, `query { viewer { id name email } }`)
    res.json({ ok: true, user: data.viewer?.name || data.viewer?.email })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get team list
linearRouter.get('/teams', async (_req, res) => {
  try {
    const config = getLinearConfig()
    if (!config.token) return res.json({ ok: false, error: 'Linear API Key not configured' })
    const data = await linearQuery(config.token, `query { teams { nodes { id name key } } }`)
    res.json({
      ok: true,
      teams: (data.teams?.nodes || []).map((t: any) => ({ id: t.id, key: t.key, name: t.name })),
    })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Get bug list (issues assigned to current user)
linearRouter.get('/bugs', async (_req, res) => {
  try {
    const config = getLinearConfig()
    if (!config.token) return res.json({ ok: false, error: 'Linear API Key not configured' })
    if (!config.teamId) return res.json({ ok: false, error: 'Please select a team first' })

    const data = await linearQuery(config.token, `
      query($teamId: ID!) {
        viewer {
          assignedIssues(
            filter: {
              team: { id: { eq: $teamId } }
              state: { type: { nin: ["completed", "canceled"] } }
            }
            first: 100
            orderBy: createdAt
          ) {
            nodes {
              id
              identifier
              title
              priority
              priorityLabel
              state { id name type }
              creator { name }
              createdAt
              attachments { nodes { id url title } }
            }
          }
        }
      }
    `, { teamId: config.teamId })

    const issues = data.viewer?.assignedIssues?.nodes || []
    const bugs = issues.map((issue: any) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel || '',
      status: issue.state?.name || '',
      statusType: issue.state?.type || '',
      creator: issue.creator?.name || '',
      created: issue.createdAt || '',
      hasAttachments: (issue.attachments?.nodes || []).length > 0,
    }))

    res.json({ ok: true, bugs, total: bugs.length })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Import issue from Linear into BugPack
linearRouter.post('/import/:id', async (req, res) => {
  try {
    const config = getLinearConfig()
    if (!config.token) return res.json({ ok: false, error: 'Linear not configured' })

    const data = await linearQuery(config.token, `
      query($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          priority
          priorityLabel
          attachments { nodes { id url title metadata } }
        }
      }
    `, { id: req.params.id })

    const issue = data.issue
    if (!issue) return res.json({ ok: false, error: 'Issue not found' })

    const projectId = req.body.projectId || ''
    const bugId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Get next number
    const last = db.prepare('SELECT MAX(number) as maxNum FROM bugs WHERE project_id = ?').get(projectId) as any
    const number = (last?.maxNum || 0) + 1

    const desc = `[Imported from Linear ${issue.identifier}]\n\n${issue.title}\n\n${issue.description || ''}`.trim()

    // Priority mapping: Linear 1=Urgent 2=High 3=Medium 4=Low 0=None
    const priMap: Record<number, string> = { 0: 'medium', 1: 'high', 2: 'high', 3: 'medium', 4: 'low' }
    const priority = priMap[issue.priority] || 'medium'

    db.prepare(`INSERT INTO bugs (id, number, title, description, status, priority, page_path, device, browser, related_files, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, '', '', '', '[]', ?, ?, ?)`).run(
      bugId, number, issue.title, desc, priority, projectId, now, now
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
    const attachments = issue.attachments?.nodes || []

    for (const att of attachments) {
      if (!att.url) continue
      try {
        // Try downloading attachment, check if image
        const imgRes = await fetch(att.url, {
          headers: { Authorization: config.token },
        })
        if (!imgRes.ok) continue
        const contentType = (imgRes.headers.get('content-type') || '').toLowerCase()
        if (!contentType.startsWith('image/')) continue

        const buffer = Buffer.from(await imgRes.arrayBuffer())
        if (buffer.length > 20 * 1024 * 1024) continue // Skip images over 20MB
        const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'png'
        const fname = `${bugId}-${imgIndex}.${ext}`
        const filePath = pathMod.join(projectDir, fname)
        writeFileSync(filePath, buffer)
        const relPath = `${projectName}/${fname}`
        const ssId = crypto.randomUUID()
        db.prepare(`INSERT INTO screenshots (id, bug_id, filename, original_name, name, annotated, sort_order, annotations, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, '[]', ?)`).run(
          ssId, bugId, relPath, fname, att.title || `Screenshot ${imgIndex + 1}`, imgIndex, now
        )
        imgIndex++
      } catch {
        // Skip
      }
    }

    // Also extract Markdown image links from description
    const descImages = (issue.description || '').matchAll(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g)
    for (const match of descImages) {
      const imgUrl = match[1]
      try {
        const imgRes = await fetch(imgUrl, {
          headers: { Authorization: config.token },
        })
        if (!imgRes.ok) continue
        const contentType = (imgRes.headers.get('content-type') || '').toLowerCase()
        if (!contentType.startsWith('image/')) continue

        const buffer = Buffer.from(await imgRes.arrayBuffer())
        if (buffer.length > 20 * 1024 * 1024) continue // Skip images over 20MB
        const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'png'
        const fname = `${bugId}-${imgIndex}.${ext}`
        const filePath = pathMod.join(projectDir, fname)
        writeFileSync(filePath, buffer)
        const relPath = `${projectName}/${fname}`
        const ssId = crypto.randomUUID()
        db.prepare(`INSERT INTO screenshots (id, bug_id, filename, original_name, name, annotated, sort_order, annotations, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, '[]', ?)`).run(
          ssId, bugId, relPath, fname, `Screenshot ${imgIndex + 1}`, imgIndex, now
        )
        imgIndex++
      } catch {
        // Skip
      }
    }

    res.json({ ok: true, bugId, number })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// Sync status back to Linear (mark as completed)
linearRouter.post('/resolve/:id', async (req, res) => {
  try {
    const config = getLinearConfig()
    if (!config.token) return res.json({ ok: false, error: 'Linear not configured' })
    if (!config.teamId) return res.json({ ok: false, error: 'No team selected' })

    // Find Done type status
    const statesData = await linearQuery(config.token, `
      query($teamId: ID!) {
        team(id: $teamId) {
          states { nodes { id name type } }
        }
      }
    `, { teamId: config.teamId })

    const doneState = (statesData.team?.states?.nodes || []).find((s: any) => s.type === 'completed')
    if (!doneState) return res.json({ ok: false, error: 'No completed state found' })

    await linearQuery(config.token, `
      mutation($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) {
          success
        }
      }
    `, { id: req.params.id, stateId: doneState.id })

    res.json({ ok: true })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})
