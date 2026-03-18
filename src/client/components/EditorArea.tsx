import { useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useStore, type Bug } from '../stores'
import { api } from '../api'
import { AnnotationCanvas, type AnnotationTool } from './AnnotationCanvas'
import { ConfirmDialog } from './ConfirmDialog'
import {
  Hand,
  MousePointer2,
  Square,
  MoveRight,
  Type,
  Hash,
  Highlighter,
  Pencil,
  Undo2,
  Redo2,
  RotateCcw,
  Minus,
  Plus,
  Maximize2,
  Clipboard,
  Plus as PlusIcon,
  X,
  ImageIcon,
  Columns2,
} from 'lucide-react'

// Mosaic pixel icon
function MosaicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="0" y="0" width="4" height="4" />
      <rect x="8" y="0" width="4" height="4" />
      <rect x="4" y="4" width="4" height="4" />
      <rect x="12" y="4" width="4" height="4" />
      <rect x="0" y="8" width="4" height="4" />
      <rect x="8" y="8" width="4" height="4" />
      <rect x="4" y="12" width="4" height="4" />
      <rect x="12" y="12" width="4" height="4" />
    </svg>
  )
}

const toolColors = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6']

// Clamp index within bounds
function clampIndex(idx: number, length: number) {
  return Math.max(0, Math.min(idx, length - 1))
}

