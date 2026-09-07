/**
 * dsh-archive-sessions — Host half.
 *
 * A DeepSeek Harness plugin that lets a user manage ARCHIVED sessions from a
 * settings page:
 *
 *   - list   the archived sessions that still have a durable log on disk
 *   - restore a session (remove it from the archive set)
 *   - permanently delete its durable log file (and detach it from workspaces)
 *
 * Browser UI (lib/client.js) talks to this half over same-origin HTTP routes.
 *
 * ── Why it deletes log files itself ────────────────────────────────────────
 * The platform has no "delete a session" service: the persistence layer is
 * append-only and every session list is derived from what exists on disk.
 * "Permanent deletion" therefore means removing the session's own durable
 * artifact (session.jsonl[.zstd]) under the jsonl persistence backend, plus
 * dropping its workspace accounting. The archived-session tombstone id is kept
 * in the archive set on purpose: while the (still resident) in-memory session
 * lives, the sidebar must keep hiding it; after an app restart nothing on disk
 * references it anymore.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 * Deletion refuses sessions whose agent is currently running a turn (it asks
 * to stop first and waits), and it runs the file removal with a full-access
 * sandbox policy because the sandboxed default shell cannot delete files in
 * the app's own data directory. Install and use at your own risk.
 */
export const name = 'dsh-archive-sessions'

export const inject = [
  'workspaceRegistry',
  'sessionPersistence',
  'sessionQuery',
  'sessionController',
  'agents',
  'shell',
  'fs',
  'sessions',
  'timer',
  'sandboxPolicy',
]

const ROUTES = {
  list: '/plugins/dsh-archive-sessions/list',
  restore: '/plugins/dsh-archive-sessions/restore',
  delete: '/plugins/dsh-archive-sessions/delete',
}

/** UTF-8 JSON response helper. */
function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** Collect and parse a JSON request body. */
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function powershellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function looksLikeInUse(text) {
  return /being used by another process|sharing violation|access to the path .* is denied|文件正由另一进程使用|正被另一进程使用|拒绝访问/i.test(text)
}

export function apply(ctx) {
  async function listArchived() {
    const archivedIds = ctx.workspaceRegistry.archivedSessionIds.map((id) => String(id))
    const headers = await ctx.sessionPersistence.list()
    const persistedById = new Map(headers.map((header) => [String(header.id), header]))
    const liveIds = new Set(ctx.sessions.list().map((session) => String(session.id)))
    let titles = []
    try {
      titles = await ctx.sessionQuery.readTitleSnapshots(archivedIds)
    } catch {
      titles = []
    }
    const titleById = new Map()
    for (const result of titles) {
      if (result.status !== 'fulfilled') continue
      const title = result.value.title
      if (title !== undefined && title.title) titleById.set(String(result.sessionId), title.title)
    }
    const items = []
    for (const id of archivedIds) {
      const persisted = persistedById.has(id)
      const live = liveIds.has(id)
      if (!persisted && !live) continue
      const header = persistedById.get(id)
      items.push({
        id,
        title: titleById.get(id) || `会话 ${id}`,
        createdAt: header === undefined ? null : header.createdAt,
        cwd: header === undefined ? null : header.cwd || null,
        live,
        persisted,
      })
    }
    return { items }
  }

  async function detachFromWorkspaces(id) {
    for (const workspace of ctx.workspaceRegistry.list()) {
      const owns = workspace.sessionIds.some((value) => String(value) === id)
      if (owns) await workspace.detachSession(id)
    }
  }

  async function stopIfRunning(id) {
    const agent = ctx.agents.get(id)
    if (agent === undefined) return true
    if (agent.status !== 'running') return true
    try {
      await ctx.sessionController.cancel({ sessionId: id })
    } catch {
      /* best effort */
    }
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

  async function restoreArchived(id) {
    const state = ctx.workspaceRegistry.global.get()
    if (!state.archivedSessionIds.some((value) => String(value) === id)) return { ok: true }
    await ctx.workspaceRegistry.global.set({
      ...state,
      archivedSessionIds: state.archivedSessionIds.filter((value) => String(value) !== id),
    })
    return { ok: true }
  }

  async function deleteArchived(id) {
    const archivedIds = ctx.workspaceRegistry.archivedSessionIds.map((value) => String(value))
    if (!archivedIds.includes(id)) return { ok: true }
    const headers = await ctx.sessionPersistence.list()
    const header = headers.find((entry) => String(entry.id) === id)
    if (header === undefined) {
      // Idempotent cleanup: the log is already gone; tidy workspace slots.
      await detachFromWorkspaces(id)
      return { ok: true }
    }
    const stopped = await stopIfRunning(id)
    if (!stopped) throw new Error('该会话仍在运行中，已请求停止但尚未结束，请稍后重试。')
    const location = ctx.sessionPersistence.locate(header)
    if (location === undefined || !location.path) {
      throw new Error('当前持久化后端不支持定位会话文件。')
    }
    const target = await ctx.fs.resolve(location.path)
    const quoted = powershellQuote(location.path)
    const clearReadonly =
      `if (Test-Path -LiteralPath ${quoted}) { Set-ItemProperty -LiteralPath ${quoted} -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue }`
    const remove = `Remove-Item -LiteralPath ${quoted} -Force -ErrorAction Stop`
    const policy = { mode: 'danger-full-access', workspaceRoot: ctx.sandboxPolicy.workspaceRoot }
    let lastStderr = ''
    let removed = false
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await ctx.timeout(300 * attempt)
      const still = await ctx.fs.stat(target)
      if (still === undefined) {
        removed = true
        break
      }
      const result = await ctx.shell.run(
        ctx.shell.resolve({
          command: `${clearReadonly}; ${remove}`,
          timeoutMs: 30000,
          sandboxPolicy: policy,
        }),
      )
      if (result.exitCode === 0) {
        const after = await ctx.fs.stat(target)
        if (after === undefined) {
          removed = true
          break
        }
      } else {
        lastStderr = result.stderr && result.stderr.text ? result.stderr.text : '未知错误'
        if (!looksLikeInUse(lastStderr)) break
      }
    }
    if (!removed) {
      const final = await ctx.fs.stat(target)
      if (final !== undefined) {
        if (looksLikeInUse(lastStderr)) {
          throw new Error('会话文件正被占用，已重试多次仍未成功。请稍后重试。')
        }
        throw new Error(`删除会话文件失败：${lastStderr}`)
      }
    }
    await detachFromWorkspaces(id)
    return { ok: true }
  }

  ctx.inject(['webServer'], (httpCtx) => {
    const offList = httpCtx.webServer.register({
      kind: 'exact',
      path: ROUTES.list,
      handler: async (_req, res) => {
        try {
          jsonResponse(res, 200, await listArchived())
        } catch (error) {
          jsonResponse(res, 500, { ok: false, message: String(error && error.message ? error.message : error) })
        }
      },
    })
    const offRestore = httpCtx.webServer.register({
      kind: 'exact',
      path: ROUTES.restore,
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req)
          jsonResponse(res, 200, await restoreArchived(String(body.id ?? '')))
        } catch (error) {
          jsonResponse(res, 500, { ok: false, message: String(error && error.message ? error.message : error) })
        }
      },
    })
    const offDelete = httpCtx.webServer.register({
      kind: 'exact',
      path: ROUTES.delete,
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req)
          jsonResponse(res, 200, await deleteArchived(String(body.id ?? '')))
        } catch (error) {
          jsonResponse(res, 500, { ok: false, message: String(error && error.message ? error.message : error) })
        }
      },
    })
    return () => {
      offList()
      offRestore()
      offDelete()
    }
  })
}
