import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { marked } from 'marked'
import morphdom from 'morphdom'
import { useStore, type Bug } from '../stores'
import { generateInstruction } from '../utils/generateInstruction'
import { ArrowLeft, Copy, Download, Check } from 'lucide-react'

// Configure marked: add section id to h2
const renderer = new marked.Renderer()
renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
  let id = ''
  if (depth === 2) {
    if (text.includes('Screenshot') || text.includes('截图')) id = 'section-screenshots'
    else if (text.includes('Environment') || text.includes('环境')) id = 'section-environment'
    else if (text.includes('File') || text.includes('文件')) id = 'section-files'
    else if (text.includes('Priority') || text.includes('优先') || text.includes('Instruction') || text.includes('指令')) id = 'section-ai'
  }
  return `<h${depth}${id ? ` id="${id}"` : ''}>${text}</h${depth}>`
}
marked.use({ renderer, gfm: true, breaks: false, async: false })

export function PreviewArea({ bug }: { bug: Bug }) {
  const { t, locale, setViewMode, compareMode, compareLeft, compareRight, currentProject } = useStore()
  const [copied, setCopied] = useState(false)

  // Generate Markdown source
  const markdown = useMemo(() => {
    return generateInstruction(bug, locale, {
      enabled: compareMode,
      leftIndex: compareLeft,
      rightIndex: compareRight,
    }, currentProject)
  }, [bug, locale, compareMode, compareLeft, compareRight, currentProject])

  // Convert to HTML
  const html = useMemo(() => marked.parse(markdown) as string, [markdown])

  // morphdom: only patch changed DOM nodes, keep unchanged elements in place
  const mdRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mdRef.current) return
    // Create temp div for new content
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    // morphdom diffs old/new DOM, updates only changes
    morphdom(mdRef.current, tmp, { childrenOnly: true })
  }, [html])

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [markdown])

  // Export .md file
  const handleExport = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bug-${String(bug.number).padStart(3, '0')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [markdown, bug.number])

  // Active navigation item
  const [activeNav, setActiveNav] = useState(0)

  return (
    <div className="flex h-full">
      {/* Left sidebar table of contents */}
      <div className="hidden md:block w-48 bg-bg-sidebar border-r border-border p-4 shrink-0">
        <button
          onClick={() => setViewMode('edit')}
          className="flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.preview.backToEdit}
        </button>

        <p className="text-[10px] text-text-muted uppercase tracking-wider mb-3">{t.preview.contents}</p>
        <nav className="space-y-2">
          {[
            bug.screenshots.length > 0 && { label: t.preview.screenshots, id: 'section-screenshots' },
            (bug.pagePath || bug.device || bug.browser) && { label: t.preview.environment, id: 'section-environment' },
            bug.relatedFiles.length > 0 && { label: t.preview.relatedFilesSection, id: 'section-files' },
            { label: t.preview.aiInstructions, id: 'section-ai' },
          ].filter((x): x is { label: string; id: string } => !!x).map(({ label, id }, i) => (
            <button
              key={i}
              onClick={() => {
                setActiveNav(i)
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`block text-sm text-left w-full transition-colors ${
                activeNav === i ? 'text-accent' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Center Markdown preview */}
      <div className="flex-1 overflow-y-auto">
        {/* Action bar */}
        <div className="sticky top-0 bg-bg-primary/90 backdrop-blur-sm border-b border-border px-2 md:px-6 py-2 md:py-3 flex items-center justify-between gap-2 z-10">
          {/* 手机端没有左侧目录，返回按钮放这里 */}
          <button
            onClick={() => setViewMode('edit')}
            className="md:hidden p-2 rounded-lg text-accent active:bg-bg-hover"
            aria-label={t.preview.backToEdit}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-sm text-text-secondary flex-1 min-w-0 truncate">
            Bug #{String(bug.number).padStart(3, '0')}
            {bug.externalId && (
              <span className="ml-2 text-xs text-accent">[{bug.externalId}]</span>
            )}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              title={t.preview.copy}
              className="flex items-center gap-1.5 p-2.5 md:px-3 md:py-1.5 text-sm text-text-secondary bg-bg-input border border-border rounded-lg hover:bg-bg-hover transition-colors"
            >
              {copied ? <Check className="w-4 h-4 md:w-3.5 md:h-3.5 text-green-400" /> : <Copy className="w-4 h-4 md:w-3.5 md:h-3.5" />}
              <span className="hidden md:inline">{copied ? (locale === 'zh' ? '已复制' : 'Copied') : t.preview.copy}</span>
            </button>
            <button
              onClick={handleExport}
              title={t.preview.export}
              className="flex items-center gap-1.5 p-2.5 md:px-3 md:py-1.5 text-sm text-text-secondary bg-bg-input border border-border rounded-lg hover:bg-bg-hover transition-colors"
            >
              <Download className="w-4 h-4 md:w-3.5 md:h-3.5" />
              <span className="hidden md:inline">{t.preview.export}</span>
            </button>
          </div>
        </div>

        {/* Markdown render */}
        <div className="max-w-5xl mx-auto p-4 md:p-8 prose prose-invert prose-sm max-w-none
          prose-headings:text-text-primary prose-p:text-text-secondary prose-li:text-text-secondary
          prose-a:text-accent prose-strong:text-text-primary prose-code:text-accent
          prose-img:rounded-lg prose-img:border prose-img:border-border
          prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-4
          prose-h2:text-lg prose-h2:font-semibold prose-h2:text-accent prose-h2:mt-8 prose-h2:mb-3
          prose-h3:text-base prose-h3:font-medium prose-h3:mt-4 prose-h3:mb-2
          prose-ul:my-2 prose-ol:my-2
        ">
          <div ref={mdRef} />
        </div>

        {/* Raw Markdown source */}
        <div className="max-w-5xl mx-auto px-4 md:px-8 pb-4">
          <details className="group">
            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary mb-2">
              {locale === 'zh' ? '查看原始 Markdown' : 'View Raw Markdown'}
            </summary>
            <pre className="text-xs text-text-muted bg-bg-card border border-border rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
              {markdown}
            </pre>
          </details>
        </div>

      </div>

    </div>
  )
}
