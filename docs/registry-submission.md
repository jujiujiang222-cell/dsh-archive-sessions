# Submit to the plugin marketplace (awesome-dsh-plugin)

The in-app “插件广场” (DeepSeek Harness market) shows the curated catalog built
from **https://github.com/awesome-dsh-plugin/awesome-dsh-plugin**
(`data/plugins/*.yml`, one YAML file per plugin). Only catalogued plugins are
installable from inside the app.

## How the submission works

Open a pull request against `awesome-dsh-plugin/awesome-dsh-plugin` that adds
**exactly one file**:

```
data/plugins/jujiujiang222-cell__dsh-archive-sessions.yml
```

with this content:

```yaml
url: https://github.com/jujiujiang222-cell/dsh-archive-sessions
name: jujiujiang222-cell/dsh-archive-sessions
category: session
description:
  en: 'Archived-session manager: an "Archived Sessions" settings page that lists archived sessions and lets you restore or permanently delete each one (two-step confirmation).'
  zh: '归档会话管理：在设置页新增“归档会话”，列出所有已归档会话，支持恢复与二次确认后的永久删除。'
```

That one file is the whole submission. The READMEs and the public catalog
(`plugins.json`) are generated on `main` after the PR merges — do not edit them
by hand.

### Checkpoints before opening the PR

- ✅ The repository declares a `dsh.bundle` manifest in `package.json`
  (this package declares `dsh.bundle.patch`, matching the installable-plugin
  convention used by `dshmarket` and other listed plugins).
- ✅ `category: session` is a valid category value
  (`agi ui usage theme model identity session memory tools wsl browser vision
  voice docs skill workflow git notify dev security remote market fun`).
- ✅ The description lines are quoted because they contain `": "` sequences.
- ⏳ **The repository must be at least 1 day old** — this is enforced by their
  CI (it filters out repos created minutes before the PR). Created
  `2026-09-07`, so submit any time after **2026-09-08**.
- 🔎 A maintainer will read the source before merging. Expect a comment if the
  description needs rewording or the category should change — that is not a
  rejection.

## How to open the PR (one-time, ~2 minutes)

```bash
# 1. clone the catalog repo (read-only is enough for a fork flow)
gh repo clone awesome-dsh-plugin/awesome-dsh-plugin -- --depth=1
cd awesome-dsh-plugin
git checkout -b add/dsh-archive-sessions

# 2. add the single YAML file (content above), then
git add data/plugins/jujiujiang222-cell__dsh-archive-sessions.yml
git commit -m "add dsh-archive-sessions (session management)"
git push -u origin add/dsh-archive-sessions

# 3. open the PR (name the plugin + the repo link in the body)
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --title "Add dsh-archive-sessions" \
  --body "Adds archived-session management (list / restore / permanent delete).\nRepo: https://github.com/jujiujiang222-cell/dsh-archive-sessions"
```

CI runs automatically. If a check fails it names exactly what to change — push a
fix to the same branch.

## Optional extras (recommended before/after listing)

- **Screenshots**: add a `screenshots.json` next to `package.json` in this repo
  listing 1–8 image paths (relative, images committed to the repo). Storefronts
  (e.g. the dsh-market detail view) pick them up on the next nightly build —
  no PR needed afterwards.
- **npm**: publishing to npm is optional and does not affect listing. If you
  publish later, keep the package's `repository` field pointing at this repo
  and the catalog links the two automatically.

## After listing

Users find the plugin in 设置 → 插件广场 (category “会话与消息” or by
searching “归档” / “archive”), with the install command
`dsh plugin --profile web add github:jujiujiang222-cell/dsh-archive-sessions`.

## Safety note (mention in the PR body)

The plugin's permanent-delete action removes session log files from the app's
own data directory (`~/.dsh/sessions/...`) and runs that removal with an
explicit full-access shell policy because the sandboxed default shell cannot
delete files there. Review `src/index.js` before merging.
