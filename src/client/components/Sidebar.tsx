import { useState, useRef, useEffect } from 'react'
import { useStore, type BugStatus, type FilterTab } from '../stores'
import { useVirtualList } from '../hooks/useVirtualList'
import { ConfirmDialog } from './ConfirmDialog'
import { ZentaoModal } from './ZentaoModal'
import { JiraModal } from './JiraModal'
import { LinearModal } from './LinearModal'
import { TapdModal } from './TapdModal'
import { Search, Camera, Trash2, ExternalLink, ChevronDown, CheckSquare, Square, ListChecks, Plus } from 'lucide-react'

// Status color mapping
const statusColorMap: Record<BugStatus, string> = {
  pending: 'bg-red-500/20 text-red-400',
  annotating: 'bg-yellow-500/20 text-yellow-400',
  generated: 'bg-blue-500/20 text-blue-400',
  fixed: 'bg-green-500/20 text-green-400',
  closed: 'bg-gray-500/20 text-gray-400',
}

// Time formatting
function timeAgo(dateStr: string, suffix: string): string {
  const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z'
  const diff = Date.now() - new Date(normalized).getTime()
  const minutes = Math.max(0, Math.floor(diff / 60000))
  const isZh = suffix === '前'
  if (minutes < 1) return isZh ? '刚刚' : 'just now'
  if (minutes < 60) return isZh ? `${minutes}分钟${suffix}` : `${minutes}m ${suffix}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return isZh ? `${hours}小时${suffix}` : `${hours}h ${suffix}`
  const days = Math.floor(hours / 24)
  return isZh ? `${days}天${suffix}` : `${days}d ${suffix}`
}

export function Sidebar({ width }: { width?: number }) {
  const {
    t,
    locale,
    bugs,
    selectedBugId,
    filterTab,
    searchQuery,
    selectBug,
    setFilterTab,
    setSearchQuery,
    createBug,
    deleteBug,
    updateBug,
    batchUpdateStatus,
    batchDeleteBugs,
    clearSelection,
  } = useStore()
  const zh = locale === 'zh'
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: number } | null>(null)
  const [zentaoOpen, setZentaoOpen] = useState(false)
  const [jiraOpen, setJiraOpen] = useState(false)
  const [linearOpen, setLinearOpen] = useState(false)
  const [tapdOpen, setTapdOpen] = useState(false)
  const [importDropdown, setImportDropdown] = useState(false)
  const importDropdownRef = useRef<HTMLDivElement>(null)
  // Single bug quick status toggle
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null)
  const [statusDropdownPos, setStatusDropdownPos] = useState({ x: 0, y: 0 })
  const statusDropdownRef = useRef<HTMLDivElement>(null)

  // Close import dropdown on outside click
  useEffect(() => {
    if (!importDropdown) return
    const handler = (e: MouseEvent) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target as Node)) {
        setImportDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [importDropdown])

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusDropdown) return
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdown(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [statusDropdown])

  const statusOptions: BugStatus[] = ['pending', 'fixed', 'closed']

  // Batch mode
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [batchConfirm, setBatchConfirm] = useState(false)

  const BUG_ITEM_HEIGHT = 76

  // Stats
  const pendingCount = bugs.filter((b) => b.status === 'pending' || b.status === 'annotating').length
  const fixedCount = bugs.filter((b) => b.status === 'fixed').length

  // Filter
  const filteredBugs = bugs.filter((bug) => {
    if (filterTab === 'pending') return bug.status === 'pending' || bug.status === 'annotating'
    if (filterTab === 'fixed') return bug.status === 'fixed'
    return true
  }).filter((bug) => {
    if (!searchQuery) return true
    return bug.title.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const {
    containerRef: virtualContainerRef,
    onScroll: onVirtualScroll,
    startIndex,
    endIndex,
    totalHeight,
    offsetY,
    scrollToIndex,
  } = useVirtualList({
    itemCount: filteredBugs.length,
    itemHeight: BUG_ITEM_HEIGHT,
  })

  // Auto-scroll to selected bug when it changes
  useEffect(() => {
    if (!selectedBugId || batchMode) return
    const idx = filteredBugs.findIndex(b => b.id === selectedBugId)
    if (idx >= 0) scrollToIndex(idx)
  }, [selectedBugId])

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: t.sidebar.filterAll, count: bugs.length },
    { key: 'pending', label: t.sidebar.filterPending, count: pendingCount },
    { key: 'fixed', label: t.sidebar.filterFixed, count: fixedCount },
  ]

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleSelectAll = () => {
    const allIds = filteredBugs.map(b => b.id)
    const allSelected = allIds.every(id => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(allIds))
  }

  const exitBatchMode = () => {
    setBatchMode(false)
    setSelectedIds(new Set())
  }

  const handleBatchStatus = async (status: BugStatus) => {
    if (selectedIds.size === 0) return
    await batchUpdateStatus([...selectedIds], status)
    exitBatchMode()
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    await batchDeleteBugs([...selectedIds])
    exitBatchMode()
  }

  return (
    <aside style={{ width: width ?? 240 }} className="bg-bg-sidebar border-r border-border flex flex-col shrink-0">
      {/* Search + New */}
      <div className="p-3 space-y-2">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder={t.sidebar.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-bg-input border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        {/* New + Batch + Import in one row */}
        <div className="flex gap-2 items-center">
          <button
            onClick={() => createBug()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t.sidebar.newBug.replace('+ ', '')}
          </button>
          {/* Batch mode */}
          <button
            onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
            className={`p-2.5 rounded-xl border transition-colors ${
              batchMode ? 'bg-accent/20 text-accent border-accent/30' : 'bg-bg-input border-border text-text-muted hover:text-text-secondary hover:bg-bg-hover'
            }`}
            title={t.sidebar.batchAction}
          >
            <ListChecks className="w-4 h-4" />
          </button>
          {/* Import */}
          <div className="relative" ref={importDropdownRef}>
            <button
              onClick={() => setImportDropdown(!importDropdown)}
              className="flex items-center gap-0.5 p-2.5 bg-bg-input border border-border text-text-muted hover:text-text-secondary hover:bg-bg-hover rounded-xl transition-colors"
              title={zh ? '从外部导入' : 'Import from external'}
            >
              <ExternalLink className="w-4 h-4" />
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
            {importDropdown && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                <button
                  onClick={() => { setZentaoOpen(true); setImportDropdown(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  {zh ? '从禅道导入' : 'From Zentao'}
                </button>
                <button
                  onClick={() => { setJiraOpen(true); setImportDropdown(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  {zh ? '从 Jira 导入' : 'From Jira'}
                </button>
                <button
                  onClick={() => { setLinearOpen(true); setImportDropdown(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  {zh ? '从 Linear 导入' : 'From Linear'}
                </button>
                <button
                  onClick={() => { setTapdOpen(true); setImportDropdown(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  {zh ? '从 TAPD 导入' : 'From TAPD'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex px-3 gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`flex-1 py-2 text-xs text-center transition-colors relative ${
              filterTab === tab.key
                ? 'text-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label} {tab.count}
            {filterTab === tab.key && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Bug list (virtual scroll) */}
      <div
        ref={virtualContainerRef}
        onScroll={onVirtualScroll}
        className="flex-1 overflow-y-auto"
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
            {filteredBugs.slice(startIndex, endIndex + 1).map((bug) => (
              <div
                key={bug.id}
                style={{ height: BUG_ITEM_HEIGHT, boxSizing: 'border-box' }}
                onClick={() => batchMode ? toggleSelect(bug.id) : selectBug(bug.id)}
                className={`w-full text-left px-4 py-3 border-l-[3px] transition-colors cursor-pointer group relative ${
                  batchMode && selectedIds.has(bug.id)
                    ? 'border-l-accent bg-accent/10'
                    : selectedBugId === bug.id && !batchMode
                    ? 'border-l-accent bg-accent/10'
                    : 'border-l-transparent hover:bg-bg-hover'
                }`}
              >
                {/* Number + Status */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {batchMode && (
                      selectedIds.has(bug.id)
                        ? <CheckSquare className="w-3.5 h-3.5 text-accent" />
                        : <Square className="w-3.5 h-3.5 text-text-muted" />
                    )}
                    <span className="text-xs text-text-muted">#{String(bug.number).padStart(3, '0')}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (statusDropdown === bug.id) {
                        setStatusDropdown(null)
                      } else {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setStatusDropdownPos({ x: rect.right + 4, y: rect.bottom })
                        setStatusDropdown(bug.id)
                      }
                    }}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${statusColorMap[bug.status]}`}
                  >
                    {t.status[bug.status]}
                  </button>
                </div>
                {/* Title */}
                <p className="text-sm text-text-primary truncate mb-1">{bug.title || (zh ? '未命名 Bug' : 'Untitled Bug')}</p>
                {/* Screenshot count + time + delete */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      {bug.screenshots.length}{t.sidebar.screenshots}
                    </span>
                    <span>·</span>
                    <span>{timeAgo(bug.createdAt, t.sidebar.timeAgo)}</span>
                  </div>
                  {!batchMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget({ id: bug.id, number: bug.number })
                      }}
                      className="p-0.5 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Batch action bar */}
      {batchMode && (
        <div className="px-3 py-2 border-t border-border bg-bg-input space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
            >
              {filteredBugs.length > 0 && filteredBugs.every(b => selectedIds.has(b.id))
                ? <CheckSquare className="w-3.5 h-3.5 text-accent" />
                : <Square className="w-3.5 h-3.5" />}
              {zh ? '全选' : 'Select All'}
            </button>
            <span className="text-xs text-text-muted">
              {zh ? `已选 ${selectedIds.size} 个` : `${selectedIds.size} selected`}
            </span>
          </div>
          <div className="flex gap-1.5">
            <select
              disabled={selectedIds.size === 0}
              defaultValue=""
              onChange={(e) => { if (e.target.value) { handleBatchStatus(e.target.value as BugStatus); e.target.value = '' } }}
              className="flex-1 px-2 py-1.5 bg-bg-input border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="" disabled>{zh ? '修改状态' : 'Set Status'}</option>
              {(['pending', 'fixed', 'closed'] as BugStatus[]).map(s => (
                <option key={s} value={s}>{t.status[s]}</option>
              ))}
            </select>
            <button
              onClick={() => setBatchConfirm(true)}
              disabled={selectedIds.size === 0}
              className="px-2 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {zh ? '删除' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {/* Delete bug confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={zh ? '删除 Bug' : 'Delete Bug'}
        message={zh
          ? `确定删除 Bug #${String(deleteTarget?.number ?? 0).padStart(3, '0')}？此操作不可撤销。`
          : `Delete Bug #${String(deleteTarget?.number ?? 0).padStart(3, '0')}? This cannot be undone.`}
        confirmText={zh ? '确认删除' : 'Delete'}
        cancelText={zh ? '取消' : 'Cancel'}
        onConfirm={() => { if (deleteTarget) deleteBug(deleteTarget.id); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Batch delete confirmation */}
      <ConfirmDialog
        open={batchConfirm}
        title={zh ? '批量删除' : 'Batch Delete'}
        message={zh
          ? `确定删除选中的 ${selectedIds.size} 个 Bug？此操作不可撤销。`
          : `Delete ${selectedIds.size} selected bugs? This cannot be undone.`}
        confirmText={zh ? '确认删除' : 'Delete'}
        cancelText={zh ? '取消' : 'Cancel'}
        onConfirm={() => { handleBatchDelete(); setBatchConfirm(false) }}
        onCancel={() => setBatchConfirm(false)}
      />

      {/* Quick status toggle popover */}
      {statusDropdown && (
        <div
          ref={statusDropdownRef}
          className="fixed bg-bg-card border border-border rounded-md shadow-xl z-50 py-0.5 w-auto"
          style={{ left: statusDropdownPos.x, top: statusDropdownPos.y }}
        >
          {statusOptions.map((s) => (
            <button
              key={s}
              onClick={(e) => {
                e.stopPropagation()
                const bugId = statusDropdown
                if (bugId) {
                  const bug = bugs.find(b => b.id === bugId)
                  if (bug && s !== bug.status) {
                    updateBug(bugId, { status: s })
                    // 状态变化时，自动跳转到下一个待处理的 bug
                    const nextPending = bugs.find(b => b.id !== bugId && (b.status === 'pending' || b.status === 'annotating'))
                    if (nextPending) {
                      selectBug(nextPending.id)
                    } else {
                      // 没有待处理的 bug，清空选中状态
                      clearSelection()
                    }
                  }
                }
                setStatusDropdown(null)
              }}
              className={`block text-left whitespace-nowrap px-2.5 py-1 text-[11px] transition-colors ${
                bugs.find(b => b.id === statusDropdown)?.status === s
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-bg-hover'
              }`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                style={{ backgroundColor: s === 'pending' ? '#ef4444' : s === 'fixed' ? '#22c55e' : '#6b7280' }} />
              {t.status[s]}
            </button>
          ))}
        </div>
      )}

      {/* Import modals */}
      {zentaoOpen && <ZentaoModal onClose={() => setZentaoOpen(false)} />}
      {jiraOpen && <JiraModal onClose={() => setJiraOpen(false)} />}
      {linearOpen && <LinearModal onClose={() => setLinearOpen(false)} />}
      {tapdOpen && <TapdModal onClose={() => setTapdOpen(false)} />}
    </aside>
  )
}
