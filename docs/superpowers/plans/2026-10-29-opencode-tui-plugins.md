# Three OpenCode TUI Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the local mixed plugin into three independently publishable OpenCode TUI plugins: clock, stats, usage plans.

**Architecture:** npm-workspaces monorepo at `~/Projects/opencode-tui-plugins`. Three packages with zero runtime imports between them; each exposes `./tui` and carries its own copy of ~40 lines of formatting helpers. The usage package owns a small provider-adapter contract with async detection and a state machine that hides unconfigured providers.

**Tech Stack:** TypeScript (strict, JSX via `@opentui/solid`), Solid signals, OpenCode 2.2.1 TUI plugin API (`@opencode/plugin/tui`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-opencode-tui-plugins-design.md`

## Global Constraints

- Package names/ids: `opencode-session-clock`/`session-clock`, `opencode-session-stats`/`session-stats`, `opencode-usage-plans`/`usage-plans`; version `0.1.0`; MIT; English UI.
- Every package: `"type":"module"`, `exports {"./tui":"./src/tui.tsx"}`, `files ["src","README.md","LICENSE"]`, `dependencies {"@opencode/plugin":"^2.2.1"}`, peers `@opentui/core >=0.6.6`, `@opentui/solid >=0.6.6`, `solid-js >=1.9.0`, Node `>=20`, `publishConfig {"access":"public"}`, no `private`.
- Slot render functions are synchronous and side-effect free; all I/O starts in `setup` and lands in signals.
- No absolute user-specific paths (`/Users/alex/...`), no hardcoded region outside option defaults, no secret/token/path/raw-error text in rendered output.
- All timers, listeners, slots, keymap layers, and AbortControllers are released by the returned cleanup.
- `npm run check` = `tsc --noEmit` + `vitest run`, and it must pass at the end of every task.

## Review Focus

1. `auth.json` missing, unreadable, invalid JSON, or not an object → Kimi is `hidden`; no crash, no header from Kimi alone.
2. `bl` absent from PATH and every known location → Alibaba is `hidden`; no "command not found" or path leaks; header suppressed when Kimi is also absent.
3. Kimi HTTP 401/403, network failure, timeout, or HTML error body → one muted error line; the bearer key never reaches state, DOM, or logs.
4. `cli.json` entry as a local package path (development) and as a published `pkg@0.1.0` name (release) both load the same `./tui` entry.
5. All percentages from either provider are finite and clamped 0..100, including `NaN`, `null`, strings, and values above 1 million.

---

### Task 1: Monorepo scaffold and clock time core

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `LICENSE`
- Create: `packages/session-clock/package.json`, `packages/session-clock/src/time.ts`, `packages/session-clock/src/time.test.ts`

**Interfaces:**
- Produces: `computeSessionTime(messages: readonly SessionMessage[], startedAt: number, now?: number): SessionTime`
- Produces: `formatDuration(ms: number, compact?: boolean): string`, `formatClock(ms: number): string`
- Produces: types `SessionMessage`, `AgentStep`, `SessionTime`

- [ ] **Step 1: Scaffold the workspace**

Root `package.json`: private, `"workspaces": ["packages/*"]`, engines Node >=20, scripts `check`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`). Install dev deps with npm (let it record resolved versions): `typescript`, `vitest`, `@types/node`, `@opencode/plugin@2.2.1`, `@opentui/core`, `@opentui/solid`, `solid-js`.

`tsconfig.json`: `target ES2022`, `module ESNext`, `moduleResolution bundler`, `lib ["ES2022","DOM"]`, `jsx preserve`, `jsxImportSource "@opentui/solid"`, `strict`, `noEmit`, `skipLibCheck`, `types ["node"]`; include `packages/*/src/**/*.ts` and `.tsx`.

`vitest.config.ts`: node environment, include `packages/*/src/**/*.test.ts`.

`.gitignore`: `node_modules`, `*.tgz`, `.DS_Store`, `dist`.

`LICENSE`: MIT, copyright 2026 Kovami.

- [ ] **Step 2: Write the failing clock tests**

