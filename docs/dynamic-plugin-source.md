# Dynamic-plugin reference source (development build)

During development this feature was built and battle-tested as a
session-scoped **dynamic Cordis plugin** (plugin id `archv-1`, nine package
iterations, current `pkg-9`). Dynamic plugins run entirely inside the current
DSH process and need no install; they are defined through the `cordis_define`
tool in an agent session.

Below is the exact, working reference implementation (Host half + Web client
half). To reproduce: in a DSH agent session that can see the Cordis dynamic
plugin tools, define a new plugin (id prefix `archv`) with these two code
halves, then run it. Keep the same business logic in mind when you extend the
installable static package in this repository (`src/index.js`,
`lib/client.js`).

## Host half

```js
return {
  inject: ['workspaceRegistry', 'sessionPersistence', 'sessionQuery', 'sessionController', 'agents', 'shell', 'fs', 'sessions', 'timer', 'sandboxPolicy'],
  apply(ctx) {
    const deletedIds = new Set()
    const listArchived = async () => {
      const archivedIds = ctx.workspaceRegistry.archivedSessionIds.map((id) => '' + id)
      const headers = await ctx.sessionPersistence.list()
      const persistedById = new Map(headers.map((header) => ['' + header.id, header]))
      const liveIds = new Set(ctx.sessions.list().map((session) => '' + session.id))
      const ids = archivedIds.filter((id) => !deletedIds.has(id))
      let titles = []
      try { titles = await ctx.sessionQuery.readTitleSnapshots(ids) } catch (_) { titles = [] }
      const titleById = new Map()
      for (const result of titles) {
        if (result.status !== 'fulfilled') continue
        const title = result.value.title
        if (title !== undefined && title.title) titleById.set('' + result.sessionId, title.title)
      }
      const items = []
      for (const id of ids) {
        const persisted = persistedById.has(id)
        const live = liveIds.has(id)
        if (!persisted && !live) continue
        const header = persistedById.get(id)
        items.push({
          id,
          title: titleById.get(id) || ('会话 ' + id),
          createdAt: header === undefined ? null : header.createdAt,
          cwd: header === undefined ? null : (header.cwd || null),
          live,
          persisted
        })
      }
      return { items }
    }
    const detachFromWorkspaces = async (id) => {
      for (const workspace of ctx.workspaceRegistry.list()) {
        if (workspace.sessionIds.some((value) => '' + value === id)) await workspace.detachSession(id)
      }
    }
    const restoreArchived = async (args) => {
      const id = '' + (args && args.id)
      if (deletedIds.has(id)) throw new Error('该会话的日志已被永久删除，无法恢复。')
      const state = ctx.workspaceRegistry.global.get()
      if (!state.archivedSessionIds.some((value) => '' + value === id)) return { ok: true }
      await ctx.workspaceRegistry.global.set({
        ...state,
        archivedSessionIds: state.archivedSessionIds.filter((value) => '' + value !== id)
      })
      return { ok: true }
    }
    const powershellQuote = (value) => "'" + ('' + value).replace(/'/g, "''") + "'"
    const looksLikeInUse = (text) => /being used by another process|sharing violation|access to the path .* is denied|文件正由另一进程使用|正被另一进程使用|拒绝访问/i.test(text)
    const fullAccessPolicy = () => ({ mode: 'danger-full-access', workspaceRoot: ctx.sandboxPolicy.workspaceRoot })
    const stopIfRunning = async (id) => {
      const agent = ctx.agents.get(id)
      if (agent === undefined) return true
      if (agent.status !== 'running') return true
      try { await ctx.sessionController.cancel({ sessionId: id }) } catch (_) {}
      let waited = 0
      while (waited < 4000) {
        await ctx.timeout(200)
        waited += 200
        const now = ctx.agents.get(id)
        if (now === undefined || now.status !== 'running') return true
      }
      const after = ctx.agents.get(id)
      return after === undefined || after.status !== 'running'
    }
    const deleteArchived = async (args) => {
      const id = '' + (args && args.id)
      const archivedIds = ctx.workspaceRegistry.archivedSessionIds.map((value) => '' + value)
      if (!archivedIds.includes(id)) return { ok: true }
      const headers = await ctx.sessionPersistence.list()
      const header = headers.find((entry) => '' + entry.id === id)
      if (header === undefined) {
        deletedIds.add(id)
        await detachFromWorkspaces(id)
        return { ok: true }
      }
      const stopped = await stopIfRunning(id)
      if (!stopped) throw new Error('该会话仍在运行中，已请求停止但尚未结束，请稍后重试。')
      const location = ctx.sessionPersistence.locate(header)
      if (location === undefined || !location.path) throw new Error('当前持久化后端不支持定位会话文件。')
      const target = await ctx.fs.resolve(location.path)
      const quoted = powershellQuote(location.path)
      const clearReadonly = 'if (Test-Path -LiteralPath ' + quoted + ') { Set-ItemProperty -LiteralPath ' + quoted + ' -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue }'
      const remove = 'Remove-Item -LiteralPath ' + quoted + ' -Force -ErrorAction Stop'
      const policy = fullAccessPolicy()
      let lastStderr = ''
      let removed = false
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (attempt > 0) await ctx.timeout(300 * attempt)
        const still = await ctx.fs.stat(target)
        if (still === undefined) { removed = true; break }
        const result = await ctx.shell.run(ctx.shell.resolve({ command: clearReadonly + '; ' + remove, timeoutMs: 30000, sandboxPolicy: policy }))
        if (result.exitCode === 0) {
          const after = await ctx.fs.stat(target)
          if (after === undefined) { removed = true; break }
        } else {
          lastStderr = result.stderr && result.stderr.text ? result.stderr.text : '未知错误'
          if (!looksLikeInUse(lastStderr)) break
        }
      }
      if (!removed) {
        const final = await ctx.fs.stat(target)
        if (final !== undefined) {
          if (looksLikeInUse(lastStderr)) throw new Error('会话文件正被占用，已重试多次仍未成功。请稍后重试。')
          throw new Error('删除会话文件失败：' + lastStderr)
        }
      }
      deletedIds.add(id)
      await detachFromWorkspaces(id)
      return { ok: true }
    }
    ctx.effect(() => {
      const offList = harness.handle('archive-sessions/list', listArchived)
      const offRestore = harness.handle('archive-sessions/restore', restoreArchived)
      const offDelete = harness.handle('archive-sessions/delete', deleteArchived)
      return () => { offList(); offRestore(); offDelete() }
    }, 'archive-sessions: rpc')
  }
}
```

