import { useState, useEffect } from 'react'
import { useStore } from '../stores'
import { api } from '../api'
import {
  X,
  FolderOpen,
  Settings,
  Palette,

  Globe,
  Search,
  Keyboard,
  Info,
} from 'lucide-react'

type SettingsTab = 'project' | 'appearance' | 'integrations' | 'shortcuts' | 'about'

export function SettingsModal() {
  const { t, locale, setLocale, theme, setTheme, setSettingsOpen, settings, saveSettings, fetchSettings, currentProjectId, currentProject, projects } = useStore()

  const [activeTab, setActiveTab] = useState<SettingsTab>('project')

  // Restore connection status from settings
  const [zentaoStatus, setZentaoStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(settings.zentaoConnected === 'true' ? 'ok' : 'idle')
  const [zentaoError, setZentaoError] = useState('')
  const [jiraStatus, setJiraStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(settings.jiraConnected === 'true' ? 'ok' : 'idle')
  const [jiraError, setJiraError] = useState('')
  const [linearStatus, setLinearStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(settings.linearConnected === 'true' ? 'ok' : 'idle')
  const [linearError, setLinearError] = useState('')
  const [tapdStatus, setTapdStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(settings.tapdConnected === 'true' ? 'ok' : 'idle')
  const [tapdError, setTapdError] = useState('')

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Local form state
  const [form, setForm] = useState({
    projectName: currentProject || '',
    rootDir: '',
    zentaoUrl: '',
    zentaoHttpUser: '',
    zentaoHttpPass: '',
    zentaoAccount: '',
    zentaoPassword: '',
    zentaoProductId: '',
    jiraUrl: '',
    jiraEmail: '',
    jiraToken: '',
    jiraProjectKey: '',
    linearToken: '',
    linearTeamId: '',
    tapdApiUser: '',
    tapdApiPassword: '',
    tapdWorkspaceId: '',
  })

  useEffect(() => { fetchSettings() }, [fetchSettings])

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      projectName: currentProject || '',
      rootDir: settings[`rootDir_${currentProjectId}`] || '',
      zentaoUrl: settings.zentaoUrl || '',
      zentaoHttpUser: settings.zentaoHttpUser || '',
      zentaoHttpPass: settings.zentaoHttpPass || '',
      zentaoAccount: settings.zentaoAccount || '',
      zentaoPassword: settings.zentaoPassword || '',
      zentaoProductId: settings.zentaoProductId || '',
      jiraUrl: settings.jiraUrl || '',
      jiraEmail: settings.jiraEmail || '',
      jiraToken: settings.jiraToken || '',
      jiraProjectKey: settings.jiraProjectKey || '',
      linearToken: settings.linearToken || '',
      linearTeamId: settings.linearTeamId || '',
      tapdApiUser: settings.tapdApiUser || '',
      tapdApiPassword: settings.tapdApiPassword || '',
      tapdWorkspaceId: settings.tapdWorkspaceId || '',
    }))
  }, [settings, currentProject, currentProjectId])

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const pickDirectory = async (field: string) => {
    try {
      const { path } = await api.pickDirectory()
      if (path) updateField(field, path)
    } catch { /* user cancelled */ }
  }

  const handleSave = async () => {
    // Rename project
    if (form.projectName && form.projectName !== currentProject) {
      await api.renameProject(currentProjectId, form.projectName)
      // Sync local projects list and currentProject
      const updatedProjects = projects.map(p =>
        p.id === currentProjectId ? { ...p, name: form.projectName } : p
      )
      useStore.setState({ projects: updatedProjects, currentProject: form.projectName })
    }
    // rootDir stored per project
    const { projectName, rootDir, ...rest } = form
    await saveSettings({
      ...rest,
      [`rootDir_${currentProjectId}`]: rootDir,
    })
    setSettingsOpen(false)
  }

  const inputCls = "w-full px-3 py-2 bg-bg-input border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
  const selectCls = inputCls
  const labelCls = "text-sm font-medium text-text-secondary"

  // Navigation items
  const navItems: { key: SettingsTab; label: string; icon: typeof FolderOpen }[] = [
    { key: 'project', label: t.settings.projectConfig, icon: FolderOpen },


    { key: 'appearance', label: t.settings.appearance, icon: Palette },
    { key: 'integrations', label: t.settings.integrations, icon: Globe },
    { key: 'shortcuts', label: t.settings.shortcuts, icon: Keyboard },
    { key: 'about', label: t.settings.about, icon: Info },
  ]

  const filteredNav = searchQuery
    ? navItems.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : navItems

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[900px] h-[640px] bg-bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-bold text-text-primary">{t.settings.title}</h2>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: two columns */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left navigation */}
          <div className="w-56 border-r border-border flex flex-col bg-bg-input/50 shrink-0">
            {/* Search */}
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={locale === 'zh' ? '搜索设置...' : 'Search settings...'}
                  className="w-full bg-bg-input border border-border rounded px-8 py-1.5 text-xs text-text-primary focus:border-accent outline-none transition-colors placeholder:text-text-secondary/50"
                />
              </div>
            </div>
            {/* Navigation list */}
            <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
              {filteredNav.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
                    activeTab === key
                      ? 'bg-accent/15 text-accent font-medium'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-xl">

              {/* Project config */}
              {activeTab === 'project' && (
                <div>
                  <h3 className="text-base font-bold text-text-primary mb-6">{t.settings.projectConfig}</h3>
                  <div className="space-y-5">
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>{t.settings.projectName}</label>
                      <input type="text" value={form.projectName} onChange={(e) => updateField('projectName', e.target.value)} className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>{t.settings.rootDir}</label>
                      <div className="flex gap-2">
                        <input type="text" value={form.rootDir} onChange={(e) => updateField('rootDir', e.target.value)} placeholder="D:\projects\my-app" className={`flex-1 px-3 py-2 font-mono bg-bg-input border border-border rounded text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent`} />
                        <button onClick={() => pickDirectory('rootDir')} className="px-3 bg-bg-hover hover:bg-accent/20 rounded border border-border transition-colors flex items-center">
                          <FolderOpen className="w-4 h-4 text-text-secondary" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}


              {/* Appearance */}
              {activeTab === 'appearance' && (
                <div>
                  <h3 className="text-base font-bold text-text-primary mb-6">{t.settings.appearance}</h3>
                  <div className="space-y-5">
                    {/* Theme toggle */}
                    <div className="flex items-center justify-between">
                      <span className={labelCls}>{locale === 'zh' ? '编辑器主题' : 'Editor Theme'}</span>
                      <div className="flex gap-1 p-1 bg-bg-input border border-border rounded-md">
                        <button
                          onClick={() => setTheme('light')}
                          className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${theme === 'light' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                          {locale === 'zh' ? '亮色' : 'Light'}
                        </button>
                        <button
                          onClick={() => setTheme('dark')}
                          className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${theme === 'dark' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                          {locale === 'zh' ? '暗色' : 'Dark'}
                        </button>
                      </div>
                    </div>
                    {/* Language */}
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>{locale === 'zh' ? '语言' : 'Language'}</label>
                      <select value={locale} onChange={(e) => setLocale(e.target.value as 'zh' | 'en')} className={selectCls}>
                        <option value="zh">中文</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Shortcuts */}
              {activeTab === 'shortcuts' && (
                <div>
                  <h3 className="text-base font-bold text-text-primary mb-6">{t.settings.shortcuts}</h3>
                  <div className="space-y-3">
                    {[
                      { key: 'Ctrl+V', desc: locale === 'zh' ? '粘贴截图' : 'Paste Screenshot' },
                      { key: 'Ctrl+Enter', desc: locale === 'zh' ? '生成 AI 指令' : 'Generate AI Instructions' },
                      { key: 'Ctrl+Z', desc: locale === 'zh' ? '撤销标注' : 'Undo Annotation' },
                      { key: 'Ctrl+Shift+Z', desc: locale === 'zh' ? '重做标注' : 'Redo Annotation' },
                      { key: 'V', desc: locale === 'zh' ? '选择工具' : 'Select Tool' },
                      { key: 'R', desc: locale === 'zh' ? '矩形框' : 'Rectangle' },
                      { key: 'A', desc: locale === 'zh' ? '箭头' : 'Arrow' },
                      { key: 'T', desc: locale === 'zh' ? '文字' : 'Text' },
                      { key: 'N', desc: locale === 'zh' ? '序号' : 'Number' },
                      { key: 'H', desc: locale === 'zh' ? '高亮' : 'Highlight' },
                      { key: 'P', desc: locale === 'zh' ? '画笔' : 'Pen' },
                      { key: 'M', desc: locale === 'zh' ? '马赛克' : 'Mosaic' },
                      { key: 'Delete', desc: locale === 'zh' ? '删除选中' : 'Delete Selected' },
                    ].map(({ key, desc }) => (
                      <div key={key} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-text-secondary">{desc}</span>
                        <kbd className="px-2 py-1 bg-bg-input border border-border rounded text-xs text-text-muted font-mono">{key}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* About */}
              {activeTab === 'about' && (
                <div>
                  <h3 className="text-base font-bold text-text-primary mb-6">{t.settings.about}</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-text-secondary">{locale === 'zh' ? '版本' : 'Version'}</span>
                      <span className="text-sm text-text-primary font-mono">{t.app.version}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-text-secondary">{locale === 'zh' ? '应用名称' : 'App Name'}</span>
                      <span className="text-sm text-text-primary">{t.app.name}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* External platform integrations */}
              {activeTab === 'integrations' && (
                <div>
                  <h3 className="text-base font-bold text-text-primary mb-6">{t.settings.integrations}</h3>
                  <div className="space-y-4">

                    {/* Zentao */}
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <span className="relative inline-block text-sm font-medium text-text-primary">
                        {locale === 'zh' ? '禅道' : 'Zentao'}
                        <span className={`absolute -right-2.5 bottom-0 w-1.5 h-1.5 rounded-full ${
                          zentaoStatus === 'ok' || settings.zentaoConnected === 'true' ? 'bg-green-500' :
                          zentaoStatus === 'testing' ? 'bg-yellow-500 animate-pulse' :
                          zentaoStatus === 'fail' ? 'bg-red-500' : 'bg-text-secondary/30'
                        }`} />
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-text-secondary">{locale === 'zh' ? '禅道地址' : 'Zentao URL'}</label>
                        <input type="text" value={form.zentaoUrl} onChange={(e) => updateField('zentaoUrl', e.target.value)} placeholder="http://zentao.company.com" className={inputCls} />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary block mb-1.5">{locale === 'zh' ? '公司网关认证（HTTP Basic Auth）' : 'Gateway Auth (HTTP Basic Auth)'}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={form.zentaoHttpUser} onChange={(e) => updateField('zentaoHttpUser', e.target.value)} placeholder={locale === 'zh' ? '网关账号' : 'Gateway user'} className={inputCls} />
                          <input type="password" value={form.zentaoHttpPass} onChange={(e) => updateField('zentaoHttpPass', e.target.value)} placeholder={locale === 'zh' ? '网关密码' : 'Gateway password'} className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary block mb-1.5">{locale === 'zh' ? '禅道系统账号' : 'Zentao Account'}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={form.zentaoAccount} onChange={(e) => updateField('zentaoAccount', e.target.value)} placeholder={locale === 'zh' ? '禅道用户名' : 'Username'} className={inputCls} />
                          <input type="password" value={form.zentaoPassword} onChange={(e) => updateField('zentaoPassword', e.target.value)} placeholder={locale === 'zh' ? '禅道密码' : 'Password'} className={inputCls} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-text-secondary">{locale === 'zh' ? '产品 ID' : 'Product ID'}</label>
                        <input type="text" value={form.zentaoProductId} onChange={(e) => updateField('zentaoProductId', e.target.value)} placeholder={locale === 'zh' ? '禅道产品编号' : 'Zentao product number'} className={inputCls} />
                      </div>
                      <button
                        onClick={async () => {
                          if (!form.zentaoUrl || !form.zentaoAccount || !form.zentaoPassword) return
                          setZentaoStatus('testing'); setZentaoError('')
                          try {
                            const res = await api.zentao.test({ url: form.zentaoUrl, httpUser: form.zentaoHttpUser, httpPass: form.zentaoHttpPass, account: form.zentaoAccount, password: form.zentaoPassword })
                            setZentaoStatus(res.ok ? 'ok' : 'fail')
                            if (res.ok) saveSettings({ zentaoConnected: 'true' })
                            else { saveSettings({ zentaoConnected: '' }); if (res.error) setZentaoError(res.error) }
                          } catch (e: any) { setZentaoStatus('fail'); setZentaoError(e.message || 'Connection failed') }
                        }}
                        className={`w-full px-3 py-2 text-sm rounded transition-colors ${zentaoStatus === 'ok' ? 'bg-green-500/20 text-green-400' : zentaoStatus === 'fail' ? 'bg-red-500/20 text-red-400' : 'bg-accent/20 text-accent hover:bg-accent/30'}`}
                      >
                        {zentaoStatus === 'testing' ? (locale === 'zh' ? '测试中...' : 'Testing...') :
                         zentaoStatus === 'ok' ? (locale === 'zh' ? '连接成功' : 'Connected') :
                         zentaoStatus === 'fail' ? (locale === 'zh' ? '连接失败，重试' : 'Failed, retry') :
                         (locale === 'zh' ? '测试连接' : 'Test Connection')}
                      </button>
                      {zentaoError && <p className="text-xs text-red-400 break-all">{zentaoError}</p>}
                    </div>

                    {/* Jira */}
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <span className="relative inline-block text-sm font-medium text-text-primary">
                        Jira
                        <span className={`absolute -right-2.5 bottom-0 w-1.5 h-1.5 rounded-full ${
                          jiraStatus === 'ok' || settings.jiraConnected === 'true' ? 'bg-green-500' :
                          jiraStatus === 'testing' ? 'bg-yellow-500 animate-pulse' :
                          jiraStatus === 'fail' ? 'bg-red-500' : 'bg-text-secondary/30'
                        }`} />
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-text-secondary">{locale === 'zh' ? 'Jira 地址' : 'Jira URL'}</label>
                        <input type="text" value={form.jiraUrl} onChange={(e) => updateField('jiraUrl', e.target.value)} placeholder="https://your-team.atlassian.net" className={inputCls} />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary block mb-1.5">{locale === 'zh' ? 'Jira 账号' : 'Jira Account'}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={form.jiraEmail} onChange={(e) => updateField('jiraEmail', e.target.value)} placeholder={locale === 'zh' ? '邮箱地址' : 'Email'} className={inputCls} />
                          <input type="password" value={form.jiraToken} onChange={(e) => updateField('jiraToken', e.target.value)} placeholder="API Token" className={inputCls} />
                        </div>
                        <p className="text-[10px] text-text-secondary mt-1">
                          {locale === 'zh' ? '前往 id.atlassian.com → 安全 → 创建 API 令牌' : 'Go to id.atlassian.com → Security → Create API token'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-text-secondary">{locale === 'zh' ? '项目 Key' : 'Project Key'}</label>
                        <input type="text" value={form.jiraProjectKey} onChange={(e) => updateField('jiraProjectKey', e.target.value)} placeholder={locale === 'zh' ? '例: PROJ' : 'e.g. PROJ'} className={inputCls} />
                      </div>
                      <button
                        onClick={async () => {
                          if (!form.jiraUrl || !form.jiraEmail || !form.jiraToken) return
                          setJiraStatus('testing'); setJiraError('')
                          try {
                            const res = await api.jira.test({ url: form.jiraUrl, email: form.jiraEmail, token: form.jiraToken })
                            setJiraStatus(res.ok ? 'ok' : 'fail')
                            if (res.ok) saveSettings({ jiraConnected: 'true' })
                            else { saveSettings({ jiraConnected: '' }); if (res.error) setJiraError(res.error) }
                          } catch (e: any) { setJiraStatus('fail'); setJiraError(e.message || 'Connection failed') }
                        }}
                        className={`w-full px-3 py-2 text-sm rounded transition-colors ${jiraStatus === 'ok' ? 'bg-green-500/20 text-green-400' : jiraStatus === 'fail' ? 'bg-red-500/20 text-red-400' : 'bg-blue-400/20 text-blue-400 hover:bg-blue-400/30'}`}
                      >
                        {jiraStatus === 'testing' ? (locale === 'zh' ? '测试中...' : 'Testing...') :
                         jiraStatus === 'ok' ? (locale === 'zh' ? '连接成功' : 'Connected') :
                         jiraStatus === 'fail' ? (locale === 'zh' ? '连接失败，重试' : 'Failed, retry') :
                         (locale === 'zh' ? '测试连接' : 'Test Connection')}
                      </button>
                      {jiraError && <p className="text-xs text-red-400 break-all">{jiraError}</p>}
                    </div>

                    {/* Linear */}
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <span className="relative inline-block text-sm font-medium text-text-primary">
                        Linear
                        <span className={`absolute -right-2.5 bottom-0 w-1.5 h-1.5 rounded-full ${
                          linearStatus === 'ok' || settings.linearConnected === 'true' ? 'bg-green-500' :
                          linearStatus === 'testing' ? 'bg-yellow-500 animate-pulse' :
                          linearStatus === 'fail' ? 'bg-red-500' : 'bg-text-secondary/30'
                        }`} />
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-text-secondary">API Key</label>
                        <input type="password" value={form.linearToken} onChange={(e) => updateField('linearToken', e.target.value)} placeholder="lin_api_..." className={inputCls} />
                        <p className="text-[10px] text-text-secondary">
                          {locale === 'zh' ? '前往 Linear Settings → API → Personal API keys 生成' : 'Go to Linear Settings → API → Personal API keys'}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!form.linearToken) return
                          setLinearStatus('testing'); setLinearError('')
                          try {
                            const res = await api.linear.test({ token: form.linearToken })
                            setLinearStatus(res.ok ? 'ok' : 'fail')
                            if (res.ok) saveSettings({ linearConnected: 'true' })
                            else { saveSettings({ linearConnected: '' }); if (res.error) setLinearError(res.error) }
                          } catch (e: any) { setLinearStatus('fail'); setLinearError(e.message || 'Connection failed') }
                        }}
                        className={`w-full px-3 py-2 text-sm rounded transition-colors ${linearStatus === 'ok' ? 'bg-green-500/20 text-green-400' : linearStatus === 'fail' ? 'bg-red-500/20 text-red-400' : 'bg-violet-400/20 text-violet-400 hover:bg-violet-400/30'}`}
                      >
                        {linearStatus === 'testing' ? (locale === 'zh' ? '测试中...' : 'Testing...') :
                         linearStatus === 'ok' ? (locale === 'zh' ? '连接成功' : 'Connected') :
                         linearStatus === 'fail' ? (locale === 'zh' ? '连接失败，重试' : 'Failed, retry') :
                         (locale === 'zh' ? '测试连接' : 'Test Connection')}
                      </button>
                      {linearError && <p className="text-xs text-red-400 break-all">{linearError}</p>}
                    </div>

                    {/* TAPD */}
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <span className="relative inline-block text-sm font-medium text-text-primary">
                        TAPD
                        <span className={`absolute -right-2.5 bottom-0 w-1.5 h-1.5 rounded-full ${
                          tapdStatus === 'ok' || settings.tapdConnected === 'true' ? 'bg-green-500' :
                          tapdStatus === 'testing' ? 'bg-yellow-500 animate-pulse' :
                          tapdStatus === 'fail' ? 'bg-red-500' : 'bg-text-secondary/30'
                        }`} />
                      </span>
                      <div>
                        <label className="text-xs text-text-secondary block mb-1.5">{locale === 'zh' ? 'API 账号' : 'API Account'}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={form.tapdApiUser} onChange={(e) => updateField('tapdApiUser', e.target.value)} placeholder={locale === 'zh' ? 'API 账号' : 'API User'} className={inputCls} />
                          <input type="password" value={form.tapdApiPassword} onChange={(e) => updateField('tapdApiPassword', e.target.value)} placeholder={locale === 'zh' ? 'API 密码' : 'API Password'} className={inputCls} />
                        </div>
                        <p className="text-[10px] text-text-secondary mt-1">
                          {locale === 'zh' ? '在 TAPD 项目设置 → 应用设置 → API 中获取' : 'Get from TAPD Project Settings → App Settings → API'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-text-secondary">{locale === 'zh' ? '项目 ID（workspace_id）' : 'Project ID (workspace_id)'}</label>
                        <input type="text" value={form.tapdWorkspaceId} onChange={(e) => updateField('tapdWorkspaceId', e.target.value)} placeholder={locale === 'zh' ? '从 TAPD 项目 URL 中获取' : 'From TAPD project URL'} className={inputCls} />
                      </div>
                      <button
                        onClick={async () => {
                          if (!form.tapdApiUser || !form.tapdApiPassword) return
                          setTapdStatus('testing'); setTapdError('')
                          try {
                            const res = await api.tapd.test({ apiUser: form.tapdApiUser, apiPassword: form.tapdApiPassword, workspaceId: form.tapdWorkspaceId })
                            setTapdStatus(res.ok ? 'ok' : 'fail')
                            if (res.ok) saveSettings({ tapdConnected: 'true' })
                            else { saveSettings({ tapdConnected: '' }); if (res.error) setTapdError(res.error) }
                          } catch (e: any) { setTapdStatus('fail'); setTapdError(e.message || 'Connection failed') }
                        }}
                        className={`w-full px-3 py-2 text-sm rounded transition-colors ${tapdStatus === 'ok' ? 'bg-green-500/20 text-green-400' : tapdStatus === 'fail' ? 'bg-red-500/20 text-red-400' : 'bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30'}`}
                      >
                        {tapdStatus === 'testing' ? (locale === 'zh' ? '测试中...' : 'Testing...') :
                         tapdStatus === 'ok' ? (locale === 'zh' ? '连接成功' : 'Connected') :
                         tapdStatus === 'fail' ? (locale === 'zh' ? '连接失败，重试' : 'Failed, retry') :
                         (locale === 'zh' ? '测试连接' : 'Test Connection')}
                      </button>
                      {tapdError && <p className="text-xs text-red-400 break-all">{tapdError}</p>}
                    </div>

                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-5 py-2 rounded-md text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            {t.settings.cancel}
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-bold shadow-lg shadow-accent/20 transition-colors"
          >
            {t.settings.save}
          </button>
        </div>
      </div>
    </div>
  )
}