`packages/session-clock/src/time.test.ts` pins: empty messages → zeros; two finished steps `[1000,2000]`, `[3000,5000]` with start 1000, now 6000 → active 3000, idle 2000, two steps with gap 1000; open last step 1000 → now 4000 → active 3000; message created before session start clamps active to total; `formatDuration` at 0, 59s, 60s, 3661s, compact 60s and 3661s; `formatClock(new Date(2020,0,2,3,4,5).getTime()) === "03:04:05"`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/session-clock/src/time.test.ts`
Expected: FAIL, cannot resolve `./time`.

- [ ] **Step 4: Implement `time.ts`**

Port the existing algorithm: active time is the sum of assistant-message durations, the last assistant message without `completed` runs to `now`, gaps are idle, total is wall clock from session start (or first message), and active is clamped to total.

- [ ] **Step 5: Add package metadata and run the full check**

`packages/session-clock/package.json` follows the package contract, description "Session time accounting for OpenCode", keywords `opencode`, `plugin`, `tui`, `session`, `clock`, repository directory `packages/session-clock`, plus a copy of `LICENSE`.

Run: `npm run check`
Expected: typecheck clean, all clock tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore LICENSE packages/session-clock
git commit -m "feat(clock): scaffold monorepo and session time core"
```

---

### Task 2: Clock TUI surfaces

**Files:**
- Create: `packages/session-clock/src/tui.tsx`, `packages/session-clock/README.md`

**Interfaces:**
- Consumes: `computeSessionTime`, `formatDuration`, `formatClock`, `SessionMessage` from `./time`.
- Produces: plugin id `session-clock`; panel `session-clock.timeline`; slash command `time`.

- [ ] **Step 1: Implement the plugin**

`Plugin.define({ id: "session-clock", setup(context) { ... } })` with:

- a 1 s `setInterval` plus `context.data.listen` bumping a tick signal;
- a `history` signal and per-session paginated loader (200 per page, max 100 pages) reading `context.client.message.list`, merged with `context.data.session.message.list` by message id; reload when cache and live window no longer overlap, at most once per 10 s;
- `sidebar.content` prepend: bold `Session time`, `Agent`, `Idle`, `Total`;
- `session.composer.top` prepend: one muted `Agent … · Idle … · Total …`;
- `session.panel` append for `session-clock.timeline`: totals, percent agent work, last 12 steps as `HH:MM:SS  duration  (+gap idle)`;
- `context.keymap.layer` with command `session-clock.timeline`, slash `time`, guarded in try/catch;
- cleanup clearing the timer, the listener, and every slot disposer.

No network, no auth, no provider code.

- [ ] **Step 2: Write the README**

What it shows, install snippet (`{"plugins":["opencode-session-clock@0.1.0"]}`), requirement OpenCode 2.2+, note that it needs no configuration.

- [ ] **Step 3: Verify**

Run: `npm run check`.
Expected: clean. Then confirm the package alone declares no imports outside `./time`, `solid-js`, `@opentui/core`, `@opencode/plugin/tui`: `grep -R "^import" packages/session-clock/src`.

- [ ] **Step 4: Commit**

```bash
git add packages/session-clock
git commit -m "feat(clock): add sidebar, composer, and timeline panel"
```

---

### Task 3: Stats core

**Files:**
- Create: `packages/session-stats/package.json`, `packages/session-stats/src/stats.ts`, `packages/session-stats/src/stats.test.ts`

**Interfaces:**
- Produces: `type RequestStats = { total: number; perHour: number }`
- Produces: `dayStart(now: number): number`, `readSteps(response: unknown): number`, `computeStats(steps: number, now: number): RequestStats`

- [ ] **Step 1: Write the failing tests**

Pin: `readSteps({data:{steps:12}})` and `readSteps({steps:12})` → 12; `readSteps({})`, `readSteps(null)`, `readSteps({data:{steps:"12"}})` → 0; `computeStats(120, local noon)` → `{total:120, perHour:10}`; `computeStats(5, dayStart)` → `perHour: 0`; negative or non-finite steps → 0.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/session-stats/src/stats.test.ts`
Expected: FAIL, cannot resolve `./stats`.

- [ ] **Step 3: Implement `stats.ts`**

`dayStart` uses local `setHours(0,0,0,0)`; `computeStats` divides by hours elapsed since midnight and returns 0 when that is ≤ 0; `readSteps` accepts both envelopes and returns 0 for anything non-finite.

- [ ] **Step 4: Add package metadata, run check**

`packages/session-stats/package.json` per contract, description "Today's LLM request count for OpenCode", repository directory `packages/session-stats`, copy of `LICENSE`.

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/session-stats
git commit -m "feat(stats): add request stats core"
```

---

### Task 4: Stats TUI surfaces

**Files:**
- Create: `packages/session-stats/src/tui.tsx`, `packages/session-stats/README.md`

**Interfaces:**
- Consumes: `dayStart`, `readSteps`, `computeStats`, `RequestStats` from `./stats`.
- Produces: plugin id `session-stats`.

