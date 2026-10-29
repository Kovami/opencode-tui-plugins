# Design: three OpenCode TUI plugins (clock, stats, usage plans)

Date: 2026-10-29
Status: approved
Author: Kovami (with an AI agent)

## Intent

The local plugin at `~/.config/opencode/plugins/opencode-session-clock` mixes four
unrelated things: session time accounting, today's LLM request count, Kimi Code
quota, and Alibaba Token Plan quota. Its package name (`opencode-usage-alibaba`),
folder name, and plugin id (`usage-alibaba`) disagree, it hardcodes
`/Users/alex/.npm-global/bin/bl` and a region, and it renders dead blocks when only
one provider is connected.

Split it into three independently installable and publishable TUI plugins:

1. **Session clock** — how much of a session the agent was actually working.
2. **Session stats** — how many LLM requests ran today.
3. **Usage plans** — subscription quota windows, with provider adapters that can
   grow over time.

Publish all three to npm so other people can use them.

## Goals

- Three packages in one monorepo, each usable alone, with no runtime imports
  between them.
- A Usage plugin that renders cleanly with zero, one, or several providers
  configured, and never shows a block for a provider that is not set up.
- No machine-specific absolute paths, no region baked into code, no secrets in
  output or logs.
- English UI (the current plugin mixes Russian and English).
- Typecheck, unit tests, READMEs, MIT license, publishable `0.1.0`.
- Local `cli.json` keeps working after the move; published packages are a drop-in
  replacement for local paths.

## Non-goals

- Server-side plugins or new OpenCode API endpoints.
- Persisting quota history, charts, or notifications/toasts.
- Kimi China endpoint (`kimi-code-plan-cn`) in `0.1.0`; the adapter is shaped so
  it can be added later.
- Kimi's `usages.limit_month_code` bucket in `0.1.0`; it is not the monthly
  request window and would need its own label.
- OpenCode Console Go/budget limits (`/api/experimental/usage/limits`) in `0.1.0`.
- User-configurable refresh intervals or bar width.
- Localization/i18n infrastructure.

## Constraints

- Target OpenCode `2.2.1` TUI plugin API; package exposes `./tui`.
- TS/TSX shipped as source; the host compiles it.
- Slot render functions must stay synchronous and side-effect free. All network
  and process work starts in `setup` and updates signals.
- `experimental.session.stats` is experimental; failures must be inert.
- npm publishing needs an interactive `npm login` by the user.
- The three npm names were free at design time: `opencode-session-clock`,
  `opencode-session-stats`, `opencode-usage-plans`.

## Approaches considered

### Repository layout

- **A. npm workspaces monorepo (chosen).** One repo at
  `~/Projects/opencode-tui-plugins`, `packages/{session-clock,session-stats,usage-plans}`,
  shared root dev tooling, independent versions and publishes.
- **B. Three standalone folders.** Rejected: three copies of tooling, no single
  `npm run check`, awkward publishing for one author.
- **C. Keep everything under `~/.config/opencode/plugins`.** Rejected: config
  directory is a poor repo/publish home and local absolute paths remain.

### Shared runtime code

- **A. Zero shared runtime code (chosen).** `formatDuration`, `formatClock`, and
  the quota bar are ~40 lines; each package carries its own copy. Simpler
  publishing, no internal dependency or workspace-resolution risk in the plugin
  loader.
- **B. Internal `@kovami/opencode-tui-shared` package.** Rejected: a fourth
  package to publish and version, and the host must resolve a workspace
  dependency from a cache directory.
- **C. Generate copies from a shared source at build time.** Rejected: a build
  step with no payoff at this size.

### Usage provider model

- **A. Adapter modules inside `opencode-usage-plans` (chosen).** A small
  `Provider` contract, one file per provider, detection decides visibility.
  Adding a provider is one file and one entry in the registry.
- **B. One package per provider.** Rejected by the chosen three-plugin split, and
  it produces duplicate `Usage` headers when several are installed.
- **C. One provider chosen by an option.** Rejected: users with two plans want
  both visible.

## Package contract (all three)

