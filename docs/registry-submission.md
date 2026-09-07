# Submit to the plugin marketplace (awesome-dsh-plugin)

The in-app “插件广场” (DeepSeek Harness market) shows the curated catalog served
from **https://awesome-dsh-plugin.com/plugins.json**, whose source repository is
**https://github.com/awesome-dsh-plugin/awesome-dsh-plugin**.

Only packages present in that curated catalog are installable from inside the
app. Getting listed is a two-step process:

1. Make this repository public on GitHub.
2. Ask the catalog maintainers to add the entry below (open an issue or a PR
   against the `awesome-dsh-plugin/awesome-dsh-plugin` repo, typically by
   editing its plugins data file).

## Suggested registry entry

```json
{
  "name": "dsh-archive-sessions",
  "owner": "jujiujiang222-cell",
  "url": "https://github.com/jujiujiang222-cell/dsh-archive-sessions",
  "category": "session",
  "description": {
    "en": "Archived-session manager: an \"Archived Sessions\" settings page that lists archived sessions and lets you restore or permanently delete each one (two-step confirmation).",
    "zh": "归档会话管理：在设置页新增“归档会话”，列出所有已归档会话，支持恢复与二次确认后的永久删除。"
  },
  "npm": null,
  "screenshots": []
}
```

Category reference: the catalog currently uses `session` (“会话与消息” /
“Sessions & Messages”), which fits this plugin. If the maintainers prefer a
different one (e.g. `ui`), follow their guidance.

## Notes to include in the request

- Repository: `https://github.com/jujiujiang222-cell/dsh-archive-sessions`
- Package name (`package.json`): `dsh-archive-sessions`
- Install spec that will be advertised once listed:
  `dsh plugin --profile web add github:jujiujiang222-cell/dsh-archive-sessions`
- The plugin installs a host half (same-origin HTTP routes) and a web client
  half (settings page), so it needs a profile that can load both.
- ⚠️ The plugin's permanent-delete action removes session log files from the
  app's own data directory and runs that removal with a full-access shell
  policy. Review `src/index.js` before listing. If the marketplace requires
  shipping only a tarball/npm source, publish the package to npm and set
  `"npm": "dsh-archive-sessions"` in the entry instead of `null`.

## After listing

Users will see the plugin in 设置 → 插件广场 → (search “归档会话” or
“archive”), with the install command shown above.