- [ ] **Step 1: Implement the plugin**

On setup: busy-flag-guarded `refresh()` calling `context.client.experimental.session.stats({ from: dayStart(Date.now()), to: Date.now(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })`, `readSteps` on the response, `computeStats`, signal update, `setInterval` every 10 s, silent catch that keeps the last value; a `data.listen` bump is not needed because only the timer changes the value.

Render: `sidebar.content` append `LLM today  N · M/h`; `session.composer.top` append `LLM today  N · M/h`; nothing when the signal is null. Cleanup clears the timer and both slots.

- [ ] **Step 2: Write the README**

What it shows, install snippet, note that older servers without the experimental endpoint simply show nothing.

- [ ] **Step 3: Verify**

Run: `npm run check`.
Expected: clean; `grep -R "^import" packages/session-stats/src` shows only `./stats`, `solid-js`, `@opencode/plugin/tui`.

- [ ] **Step 4: Commit**

```bash
git add packages/session-stats
git commit -m "feat(stats): show today's LLM requests in sidebar and composer"
```

---

### Task 5: Usage shared types and formatting

**Files:**
- Create: `packages/usage-plans/package.json`, `packages/usage-plans/src/providers/types.ts`, `packages/usage-plans/src/format.ts`, `packages/usage-plans/src/format.test.ts`

**Interfaces:**
- Produces: `type QuotaWindow = { label: string; usedPct: number; remainingPct: number; resetLabel: string }`
- Produces: `type ProviderState = {phase:"hidden"} | {phase:"detecting"} | {phase:"loading"} | {phase:"ok";windows:QuotaWindow[]} | {phase:"error";message:string}`
- Produces: `type Provider = { id: string; title: string; detect(): Promise<boolean>; fetch(signal: AbortSignal): Promise<QuotaWindow[] | {error:string}> }`
- Produces: `clampPct(value: number): number`, `quotaBar(usedPct: number, width?: number): string`, `quotaColor(usedPct: number): string`, `formatReset(at: number, now?: number): string`, `windowLabel(usedPct: number): string`

- [ ] **Step 1: Write the failing formatting tests**

Pin: `clampPct(NaN)`, `clampPct(Infinity)`, `clampPct(-5)`, `clampPct(150)` → 0, 0, 0, 100; `quotaBar(50)` has 8 filled and 8 empty cells; `quotaBar(0)` all empty; `quotaBar(100)` all filled; `quotaColor(91)` red, `quotaColor(51)` yellow, `quotaColor(50)` green, `quotaColor(undefined as unknown as number)` grey; `formatReset(now + 3h12m, now) === "in 3h 12m"`, `formatReset(now + 45m, now) === "in 45m"`, `formatReset(now - 1, now) === "now"`, `formatReset(new Date(2026,10,1,12).getTime(), now) === "1 Nov"` when more than 24 h away; `windowLabel(23.44) === "23.4%"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/usage-plans/src/format.test.ts`
Expected: FAIL, cannot resolve `./format`.

- [ ] **Step 3: Implement types and formatting**

Bar is 16 cells, filled = `Math.round(used/100*width)`, colors `#ef4444` (>90), `#eab308` (>50), `#22c55e` otherwise, `#8b949e` for non-finite. Reset label: "now" when past, "in {h}h {m}m" under 24 h (drop the hours part when 0), else `d Mon` with English short months. `remainingPct` is always `clampPct(100 - usedPct)`.

- [ ] **Step 4: Package metadata and check**

`packages/usage-plans/package.json` per contract, description "Subscription usage windows for OpenCode", repository directory `packages/usage-plans`, copy of `LICENSE`.

Run: `npm run check`.

- [ ] **Step 5: Commit**

```bash
git add packages/usage-plans
git commit -m "feat(usage): add provider types and quota formatting"
```

---

### Task 6: Kimi adapter

**Files:**
- Create: `packages/usage-plans/src/providers/kimi.ts`, `packages/usage-plans/src/providers/kimi.test.ts`

**Interfaces:**
- Produces: `type KimiCredentials = { key: string }`
- Produces: `detectKimi(dataHome?: string, home?: string): Promise<KimiCredentials | undefined>`
- Produces: `parseKimi(payload: unknown, now?: number): QuotaWindow[]`
- Produces: `fetchKimi(credentials: KimiCredentials, signal: AbortSignal, now?: number): Promise<QuotaWindow[] | { error: string }>`

