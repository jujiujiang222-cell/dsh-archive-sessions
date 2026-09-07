# dsh-archive-sessions

Archived-session manager for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness).

在 DSH 设置界面新增“归档会话”页：列出所有已归档会话，支持**恢复**与**永久删除**（删除前二次确认）。

Adds an “归档会话” (Archived Sessions) settings page that lists archived
sessions and lets you **restore** or **permanently delete** each one (with an
in-page confirmation step).

## Features

- Lists archived sessions that still have a durable log on disk (disk is the
  source of truth — no ghost rows from the in-memory session store).
- Shows title, creation time, working directory and whether the session is
  currently open in memory.
- **Restore**: moves a session out of the archive set; it reappears in the
  sidebar.
- **Permanently delete**: removes the session's durable log file and detaches
  it from workspace accounting. Requires a two-step in-page confirmation.

## Install

Requirements: a DeepSeek Harness desktop / web profile (the “web” profile on
this machine) with the plugin market runtime.

```bash
# from a GitHub checkout (once the repository is listed in the marketplace
# registry) or directly from the repository:
dsh plugin --profile web add github:<owner>/dsh-archive-sessions
```

To build it from source and install locally, place the package into the active
profile's dependency set (pnpm install `file:`/git target), then make sure the
row below is present in the profile's bundle patch layer:

```yaml
# cordis.patch.yml
- insert:
    - id: dsh-archive-sessions
      name: dsh-archive-sessions
```

After install/update, restart the app (or let the market hot-reload the client
bundle) and open **设置 → 归档会话**.

## How it works

| Layer | File | Role |
| --- | --- | --- |
| Host | `src/index.js` | cordis plugin; registers same-origin HTTP routes `/plugins/dsh-archive-sessions/{list,restore,delete}` and implements all logic |
| Web client | `lib/client.js` | registers the `settings.section` page “归档会话” and talks to the host routes |
| Bundle row | `cordis.patch.yml` | inserts the plugin row into the profile layer stack |

### Design notes / caveats

- **No platform “delete session” service exists.** The session log backend is
  append-only and every list is derived from what is on disk. Permanent
  deletion therefore removes the session's own artifact
  (`session.jsonl[.zstd]` under the jsonl persistence backend) plus workspace
  accounting. The id stays in the archived set as a tombstone so the still
  resident in-memory session stays hidden from the sidebar during this run;
  after an app restart nothing references it.
- **In-memory resident sessions.** Sessions that were opened during the current
  app run keep a live agent in memory. Deleting such a session is allowed only
  when the agent is idle; a running agent is asked to stop first (up to ~4s).
- **Full-access file removal.** The sandboxed default shell cannot delete files
  inside the app's own data directory, so deletion runs through the shell with
  an explicit `danger-full-access` policy. Read the code before installing;
  use at your own risk.
- **Restore of a deleted session** is rejected: its log is gone.
- Verification status: developed and battle-tested as a session-scoped
  **dynamic plugin** (see `docs/dynamic-plugin-source.js`). The installable
  static package in this repo follows the published plugin layout
  (`dsh.client` metadata, bundle patch, `window.__ModuleLoader__` client
  bundle, same-origin host routes). Load-time dependency wiring should be
  verified in the target profile before publishing updates.

## Reference: run it as a dynamic plugin (no install needed)

If you want the same feature immediately in the current DSH session without
installing anything, paste the code from
[`docs/dynamic-plugin-source.md`](docs/dynamic-plugin-source.md) into a Cordis
dynamic-plugin definition, or ask your agent to create it with the plugin id
prefix `archv` (as was done during development).

## Repository layout

```
src/index.js                  host half (HTTP routes + logic)
lib/client.js                 web client half (settings page)
cordis.patch.yml              profile bundle row
docs/registry-submission.md   how to request listing on awesome-dsh-plugin
docs/dynamic-plugin-source.md reference dynamic-plugin source (dev version)
```

## License

MIT — see [LICENSE](LICENSE).
