import { useState, useEffect, useRef } from 'react'
import { useStore } from '../stores'
import { api } from '../api'
import { X, Download, RefreshCw, ExternalLink, AlertCircle, CheckSquare, Square } from 'lucide-react'

interface TapdBug {
  id: string
  title: string
  severity: string
  priority: string
  status: string
  reporter: string
  currentOwner: string
  created: string
}

export function TapdModal({ onClose }: { onClose: () => void }) {
  const { locale, currentProjectId, fetchBugs, settings } = useStore()
  const zh = locale === 'zh'
  const hasImported = useRef(false)

  const [bugs, setBugs] = useState<TapdBug[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [imported, setImported] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const loadBugs = async () => {
    if (!settings.tapdWorkspaceId) {
      setError(zh ? '请先在设置中填写 TAPD 项目 ID（workspace_id）' : 'Please set TAPD workspace_id in Settings first')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.tapd.getBugs()
      if (!res.ok) throw new Error(res.error || 'Failed to fetch')
      setBugs(res.bugs || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBugs()
  }, [])

  const handleImport = async (id: string) => {
    setImporting(prev => new Set(prev).add(id))
    try {
      const res = await api.tapd.importBug(id, currentProjectId)
      if (!res.ok) throw new Error('Import failed')
      setImported(prev => new Set(prev).add(id))
      hasImported.current = true
    } catch {
      // ignore
    } finally {
      setImporting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleSelectAll = () => {
    const importable = bugs.filter(b => !imported.has(b.id)).map(b => b.id)
    const allSelected = importable.every(id => selected.has(id))
    setSelected(allSelected ? new Set() : new Set(importable))
  }

  const handleBatchImport = async () => {
    if (selected.size === 0) return
    setBatchImporting(true)
    const ids = [...selected].filter(id => !imported.has(id))
    for (const id of ids) {
      setImporting(prev => new Set(prev).add(id))
      try {
        const res = await api.tapd.importBug(id, currentProjectId)
        if (res.ok) setImported(prev => new Set(prev).add(id))
      } catch {
        // skip failed
      } finally {
        setImporting(prev => { const s = new Set(prev); s.delete(id); return s })
      }
    }
    setSelected(new Set())
    hasImported.current = true
    setBatchImporting(false)
    fetchBugs()
    onClose()
  }

  const sevColor = (s: string) => {
    if (s === 'fatal' || s === '致命') return 'text-red-400'
    if (s === 'serious' || s === '严重') return 'text-orange-400'
    if (s === 'normal' || s === '一般') return 'text-yellow-400'
    return 'text-text-muted'
  }

  const statusText = (s: string) => {
    const map: Record<string, string> = {
      new: zh ? '新建' : 'New',
      assigned: zh ? '已指派' : 'Assigned',
      reopened: zh ? '重新打开' : 'Reopened',
      resolved: zh ? '已解决' : 'Resolved',
      closed: zh ? '已关闭' : 'Closed',
    }
    return map[s] || s
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[600px] max-h-[80vh] bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-text-primary">
              {zh ? '从 TAPD 导入' : 'Import from TAPD'}
            </h2>
            {settings.tapdWorkspaceId && (
              <span className="ml-2 px-2 py-0.5 text-xs text-cyan-400 bg-cyan-400/10 rounded">
                #{settings.tapdWorkspaceId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadBugs()}
              className="p-1.5 rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => { if (hasImported.current) fetchBugs(); onClose() }} className="p-1.5 rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm text-red-400">
                <p>{error}</p>
                <p className="text-xs text-red-400/60 mt-1">
                  {zh ? '请检查设置中的 TAPD 配置' : 'Check TAPD settings'}
                </p>
              </div>
            </div>
          )}

          {loading && !error && (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              {zh ? '加载中...' : 'Loading...'}
            </div>
          )}

          {/* Bug list */}
          {!loading && !error && bugs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted text-sm">
              <p>{zh ? '该项目下没有待处理的 Bug' : 'No open bugs in this project'}</p>
            </div>
          )}

          {!loading && bugs.length > 0 && (
            <div className="divide-y divide-border">
              {bugs.map(bug => (
                <div key={bug.id} className="px-6 py-3 flex items-center gap-3 hover:bg-bg-hover transition-colors">
                  <button
                    onClick={() => toggleSelect(bug.id)}
                    className={`shrink-0 ${imported.has(bug.id) ? 'text-text-muted/30 cursor-default' : 'text-text-muted hover:text-cyan-400'}`}
                    disabled={imported.has(bug.id)}
                  >
                    {selected.has(bug.id) ? <CheckSquare className="w-4 h-4 text-cyan-400" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-text-muted">#{bug.id}</span>
                      <span className={`text-xs font-medium ${sevColor(bug.severity)}`}>{bug.severity || bug.priority}</span>
                      <span className="text-xs text-text-muted px-1.5 py-0.5 bg-bg-input rounded">{statusText(bug.status)}</span>
                    </div>
                    <p className="text-sm text-text-primary truncate">{bug.title}</p>
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                      {bug.currentOwner && <span>{bug.currentOwner}</span>}
                      {bug.created && <span>{bug.created.split(' ')[0]}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleImport(bug.id)}
                    disabled={importing.has(bug.id) || imported.has(bug.id)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                      imported.has(bug.id)
                        ? 'bg-green-500/20 text-green-400 cursor-default'
                        : importing.has(bug.id)
                        ? 'bg-bg-input text-text-muted cursor-wait'
                        : 'bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30'
                    }`}
                  >
                    {imported.has(bug.id) ? (
                      zh ? '已导入' : 'Imported'
                    ) : importing.has(bug.id) ? (
                      <><RefreshCw className="w-3 h-3 animate-spin" /> {zh ? '导入中' : 'Importing'}</>
                    ) : (
                      <><Download className="w-3 h-3" /> {zh ? '导入' : 'Import'}</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {bugs.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-cyan-400 transition-colors"
              >
                {bugs.filter(b => !imported.has(b.id)).every(b => selected.has(b.id)) && bugs.some(b => !imported.has(b.id))
                  ? <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                  : <Square className="w-3.5 h-3.5" />}
                {zh ? '全选' : 'Select All'}
              </button>
            )}
            <span className="text-xs text-text-muted">
              {zh
                ? `共 ${bugs.length} 个 Bug${selected.size > 0 ? `，已选 ${selected.size} 个` : ''}`
                : `${bugs.length} bugs${selected.size > 0 ? `, ${selected.size} selected` : ''}`}
            </span>
          </div>
          {selected.size > 0 && (
            <button
              onClick={handleBatchImport}
              disabled={batchImporting}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                batchImporting
                  ? 'bg-bg-input text-text-muted cursor-wait'
                  : 'bg-cyan-400 text-white hover:bg-cyan-500'
              }`}
            >
              {batchImporting ? (
                <><RefreshCw className="w-3 h-3 animate-spin" /> {zh ? '批量导入中...' : 'Importing...'}</>
              ) : (
                <><Download className="w-3 h-3" /> {zh ? `批量导入 (${selected.size})` : `Import (${selected.size})`}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