- [ ] **Step 1: Write the failing tests**

Fixtures: detail-only (`limit "100"`, `remaining "70"`, resetTime) → 30 % 5h; ratio-only (`limit_5h.used_ratio 0.25`) → 25 %; both (`remaining 70`, `used_ratio 0.25`) → 25 % (ratio wins); monthly (`limit_month_total {used_ratio:0.4, reset_time}`) → 40 % with label `Monthly`; `limit_month_code` present → ignored; missing reset on 5h → that window skipped; `used_ratio: null` falls back to derived; non-finite/negative/150 → clamped 0..100; `parseKimi(null)`, `{}` → `[]`. Detection: auth file with `kimi-code-plan-global.key` → key; missing file, invalid JSON, array, empty key → `undefined` (use a temp dir; do not touch the real home).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/usage-plans/src/providers/kimi.test.ts`
Expected: FAIL, cannot resolve `./kimi`.

- [ ] **Step 3: Implement detection, parsing, fetch**

Read the first readable auth file among `$XDG_DATA_HOME/opencode/auth.json`, `~/.local/share/opencode/auth.json`, `~/.config/opencode/auth.json`; accept only a non-empty string key. `parseKimi` follows the precedence in the spec and skips windows without a reset. `fetchKimi` calls `GET https://api.kimi.ai/coding/v1/usages` with the bearer header and `AbortSignal.timeout(10_000)` combined with the caller signal; 401/403 → `{error:"Kimi key rejected — sign in again"}`; other failures → `{error:"Kimi usage unavailable"}`; no key in messages.

- [ ] **Step 4: Verify and commit**

Run: `npm run check`.
Expected: clean.

```bash
git add packages/usage-plans/src/providers/kimi.ts packages/usage-plans/src/providers/kimi.test.ts
git commit -m "feat(usage): add Kimi Code adapter"
```

---

### Task 7: Alibaba adapter

**Files:**
- Create: `packages/usage-plans/src/providers/alibaba.ts`, `packages/usage-plans/src/providers/alibaba.test.ts`

**Interfaces:**
- Produces: `type AlibabaOptions = { enabled?: boolean; blPath?: string; region?: string; site?: string }`
- Produces: `parseAlibaba(payload: unknown, now?: number): QuotaWindow[]`
- Produces: `resolveBl(options: AlibabaOptions, home?: string): Promise<string | undefined>`
- Produces: `fetchAlibaba(blPath: string, options: AlibabaOptions, signal: AbortSignal, now?: number): Promise<QuotaWindow[] | { error: string }>`

- [ ] **Step 1: Write the failing tests**

Pin: `parseAlibaba({per1MonthPercentage:0.42,per1MonthResetTime:t})` → one `Monthly` window at 42 %; percentage `0` → 0 % (not an error); missing/`"0.4"`/`null`/`NaN` percentage → `[]`; reset missing → window with empty reset label is skipped; 1.5 and -0.2 clamp to 100 and 0. `resolveBl`: explicit existing path wins without spawning; missing explicit path falls through to the known-path list; an injected `home` with no `bl` → `undefined` (test with a temp home, never spawn a real binary).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/usage-plans/src/providers/alibaba.test.ts`
Expected: FAIL, cannot resolve `./alibaba`.

- [ ] **Step 3: Implement**

`resolveBl`: if `options.blPath` exists, return it; otherwise `execFile("bl", ["--version"], {timeout:3000})`, and on success return `"bl"`; otherwise check `~/.npm-global/bin/bl`, `~/.local/bin/bl`, `/opt/homebrew/bin/bl`, `/usr/local/bin/bl` with `existsSync`. `fetchAlibaba` runs the array args in the spec with a 20 s timeout and 1 MiB buffer, aborts via the caller signal, parses JSON, maps failures to `{error:"Alibaba usage unavailable — run bl login"}`. stderr and the path never appear in the message.

- [ ] **Step 4: Verify and commit**

Run: `npm run check`.

```bash
git add packages/usage-plans/src/providers/alibaba.ts packages/usage-plans/src/providers/alibaba.test.ts
git commit -m "feat(usage): add Alibaba Token Plan adapter"
```

---

### Task 8: Usage plugin render and state machine

**Files:**
- Create: `packages/usage-plans/src/tui.tsx`, `packages/usage-plans/README.md`

**Interfaces:**
- Consumes: every type from `providers/types.ts`, `detectKimi`, `fetchKimi`, `resolveBl`, `fetchAlibaba`, formatting helpers.
- Produces: plugin id `usage-plans`; options `{kimi?:{enabled?:boolean}; alibaba?:{enabled?:boolean;blPath?:string;region?:string;site?:string}}`.

- [ ] **Step 1: Implement the state machine**

Initialize every enabled provider at `detecting`, disabled at `hidden`. Detection runs asynchronously; on success set `loading` and fetch immediately; on failure set `hidden`. Refresh every 5 minutes re-detects then fetches, so a fresh login is picked up without a restart. One `AbortController` per fetch, all aborted in cleanup; a busy guard per provider. Defaults: both enabled, region `ap-southeast-1`, site `international`.

- [ ] **Step 2: Implement rendering**

`sidebar.content` append only. Header shown only if some state is `loading`, `ok`, or `error`; nothing at all for `detecting`/`hidden`. Per provider: bold title, `loading…` while loading, the muted message on error, otherwise each window as a 16-cell colored bar plus `used%` and a muted `{remaining}% left · resets {label}` line. Threat model for the render: no key, path, or raw error.

- [ ] **Step 3: Write the README**

What it shows, install snippet, full options table with defaults, requirements (Kimi login via OpenCode, `bl` + `bl login`), and the note that a provider without credentials is simply not shown; recommended `cli.json` order clock, stats, usage.

- [ ] **Step 4: Verify**

Run: `npm run check`.
Expected: clean. `grep -R "/Users/" packages` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/usage-plans
git commit -m "feat(usage): render detected providers under one Usage header"
```

