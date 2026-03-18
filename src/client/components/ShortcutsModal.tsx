import { useStore } from '../stores'
import { X, Keyboard } from 'lucide-react'

export function ShortcutsModal() {
  const { t, locale, setShortcutsOpen } = useStore()

  // Dynamic i18n reference, synced with toolbar
  const data = [
    { category: locale === 'zh' ? '通用' : 'General', items: [
      { keys: 'Ctrl+V', desc: locale === 'zh' ? '粘贴截图' : 'Paste screenshot' },
      { keys: 'Ctrl+N', desc: locale === 'zh' ? '新建 Bug' : 'New Bug' },
      { keys: 'Ctrl+Enter', desc: locale === 'zh' ? '切换编辑/预览模式' : 'Toggle edit/preview' },
      { keys: 'Delete', desc: locale === 'zh' ? '删除选中标注' : 'Delete annotation' },
      { keys: 'Ctrl+Z', desc: t.editor.tools.undo },
      { keys: 'Ctrl+Shift+Z', desc: t.editor.tools.redo },
    ]},
    { category: locale === 'zh' ? '标注工具' : 'Annotation Tools', items: [
      { keys: 'D', desc: t.editor.tools.drag },
      { keys: 'V', desc: t.editor.tools.select },
      { keys: 'R', desc: t.editor.tools.rect },
      { keys: 'A', desc: t.editor.tools.arrow },
      { keys: 'T', desc: t.editor.tools.text },
      { keys: 'N', desc: t.editor.tools.number },
      { keys: 'H', desc: t.editor.tools.highlight },
      { keys: 'P', desc: t.editor.tools.pen },
      { keys: 'M', desc: t.editor.tools.mosaic },
    ]},
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShortcutsOpen(false)}>
      <div className="w-[400px] bg-bg-card border border-border rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">
              {locale === 'zh' ? '快捷键' : 'Keyboard Shortcuts'}
            </h2>
          </div>
          <button
            onClick={() => setShortcutsOpen(false)}
            className="p-1.5 rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {data.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">{group.category}</h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{item.desc}</span>
                    <div className="flex gap-1">
                      {item.keys.split('+').map((k) => (
                        <kbd key={k} className="px-2 py-0.5 bg-bg-input border border-border rounded text-xs text-text-primary font-mono">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
