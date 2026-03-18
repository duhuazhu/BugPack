import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { bugsRouter } from './routes/bugs.js'
import { settingsRouter } from './routes/settings.js'
import { projectsRouter } from './routes/projects.js'
import { zentaoRouter } from './routes/zentao.js'
import { jiraRouter } from './routes/jira.js'
import { linearRouter } from './routes/linear.js'
import { tapdRouter } from './routes/tapd.js'
import { UPLOADS_DIR } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = parseInt(process.env.PORT || '3457', 10)

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

// Static files: screenshots
app.use('/uploads', express.static(UPLOADS_DIR, { dotfiles: 'deny' }))

// API routes
app.use('/api/bugs', bugsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/zentao', zentaoRouter)
app.use('/api/jira', jiraRouter)
app.use('/api/linear', linearRouter)
app.use('/api/tapd', tapdRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' })
})

// Production: serve frontend static files
const clientDir = path.resolve(__dirname, '../client')
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(clientDir, 'index.html'))
    }
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BugPack server running at http://localhost:${PORT}`)
})