| Field | Value |
| --- | --- |
| Folder | `packages/session-clock`, `packages/session-stats`, `packages/usage-plans` |
| npm name | `opencode-session-clock`, `opencode-session-stats`, `opencode-usage-plans` |
| Plugin id | `session-clock`, `session-stats`, `usage-plans` |
| Version | `0.1.0` |
| License | MIT, copyright Kovami |
| Type | `"type": "module"` |
| Entry | `"exports": { "./tui": "./src/tui.tsx" }` |
| Files | `src`, `README.md`, `LICENSE` |
| Repository | `github.com/Kovami/opencode-tui-plugins`, directory set per package |
| Runtime deps | `@opencode/plugin` `^2.2.1` |
| Peer deps | `@opentui/core >=0.6.6`, `@opentui/solid >=0.6.6`, `solid-js >=1.9.0` |
| Node | `>=20` (global `fetch`, `AbortSignal.timeout`) |
| Publish | `--access public`, no `private: true` |

Root: private workspace package with TypeScript, Vitest, `@types/node`, and the
peer dependencies installed for typecheck; scripts `check` (`tsc --noEmit` plus
`vitest run`), `test`, `typecheck`.

Install shape for users, in `cli.json`:

```json
{
  "plugins": [
    "opencode-session-clock@0.1.0",
    "opencode-session-stats@0.1.0",
    "opencode-usage-plans@0.1.0"
  ]
}
```

Options are passed with the object form:

```json
{ "package": "opencode-usage-plans@0.1.0", "options": { "alibaba": { "region": "ap-southeast-1" } } }
```

## 1. Session clock (`opencode-session-clock`)

Port `src/time.ts` unchanged in behaviour: active time is the sum of assistant
message durations (request start to completion, including tool execution); idle
is wall-clock time minus active; the last unfinished assistant message is counted
up to `now`. History is loaded once per session through paginated
`client.message.list` (200 per page), cached in memory, merged with the live
window by message id, and reloaded (at most every 10 s) when the live window no
longer overlaps the cache.

UI:

- Sidebar (`prepend: "sidebar.content"`): `Session time`, then `Agent`, `Idle`,
  `Total`.
- Composer top (`prepend: "session.composer.top"`): one muted line
  `Agent … · Idle … · Total …`.
- `/time` command opens panel `session-clock.timeline`
  (`append: "session.panel"`) with the same totals, percent of session spent in
  agent work, and the last 12 steps (`HH:MM:SS  duration  (+gap idle)`).
- One 1 s timer plus `data.listen` bumps; all disposed in cleanup.

No network, no auth, no provider code. This plugin must work on a fresh machine
with no configuration.

Tests (Vitest, pure): `computeSessionTime` with empty messages, finished steps,
one open step, overlapping/skewed timestamps, duration clamping to total;
`formatDuration` and `formatClock` boundaries.

## 2. Session stats (`opencode-session-stats`)

Calls `client.experimental.session.stats({ from, to, timezone })` where `from` is
local midnight, `to` is `now`, timezone is
`Intl.DateTimeFormat().resolvedOptions().timeZone`. Reads `response.data.steps`
and accepts a bare response object as fallback. Refreshes every 10 s, guarded by
a busy flag; on error it keeps the last successful value and, if there never was
one, renders nothing.

Derived value: `{ total, perHour }` with `perHour = total / hoursSinceMidnight`.

UI:

- Sidebar (`append: "sidebar.content"`): `LLM today  N · M/h`.
- Composer top (`append: "session.composer.top"`): `LLM today N · M/h`.
- No panel and no command in `0.1.0`; the plugin is intentionally one line per
  surface.

No auth, no config. A server without the experimental endpoint is silently
supported.

Tests: response normalization (`{data}` vs bare, missing `steps`, zero), per-hour
calculation and rounding, midnight boundary with an injected `now`.

## 3. Usage plans (`opencode-usage-plans`)

### Provider contract

```ts
type QuotaWindow = {
  label: string        // "5h" | "Monthly"
  usedPct: number      // clamped 0..100, finite
  remainingPct: number // clamped 0..100
  resetLabel: string   // "3ч 12м" is gone; English: "in 3h 12m" or "1 Nov"
}

type ProviderState =
  | { phase: "hidden" }                                  // not configured
  | { phase: "detecting" }                               // probe in flight
  | { phase: "loading" }                                 // detected, fetch in flight
  | { phase: "ok"; windows: QuotaWindow[] }
  | { phase: "error"; message: string }

type Provider = {
  id: "kimi" | "alibaba"
  title: string
  detect(): Promise<boolean> // may spawn `bl --version`; never throws
  fetch(signal: AbortSignal): Promise<QuotaWindow[] | { error: string }>
}
```