export function EditorArea({ bug }: { bug: Bug }) {
  const { t, locale, uploadScreenshot, deleteScreenshot, renameScreenshot, updateScreenshotAnnotated, saveAnnotations, reorderScreenshots, compareMode, setCompareMode, compareLeft, setCompareLeft, compareRight, setCompareRight } = useStore()
  const zh = locale === 'zh'

  // 动态翻译默认截图名
  const displayName = (name: string) => {
    const m = name.match(/^(Screenshot|截图)\s*(\d+)$/)
    if (m) return zh ? `截图 ${m[2]}` : `Screenshot ${m[2]}`
    if (name === '粘贴截图' || name === 'Pasted screenshot') return zh ? '粘贴截图' : 'Pasted screenshot'
    return name
  }
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<AnnotationTool>('drag')
  const [activeColor, setActiveColor] = useState('#EF4444')
  const [activeLineWidth, setActiveLineWidth] = useState(2)
  const [zoom, setZoom] = useState(100)
  const [selectedScreenshot, setSelectedScreenshot] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragItemRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; imageUrl: string } | null>(null)
  const [copyToast, setCopyToast] = useState<string | null>(null)

  const copyImageToClipboard = useCallback(async (imageUrl: string) => {
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const pngBlob = blob.type === 'image/png' ? blob : await new Promise<Blob>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          canvas.toBlob((b) => resolve(b!), 'image/png')
        }
        img.src = imageUrl
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
      setCopyToast(t.editor.copySuccess)
    } catch {
      setCopyToast(t.editor.copyFail)
    }
    setTimeout(() => setCopyToast(null), 1500)
    setContextMenu(null)
  }, [t])

  const handleContextMenu = useCallback((e: ReactMouseEvent, imageUrl: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, imageUrl })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [contextMenu])

  // Reset screenshot index when bug changes
  useEffect(() => {
    setSelectedScreenshot(0)
    setCompareMode(false)
    setCompareLeft(0)
    setCompareRight(1)
    setZoom(100)
  }, [bug.id])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  // Listen for keyboard tool switching
  useEffect(() => {
    const handler = (e: Event) => {
      const tool = (e as CustomEvent).detail as AnnotationTool
      setActiveTool(tool)
    }
    window.addEventListener('bugpack:tool', handler)
    return () => window.removeEventListener('bugpack:tool', handler)
  }, [])

  const hasScreenshots = bug.screenshots.length > 0
  const safeIdx = clampIndex(selectedScreenshot, bug.screenshots.length)
  const currentSS = hasScreenshots ? bug.screenshots[safeIdx] : undefined

  const safeCompareLeft = clampIndex(compareLeft, bug.screenshots.length)
  const safeCompareRight = clampIndex(compareRight, bug.screenshots.length)

  // Debounced save of annotation data + annotated render image
  const handleSaveAnnotations = useMemo(() => {
    return (ssId: string) => (canvasJson: unknown, annotatedDataUrl: string | null) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveAnnotations(bug.id, ssId, [canvasJson])
        if (annotatedDataUrl) {
          api.saveAnnotatedImage(bug.id, ssId, annotatedDataUrl).catch(() => {})
        }
      }, 800)
    }
  }, [bug.id, saveAnnotations])

  const tools: { key: AnnotationTool; icon: any; label: string }[] = [
    { key: 'drag', icon: Hand, label: t.editor.tools.drag },
    { key: 'select', icon: MousePointer2, label: t.editor.tools.select },
    { key: 'rect', icon: Square, label: t.editor.tools.rect },
    { key: 'arrow', icon: MoveRight, label: t.editor.tools.arrow },
    { key: 'text', icon: Type, label: t.editor.tools.text },
    { key: 'number', icon: Hash, label: t.editor.tools.number },
    { key: 'highlight', icon: Highlighter, label: t.editor.tools.highlight },
    { key: 'pen', icon: Pencil, label: t.editor.tools.pen },
    { key: 'mosaic', icon: MosaicIcon, label: t.editor.tools.mosaic },
  ]

  // Drag-and-drop upload (max 10, sequential to avoid concurrency)
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, 10)
    for (const file of files) {
      try {
        await uploadScreenshot(bug.id, file, file.name)
      } catch (err) {
        console.error('Upload failed:', err)
      }
    }
  }, [bug.id, uploadScreenshot])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      await uploadScreenshot(bug.id, file, file.name)
    }
    e.target.value = ''
  }, [bug.id, uploadScreenshot])

  return (
    <div className="flex flex-col h-full">
      <div className="h-12 bg-bg-input border-b border-border flex items-center px-4 shrink-0">
        <div className="flex items-center gap-0.5 bg-bg-primary/60 rounded-lg p-1">
          {tools.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveTool(key)}
              className={`p-2 rounded-md transition-colors ${
                activeTool === key
                  ? 'bg-bg-card text-accent shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-border mx-3" />

        <div className="flex items-center gap-1.5">
          {toolColors.map((color) => (
            <button
              key={color}
              onClick={() => setActiveColor(color)}
              className={`w-5 h-5 rounded-full transition-all ${
                activeColor === color ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-bg-input' : 'hover:ring-1 hover:ring-white/20'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          {/* Custom color picker */}
          <label
            className={`w-5 h-5 rounded-full cursor-pointer transition-all overflow-hidden relative ${
              !toolColors.includes(activeColor) ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-bg-input' : 'hover:ring-1 hover:ring-white/20'
            }`}
            style={{ background: !toolColors.includes(activeColor) ? activeColor : `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)` }}
          >
            <input
              type="color"
              value={activeColor}
              onChange={(e) => setActiveColor(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>
        </div>

        <div className="w-px h-6 bg-border mx-3" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => window.dispatchEvent(new Event('bugpack:undo'))}
            className="p-2 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
            title={t.editor.tools.undo}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event('bugpack:redo'))}
            className="p-2 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
            title={t.editor.tools.redo}
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setResetConfirm(true)}
            className="p-2 rounded-md text-text-muted hover:text-red-400 hover:bg-bg-hover transition-colors"
            title={t.editor.tools.reset}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <div className="flex items-center gap-1.5">
            {([{ val: 1, size: 4 }, { val: 2, size: 7 }, { val: 4, size: 10 }]).map(({ val, size }) => (
              <button
                key={val}
                onClick={() => setActiveLineWidth(val)}
                className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                  activeLineWidth === val ? 'bg-accent/20' : 'hover:bg-bg-hover'
                }`}
              >
                <span
                  className={`block rounded-full ${activeLineWidth === val ? 'bg-accent' : 'bg-text-muted'}`}
                  style={{ width: size, height: size }}
                />
              </button>
            ))}
          </div>

          {bug.screenshots.length >= 1 && (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              <button
                onClick={() => {
                  setCompareMode(!compareMode)
                  if (!compareMode) {
                    setCompareLeft(selectedScreenshot)
                    setCompareRight(selectedScreenshot === 0 ? 1 : 0)
                  }
                }}
                className={`p-2 rounded-md transition-colors ${
                  compareMode ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                }`}
                title={t.editor.compare}
              >
                <Columns2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className={`flex-1 relative overflow-hidden bg-bg-primary ${dragOver ? 'drop-active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onContextMenu={(e) => {
          if (currentSS?.url) handleContextMenu(e as unknown as ReactMouseEvent, currentSS.url)
        }}
      >
        {dragOver && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-accent/5 border-2 border-dashed border-accent rounded-lg">
            <p className="text-accent text-lg font-medium">{t.editor.emptySubtitle}</p>
          </div>
        )}

        {hasScreenshots && currentSS && compareMode ? (
          /* Compare mode: two screenshots side by side */
          <div className="absolute inset-0 flex">
            <div className="flex-1 flex flex-col border-r border-border">
              <div className="text-center py-1.5 bg-bg-input border-b border-border">
                <span className="text-xs text-text-muted">{t.editor.compareLeft}</span>
                <select
                  value={safeCompareLeft}
                  onChange={(e) => setCompareLeft(Number(e.target.value))}
                  className="ml-2 text-xs bg-bg-card border border-border rounded px-1 py-0.5 text-text-primary"
                >
                  {bug.screenshots.map((ss, i) => (
                    <option key={ss.id} value={i}>{displayName(ss.name)}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                {bug.screenshots[safeCompareLeft] ? (
                  <img src={bug.screenshots[safeCompareLeft].url} alt={displayName(bug.screenshots[safeCompareLeft].name)} className="max-w-full max-h-full object-contain rounded" />
                ) : (
                  <p className="text-text-muted text-sm">{t.editor.emptySubtitle}</p>
                )}
              </div>
            </div>
            <div className="flex-1 flex flex-col">
              <div className="text-center py-1.5 bg-bg-input border-b border-border">
                <span className="text-xs text-text-muted">{t.editor.compareRight}</span>
                <select
                  value={safeCompareRight}
                  onChange={(e) => setCompareRight(Number(e.target.value))}
                  className="ml-2 text-xs bg-bg-card border border-border rounded px-1 py-0.5 text-text-primary"
                >
                  {bug.screenshots.map((ss, i) => (
                    <option key={ss.id} value={i}>{displayName(ss.name)}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                {bug.screenshots.length >= 2 && bug.screenshots[safeCompareRight] ? (
                  <img src={bug.screenshots[safeCompareRight].url} alt={bug.screenshots[safeCompareRight].name} className="max-w-full max-h-full object-contain rounded" />
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 text-text-muted hover:text-accent transition-colors border-2 border-dashed border-border hover:border-accent/50 rounded-xl px-12 py-8"
                  >
                    <PlusIcon className="w-8 h-8" />
                    <span className="text-sm">{zh ? '上传期望效果图' : 'Upload expected image'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : hasScreenshots && currentSS ? (
          <>
            <AnnotationCanvas
              key={currentSS.id}
              imageUrl={currentSS.url}
              color={activeColor}
              tool={activeTool}
              lineWidth={activeLineWidth}
              zoom={zoom}
              onZoomChange={setZoom}
              initialAnnotations={currentSS.annotations}
              onSaveAnnotations={handleSaveAnnotations(currentSS.id)}
              onAnnotated={() => {
                if (currentSS && !currentSS.annotated) {
                  updateScreenshotAnnotated(bug.id, currentSS.id)
                }
              }}
            />

            <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-bg-card/90 backdrop-blur-sm rounded-lg px-2 py-1 border border-border z-10">
              <button onClick={() => setZoom(Math.max(25, zoom - 25))} className="p-1 text-text-muted hover:text-text-secondary">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-text-secondary w-10 text-center">{zoom}%</span>
              <button onClick={() => setZoom(Math.min(200, zoom + 25))} className="p-1 text-text-muted hover:text-text-secondary">
                <Plus className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              <button onClick={() => { window.dispatchEvent(new Event('bugpack:fitWindow')) }} className="p-1 text-text-muted hover:text-text-secondary" title={t.editor.fitWindow}>
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center border-2 border-dashed border-border rounded-2xl px-16 py-12">
              <Clipboard className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="text-lg text-text-secondary mb-1">{t.editor.emptyTitle}</p>
              <p className="text-sm text-text-muted mb-3">{t.editor.emptySubtitle}</p>
              <p className="text-xs text-text-muted">{t.editor.emptyFormat}</p>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html,.md,.json,.xml,.zip"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="h-[180px] border-t border-border bg-bg-sidebar shrink-0">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm text-text-secondary">
            {t.evidence.title} ({bug.screenshots.length})
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
          >
            <PlusIcon className="w-3 h-3" />
            {t.evidence.addFile}
          </button>
        </div>
        <div className="flex gap-3 px-4 pb-3 overflow-x-auto">
          {bug.screenshots.map((ss, i) => (
            <button
              key={ss.id}
              draggable
              onClick={() => setSelectedScreenshot(i)}
              onDragStart={() => { dragItemRef.current = i }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i) }}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverIndex(null)
                const from = dragItemRef.current
                if (from === null || from === i) return
                const newOrder = [...bug.screenshots.map(s => s.id)]
                const moved = newOrder.splice(from, 1)[0]
                if (moved) newOrder.splice(i, 0, moved)
                reorderScreenshots(bug.id, newOrder)
                setSelectedScreenshot(i)
                dragItemRef.current = null
              }}
              onDragEnd={() => { dragItemRef.current = null; setDragOverIndex(null) }}
              className={`shrink-0 group relative transition-transform ${dragOverIndex === i ? 'scale-105 ring-2 ring-accent' : ''}`}
            >
              <div
                className={`w-[120px] h-[90px] rounded-lg overflow-hidden border-2 transition-colors ${
                  selectedScreenshot === i ? 'border-accent' : 'border-border hover:border-border'
                }`}
              >
                {ss.url ? (
                  <img
                    src={ss.url}
                    alt={ss.name}
                    className="w-full h-full object-cover"
                    onContextMenu={(e) => handleContextMenu(e, ss.url)}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-bg-input to-bg-card flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-text-muted/50" />
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteScreenshot(bug.id, ss.id) }}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full items-center justify-center text-white hidden group-hover:flex z-10"
              >
                <X className="w-3 h-3" />
              </button>
              {editingNameId === ss.id ? (
                <input
                  autoFocus
                  defaultValue={ss.name}
                  className="text-[11px] text-text-primary mt-1.5 text-center w-[120px] bg-bg-input border border-accent rounded px-1 py-0.5 outline-none"
                  onBlur={(e) => {
                    const val = e.target.value.trim()
                    if (val && val !== ss.name) renameScreenshot(bug.id, ss.id, val)
                    setEditingNameId(null)
                  }}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditingNameId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p
                  className="text-[11px] text-text-secondary mt-1.5 text-center truncate w-[120px] cursor-text"
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingNameId(ss.id) }}
                >
                  {displayName(ss.name)}
                </p>
              )}
            </button>
          ))}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 w-[120px] h-[90px] rounded-lg border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center text-text-muted hover:text-accent transition-colors"
          >
            <PlusIcon className="w-6 h-6 mb-1" />
            <span className="text-[11px]">{t.evidence.addFile}</span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={resetConfirm}
        title={zh ? '重置标注' : 'Reset Annotations'}
        message={zh
          ? `确定清除「${currentSS?.name || '当前截图'}」上的所有标注？此操作可通过撤销恢复。`
          : `Clear all annotations on "${currentSS?.name || 'current screenshot'}"? You can undo this action.`}
        confirmText={zh ? '确认重置' : 'Reset'}
        cancelText={zh ? '取消' : 'Cancel'}
        onConfirm={() => {
          window.dispatchEvent(new Event('bugpack:reset'))
          setResetConfirm(false)
        }}
        onCancel={() => setResetConfirm(false)}
      />

      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-4 py-2 text-sm text-text-primary hover:bg-bg-hover text-left"
            onClick={() => copyImageToClipboard(contextMenu.imageUrl)}
          >
            {t.editor.copyImage}
          </button>
        </div>
      )}

      {copyToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-bg-card border border-border rounded-lg px-4 py-2 text-sm text-text-primary shadow-lg">
          {copyToast}
        </div>
      )}
    </div>
  )
}
