# opencode-session-clock

A TUI plugin for OpenCode that shows how long the current session has been
running and how much of that time the agent was actually working.

## What it shows

- **Sidebar**: `Agent`, `Idle`, and `Total` time for the open session.
- **Composer**: a one-line summary above the prompt.
- **Timeline panel**: totals, the share of the session spent on agent work,
  and the last 12 agent steps with their duration and idle gap. Open it with
  `/time`.

Active time is the sum of assistant-message durations, from the moment a
request starts until its reply and tool work finish. Gaps between requests
count as idle, so time spent waiting for you never inflates the agent total.

## Install

Add the plugin to the `plugins` array in `~/.config/opencode/cli.json`:

```json
{
  "plugins": ["opencode-session-clock@0.1.0"]
}
```

Restart is not required: OpenCode reloads the CLI configuration when the file
changes.

## Requirements

- OpenCode 2.2 or newer.
- No configuration and no credentials.

## License

MIT