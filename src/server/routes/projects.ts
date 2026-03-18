import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { db, UPLOADS_DIR } from '../db.js'
import crypto from 'crypto'
import { v4 as uuid } from 'uuid'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import multer from 'multer'

export const projectsRouter = Router()

// ZIP file upload (in-memory, max 200MB)
const zipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } })

// Get all projects
projectsRouter.get('/', (_req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
  res.json(projects)
})

// Create project
projectsRouter.post('/', (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'Project name is required' })

  const id = crypto.randomUUID()
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, name)
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  res.json(project)
})

// Rename project
projectsRouter.patch('/:id', (req, res) => {
  const { name } = req.body
  db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, req.params.id)
  res.json({ ok: true })
})

// Delete project (also deletes associated bugs and screenshot files)
projectsRouter.delete('/:id', (req, res) => {
  const bugs: any[] = db.prepare('SELECT id FROM bugs WHERE project_id = ?').all(req.params.id)
  for (const bug of bugs) {
    const screenshots: any[] = db.prepare('SELECT filename FROM screenshots WHERE bug_id = ?').all(bug.id)
    for (const ss of screenshots) {
      const filePath = path.join(UPLOADS_DIR, ss.filename)
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore file deletion error */ }
    }
    db.prepare('DELETE FROM screenshots WHERE bug_id = ?').run(bug.id)
  }
  db.prepare('DELETE FROM bugs WHERE project_id = ?').run(req.params.id)
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// Export project data (ZIP: manifest.json + original image files, streaming)
projectsRouter.get('/:id/export', (req, res) => {
  const project: any = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const bugs: any[] = db.prepare('SELECT * FROM bugs WHERE project_id = ?').all(req.params.id)

  const manifest: any = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    project: { name: project.name, created_at: project.created_at },
    bugs: [],
  }

  // Collect screenshot file info
  const imageFiles: { zipPath: string; diskPath: string }[] = []

  for (const bug of bugs) {
    const screenshots: any[] = db.prepare('SELECT * FROM screenshots WHERE bug_id = ? ORDER BY sort_order').all(bug.id)

    const ssExport = screenshots.map((ss: any, i: number) => {
      const ext = path.extname(ss.filename).toLowerCase() || '.png'
      const zipPath = `images/${bug.number}/${i}${ext}`
      const diskPath = path.join(UPLOADS_DIR, ss.filename)

      if (fs.existsSync(diskPath)) {
        imageFiles.push({ zipPath, diskPath })
      }

      return {
        original_name: ss.original_name,
        name: ss.name,
        annotated: ss.annotated,
        sort_order: ss.sort_order,
        annotations: ss.annotations,
        imagePath: fs.existsSync(diskPath) ? zipPath : null,
      }
    })

    manifest.bugs.push({
      number: bug.number,
      title: bug.title,
      description: bug.description,
      status: bug.status,
      priority: bug.priority,
      page_path: bug.page_path,
      device: bug.device,
      browser: bug.browser,
      related_files: bug.related_files,
      created_at: bug.created_at,
      updated_at: bug.updated_at,
      screenshots: ssExport,
    })
  }

  // Stream ZIP output
  const filename = `bugpack-${project.name}-${new Date().toISOString().split('T')[0]}.zip`
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
  res.setHeader('Content-Type', 'application/zip')

  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.on('error', (err: Error) => {
    console.error('ZIP archive error:', err)
    if (!res.headersSent) res.status(500).json({ error: err.message })
  })
  archive.pipe(res)

  // Write manifest
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

  // Stream image files (no full memory load)
  for (const img of imageFiles) {
    archive.file(img.diskPath, { name: img.zipPath })
  }

  archive.finalize()
})

// Import project data (receive ZIP file)
projectsRouter.post('/:id/import', zipUpload.single('file'), (req, res) => {
  try {
    const projectId = req.params.id
    const project: any = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    if (!project) return res.status(404).json({ error: 'Project not found' })

    if (!req.file) return res.status(400).json({ error: 'Please upload a .zip file' })

    const zip = new AdmZip(req.file.buffer)
    const manifestEntry = zip.getEntry('manifest.json')
    if (!manifestEntry) return res.status(400).json({ error: 'Invalid BugPack backup file (missing manifest.json)' })

    const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'))
    if (!manifest.bugs || !Array.isArray(manifest.bugs)) {
      return res.status(400).json({ error: 'Invalid manifest data' })
    }
    if (manifest.bugs.length > 5000) {
      return res.status(400).json({ error: 'Too many bugs in import (max 5000)' })
    }

    const projectName = (project.name || 'default').replace(/[<>:"/\\|?*]/g, '_')
    const projectDir = path.join(UPLOADS_DIR, projectName)
    fs.mkdirSync(projectDir, { recursive: true })

    let importedCount = 0

    const importAll = db.transaction(() => {
      for (const bugData of manifest.bugs) {
        const bugId = uuid()
        const now = new Date().toISOString()

        const last: any = db.prepare('SELECT MAX(number) as maxNum FROM bugs WHERE project_id = ?').get(projectId)
        const number = (last?.maxNum || 0) + 1

        db.prepare(`INSERT INTO bugs (id, number, title, description, status, priority, page_path, device, browser, related_files, project_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          bugId, number,
          bugData.title || '',
          bugData.description || '',
          bugData.status || 'pending',
          bugData.priority || 'medium',
          bugData.page_path || '',
          bugData.device || '',
          bugData.browser || '',
          bugData.related_files || '[]',
          projectId,
          bugData.created_at || now,
          bugData.updated_at || now,
        )

        // Import screenshots
        if (Array.isArray(bugData.screenshots)) {
          for (let i = 0; i < bugData.screenshots.length; i++) {
            const ssData = bugData.screenshots[i]
            if (!ssData?.imagePath) continue

            // Path traversal protection
            if (ssData.imagePath.includes('..') || path.isAbsolute(ssData.imagePath)) continue

            // Extract image from ZIP
            const imgEntry = zip.getEntry(ssData.imagePath)
            if (!imgEntry) continue
            if (imgEntry.header.size > 50 * 1024 * 1024) continue // Skip files > 50MB

            const buffer = imgEntry.getData()
            const ext = path.extname(ssData.imagePath) || '.png'
            const fname = `${bugId}-${i}${ext}`
            const filePath = path.join(projectDir, fname)

            // Verify resolved path is within project dir
            const resolved = path.resolve(filePath)
            if (!resolved.startsWith(path.resolve(projectDir) + path.sep)) continue

            fs.writeFileSync(filePath, buffer)

            const relPath = `${projectName}/${fname}`
            const ssId = uuid()
            db.prepare(`INSERT INTO screenshots (id, bug_id, filename, original_name, name, annotated, sort_order, annotations, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
              ssId, bugId, relPath,
              ssData.original_name || fname,
              ssData.name || `截图 ${i + 1}`,
              ssData.annotated ? 1 : 0,
              ssData.sort_order ?? i,
              ssData.annotations || '[]',
              now,
            )
          }
        }

        importedCount++
      }
    })

    importAll()
    res.json({ ok: true, importedCount })
  } catch (e: any) {
    console.error('Import failed:', e)
    res.json({ ok: false, error: 'Import failed. Please check the file format.' })
  }
})
