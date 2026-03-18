import { useState, useCallback } from 'react'
import { useStore, type Bug, type BugStatus, type Priority } from '../stores'
import { generateInstruction } from '../utils/generateInstruction'
import {
  ChevronDown,
  ChevronUp,
  Zap,
  Copy,
  FileText,
} from 'lucide-react'

// Collapsible Section
function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-hover transition-colors"
      >
        <span className="text-sm font-medium text-text-primary">{title}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

const statusOptions: BugStatus[] = ['pending', 'fixed', 'closed']
const priorityOptions: { key: Priority; color: string }[] = [
  { key: 'high', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'medium', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { key: 'low', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
]

export function PropertyPanel({ bug, width }: { bug: Bug; width?: number }) {
  const { t, locale, setViewMode, updateBug, compareMode, compareLeft, compareRight, currentProject, bugs, selectBug, clearSelection } = useStore()
  // Debounced update
  const handleFieldBlur = useCallback((field: string, value: string) => {
    updateBug(bug.id, { [field]: value })
  }, [bug.id, updateBug])

  return (
    <aside style={{ width: width ?? 320 }} className="bg-bg-sidebar border-l border-border flex flex-col shrink-0 overflow-y-auto">
      {/* Bug info */}
      <Section title={t.panel.bugInfo}>
        <div>
          <label className="text-xs text-text-muted block mb-1">{t.panel.title}</label>
          <input
            type="text"
            defaultValue={bug.title}
            key={`title-${bug.id}`}
            placeholder={t.panel.titlePlaceholder}
            onBlur={(e) => handleFieldBlur('title', e.target.value)}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">{t.panel.description}</label>
          <textarea
            defaultValue={bug.description}
            key={`desc-${bug.id}`}
            placeholder={t.panel.descriptionPlaceholder}
            rows={4}
            onBlur={(e) => handleFieldBlur('description', e.target.value)}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-y min-h-[96px]"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1.5">{t.panel.priority}</label>
          <div className="flex gap-2">
            {priorityOptions.map(({ key, color }) => (
              <button
                key={key}
                onClick={() => updateBug(bug.id, { priority: key })}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                  bug.priority === key ? color : 'border-border text-text-muted hover:border-border'
                }`}
              >
                {t.priority[key]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">{t.panel.statusLabel}</label>
          <select
            defaultValue={bug.status}
            key={`status-${bug.id}`}
            onChange={(e) => {
              const newStatus = e.target.value
              updateBug(bug.id, { status: newStatus })
              // 状态变化时，自动跳转到下一个待处理的 bug
              const nextPending = bugs.find(b => b.id !== bug.id && (b.status === 'pending' || b.status === 'annotating'))
              if (nextPending) {
                selectBug(nextPending.id)
              } else {
                // 没有待处理的 bug，清空选中状态
                clearSelection()
              }
            }}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>{t.status[s]}</option>
            ))}
          </select>
        </div>
      </Section>

      {/* Bottom action buttons */}
      <div className="mt-auto p-4 space-y-2">
        <button
          onClick={() => setViewMode('preview')}
          className="w-full py-3 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />
          {t.panel.generateBtn}
          <span className="text-xs opacity-60 ml-1">{t.panel.generateShortcut}</span>
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const md = generateInstruction(bug, locale, { enabled: compareMode, leftIndex: compareLeft, rightIndex: compareRight }, currentProject)
              navigator.clipboard.writeText(md)
            }}
            className="flex-1 py-2 bg-bg-input border border-border text-text-secondary text-sm rounded-lg hover:bg-bg-hover transition-colors flex items-center justify-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            {t.panel.copyBtn}
          </button>
          <button
            onClick={() => {
              const md = generateInstruction(bug, locale, { enabled: compareMode, leftIndex: compareLeft, rightIndex: compareRight }, currentProject)
              const blob = new Blob([md], { type: 'text/markdown' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `bug-${String(bug.number).padStart(3, '0')}.md`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="flex-1 py-2 bg-bg-input border border-border text-text-secondary text-sm rounded-lg hover:bg-bg-hover transition-colors flex items-center justify-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            {t.panel.exportBtn}
          </button>
        </div>
      </div>
    </aside>
  )
}