Detection is asynchronous for every provider, so all start at `detecting` and
settle to `hidden`, `loading`, or `error`. The Kimi probe wraps the file read in
an async function to keep one contract. The `Usage` header is shown only when at
least one provider is in `loading`, `ok`, or `error`, so a machine with no
providers never sees it; during the brief detection window nothing is rendered.

Registry is an ordered array. `setup` builds provider states and starts detection;
detected providers immediately fetch. Refresh every 5 minutes, guarded per
provider, all timers aborted and cleared in cleanup.

### Options

```ts
type Options = {
  kimi?:    { enabled?: boolean }                       // default true
  alibaba?: { enabled?: boolean; blPath?: string; region?: string; site?: string }
}
```

Defaults: both enabled, `region: "ap-southeast-1"`, `site: "international"`.
`enabled: false` forces `hidden` even when credentials exist.

### Kimi adapter

- Detect: read the first readable of
  `$XDG_DATA_HOME/opencode/auth.json`, `~/.local/share/opencode/auth.json`,
  `~/.config/opencode/auth.json`; JSON object with a non-empty
  `kimi-code-plan-global.key`.
- Fetch: `GET https://api.kimi.ai/coding/v1/usages` with
  `Authorization: Bearer <key>`, 10 s timeout, no redirects needed.
- Parse: 5-hour window from `limits[].window.duration === 300`: its `detail`
  carries `limit`, `remaining`, `resetTime` and no `used` field, so used is
  derived as `limit - remaining`. Precedence: when
  `usages.limit_5h.used_ratio` is a finite number it wins (it is what Kimi's own
  UI shows); the derived value is the fallback. Reset comes from the detail
  `resetTime`, else `usages.limit_5h.reset_time`. Monthly window comes only from
  `usages.limit_month_total` (`used_ratio`, `reset_time`); `limit_month_code` is
  ignored in `0.1.0`. Percentages clamp to 0..100 and reject non-finite values.
  A window without a reset time is skipped.
- Errors: 401/403 → `"Kimi key rejected — sign in again"`; anything else →
  `"Kimi usage unavailable"`. The key never appears in state, DOM, or logs.
- Reading the auth file on every refresh is allowed (small file) so a re-login
  is picked up without restarting.

### Alibaba adapter

- Detect: `options.blPath` if it exists, otherwise resolve `bl` by running
  `bl --version` (async, 3 s timeout) and then checking the known locations
  `~/.npm-global/bin/bl`, `~/.local/bin/bl`, `/opt/homebrew/bin/bl`,
  `/usr/local/bin/bl`. Not found → `hidden`. No `/Users/alex/...` literal.
- Fetch: `bl usage token-plan --console-region <region> --console-site <site>
  --output json`, 20 s timeout, 1 MiB max buffer. Args are passed as an array
  (no shell).
- Parse: `per1MonthPercentage` is a 0..1 ratio → ×100; `per1MonthResetTime` is
  epoch ms → date label. A missing or non-numeric percentage is an error, not 0 %.
- Errors: binary present but not logged in or output unparsable → `"Alibaba usage
  unavailable — run bl login"`. stderr is not shown.

### Rendering

- Sidebar (`append: "sidebar.content"`) and nothing else in `0.1.0`.
- One bold `Usage` header, rendered only when at least one provider is in
  `loading`, `ok`, or `error` (i.e. detected). During the short `detecting`
  window nothing renders, so a machine with no providers never sees a header.
- Per provider: bold title, then each window as
  `5h      ████░░░░░░░░░░░░  23.4%` on a 16-cell bar coloured by used percent
  (>90 red, >50 yellow, else green), followed by a muted
  `23.4% left · resets in 3h 12m` (window > 24 h away → `resets 1 Nov`).
- `loading` → title plus muted `loading…`; `error` → title plus one muted line.
- Zero providers → the slot renders an empty box, no header, no placeholder.
- No secret, token, file path, or raw API error text is rendered.

