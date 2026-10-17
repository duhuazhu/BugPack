import { useEffect, useCallback, useState, useRef } from 'react'
import { useStore } from './stores'
import { useKeyboard } from './hooks/useKeyboard'
import { useIsMobile } from './hooks/useIsMobile'
import { Navbar } from './components/Navbar'
import { Sidebar } from './components/Sidebar'
import { EditorArea } from './components/EditorArea'
import { PropertyPanel } from './components/PropertyPanel'
import { StatusBar } from './components/StatusBar'
import { SettingsModal } from './components/SettingsModal'
import { ShortcutsModal } from './components/ShortcutsModal'
import { EmptyState } from './components/EmptyState'
import { PreviewArea } from './components/PreviewArea'
import { ArrowLeft } from 'lucide-react'

export default function App() {
  const { bugs, selectedBugId, viewMode, settingsOpen, shortcutsOpen, projects, locale, fetchSettings, fetchProjects, createProject, createBug, pasteScreenshot, mobileDetailOpen, setMobileDetailOpen } = useStore()
  const isMobile = useIsMobile()
  // 手机详情页当前标签：标注 / 信息
  const [mobileTab, setMobileTab] = useState<'annotate' | 'info'>('annotate')
  const [initLoaded, setInitLoaded] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const initRef = useRef(false)

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

  // 初始化：加载设置（恢复上次项目ID），然后加载项目列表
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    fetchSettings()
      .then(() => fetchProjects())
      .then(() => setInitLoaded(true))
      .catch((e) => { console.error('初始化失败:', e); setInitLoaded(true) })
  }, [])

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
    return <div className="h-dvh bg-bg-primary" />
  }

  // Show onboarding page when no projects
  if (projects.length === 0) {
    return (
      <div className="flex flex-col h-dvh bg-bg-primary text-text-primary font-sans items-center justify-center px-4">
        <div className="text-center w-full max-w-sm">
          <div className="flex items-center justify-center mb-6">
            <img src="favicon.svg" alt="BugPack" className="w-14 h-14" />
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
              className="flex-1 min-w-0 px-4 py-3 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
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

  const modals = (
    <>
      {settingsOpen && <SettingsModal />}
      {shortcutsOpen && <ShortcutsModal />}
    </>
  )

  // 手机：列表页和详情页两屏切换
  if (isMobile) {
    const zh = locale === 'zh'
    const showDetail = mobileDetailOpen && !!selectedBug
    return (
      <div className="flex flex-col h-dvh bg-bg-primary text-text-primary font-sans overflow-hidden">
        {!showDetail ? (
          <>
            <Navbar />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
            </div>
            <StatusBar />
          </>
        ) : viewMode === 'preview' ? (
          <main className="flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
            <PreviewArea key={selectedBug.id} bug={selectedBug} />
          </main>
        ) : (
          <>
            <header className="h-12 bg-bg-primary border-b border-border flex items-center gap-2 px-2 shrink-0">
              <button
                onClick={() => setMobileDetailOpen(false)}
                className="p-2 rounded-lg text-text-secondary active:bg-bg-hover"
                aria-label={zh ? '返回列表' : 'Back to list'}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-text-muted shrink-0">#{String(selectedBug.number).padStart(3, '0')}</span>
              <span className="text-sm text-text-primary truncate flex-1 min-w-0">
                {selectedBug.title || (zh ? '未命名 Bug' : 'Untitled Bug')}
              </span>
            </header>
            <div className="flex border-b border-border shrink-0">
              {([['annotate', zh ? '截图标注' : 'Annotate'], ['info', zh ? 'Bug 信息' : 'Details']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMobileTab(key)}
                  className={`flex-1 py-2.5 text-sm relative ${mobileTab === key ? 'text-accent' : 'text-text-muted'}`}
                >
                  {label}
                  {mobileTab === key && <span className="absolute bottom-0 left-1/3 right-1/3 h-0.5 bg-accent rounded-full" />}
                </button>
              ))}
            </div>
            <main className="flex-1 overflow-hidden flex pb-[env(safe-area-inset-bottom)]">
              {mobileTab === 'annotate'
                ? <div className="flex-1 min-w-0"><EditorArea key={selectedBug.id} bug={selectedBug} /></div>
                : <PropertyPanel key={selectedBug.id} bug={selectedBug} />}
            </main>
          </>
        )}
        {modals}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-dvh bg-bg-primary text-text-primary font-sans overflow-hidden">
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
      {modals}
    </div>
  )
}
