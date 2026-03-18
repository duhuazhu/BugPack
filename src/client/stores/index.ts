import { create } from 'zustand'
import { type Locale, getMessages, type TranslationKeys } from '../i18n'
import { api, type ApiBug, type ApiProject } from '../api'

export type BugStatus = 'pending' | 'annotating' | 'generated' | 'fixed' | 'closed'
export type Priority = 'high' | 'medium' | 'low'
export type FilterTab = 'all' | 'pending' | 'fixed'

// Filter bugs by tab
function filterByTab(bugs: Bug[], tab: FilterTab): Bug[] {
  if (tab === 'pending') return bugs.filter(b => b.status === 'pending' || b.status === 'annotating')
  if (tab === 'fixed') return bugs.filter(b => b.status === 'fixed')
  return bugs
}

export interface Screenshot {
  id: string
  url: string
  name: string
  annotated: boolean
  annotations: unknown[]
}

export interface Bug {
  id: string
  number: number
  title: string
  description: string
  status: BugStatus
  priority: Priority
  screenshots: Screenshot[]
  pagePath: string
  device: string
  browser: string
  relatedFiles: string[]
  createdAt: string
}

function toBug(raw: ApiBug): Bug {
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    description: raw.description,
    status: raw.status as BugStatus,
    priority: raw.priority as Priority,
    screenshots: raw.screenshots || [],
    pagePath: raw.page_path ?? '',
    device: raw.device ?? '',
    browser: raw.browser ?? '',
    relatedFiles: raw.relatedFiles || [],
    createdAt: raw.created_at,
  }
}

export type Theme = 'dark' | 'light'
export type ViewMode = 'edit' | 'preview'

interface AppState {
  locale: Locale
  t: TranslationKeys
  setLocale: (locale: Locale) => void

  bugs: Bug[]
  selectedBugId: string | null
  filterTab: FilterTab
  searchQuery: string
  loading: boolean

  settings: Record<string, string>

  projects: ApiProject[]
  currentProjectId: string

  theme: Theme
  viewMode: ViewMode
  settingsOpen: boolean
  shortcutsOpen: boolean

  currentProject: string

  compareMode: boolean
  compareLeft: number
  compareRight: number

  fetchBugs: () => Promise<void>
  createBug: (title?: string) => Promise<Bug>
  updateBug: (id: string, data: Record<string, unknown>) => Promise<void>
  deleteBug: (id: string) => Promise<void>
  pasteScreenshot: (bugId: string, dataUrl: string, name?: string) => Promise<void>
  uploadScreenshot: (bugId: string, file: File, name?: string) => Promise<void>
  deleteScreenshot: (bugId: string, ssId: string) => Promise<void>
  renameScreenshot: (bugId: string, ssId: string, name: string) => Promise<void>
  updateScreenshotAnnotated: (bugId: string, ssId: string) => Promise<void>
  saveAnnotations: (bugId: string, ssId: string, annotations: unknown) => Promise<void>
  reorderScreenshots: (bugId: string, order: string[]) => Promise<void>
  batchUpdateStatus: (ids: string[], status: BugStatus) => Promise<void>
  batchDeleteBugs: (ids: string[]) => Promise<void>

  fetchSettings: () => Promise<void>
  saveSettings: (data: Record<string, string>) => Promise<void>

  fetchProjects: () => Promise<void>
  createProject: (name: string) => Promise<ApiProject>
  switchProject: (id: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  selectBug: (id: string) => void
  clearSelection: () => void
  setFilterTab: (tab: FilterTab) => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: Theme) => void
  setSettingsOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setCompareMode: (on: boolean) => void
  setCompareLeft: (idx: number) => void
  setCompareRight: (idx: number) => void
}

