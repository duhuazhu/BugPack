import { Router } from 'express'
import { execFile } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { db, DATA_DIR } from '../db.js'

export const settingsRouter = Router()

// Get all settings
settingsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  // Return server data directory
  result._dataDir = DATA_DIR
  result._cwd = process.cwd()
  res.json(result)
})

// Pick directory (native Windows dialog, foreground, returns full path)
settingsRouter.post('/pick-directory', (_req, res) => {
  const resultPath = path.join(tmpdir(), 'bugpack-pick-result.txt')
  const scriptPath = path.join(tmpdir(), 'bugpack-pick-dir.ps1')
  // Create a TopMost hidden form as parent to ensure dialog appears in foreground
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.WindowState = 'Minimized'
$form.ShowInTaskbar = $false
$form.Show()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select Directory'
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog($form)
$form.Close()
if ($result -eq 'OK') {
  [System.IO.File]::WriteAllText('${resultPath.replace(/\\/g, '\\\\')}', $dialog.SelectedPath)
} else {
  [System.IO.File]::WriteAllText('${resultPath.replace(/\\/g, '\\\\')}', '')
}
`
  writeFileSync(scriptPath, ps, 'utf-8')
  execFile('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    timeout: 60000,
  }, (err) => {
    try { unlinkSync(scriptPath) } catch {}
    if (err) {
      console.error('Failed to open directory picker:', err)
      try { unlinkSync(resultPath) } catch {}
      return res.json({ path: '' })
    }
    let selected = ''
    try {
      selected = readFileSync(resultPath, 'utf-8').trim()
      unlinkSync(resultPath)
    } catch {}
    res.json({ path: selected })
  })
})

// Batch save settings
settingsRouter.put('/', (req, res) => {
  const data = req.body as Record<string, string>
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(data)) {
      upsert.run(key, value, value)
    }
  })
  tx()
  res.json({ ok: true })
})
