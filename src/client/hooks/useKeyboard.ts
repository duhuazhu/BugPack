import { useEffect } from 'react'
import { useStore } from '../stores'

// Global keyboard shortcuts
export function useKeyboard() {
  const { createBug, setViewMode, viewMode, selectedBugId } = useStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable

      // Ctrl combos (regardless of input focus)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault()
          createBug()
          return
        }
        if (e.key === 'Enter' && selectedBugId) {
          e.preventDefault()
          setViewMode(viewMode === 'edit' ? 'preview' : 'edit')
          return
        }
      }

      // Single key shortcuts (only when not in input)
      if (isInput) return

      // Tool switching via custom events, listened by EditorArea
      const toolMap: Record<string, string> = {
        d: 'drag',
        v: 'select',
        r: 'rect',
        a: 'arrow',
        t: 'text',
        n: 'number',
        h: 'highlight',
        p: 'pen',
        m: 'mosaic',
      }

      const tool = toolMap[e.key.toLowerCase()]
      if (tool) {
        window.dispatchEvent(new CustomEvent('bugpack:tool', { detail: tool }))
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createBug, setViewMode, viewMode, selectedBugId])
}