export const useStore = create<AppState>((set, get) => ({
  locale: 'en',
  t: getMessages('en'),
  setLocale: (locale) => {
    set({ locale, t: getMessages(locale) })
    api.saveSettings({ locale }).catch(() => {})
  },

  bugs: [],
  selectedBugId: null,
  filterTab: 'all',
  searchQuery: '',
  loading: false,

  settings: {},

  projects: [],
  currentProjectId: '',

  theme: 'dark' as Theme,
  viewMode: 'edit',
  settingsOpen: false,
  shortcutsOpen: false,

  currentProject: '',

  compareMode: false,
  compareLeft: 0,
  compareRight: 1,

  fetchBugs: async () => {
    set({ loading: true })
    try {
      const projectId = get().currentProjectId
      const raw = await api.getBugs(projectId)
      const bugs = raw.map(toBug)
      const state = get()
      const filtered = filterByTab(bugs, state.filterTab)
      const selectedBugId = state.selectedBugId && filtered.find(b => b.id === state.selectedBugId)
        ? state.selectedBugId
        : filtered[0]?.id ?? null
      set({ bugs, selectedBugId, loading: false })
    } catch (e) {
      console.error('Failed to load bug list:', e)
      set({ loading: false })
    }
  },

  createBug: async (title) => {
    const raw = await api.createBug({ title: title || '', project_id: get().currentProjectId })
    const bug = toBug(raw)
    set((s) => ({ bugs: [bug, ...s.bugs], selectedBugId: bug.id, viewMode: 'edit' }))
    return bug
  },

  updateBug: async (id, data) => {
    const raw = await api.updateBug(id, data)
    const updated = toBug(raw)
    set((s) => ({
      bugs: s.bugs.map(b => b.id === id ? updated : b),
    }))
  },

  deleteBug: async (id) => {
    await api.deleteBug(id)
    set((s) => {
      const bugs = s.bugs.filter(b => b.id !== id)
      // 根据当前 tab 过滤后选中第一个
      const filtered = filterByTab(bugs, s.filterTab)
      return {
        bugs,
        selectedBugId: s.selectedBugId === id ? (filtered[0]?.id ?? null) : s.selectedBugId,
      }
    })
  },

  pasteScreenshot: async (bugId, dataUrl, name) => {
    await api.pasteScreenshot(bugId, dataUrl, name)
    await get().fetchBugs()
  },

  uploadScreenshot: async (bugId, file, name) => {
    await api.uploadScreenshot(bugId, file, name)
    await get().fetchBugs()
  },

  deleteScreenshot: async (bugId, ssId) => {
    await api.deleteScreenshot(bugId, ssId)
    await get().fetchBugs()
  },

  renameScreenshot: async (bugId, ssId, name) => {
    await api.renameScreenshot(bugId, ssId, name)
    await get().fetchBugs()
  },

  updateScreenshotAnnotated: async (bugId, ssId) => {
    await api.markScreenshotAnnotated(bugId, ssId)
    set((s) => ({
      bugs: s.bugs.map(b => b.id === bugId ? {
        ...b,
        screenshots: b.screenshots.map(ss => ss.id === ssId ? { ...ss, annotated: true } : ss),
      } : b),
    }))
  },

  saveAnnotations: async (bugId, ssId, annotations) => {
    await api.saveAnnotations(bugId, ssId, annotations)
    set((s) => ({
      bugs: s.bugs.map(b => b.id === bugId ? {
        ...b,
        screenshots: b.screenshots.map(ss => ss.id === ssId ? { ...ss, annotations: annotations as unknown[] } : ss),
      } : b),
    }))
  },

  reorderScreenshots: async (bugId, order) => {
    await api.reorderScreenshots(bugId, order)
    set((s) => ({
      bugs: s.bugs.map(b => {
        if (b.id !== bugId) return b
        const sorted = order.map(id => b.screenshots.find(ss => ss.id === id)!).filter(Boolean)
        return { ...b, screenshots: sorted }
      }),
    }))
  },

  // Optimistic update, rollback on failure
  batchUpdateStatus: async (ids, status) => {
    const prevBugs = get().bugs
    set((s) => {
      const bugs = s.bugs.map(b => ids.includes(b.id) ? { ...b, status } : b)
      const filtered = filterByTab(bugs, s.filterTab)
      const stillVisible = filtered.some(b => b.id === s.selectedBugId)
      return {
        bugs,
        selectedBugId: stillVisible ? s.selectedBugId : (filtered[0]?.id ?? null),
      }
    })
    try {
      await api.batchUpdateStatus(ids, status)
    } catch (e) {
      set({ bugs: prevBugs })
      console.error('Batch status update failed:', e)
      throw e
    }
  },

  // Optimistic update, rollback on failure
  batchDeleteBugs: async (ids) => {
    const prevBugs = get().bugs
    const prevSelected = get().selectedBugId
    set((s) => {
      const bugs = s.bugs.filter(b => !ids.includes(b.id))
      const filtered = filterByTab(bugs, s.filterTab)
      return {
        bugs,
        selectedBugId: ids.includes(s.selectedBugId || '') ? (filtered[0]?.id ?? null) : s.selectedBugId,
      }
    })
    try {
      await api.batchDeleteBugs(ids)
    } catch (e) {
      set({ bugs: prevBugs, selectedBugId: prevSelected })
      console.error('Batch delete failed:', e)
      throw e
    }
  },

  fetchSettings: async () => {
    try {
      const settings = await api.getSettings()
      set({ settings })
      if (settings.theme === 'light' || settings.theme === 'dark') {
        const theme = settings.theme as Theme
        if (theme === 'light') {
          document.documentElement.classList.add('light')
        } else {
          document.documentElement.classList.remove('light')
        }
        set({ theme })
      }
      if (settings.locale === 'zh' || settings.locale === 'en') {
        const locale = settings.locale as Locale
        set({ locale, t: getMessages(locale) })
      }
      if (settings.currentProjectId) {
        set({ currentProjectId: settings.currentProjectId })
      }
      if (settings.filterTab === 'all' || settings.filterTab === 'pending' || settings.filterTab === 'fixed') {
        set({ filterTab: settings.filterTab as FilterTab })
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  },

  // Rollback on failure
  saveSettings: async (data) => {
    const prevSettings = get().settings
    set({ settings: { ...prevSettings, ...data } })
    try {
      await api.saveSettings(data)
    } catch (e) {
      set({ settings: prevSettings })
      console.error('Failed to save settings:', e)
      throw e
    }
  },

  fetchProjects: async () => {
    try {
      const projects = await api.getProjects()
      set({ projects })
      const savedId = get().currentProjectId
      if (projects.length > 0) {
        const targetId = savedId && projects.find(p => p.id === savedId) ? savedId : projects[0]!.id
        await get().switchProject(targetId)
      }
    } catch (e) {
      console.error('Failed to load project list:', e)
    }
  },

  createProject: async (name) => {
    const project = await api.createProject(name)
    set((s) => ({ projects: [project, ...s.projects] }))
    await get().switchProject(project.id)
    return project
  },

  switchProject: async (id) => {
    const project = get().projects.find(p => p.id === id)
    set({
      currentProjectId: id,
      currentProject: project?.name || '',
      bugs: [],
      selectedBugId: null,
      loading: true,
    })
    api.saveSettings({ currentProjectId: id }).catch(() => {})
    await get().fetchBugs()
  },

  deleteProject: async (id) => {
    await api.deleteProject(id)
    const remaining = get().projects.filter(p => p.id !== id)
    set({ projects: remaining })
    if (get().currentProjectId === id) {
      if (remaining.length > 0) {
        await get().switchProject(remaining[0]!.id)
      } else {
        set({ currentProjectId: '', currentProject: '', bugs: [], selectedBugId: null })
      }
    }
  },

  selectBug: (id) => set({ selectedBugId: id, viewMode: 'edit' }),
  clearSelection: () => set({ selectedBugId: null }),
  setTheme: (theme) => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
    set({ theme })
    api.saveSettings({ theme }).catch(() => {})
  },
  setFilterTab: (tab) => {
    const { bugs, selectedBugId } = get()
    const filtered = filterByTab(bugs, tab)
    const stillVisible = filtered.some(b => b.id === selectedBugId)
    set({
      filterTab: tab,
      selectedBugId: stillVisible ? selectedBugId : (filtered[0]?.id ?? null),
    })
    api.saveSettings({ filterTab: tab }).catch(() => {})
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setCompareMode: (on) => set({ compareMode: on }),
  setCompareLeft: (idx) => set({ compareLeft: idx }),
  setCompareRight: (idx) => set({ compareRight: idx }),
}))
