import { useState, useEffect, useRef } from 'react'
import { useStore } from '../stores'
import { api } from '../api'
import { X, Download, RefreshCw, ExternalLink, AlertCircle, ChevronDown, CheckSquare, Square } from 'lucide-react'

interface LinearBug {
  id: string
  identifier: string
  title: string
  priority: number
  priorityLabel: string
  status: string
  statusType: string
  creator: string
  created: string
  hasAttachments: boolean
}

interface LinearTeam {
  id: string
  key: string
  name: string
}

export function LinearModal({ onClose }: { onClose: () => void }) {
  const { locale, currentProjectId, fetchBugs, settings, saveSettings } = useStore()
  const zh = locale === 'zh'
  const hasImported = useRef(false)

  const [teams, setTeams] = useState<LinearTeam[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState(settings.linearTeamId || '')
  const [bugs, setBugs] = useState<LinearBug[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [imported, setImported] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [step, setStep] = useState<'teams' | 'bugs'>(settings.linearTeamId ? 'bugs' : 'teams')

  const loadTeams = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.linear.getTeams()
      if (!res.ok) throw new Error(res.error || 'Failed to fetch teams')
      setTeams(res.teams || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadBugs = async (teamId?: string) => {
    const tid = teamId || selectedTeamId
    if (!tid) { setStep('teams'); loadTeams(); return }
    setLoading(true)
    setError('')
    try {
      if (tid !== settings.linearTeamId) {
        await saveSettings({ linearTeamId: tid })
      }
      const res = await api.linear.getBugs()
      if (!res.ok) throw new Error(res.error || 'Failed to fetch')
      setBugs(res.bugs || [])
      setStep('bugs')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (settings.linearTeamId) {
      loadBugs(settings.linearTeamId)
    } else {
      loadTeams()
    }
  }, [])

  const selectTeam = (id: string) => {
    setSelectedTeamId(id)
    loadBugs(id)
  }

  const handleImport = async (id: string) => {
    setImporting(prev => new Set(prev).add(id))
    try {
      const res = await api.linear.importBug(id, currentProjectId)
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
        const res = await api.linear.importBug(id, currentProjectId)
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

  // Priority color: 1=Urgent 2=High 3=Medium 4=Low
  const priColor = (p: number) => {
    if (p <= 1) return 'text-red-400'
    if (p === 2) return 'text-orange-400'
    if (p === 3) return 'text-yellow-400'
    return 'text-text-muted'
  }

  const curTeam = teams.find(t => t.id === selectedTeamId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[600px] max-h-[80vh] bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-text-primary">
              {zh ? '从 Linear 导入' : 'Import from Linear'}
            </h2>
            {step === 'bugs' && (
              <button
                onClick={() => { setStep('teams'); loadTeams() }}
                className="ml-2 flex items-center gap-1 px-2 py-0.5 text-xs text-violet-400 bg-violet-400/10 rounded hover:bg-violet-400/20 transition-colors"
              >
                {curTeam ? `${curTeam.name} (${curTeam.key})` : selectedTeamId}
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => step === 'bugs' ? loadBugs() : loadTeams()}
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
                  {zh ? '请检查设置中的 Linear 配置' : 'Check Linear settings'}
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

          {/* Team selection */}
          {!loading && step === 'teams' && !error && (
            <div className="p-6">
              <p className="text-sm text-text-secondary mb-3">
                {zh ? '选择 Linear 团队：' : 'Select a Linear team:'}
              </p>
              {teams.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">
                  {zh ? '没有找到团队' : 'No teams found'}
                </p>
              ) : (
                <div className="space-y-2">
                  {teams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => selectTeam(t.id)}
                      className="w-full text-left px-4 py-3 bg-bg-input border border-border rounded-lg hover:border-violet-400 hover:bg-violet-400/5 transition-colors"
                    >
                      <span className="text-xs text-text-muted mr-2">{t.key}</span>
                      <span className="text-sm text-text-primary">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Issue list */}
          {!loading && step === 'bugs' && !error && bugs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted text-sm">
              <p>{zh ? '该团队下没有指派给你的 Issue' : 'No issues assigned to you'}</p>
            </div>
          )}

          {!loading && step === 'bugs' && bugs.length > 0 && (
            <div className="divide-y divide-border">
              {bugs.map(bug => (
                <div key={bug.id} className="px-6 py-3 flex items-center gap-3 hover:bg-bg-hover transition-colors">
                  <button
                    onClick={() => toggleSelect(bug.id)}
                    className={`shrink-0 ${imported.has(bug.id) ? 'text-text-muted/30 cursor-default' : 'text-text-muted hover:text-violet-400'}`}
                    disabled={imported.has(bug.id)}
                  >
                    {selected.has(bug.id) ? <CheckSquare className="w-4 h-4 text-violet-400" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-text-muted">{bug.identifier}</span>
                      <span className={`text-xs font-medium ${priColor(bug.priority)}`}>{bug.priorityLabel}</span>
                      <span className="text-xs text-text-muted px-1.5 py-0.5 bg-bg-input rounded">{bug.status}</span>
                    </div>
                    <p className="text-sm text-text-primary truncate">{bug.title}</p>
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                      {bug.creator && <span>{bug.creator}</span>}
                      {bug.created && <span>{new Date(bug.created).toLocaleString()}</span>}
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
                        : 'bg-violet-400/20 text-violet-400 hover:bg-violet-400/30'
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
            {step === 'bugs' && bugs.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-violet-400 transition-colors"
              >
                {bugs.filter(b => !imported.has(b.id)).every(b => selected.has(b.id)) && bugs.some(b => !imported.has(b.id))
                  ? <CheckSquare className="w-3.5 h-3.5 text-violet-400" />
                  : <Square className="w-3.5 h-3.5" />}
                {zh ? '全选' : 'Select All'}
              </button>
            )}
            <span className="text-xs text-text-muted">
              {step === 'bugs'
                ? (zh
                  ? `指派给我 ${bugs.length} 个 Issue${selected.size > 0 ? `，已选 ${selected.size} 个` : ''}`
                  : `${bugs.length} issues assigned to me${selected.size > 0 ? `, ${selected.size} selected` : ''}`)
                : (zh ? `共 ${teams.length} 个团队` : `${teams.length} teams`)}
            </span>
          </div>
          {step === 'bugs' && selected.size > 0 && (
            <button
              onClick={handleBatchImport}
              disabled={batchImporting}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                batchImporting
                  ? 'bg-bg-input text-text-muted cursor-wait'
                  : 'bg-violet-400 text-white hover:bg-violet-500'
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
