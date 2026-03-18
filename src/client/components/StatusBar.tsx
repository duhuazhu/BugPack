import { useStore } from '../stores'
import { Folder } from 'lucide-react'

export function StatusBar() {
  const { bugs, settings, locale } = useStore()
  const zh = locale === 'zh'

  const total = bugs.length
  const pending = bugs.filter((b) => b.status === 'pending' || b.status === 'annotating').length

  return (
    <footer className="h-8 bg-bg-primary border-t border-border flex items-center justify-between px-4 text-xs text-text-muted shrink-0">
      {/* Left: workspace status + stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span>{zh ? '工作空间活跃' : 'Workspace Active'}</span>
        </div>
        <span>{zh ? `${total} 个 Bug · ${pending} 待处理` : `${total} bugs · ${pending} pending`}</span>
      </div>

      {/* Right: storage path */}
      <div className="flex items-center gap-1.5">
        <Folder className="w-3 h-3" />
        <span>{settings.dataDir || settings._dataDir || '~/.bugpack/data/'}</span>
      </div>
    </footer>
  )
}
