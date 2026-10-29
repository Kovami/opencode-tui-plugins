# opencode-session-stats

A TUI plugin for OpenCode that shows how many LLM requests you made today and
how that rate compares to the day so far.

## What it shows

- **Sidebar**: `LLM today  N · M/h`.
- **Composer**: the same line above the prompt.

The count comes from OpenCode's own session statistics, aggregated from local
midnight across every session, and refreshes every 10 seconds.

## Install

Add the plugin to the `plugins` array in `~/.config/opencode/cli.json`:

```json
{
  "plugins": ["opencode-session-stats@0.1.0"]
}
```

## Requirements

- OpenCode 2.2 or newer.
- No configuration and no credentials.

Servers that do not expose the experimental stats endpoint simply show
nothing.

## License

MIT