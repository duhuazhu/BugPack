import { useState, useEffect, useRef } from 'react'
import { useStore } from '../stores'
import { api } from '../api'
import { X, Download, RefreshCw, ExternalLink, AlertCircle, ChevronDown, CheckSquare, Square } from 'lucide-react'

interface JiraBug {
  id: string
  key: string
  title: string
  priority: string
  priorityId: string
  status: string
  statusCategory: string
  reporter: string
  created: string
  hasAttachments: boolean
}

interface JiraProject {
  id: string
  key: string
  name: string
}

export function JiraModal({ onClose }: { onClose: () => void }) {
  const { locale, currentProjectId, fetchBugs, settings, saveSettings } = useStore()
  const hasImported = useRef(false)
  const zh = locale === 'zh'

  const [projects, setProjects] = useState<JiraProject[]>([])
  const [selectedProjectKey, setSelectedProjectKey] = useState(settings.jiraProjectKey || '')
  const [bugs, setBugs] = useState<JiraBug[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [imported, setImported] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [step, setStep] = useState<'projects' | 'bugs'>(settings.jiraProjectKey ? 'bugs' : 'projects')

  // Load project list
  const loadProjects = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.jira.getProjects()
      if (!res.ok) throw new Error(res.error || 'Failed to fetch projects')
      setProjects(res.projects || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Load bug list
  const loadBugs = async (projectKey?: string) => {
    const pk = projectKey || selectedProjectKey
    if (!pk) { setStep('projects'); loadProjects(); return }
    setLoading(true)
    setError('')
    try {
      if (pk !== settings.jiraProjectKey) {
        await saveSettings({ jiraProjectKey: pk })
      }
      const res = await api.jira.getBugs()
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
    if (settings.jiraProjectKey) {
      loadBugs(settings.jiraProjectKey)
    } else {
      loadProjects()
    }
  }, [])

  const selectProject = (key: string) => {
    setSelectedProjectKey(key)
    loadBugs(key)
  }

  // Import single bug
  const handleImport = async (key: string) => {
    setImporting(prev => new Set(prev).add(key))
    try {
      const res = await api.jira.importBug(key, currentProjectId)
      if (!res.ok) throw new Error('Import failed')
      setImported(prev => new Set(prev).add(key))
      hasImported.current = true
    } catch {
      // ignore
    } finally {
      setImporting(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const toggleSelectAll = () => {
    const importable = bugs.filter(b => !imported.has(b.key)).map(b => b.key)
    const allSelected = importable.every(k => selected.has(k))
    setSelected(allSelected ? new Set() : new Set(importable))
  }

  const handleBatchImport = async () => {
    if (selected.size === 0) return
    setBatchImporting(true)
    const keys = [...selected].filter(k => !imported.has(k))
    for (const key of keys) {
      setImporting(prev => new Set(prev).add(key))
      try {
        const res = await api.jira.importBug(key, currentProjectId)
        if (res.ok) setImported(prev => new Set(prev).add(key))
      } catch {
        // skip failed
      } finally {
        setImporting(prev => { const s = new Set(prev); s.delete(key); return s })
      }
    }
    setSelected(new Set())
    hasImported.current = true
    setBatchImporting(false)
    fetchBugs()
    onClose()
  }

  // Priority color
  const priColor = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('high') || n.includes('critical') || n.includes('blocker')) return 'text-red-400'
    if (n.includes('medium')) return 'text-yellow-400'
    return 'text-text-muted'
  }

  const curProject = projects.find(p => p.key === selectedProjectKey)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[600px] max-h-[80vh] bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-text-primary">
              {zh ? '从 Jira 导入' : 'Import from Jira'}
            </h2>
            {step === 'bugs' && (
              <button
                onClick={() => { setStep('projects'); loadProjects() }}
                className="ml-2 flex items-center gap-1 px-2 py-0.5 text-xs text-blue-400 bg-blue-400/10 rounded hover:bg-blue-400/20 transition-colors"
              >
                {curProject ? `${curProject.name} (${curProject.key})` : selectedProjectKey}
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => step === 'bugs' ? loadBugs() : loadProjects()}
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
                  {zh ? '请检查设置中的 Jira 配置' : 'Check Jira settings'}
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

          {/* Project selection */}
          {!loading && step === 'projects' && !error && (
            <div className="p-6">
              <p className="text-sm text-text-secondary mb-3">
                {zh ? '选择 Jira 项目：' : 'Select a Jira project:'}
              </p>
              {projects.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">
                  {zh ? '没有找到项目（当前账号可能无权限）' : 'No projects found (no permission?)'}
                </p>
              ) : (
                <div className="space-y-2">
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectProject(p.key)}
                      className="w-full text-left px-4 py-3 bg-bg-input border border-border rounded-lg hover:border-blue-400 hover:bg-blue-400/5 transition-colors"
                    >
                      <span className="text-xs text-text-muted mr-2">{p.key}</span>
                      <span className="text-sm text-text-primary">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bug list */}
          {!loading && step === 'bugs' && !error && bugs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted text-sm">
              <p>{zh ? '该项目下没有指派给你的 Bug' : 'No bugs assigned to you'}</p>
            </div>
          )}

          {!loading && step === 'bugs' && bugs.length > 0 && (
            <div className="divide-y divide-border">
              {bugs.map(bug => (
                <div key={bug.key} className="px-6 py-3 flex items-center gap-3 hover:bg-bg-hover transition-colors">
                  <button
                    onClick={() => toggleSelect(bug.key)}
                    className={`shrink-0 ${imported.has(bug.key) ? 'text-text-muted/30 cursor-default' : 'text-text-muted hover:text-blue-400'}`}
                    disabled={imported.has(bug.key)}
                  >
                    {selected.has(bug.key) ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-text-muted">{bug.key}</span>
                      <span className={`text-xs font-medium ${priColor(bug.priority)}`}>{bug.priority}</span>
                      <span className="text-xs text-text-muted px-1.5 py-0.5 bg-bg-input rounded">{bug.status}</span>
                    </div>
                    <p className="text-sm text-text-primary truncate">{bug.title}</p>
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                      {bug.reporter && <span>{bug.reporter}</span>}
                      {bug.created && <span>{new Date(bug.created).toLocaleString()}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleImport(bug.key)}
                    disabled={importing.has(bug.key) || imported.has(bug.key)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                      imported.has(bug.key)
                        ? 'bg-green-500/20 text-green-400 cursor-default'
                        : importing.has(bug.key)
                        ? 'bg-bg-input text-text-muted cursor-wait'
                        : 'bg-blue-400/20 text-blue-400 hover:bg-blue-400/30'
                    }`}
                  >
                    {imported.has(bug.key) ? (
                      zh ? '已导入' : 'Imported'
                    ) : importing.has(bug.key) ? (
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
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-blue-400 transition-colors"
              >
                {bugs.filter(b => !imported.has(b.key)).every(b => selected.has(b.key)) && bugs.some(b => !imported.has(b.key))
                  ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                  : <Square className="w-3.5 h-3.5" />}
                {zh ? '全选' : 'Select All'}
              </button>
            )}
            <span className="text-xs text-text-muted">
              {step === 'bugs'
                ? (zh
                  ? `指派给我 ${bugs.length} 个 Bug${selected.size > 0 ? `，已选 ${selected.size} 个` : ''}`
                  : `${bugs.length} bugs assigned to me${selected.size > 0 ? `, ${selected.size} selected` : ''}`)
                : (zh ? `共 ${projects.length} 个项目` : `${projects.length} projects`)}
            </span>
          </div>
          {step === 'bugs' && selected.size > 0 && (
            <button
              onClick={handleBatchImport}
              disabled={batchImporting}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                batchImporting
                  ? 'bg-bg-input text-text-muted cursor-wait'
                  : 'bg-blue-400 text-white hover:bg-blue-500'
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