## Web client half

```js
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const css = `
      .dsh-archive-page { box-sizing: border-box; max-width: 760px; padding: 28px 32px 40px; color: var(--dsw-alias-label-primary); }
      .dsh-archive-heading { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: -0.01em; }
      .dsh-archive-subtitle { margin: 7px 0 22px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
      .dsh-archive-list { display: flex; flex-direction: column; gap: 8px; }
      .dsh-archive-empty { padding: 34px 16px; border: 1px dashed var(--dsw-alias-border-secondary); border-radius: 12px; color: var(--dsw-alias-label-tertiary); text-align: center; font-size: 13px; }
      .dsh-archive-row { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-secondary); border-radius: 12px; background: var(--dsw-alias-bg-primary); }
      .dsh-archive-main { min-width: 0; flex: 1; }
      .dsh-archive-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 550; }
      .dsh-archive-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 5px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .dsh-archive-actions { display: flex; flex: none; gap: 8px; }
      .dsh-archive-button { cursor: pointer; border: 1px solid var(--dsw-alias-border-secondary); border-radius: 8px; padding: 7px 11px; color: var(--dsw-alias-label-primary); background: transparent; font-size: 12px; }
      .dsh-archive-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
      .dsh-archive-button.danger { color: var(--dsw-alias-label-danger, #d04444); }
      .dsh-archive-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; color: var(--dsw-alias-label-danger, #d04444); font-size: 12px; }
      .dsh-archive-error { margin-bottom: 14px; padding: 10px 12px; border-radius: 8px; color: var(--dsw-alias-label-danger, #d04444); background: color-mix(in srgb, var(--dsw-alias-label-danger, #d04444) 10%, transparent); font-size: 12px; }
      .dsh-archive-loading { color: var(--dsw-alias-label-tertiary); font-size: 13px; }
    `
    ctx.effect(() => styles.insert(css), 'archive-sessions: styles')
    function ArchivePage() {
      const [items, setItems] = React.useState([])
      const [loading, setLoading] = React.useState(true)
      const [busy, setBusy] = React.useState(null)
      const [confirmId, setConfirmId] = React.useState(null)
      const [error, setError] = React.useState(null)
      const reload = async () => {
        setLoading(true); setError(null)
        try {
          const result = await host.call('archive-sessions/list')
          setItems(result && Array.isArray(result.items) ? result.items : [])
        } catch (reason) {
          setError('读取归档会话失败：' + (reason && reason.message ? reason.message : '' + reason))
        } finally { setLoading(false) }
      }
      React.useEffect(() => { reload() }, [])
      const runAction = async (id, action) => {
        setBusy(id + ':' + action); setError(null)
        try {
          await host.call('archive-sessions/' + action, { id })
          setConfirmId(null); await reload()
        } catch (reason) {
          setError((action === 'delete' ? '永久删除失败：' : '恢复失败：') + (reason && reason.message ? reason.message : '' + reason))
        } finally { setBusy(null) }
      }
      return React.createElement('div', { className: 'dsh-archive-page' },
        React.createElement('h2', { className: 'dsh-archive-heading' }, '归档会话'),
        React.createElement('p', { className: 'dsh-archive-subtitle' }, '已归档的会话会从侧边栏隐藏。你可以恢复会话，或将其永久删除。'),
        error ? React.createElement('div', { className: 'dsh-archive-error' }, error) : null,
        loading ? React.createElement('div', { className: 'dsh-archive-loading' }, '正在加载…') : null,
        !loading && items.length === 0 ? React.createElement('div', { className: 'dsh-archive-empty' }, '暂无归档会话') : null,
        !loading && items.length > 0 ? React.createElement('div', { className: 'dsh-archive-list' }, items.map((item) => {
          const isBusy = busy !== null && busy.indexOf(item.id + ':') === 0
          const metaParts = []
          if (item.createdAt !== null) metaParts.push('创建于 ' + item.createdAt)
          if (item.cwd) metaParts.push(item.cwd)
          if (item.live) metaParts.push('当前打开')
          const meta = metaParts.length > 0 ? metaParts.join(' · ') : '会话 ID：' + item.id
          return React.createElement('div', { className: 'dsh-archive-row', key: item.id },
            React.createElement('div', { className: 'dsh-archive-main' },
              React.createElement('div', { className: 'dsh-archive-title' }, item.title),
              React.createElement('div', { className: 'dsh-archive-meta' }, meta)
            ),
            confirmId === item.id ? React.createElement('div', { className: 'dsh-archive-confirm' },
              React.createElement('span', null, '确定永久删除？此操作不可撤销。'),
              React.createElement('button', { className: 'dsh-archive-button danger', disabled: isBusy, onClick: () => runAction(item.id, 'delete') }, isBusy ? '删除中…' : '确认删除'),
              React.createElement('button', { className: 'dsh-archive-button', disabled: isBusy, onClick: () => setConfirmId(null) }, '取消')
            ) : React.createElement('div', { className: 'dsh-archive-actions' },
              React.createElement('button', { className: 'dsh-archive-button', disabled: isBusy, onClick: () => runAction(item.id, 'restore') }, isBusy ? '处理中…' : '恢复'),
              React.createElement('button', { className: 'dsh-archive-button danger', disabled: isBusy, onClick: () => setConfirmId(item.id) }, '永久删除')
            )
          )
        })) : null
      )
    }
    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'archive-sessions', order: 25, label: '归档会话' },
      (props) => React.createElement(ArchivePage, props)
    ))
  }
}
```

Note: the dynamic client half talks to the Host via the dynamic-runner's
`host.call('archive-sessions/…')` bridge. The installable static package in
this repo replaces that bridge with same-origin HTTP routes
(`/plugins/dsh-archive-sessions/…`), keeping the UI logic identical.
