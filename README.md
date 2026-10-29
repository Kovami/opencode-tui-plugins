> **This monorepo has been split into three standalone repositories.** Each
> plugin now lives, ships, and is published on its own:
>
> - [opencode-session-clock](https://github.com/Kovami/opencode-session-clock)
> - [opencode-session-stats](https://github.com/Kovami/opencode-session-stats)
> - [opencode-usage-plans](https://github.com/Kovami/opencode-usage-plans)
>
> This repository is kept for history.

# OpenCode TUI plugins

Three small, independent plugins for the OpenCode terminal UI. Install only the
ones you need; each package works on its own.

| Package | What it adds | Sidebar |
| --- | --- | --- |
| [`opencode-session-clock`](packages/session-clock) | Agent, idle, and total time for the current session, plus a `/time` timeline panel | Yes |
| [`opencode-session-stats`](packages/session-stats) | Today's LLM step count and average rate per hour | Yes |
| [`opencode-usage-plans`](packages/usage-plans) | Plan quota for Kimi Code and Alibaba Cloud Token Plan | Yes |

The clock and the stats plugin show one line each above the composer too, so the
numbers stay visible while you type.

## Install

TUI plugins are configured in `~/.config/opencode/cli.json` (or
`$XDG_CONFIG_HOME/opencode/cli.json`). Add the packages to `plugins`:

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    "opencode-session-clock@latest",
    "opencode-session-stats@latest",
    "opencode-usage-plans@latest"
  ]
}
```

To use just one, keep only its entry:

```jsonc
{
  "plugins": ["opencode-usage-plans@latest"]
}
```

OpenCode reloads the TUI when `cli.json` changes. For local development, point an
entry at a package directory instead of a registry name:

```jsonc
{
  "plugins": [
    { "package": "/absolute/path/to/opencode-tui-plugins/packages/usage-plans" }
  ]
}
```

### Recommended order

The plugins append to the sidebar in the order they are listed. Clock, stats,
usage reads naturally:

```jsonc
"plugins": [
  "opencode-session-clock@latest",
  "opencode-session-stats@latest",
  "opencode-usage-plans@latest"
]
```

## Usage plans

`opencode-usage-plans` detects each provider at startup and hides the ones that
are not set up. A missing login never shows an error block.

- **Kimi Code** requires an OpenCode login for `kimi-code-plan-global`. The key is
  read from the local OpenCode auth file and sent only to `api.kimi.ai`.
- **Alibaba Cloud Token Plan** requires the `bl` CLI and a prior `bl login`. The
  plugin runs `bl usage token-plan --output json`; the inference API key cannot
  read quota.

Optional settings:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-usage-plans@latest",
      "options": {
        "kimi": { "enabled": true },
        "alibaba": {
          "enabled": true,
          "blPath": "/custom/path/to/bl",
          "region": "ap-southeast-1",
          "site": "international"
        }
      }
    }
  ]
}
```

Quota is refreshed every five minutes. No keys or command output are logged or
displayed.

## Development

This is an npm-workspaces monorepo. From the repository root:

```sh
npm install
npm run check   # types, tests, and formatting of the sources
```

Each package is published independently with `npm publish -w packages/<name>`.

## License

MIT