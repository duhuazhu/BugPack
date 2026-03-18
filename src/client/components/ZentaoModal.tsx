import { useState, useEffect, useRef } from 'react'
import { useStore } from '../stores'
import { api } from '../api'
import { X, Download, RefreshCw, ExternalLink, AlertCircle, ChevronDown, CheckSquare, Square } from 'lucide-react'

interface ZentaoBug {
  id: number
  title: string
  severity: number
  pri: number
  status: string
  openedBy?: { realname?: string }
  openedDate?: string
}

interface ZentaoProduct {
  id: number
  name: string
}

export function ZentaoModal({ onClose }: { onClose: () => void }) {
  const { locale, currentProjectId, fetchBugs, settings, saveSettings } = useStore()
  const zh = locale === 'zh'
  const hasImported = useRef(false)

  const [products, setProducts] = useState<ZentaoProduct[]>([])
  const [selectedProductId, setSelectedProductId] = useState(settings.zentaoProductId || '')
  const [bugs, setBugs] = useState<ZentaoBug[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState<Set<number>>(new Set())
  const [imported, setImported] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [step, setStep] = useState<'products' | 'bugs'>(settings.zentaoProductId ? 'bugs' : 'products')

  // Load product list
  const loadProducts = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.zentao.getProducts()
      if (!res.ok) throw new Error(res.error || 'Failed to fetch products')
      setProducts(res.products || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Load bug list
  const loadBugs = async (productId?: string) => {
    const pid = productId || selectedProductId
    if (!pid) { setStep('products'); loadProducts(); return }
    setLoading(true)
    setError('')
    try {
      // Save product ID to settings first
      if (pid !== settings.zentaoProductId) {
        await saveSettings({ zentaoProductId: pid })
      }
      const res = await api.zentao.getBugs()
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
    if (settings.zentaoProductId) {
      loadBugs(settings.zentaoProductId)
    } else {
      loadProducts()
    }
  }, [])

  // Select product
  const selectProduct = (id: number) => {
    const pid = String(id)
    setSelectedProductId(pid)
    loadBugs(pid)
  }

  // Import single bug
  const handleImport = async (bugId: number) => {
    setImporting(prev => new Set(prev).add(bugId))
    try {
      const res = await api.zentao.importBug(bugId, currentProjectId)
      if (!res.ok) throw new Error('Import failed')
      setImported(prev => new Set(prev).add(bugId))
      hasImported.current = true
    } catch {
      // ignore
    } finally {
      setImporting(prev => { const s = new Set(prev); s.delete(bugId); return s })
    }
  }

  // Toggle selection
  const toggleSelect = (bugId: number) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(bugId) ? s.delete(bugId) : s.add(bugId)
      return s
    })
  }

  // Toggle select all (excluding imported)
  const toggleSelectAll = () => {
    const importable = bugs.filter(b => !imported.has(b.id)).map(b => b.id)
    const allSelected = importable.every(id => selected.has(id))
    setSelected(allSelected ? new Set() : new Set(importable))
  }

  // Batch import
  const handleBatchImport = async () => {
    if (selected.size === 0) return
    setBatchImporting(true)
    const ids = [...selected].filter(id => !imported.has(id))
    for (const bugId of ids) {
      setImporting(prev => new Set(prev).add(bugId))
      try {
        const res = await api.zentao.importBug(bugId, currentProjectId)
        if (res.ok) setImported(prev => new Set(prev).add(bugId))
      } catch {
        // skip failed
      } finally {
        setImporting(prev => { const s = new Set(prev); s.delete(bugId); return s })
      }
    }
    setSelected(new Set())
    hasImported.current = true
    setBatchImporting(false)
    fetchBugs()
    onClose()
  }

  // Severity color
  const sevColor = (s: number) => {
    if (s <= 1) return 'text-red-400'
    if (s === 2) return 'text-orange-400'
    if (s === 3) return 'text-yellow-400'
    return 'text-text-muted'
  }

  const statusText = (s: string) => {
    const map: Record<string, string> = { active: zh ? '激活' : 'Active', resolved: zh ? '已解决' : 'Resolved', closed: zh ? '已关闭' : 'Closed' }
    return map[s] || s
  }

  const curProduct = products.find(p => String(p.id) === selectedProductId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[600px] max-h-[80vh] bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">
              {zh ? '从禅道导入' : 'Import from Zentao'}
            </h2>
            {/* Product switcher */}
            {step === 'bugs' && (
              <button
                onClick={() => { setStep('products'); loadProducts() }}
                className="ml-2 flex items-center gap-1 px-2 py-0.5 text-xs text-accent bg-accent/10 rounded hover:bg-accent/20 transition-colors"
              >
                {curProduct?.name || `ID:${selectedProductId}`}
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => step === 'bugs' ? loadBugs() : loadProducts()}
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
                  {zh ? '请检查设置中的禅道配置' : 'Check Zentao settings'}
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

          {/* Product selection */}
          {!loading && step === 'products' && !error && (
            <div className="p-6">
              <p className="text-sm text-text-secondary mb-3">
                {zh ? '选择禅道项目：' : 'Select a Zentao project:'}
              </p>
              {products.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">
                  {zh ? '没有找到项目（当前账号可能无权限）' : 'No products found (no permission?)'}
                </p>
              ) : (
                <div className="space-y-2">
                  {products.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectProduct(p.id)}
                      className="w-full text-left px-4 py-3 bg-bg-input border border-border rounded-lg hover:border-accent hover:bg-accent/5 transition-colors"
                    >
                      <span className="text-xs text-text-muted mr-2">#{p.id}</span>
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
                <div key={bug.id} className="px-6 py-3 flex items-center gap-3 hover:bg-bg-hover transition-colors">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(bug.id)}
                    className={`shrink-0 ${imported.has(bug.id) ? 'text-text-muted/30 cursor-default' : 'text-text-muted hover:text-accent'}`}
                    disabled={imported.has(bug.id)}
                  >
                    {selected.has(bug.id) ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-text-muted">#{bug.id}</span>
                      <span className={`text-xs font-medium ${sevColor(bug.severity)}`}>S{bug.severity}</span>
                      <span className="text-xs text-text-muted px-1.5 py-0.5 bg-bg-input rounded">{statusText(bug.status)}</span>
                    </div>
                    <p className="text-sm text-text-primary truncate">{bug.title}</p>
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                      {bug.openedBy?.realname && <span>{bug.openedBy.realname}</span>}
                      {bug.openedDate && <span>{bug.openedDate.split(' ')[0]}</span>}
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
                        : 'bg-accent/20 text-accent hover:bg-accent/30'
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
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
              >
                {bugs.filter(b => !imported.has(b.id)).every(b => selected.has(b.id)) && bugs.some(b => !imported.has(b.id))
                  ? <CheckSquare className="w-3.5 h-3.5 text-accent" />
                  : <Square className="w-3.5 h-3.5" />}
                {zh ? '全选' : 'Select All'}
              </button>
            )}
            <span className="text-xs text-text-muted">
              {step === 'bugs'
                ? (zh
                  ? `指派给我 ${bugs.length} 个 Bug${selected.size > 0 ? `，已选 ${selected.size} 个` : ''}`
                  : `${bugs.length} bugs assigned to me${selected.size > 0 ? `, ${selected.size} selected` : ''}`)
                : (zh ? `共 ${products.length} 个项目` : `${products.length} projects`)}
            </span>
          </div>
          {step === 'bugs' && selected.size > 0 && (
            <button
              onClick={handleBatchImport}
              disabled={batchImporting}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                batchImporting
                  ? 'bg-bg-input text-text-muted cursor-wait'
                  : 'bg-accent text-white hover:bg-accent-hover'
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