---

### Task 9: Migration, smoke test, and release prep

**Files:**
- Create: `README.md`
- Modify: `~/.config/opencode/cli.json`

- [ ] **Step 1: Write the root README**

What the three plugins do, a table with install names and one-line descriptions, install examples for all and for one, local-development path form, recommended order, license.

- [ ] **Step 2: Point the local config at the three packages**

In `~/.config/opencode/cli.json`, replace the `opencode-session-clock` folder entry with the three package directories (keep `opencode-visual-cache@latest` and every other setting).

- [ ] **Step 3: Smoke-test plugin loading**

Start the TUI briefly (background, then stop) and inspect `~/.local/share/opencode/log/opencode.log`, filtering `role=cli` for `plugin`, `error`, and the three ids. Expected: no load/compile errors. If a TUI launch is impossible in this environment, report that and rely on the user's visual pass.

- [ ] **Step 4: Verify each package alone and the tarball contents**

Run: `npm pack --dry-run -w packages/session-clock`, then the other two.
Expected: exactly `package.json`, `README.md`, `LICENSE`, and `src/**`.

Run: `npm run check`. Expected: clean.

- [ ] **Step 5: Retire the old plugin folder**

Only after step 3 shows clean loading, move `~/.config/opencode/plugins/opencode-session-clock` to `~/.config/opencode/plugins-backup/opencode-session-clock-<date>` (never delete without a backup). Confirm `cli.json` has no reference to it.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add repository overview and install guide"
```

---

### Task 10: Publish and verify

**Files:**
- Modify: per-package `repository`/version if publishing reveals a mismatch.

- [ ] **Step 1: Create the public GitHub repo**

`gh repo create Kovami/opencode-tui-plugins --public --source . --remote origin --push`, then confirm `git remote -v` and the branch is pushed.

- [ ] **Step 2: Confirm npm session and name ownership**

Run: `npm whoami` and `npm view opencode-session-clock version` (expect 404 for all three). If not logged in, stop and ask the user to run `npm login`.

- [ ] **Step 3: Publish in order and tag**

`npm publish -w packages/session-clock --access public`, then stats, then usage. Tag `session-clock-v0.1.0`, `session-stats-v0.1.0`, `usage-plans-v0.1.0`; push tags.

- [ ] **Step 4: Verify install from the registry cache**

Temporarily switch `cli.json` to the published `@0.1.0` names, restart/inspect the client log for load errors, then leave the published names in place. Report the log evidence.

---

## Self-Review

- Spec coverage: clock (Tasks 1–2), stats (3–4), usage contract/options/rendering (5–8), repo contents (1–9), migration (9), publishing (10), verification (9–10).
- Type consistency: `QuotaWindow`/`ProviderState`/`Provider` are defined once in Task 5 and consumed unchanged in Tasks 6–8; `RequestStats` is defined in Task 3 and consumed in Task 4.
- Review Focus tests live in Tasks 5–7 (finite clamping, invalid payloads, detection with temp homes); items 4–5 are verified by Tasks 9–10 (path vs published load, zero-provider header via options).