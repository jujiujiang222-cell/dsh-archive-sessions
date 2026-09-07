/**
 * dsh-archive-sessions — Web client half.
 *
 * Loaded by the DSH web module loader. Registers one settings page
 * ("归档会话") that lists archived sessions and lets the user restore or
 * permanently delete each one. All data comes from the host half over
 * same-origin HTTP routes (see src/index.js).
 */
window.__ModuleLoader__.load({ id: 'dsh-archive-sessions', factory: (require) => {
  const React = require('react')

  const LIST_URL = '/plugins/dsh-archive-sessions/list'
  const RESTORE_URL = '/plugins/dsh-archive-sessions/restore'
  const DELETE_URL = '/plugins/dsh-archive-sessions/delete'

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

  function call(method, url, body) {
    const options = { method, cache: 'no-store' }
    if (body !== undefined) {
      options.headers = { 'content-type': 'application/json' }
      options.body = JSON.stringify(body)
    }
    return fetch(url, options).then(async (response) => {
      const data = await response.json().catch(() => ({}))
      if (!response.ok || (data && data.ok === false)) {
        throw new Error(data && data.message ? data.message : `request failed: ${response.status}`)
      }
      return data
    })
  }

  function ArchivePage() {
    const [items, setItems] = React.useState([])
    const [loading, setLoading] = React.useState(true)
    const [busy, setBusy] = React.useState(null)
    const [confirmId, setConfirmId] = React.useState(null)
    const [error, setError] = React.useState(null)

    const reload = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await call('GET', LIST_URL)
        setItems(result && Array.isArray(result.items) ? result.items : [])
      } catch (reason) {
        setError('读取归档会话失败：' + (reason && reason.message ? reason.message : '' + reason))
      } finally {
        setLoading(false)
      }
    }

    React.useEffect(() => {
      reload()
    }, [])

    const runAction = async (id, action) => {
      setBusy(id + ':' + action)
      setError(null)
      try {
        await call('POST', action === 'delete' ? DELETE_URL : RESTORE_URL, { id })
        setConfirmId(null)
        await reload()
      } catch (reason) {
        setError(
          (action === 'delete' ? '永久删除失败：' : '恢复失败：') +
            (reason && reason.message ? reason.message : '' + reason),
        )
      } finally {
        setBusy(null)
      }
    }

    return React.createElement(
      'div',
      { className: 'dsh-archive-page' },
      React.createElement('h2', { className: 'dsh-archive-heading' }, '归档会话'),
      React.createElement(
        'p',
        { className: 'dsh-archive-subtitle' },
        '已归档的会话会从侧边栏隐藏。你可以恢复会话，或将其永久删除。',
      ),
      error ? React.createElement('div', { className: 'dsh-archive-error' }, error) : null,
      loading
        ? React.createElement('div', { className: 'dsh-archive-loading' }, '正在加载…')
        : null,
      !loading && items.length === 0
        ? React.createElement('div', { className: 'dsh-archive-empty' }, '暂无归档会话')
        : null,
      !loading && items.length > 0
        ? React.createElement(
            'div',
            { className: 'dsh-archive-list' },
            items.map((item) => {
              const isBusy = busy !== null && busy.indexOf(item.id + ':') === 0
              const metaParts = []
              if (item.createdAt !== null) metaParts.push('创建于 ' + item.createdAt)
              if (item.cwd) metaParts.push(item.cwd)
              if (item.live) metaParts.push('当前打开')
              const meta = metaParts.length > 0 ? metaParts.join(' · ') : '会话 ID：' + item.id
              return React.createElement(
                'div',
                { className: 'dsh-archive-row', key: item.id },
                React.createElement(
                  'div',
                  { className: 'dsh-archive-main' },
                  React.createElement('div', { className: 'dsh-archive-title' }, item.title),
                  React.createElement('div', { className: 'dsh-archive-meta' }, meta),
                ),
                confirmId === item.id
                  ? React.createElement(
                      'div',
                      { className: 'dsh-archive-confirm' },
                      React.createElement('span', null, '确定永久删除？此操作不可撤销。'),
                      React.createElement(
                        'button',
                        { className: 'dsh-archive-button danger', disabled: isBusy, onClick: () => runAction(item.id, 'delete') },
                        isBusy ? '删除中…' : '确认删除',
                      ),
                      React.createElement(
                        'button',
                        { className: 'dsh-archive-button', disabled: isBusy, onClick: () => setConfirmId(null) },
                        '取消',
                      ),
                    )
                  : React.createElement(
                      'div',
                      { className: 'dsh-archive-actions' },
                      React.createElement(
                        'button',
                        { className: 'dsh-archive-button', disabled: isBusy, onClick: () => runAction(item.id, 'restore') },
                        isBusy ? '处理中…' : '恢复',
                      ),
                      React.createElement(
                        'button',
                        { className: 'dsh-archive-button danger', disabled: isBusy, onClick: () => setConfirmId(item.id) },
                        '永久删除',
                      ),
                    ),
              )
            }),
          )
        : null,
    )
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-archive-sessions: styles')

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          { name: 'settings.section', id: 'archive-sessions', order: 25, label: '归档会话' },
          (props) => React.createElement(ArchivePage, props),
        ),
      )
    },
  }
}})