Tests: Kimi response parsing (detail shape, ratio shape, both, missing reset,
invalid numbers, 0 %), Alibaba parsing (ratio, reset, invalid/missing), clamping,
reset-label formatting (relative and date), detection with a missing/unreadable
auth file, `enabled: false` hiding.

## Repository contents

```
~/Projects/opencode-tui-plugins/
  package.json            # private, workspaces, scripts
  tsconfig.json           # strict, noEmit, jsx preserve, @opentui/solid
  vitest.config.ts
  .gitignore              # node_modules, *.tgz, .DS_Store
  LICENSE                 # MIT
  README.md               # what the three do, install for all/some
  docs/superpowers/specs/2026-10-29-opencode-tui-plugins-design.md
  packages/
    session-clock/{package.json,README.md,src/{tui.tsx,time.ts,time.test.ts}}
    session-stats/{package.json,README.md,src/{tui.tsx,stats.ts,stats.test.ts}}
    usage-plans/{package.json,README.md,src/{tui.tsx,format.ts,providers/{types.ts,kimi.ts,alibaba.ts},*.test.ts}}
```

Each package README: what it shows, install snippet for `cli.json`, options
(usage only), requirements (Kimi login, `bl` + login), and a note that it needs
OpenCode 2.2+.

## Migration of the local setup

1. Create the repo and packages; copy `time.ts` and the clock parts of `tui.tsx`.
2. Put the Usage logic into `usage-plans` with the provider split; leave the old
   folder untouched until the new ones load.
3. Point `~/.config/opencode/cli.json` at the three package directories.
4. Verify, then remove the old `opencode-session-clock` folder (or keep a backup
   outside the plugins directory). The old package name `opencode-usage-alibaba`
   is retired, never published.
5. After npm login and publish, switch `cli.json` entries to published names and
   re-verify.

## Verification and acceptance

Automated and agent-run:

- `npm run check` passes: `tsc --noEmit` across all packages plus all Vitest
  suites.
- `npm pack --dry-run -w <pkg>` for each package lists `src`, `README.md`,
  `LICENSE`, `package.json` and nothing else.
- Launch the TUI with all three registered; the client log
  (`~/.local/share/opencode/log/opencode.log`, `role=cli`) shows no plugin load
  errors.
- Usage scenarios are forced by options and by temporarily renaming the auth
  file / `bl`; the agent checks the log and exported state, not pixels:
  - none configured → no Usage header;
  - Kimi only → only Kimi;
  - Alibaba only → only Alibaba;
  - both → both under one header;
  - invalid key / logged-out `bl` → one error line, no crash.
- Each package is independently importable and typechecks without its siblings;
  the clock alone is loaded in a clean config.
- Published `0.1.0` installs from the npm cache and loads.

User-run (the agent cannot see the screen or complete an interactive login):

- One visual pass over the sidebar and composer with all three plugins.
- `npm login` in a browser; then the agent runs `npm publish` for each package,
  switches `cli.json` to the published names, and re-checks the log.

## Delivery

1. `git init`, first commit in `~/Projects/opencode-tui-plugins`.
2. Create a public GitHub repo `Kovami/opencode-tui-plugins` with `gh` and push
   (the `repository` fields point there).
3. `npm login` (user), then `npm publish --access public` per package, in order:
   clock, stats, usage.
4. Tag each release as `<package>-v0.1.0` and push tags.

## Risks

- `experimental.session.stats` may change or disappear; the plugin hides itself.
- Plugin typings for `@opencode/plugin/tui` may lag the host; typecheck is
  against npm `2.2.1`, the installed client.
- The host's workspace/cache resolution of `@opencode/plugin` could differ from
  dev; the published packages are smoke-tested from the registry cache before
  being recommended.
- `bl` stdout is undocumented; the parser is strict about the percentage and
  mutes the rest.
- Two plugins appending to `sidebar.content` rely on plugin load order, which
  follows `cli.json`; README shows a recommended order (clock, stats, usage).
- npm names are free now but not reserved.

## Decisions left to the builder

- Bar width, spacing, and exact English wording (within the described shape).
- How to cache the resolved `bl` path in memory.
- Whether to share a tiny formatting helper file inside `usage-plans` or inline.