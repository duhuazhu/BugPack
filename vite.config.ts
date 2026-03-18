import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3456,
    proxy: {
      '/api': 'http://localhost:3457',
      '/uploads': 'http://localhost:3457',
    },
  },
})
