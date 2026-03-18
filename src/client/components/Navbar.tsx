import { useState, useRef, useEffect } from 'react'
import { useStore } from '../stores'
import { ConfirmDialog } from './ConfirmDialog'
import { api } from '../api'
import {
  Settings,
  ChevronDown,
  Plus,
  Trash2,
  Download,
  Upload,
} from 'lucide-react'

export function Navbar() {
  const {
    t, locale, setSettingsOpen,
    currentProject, currentProjectId, projects,
    createProject, switchProject, deleteProject, fetchBugs,
  } = useStore()
  const zh = locale === 'zh'

  // Project switching
  const [projDropdown, setProjDropdown] = useState(false)
  const [projCreating, setProjCreating] = useState(false)
  const [projNewName, setProjNewName] = useState('')
  const [projCreateLoading, setProjCreateLoading] = useState(false)
  const [projImportLoading, setProjImportLoading] = useState(false)
  const [projDeleteTarget, setProjDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const projDropdownRef = useRef<HTMLDivElement>(null)
  const projImportRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projDropdownRef.current && !projDropdownRef.current.contains(e.target as Node)) {
        setProjDropdown(false)
        setProjCreating(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleProjCreate = async () => {
    const name = projNewName.trim()
    if (!name || projCreateLoading) return
    setProjCreateLoading(true)
    try {
      await createProject(name)
      setProjNewName('')
      setProjCreating(false)
      setProjDropdown(false)
    } finally {
      setProjCreateLoading(false)
    }
  }

  const handleProjImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || projImportLoading) return
    setProjImportLoading(true)
    try {
      const res = await api.importProject(currentProjectId, file)
      if (res.ok) {
        await fetchBugs()
        setProjDropdown(false)
      } else {
        console.error('Import failed:',res.error)
      }
    } catch (err) {
      console.error('Import failed:',err)
    } finally {
      setProjImportLoading(false)
    }
    e.target.value = ''
  }

  return (
    <header className="h-12 bg-bg-primary border-b border-border flex items-center justify-between px-4 shrink-0">
      {/* Left Logo */}
      <div className="flex items-center gap-2">
        <img src="/favicon.svg" alt="BugPack" className="w-7 h-7" />
        <span className="text-base font-bold tracking-tight text-text-primary">{t.app.name}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Project switcher */}
        <div className="relative" ref={projDropdownRef}>
          <button
            onClick={() => setProjDropdown(!projDropdown)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-border text-sm hover:bg-bg-hover transition-colors"
          >
            <span className="text-text-muted">{t.nav.project}:</span>
            <span className="text-text-primary font-medium">{currentProject}</span>
            <ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${projDropdown ? 'rotate-180' : ''}`} />
          </button>

          {projDropdown && (
            <div className="absolute top-full right-0 mt-1 w-64 bg-bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
              {/* Project list */}
              <div className="max-h-48 overflow-y-auto">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors group ${
                      p.id === currentProjectId ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover'
                    }`}
                    onClick={() => { switchProject(p.id); setProjDropdown(false) }}
                  >
                    <span className="truncate">{p.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setProjDeleteTarget({ id: p.id, name: p.name }) }}
                      className="p-1 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {/* New project input (shown when expanded) */}
              {projCreating && (
                <div className="p-2">
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      value={projNewName}
                      onChange={(e) => setProjNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleProjCreate(); if (e.key === 'Escape') setProjCreating(false) }}
                      placeholder={zh ? '项目名称' : 'Project name'}
                      className="flex-1 px-2 py-1.5 bg-bg-input border border-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={handleProjCreate}
                      disabled={projCreateLoading}
                      className={`px-3 py-1.5 text-white text-xs rounded transition-colors ${projCreateLoading ? 'bg-accent/50 cursor-wait' : 'bg-accent hover:bg-accent-hover'}`}
                    >
                      {projCreateLoading ? '...' : (zh ? '创建' : 'OK')}
                    </button>
                  </div>
                </div>
              )}
              {/* New / Export / Import in one row */}
              <div className="px-2 py-1.5 flex gap-1">
                {!projCreating && (
                  <button
                    onClick={() => setProjCreating(true)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-accent bg-accent/10 hover:bg-accent/20 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {zh ? '新建' : 'New'}
                  </button>
                )}
                <a
                  href={api.exportProject(currentProjectId)}
                  download
                  onClick={() => setProjDropdown(false)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:bg-bg-hover rounded transition-colors"
                >
                  <Download className="w-3 h-3" />
                  {zh ? '导出' : 'Export'}
                </a>
                <button
                  onClick={() => { if (!projImportLoading) projImportRef.current?.click() }}
                  disabled={projImportLoading}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                    projImportLoading ? 'text-text-muted cursor-wait' : 'text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  <Upload className={`w-3 h-3 ${projImportLoading ? 'animate-spin' : ''}`} />
                  {projImportLoading ? '...' : (zh ? '导入' : 'Import')}
                </button>
              </div>
            </div>
          )}
          <input ref={projImportRef} type="file" accept=".zip" className="hidden" onChange={handleProjImport} />
        </div>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
          title={t.nav.settings}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Delete project confirmation */}
      <ConfirmDialog
        open={!!projDeleteTarget}
        title={zh ? '删除项目' : 'Delete Project'}
        message={zh
          ? `确定删除项目「${projDeleteTarget?.name}」？关联的 Bug 也会被删除。`
          : `Delete project "${projDeleteTarget?.name}"? Related bugs will also be deleted.`}
        confirmText={zh ? '确认删除' : 'Delete'}
        cancelText={zh ? '取消' : 'Cancel'}
        onConfirm={() => { if (projDeleteTarget) deleteProject(projDeleteTarget.id); setProjDeleteTarget(null) }}
        onCancel={() => setProjDeleteTarget(null)}
      />
    </header>
  )
}
