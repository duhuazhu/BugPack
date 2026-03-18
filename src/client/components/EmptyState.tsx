import { useStore } from '../stores'
import { Lightbulb } from 'lucide-react'

export function EmptyState() {
  const { t, createBug } = useStore()

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <img src="/favicon.svg" alt="BugPack" className="w-12 h-12" />
        </div>

        <h2 className="text-xl font-semibold text-text-primary mb-2">
          {t.empty.title}
        </h2>
        <p className="text-sm text-text-muted mb-6">{t.empty.subtitle}</p>

        <button onClick={() => createBug()} className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors">
          {t.empty.createFirst}
        </button>

        <div className="mt-8 mx-auto max-w-sm bg-bg-card border border-border rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-xs text-text-muted text-left leading-relaxed">
              {t.empty.tip}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
