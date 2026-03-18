import { useEffect, useCallback, useState, useRef } from 'react'
import { useStore } from './stores'
import { useKeyboard } from './hooks/useKeyboard'
import { Navbar } from './components/Navbar'
import { Sidebar } from './components/Sidebar'
import { EditorArea } from './components/EditorArea'
import { PropertyPanel } from './components/PropertyPanel'
import { StatusBar } from './components/StatusBar'
import { SettingsModal } from './components/SettingsModal'
import { ShortcutsModal } from './components/ShortcutsModal'
import { EmptyState } from './components/EmptyState'
import { PreviewArea } from './components/PreviewArea'

export default function App() {
  const { bugs, selectedBugId, viewMode, settingsOpen, shortcutsOpen, projects, locale, fetchSettings, fetchProjects, createProject, createBug, pasteScreenshot } = useStore()
  const [initLoaded, setInitLoaded] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  const selectedBug = bugs.find((b) => b.id === selectedBugId)

  // Sidebar drag-to-resize
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [panelWidth, setPanelWidth] = useState(320)
  const isDraggingRef = useRef(false)

  const makeResizeHandler = useCallback((setter: (w: number) => void, current: number, min: number, max: number, direction: 'left' | 'right') => {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      isDraggingRef.current = true
      const startX = e.clientX
      const onMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return
        const delta = ev.clientX - startX
        const newWidth = direction === 'left'
          ? current + delta   // Left sidebar: wider on mouse right
          : current - delta   // Right sidebar: wider on mouse left
        setter(Math.max(min, Math.min(max, newWidth)))
      }
      const onUp = () => {
        isDraggingRef.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }, [])

  useKeyboard()

  // Init: load settings (restore last project ID), then load project list
  useEffect(() => {
    fetchSettings()
      .then(() => fetchProjects())
      .then(() => setInitLoaded(true))
      .catch((e) => { console.error('Initialization failed:', e); setInitLoaded(true) })
  }, [fetchSettings, fetchProjects])

  // Global Ctrl+V paste screenshot (capture phase)
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    // Check for images
    let imageItem: DataTransferItem | null = null
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item && item.type.startsWith('image/')) {
        imageItem = item
        break
      }
    }
    if (!imageItem) return

    // Prevent default when image found
    e.preventDefault()
    e.stopPropagation()

    const blob = imageItem.getAsFile()
    if (!blob) return

    const reader = new FileReader()
    // Capture current selectedBugId to avoid switching during read
    const capturedBugId = selectedBugId
    reader.onload = async () => {
      const dataUrl = reader.result as string
      let bugId = capturedBugId

      // No bug selected, auto-create one
      if (!bugId) {
        const newBug = await createBug()
        bugId = newBug.id
      }

      const ssName = locale === 'zh' ? '粘贴截图' : 'Pasted screenshot'
      await pasteScreenshot(bugId, dataUrl, ssName)
    }
    reader.readAsDataURL(blob)
  }, [selectedBugId, createBug, pasteScreenshot])

  useEffect(() => {
    // capture: true ensures capture before all child elements
    window.addEventListener('paste', handlePaste, true)
    return () => window.removeEventListener('paste', handlePaste, true)
  }, [handlePaste])

  // Create first project
  const handleCreateFirst = async () => {
    const name = newProjectName.trim()
    if (!name) return
    await createProject(name)
    setNewProjectName('')
  }

  // Show blank until data loads to prevent flicker
  if (!initLoaded) {
    return <div className="h-screen bg-bg-primary" />
  }

  // Show onboarding page when no projects
  if (projects.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-bg-primary text-text-primary font-sans items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="flex items-center justify-center mb-6">
            <img src="/favicon.svg" alt="BugPack" className="w-14 h-14" />
          </div>
          <h1 className="text-2xl font-bold mb-2">BugPack</h1>
          <p className="text-sm text-text-muted mb-8">
            {locale === 'zh' ? '创建你的第一个项目开始使用' : 'Create your first project to get started'}
          </p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFirst() }}
              placeholder={locale === 'zh' ? '输入项目名称' : 'Project name'}
              className="flex-1 px-4 py-3 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleCreateFirst}
              className="px-6 py-3 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              {locale === 'zh' ? '创建' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary font-sans overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar width={sidebarWidth} />
        {/* Left resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors"
          onMouseDown={makeResizeHandler(setSidebarWidth, sidebarWidth, 160, 400, 'left')}
        />
        <main className="flex-1 overflow-hidden">
          {!selectedBug ? (
            <EmptyState />
          ) : viewMode === 'edit' ? (
            <EditorArea key={selectedBug.id} bug={selectedBug} />
          ) : (
            <PreviewArea key={selectedBug.id} bug={selectedBug} />
          )}
        </main>
        {selectedBug && viewMode === 'edit' && (
          <>
            {/* Right resize handle */}
            <div
              className="w-1 shrink-0 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors"
              onMouseDown={makeResizeHandler(setPanelWidth, panelWidth, 240, 600, 'right')}
            />
            <PropertyPanel key={selectedBug.id} bug={selectedBug} width={panelWidth} />
          </>
        )}
      </div>
      <StatusBar />
      {settingsOpen && <SettingsModal />}
      {shortcutsOpen && <ShortcutsModal />}
    </div>
  )
}
