const BASE = '/api'

// Generic request
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Bug API types
export interface ApiBug {
  id: string
  number: number
  title: string
  description: string
  status: string
  priority: string
  page_path: string
  device: string
  browser: string
  related_files?: string
  relatedFiles: string[]
  screenshots: ApiScreenshot[]
  created_at: string
  updated_at: string
}

export interface ApiScreenshot {
  id: string
  url: string
  name: string
  annotated: boolean
  annotations: unknown[]
}

// Project API types
export interface ApiProject {
  id: string
  name: string
  created_at: string
}

// API methods
export const api = {
  // Get all bugs (filtered by project)
  getBugs: (projectId?: string) =>
    request<ApiBug[]>(projectId ? `/bugs?project_id=${projectId}` : '/bugs'),

  // Get single bug
  getBug: (id: string) => request<ApiBug>(`/bugs/${id}`),

  // Create bug
  createBug: (data: { title?: string; project_id?: string }) =>
    request<ApiBug>('/bugs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update bug
  updateBug: (id: string, data: Record<string, unknown>) =>
    request<ApiBug>(`/bugs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Delete bug
  deleteBug: (id: string) =>
    request<{ ok: boolean }>(`/bugs/${id}`, { method: 'DELETE' }),

  // Upload screenshot file
  uploadScreenshot: async (bugId: string, file: File, name?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (name) form.append('name', name)

    const res = await fetch(`${BASE}/bugs/${bugId}/screenshots`, {
      method: 'POST',
      body: form,
    })
    return res.json() as Promise<ApiScreenshot>
  },

  // Paste screenshot (Base64)
  pasteScreenshot: (bugId: string, dataUrl: string, name?: string) =>
    request<ApiScreenshot>(`/bugs/${bugId}/screenshots/paste`, {
      method: 'POST',
      body: JSON.stringify({ dataUrl, name }),
    }),

  // Rename screenshot
  renameScreenshot: (bugId: string, ssId: string, name: string) =>
    request<{ ok: boolean }>(`/bugs/${bugId}/screenshots/${ssId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  // Mark screenshot as annotated
  markScreenshotAnnotated: (bugId: string, ssId: string) =>
    request<{ ok: boolean }>(`/bugs/${bugId}/screenshots/${ssId}`, {
      method: 'PATCH',
      body: JSON.stringify({ annotated: true }),
    }),

  // Save annotation data
  saveAnnotations: (bugId: string, ssId: string, annotations: unknown) =>
    request<{ ok: boolean }>(`/bugs/${bugId}/screenshots/${ssId}`, {
      method: 'PATCH',
      body: JSON.stringify({ annotations }),
    }),

  // Save annotated render image (full screenshot with annotations)
  saveAnnotatedImage: (bugId: string, ssId: string, dataUrl: string) =>
    request<{ ok: boolean; annotatedFilename?: string }>(`/bugs/${bugId}/screenshots/${ssId}/annotated-image`, {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    }),

  // Reorder screenshots
  reorderScreenshots: (bugId: string, order: string[]) =>
    request<{ ok: boolean }>(`/bugs/${bugId}/screenshots/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),

  // Batch update status
  batchUpdateStatus: (ids: string[], status: string) =>
    request<{ ok: boolean }>('/bugs/batch/status', {
      method: 'PATCH',
      body: JSON.stringify({ ids, status }),
    }),

  // Batch delete
  batchDeleteBugs: (ids: string[]) =>
    request<{ ok: boolean }>('/bugs/batch/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  // Delete screenshot
  deleteScreenshot: (bugId: string, ssId: string) =>
    request<{ ok: boolean }>(`/bugs/${bugId}/screenshots/${ssId}`, {
      method: 'DELETE',
    }),

  // Get settings
  getSettings: () => request<Record<string, string>>('/settings'),

  // Save settings
  saveSettings: (data: Record<string, string>) =>
    request<{ ok: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Pick directory (server-side native dialog)
  pickDirectory: () =>
    request<{ path: string }>('/settings/pick-directory', { method: 'POST' }),

  // Project management
  getProjects: () => request<ApiProject[]>('/projects'),

  createProject: (name: string) =>
    request<ApiProject>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  renameProject: (id: string, name: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  // Export project data
  exportProject: (id: string) => `/api/projects/${id}/export`,

  // Import project data (ZIP file)
  importProject: async (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/projects/${id}/import`, {
      method: 'POST',
      body: form,
    })
    return res.json() as Promise<{ ok: boolean; importedCount: number; error?: string }>
  },

  // TAPD integration
  tapd: {
    test: (data: { apiUser: string; apiPassword: string; workspaceId?: string }) =>
      request<{ ok: boolean; error?: string }>('/tapd/test', { method: 'POST', body: JSON.stringify(data) }),
    getWorkspaces: () =>
      request<{ ok: boolean; workspaces: any[]; error?: string }>('/tapd/workspaces'),
    getBugs: () =>
      request<{ ok: boolean; bugs: any[]; total?: number; error?: string }>('/tapd/bugs'),
    importBug: (id: string, projectId: string) =>
      request<{ ok: boolean; bugId: string; number: number }>(`/tapd/import/${id}`, {
        method: 'POST', body: JSON.stringify({ projectId }),
      }),
    resolve: (id: string) =>
      request<{ ok: boolean }>(`/tapd/resolve/${id}`, { method: 'POST' }),
  },

  // Linear integration
  linear: {
    test: (data: { token: string }) =>
      request<{ ok: boolean; user?: string; error?: string }>('/linear/test', { method: 'POST', body: JSON.stringify(data) }),
    getTeams: () =>
      request<{ ok: boolean; teams: any[]; error?: string }>('/linear/teams'),
    getBugs: () =>
      request<{ ok: boolean; bugs: any[]; total?: number; error?: string }>('/linear/bugs'),
    importBug: (id: string, projectId: string) =>
      request<{ ok: boolean; bugId: string; number: number }>(`/linear/import/${id}`, {
        method: 'POST', body: JSON.stringify({ projectId }),
      }),
    resolve: (id: string) =>
      request<{ ok: boolean }>(`/linear/resolve/${id}`, { method: 'POST' }),
  },

  // Jira integration
  jira: {
    test: (data: { url: string; email: string; token: string }) =>
      request<{ ok: boolean; user?: string; error?: string }>('/jira/test', { method: 'POST', body: JSON.stringify(data) }),
    getProjects: () =>
      request<{ ok: boolean; projects: any[]; error?: string }>('/jira/projects'),
    getBugs: () =>
      request<{ ok: boolean; bugs: any[]; total?: number; error?: string }>('/jira/bugs'),
    importBug: (key: string, projectId: string) =>
      request<{ ok: boolean; bugId: string; number: number }>(`/jira/import/${key}`, {
        method: 'POST', body: JSON.stringify({ projectId }),
      }),
    resolve: (key: string) =>
      request<{ ok: boolean }>(`/jira/resolve/${key}`, { method: 'POST' }),
  },

  // Zentao integration
  zentao: {
    test: (data: { url: string; httpUser?: string; httpPass?: string; account: string; password: string }) =>
      request<{ ok: boolean; error?: string }>('/zentao/test', { method: 'POST', body: JSON.stringify(data) }),
    getProducts: () =>
      request<{ ok: boolean; products: any[]; error?: string }>('/zentao/products'),
    getBugs: () =>
      request<{ ok: boolean; bugs: any[]; total?: number; error?: string }>('/zentao/bugs'),
    getBug: (id: number) =>
      request<{ ok: boolean; bug: any }>(`/zentao/bugs/${id}`),
    importBug: (id: number, projectId: string) =>
      request<{ ok: boolean; bugId: string; number: number }>(`/zentao/import/${id}`, {
        method: 'POST', body: JSON.stringify({ projectId }),
      }),
    resolve: (id: number, resolution?: string) =>
      request<{ ok: boolean }>(`/zentao/resolve/${id}`, {
        method: 'POST', body: JSON.stringify({ resolution }),
      }),
  },
}
