#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.argv.includes('--mcp')) {
  await import(pathToFileURL(path.join(__dirname, '../dist/mcp/index.js')).href)
} else {
  // Default port 3456 for production
  if (!process.env.PORT) process.env.PORT = '3456'
  await import(pathToFileURL(path.join(__dirname, '../dist/server/index.js')).href)
}
