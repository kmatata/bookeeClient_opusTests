# bookeeClient_opusTests — developer reference

## What this is

A browser-side web client (Svelte 4 + Webpack 5) that consumes a live
arbitrage-opportunity feed from `bookee-backend` running at
`http://localhost:8000`.

The client:
1. Fetches a full SQLite snapshot of current opportunities (gzip over HTTP).
2. Deserializes it into an in-browser SQLite instance (sqlite-wasm / OPFS).
3. Stays current via a Server-Sent Events stream delivering row-level upserts and deletes.
4. Applies its own expiry logic every 5 seconds — tighter than the backend's thresholds.
5. Renders opportunities in a Svelte 4 UI with four bucket tabs, a status bar, and per-row leg detail.

There is **no separate API server** for the client — the backend Docker container
serves the built files at `/app/*` from the `dist/web/` directory.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 18 | build tooling |
| npm | ≥ 9 | package manager |
| Docker (running) | any | backend + ETL |
| sqlite3 CLI | any | snapshot inspection |

The backend must be running before any live tests. Confirm:

```bash
curl -s http://localhost:8000/health
# expected: {"ok":true,"last_run_id":N,"samples":N,...}
```

If the backend is not reachable, start the Docker stack in `bookeeBackend_opusTests` /
`bookeeETL_opusTests` first.

---

## Quick start

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Build all three targets (web, ext, telegram)
npm run build

# 3. Or build just the web target
npm run build:web

# 4. Rebuild on every save (web only — backend serves updated files instantly)
npm run watch
```

After `npm run build:web` (or `watch`), open:

```
http://localhost:8000/app/
```

Open **DevTools → Console** (set level to "Verbose" / "All") to see live logs.

---

## Directory structure

```
bookeeClient_opusTests/
├── webpack.config.js          re-exports all three platform configs as array
├── webpack/
│   ├── base.config.js         shared: svelte-loader, wasm rules, aliases
│   ├── web.config.js          → dist/web/   (OPFS VFS, served by backend)
│   ├── ext.config.js          → dist/ext/   (Firefox MV2, memory VFS)
│   └── telegram.config.js     → dist/telegram/
│
├── src/
│   ├── package.json           {"type":"module"} — ESM parsing for src/ files;
│   │                          root package.json stays commonjs so webpack
│   │                          configs can use require/module.exports
│   │
│   ├── db/
│   │   ├── init.js            createSQLiteAPI() singleton — loads sqlite-wasm
│   │   ├── schema.sql         DDL mirror of ETL schema (reference + ext use)
│   │   └── queries.js         liveArbs(db) — SELECT * JOIN legs ORDER BY margin
│   │
│   ├── sync/                  PLATFORM-AGNOSTIC — no Svelte, no DOM imports
│   │   ├── protocol.js        boot(), runExpiryCleanup(), applyUpsert(), applyDelete()
│   │   ├── storage.js         detectVFS(), openDB()
│   │   └── api.js             fetchMeta(), fetchSnapshot(), openStream()
│   │
│   ├── ui/                    Svelte 4 components (Phase D)
│   │   ├── theme.js           applyTheme() — light/dark via prefers-color-scheme
│   │   ├── BucketTabs.svelte  4 tabs (low/mid/high/moon) with badge counts
│   │   ├── StatusBar.svelte   connection dot, count, "Xs ago" rolling clock
│   │   ├── ArbRow.svelte      single opportunity card (header + legs + footer)
│   │   └── ArbTable.svelte    list of ArbRow + empty state
│   │
│   ├── web/
│   │   ├── App.svelte         root: boots all 4 buckets, reactive stores, tab state
│   │   ├── index.js           entry: mounts App into #app
│   │   └── index.html         <div id="app">, COOP/COEP headers from backend
│   │
│   ├── ext/                   (Phase E — Firefox MV2, stubs)
│   │   ├── background.js
│   │   ├── popup/popup.js
│   │   └── popup/popup.html
│   │
│   └── telegram/              (Phase F — stubs)
│       ├── index.js
│       └── index.html
│
└── dist/                      build output (git-ignored; may be root-owned by Docker)
    ├── web/                   bind-mounted into backend container → served at /app/*
    ├── ext/
    └── telegram/
```

---

## Build commands

| Command | Output | Use when |
|---------|--------|----------|
| `npm run build` | all three targets | before committing |
| `npm run build:web` | `dist/web/` only | web development |
| `npm run build:ext` | `dist/ext/` only | extension development |
| `npm run build:telegram` | `dist/telegram/` only | Telegram development |
| `npm run watch` | `dist/web/` on change | active web development |

`dist/web/` is bind-mounted inside the backend Docker container and served
under `/app/*`. No container restart needed — just rebuild and hard-refresh the browser.

### Expected build output

A successful `npm run build:web` ends with:

```
web (webpack 5.x.x) compiled with N warnings in Xs
```

Acceptable warnings (all benign, from third-party code):
- `Critical dependency: the request of a dependency is an expression` — sqlite-wasm internal worker URL, not actionable.
- `asset size limit ... sqlite3.wasm (844 KiB)` — wasm binary, expected size.

Any `ERROR` in the output means the build failed — do not proceed to browser testing.

---

## Webpack module aliases

Configured in `webpack/base.config.js`:

| Alias | Resolves to |
|-------|-------------|
| `@sync` | `src/sync/` |
| `@db` | `src/db/` |
| `@ui` | `src/ui/` |

Usage: `import { boot } from '@sync/protocol.js'`

---

## Full test procedure — phases A through D

Run each phase's checks in order. If an earlier phase fails, do not proceed to the next.

---

### Phase A — static serving

**Goal:** confirm the backend is serving the built HTML and all required static assets.

**Step 1 — build**

```bash
npm run build:web
```

Expect: `compiled with N warnings` (no errors).

**Step 2 — health check**

```bash
curl -s http://localhost:8000/health
```

Expected response (values will differ):
```json
{"ok": true, "last_run_id": 1128, "samples": 763}
```

If `"ok"` is `false` or the command hangs, the backend is not running.

**Step 3 — index.html is served**

```bash
curl -s http://localhost:8000/app/
```

Expected output: HTML containing `<div id="app">` and a `<script src="app.*.js">` tag.

**Step 4 — COOP/COEP headers**

```bash
curl -I http://localhost:8000/app/
```

The response **must** include both:
```
cross-origin-embedder-policy: require-corp
cross-origin-opener-policy: same-origin
```

If either header is missing, OPFS will not be available and sqlite-wasm
will fall back to the memory VFS (no persistence, fine for dev but not production).

**Step 5 — sqlite-wasm proxy asset**

```bash
curl -I http://localhost:8000/app/sqlite-wasm/sqlite3-opfs-async-proxy.js
```

Expected: `HTTP/1.1 200 OK`. If 404, the `CopyWebpackPlugin` in `webpack/web.config.js`
is not copying the sqlite-wasm dist directory correctly.

---

### Phase B — SQLite boot

**Goal:** confirm the in-browser SQLite engine initialises, downloads the snapshot,
and opens the SSE stream without errors.

**Step 1 — open the app in Chrome or Firefox**

Navigate to `http://localhost:8000/app/`. Open **DevTools → Console**. Set the log
level to **Verbose** (Chrome) or **All** (Firefox) so that `console.debug` lines appear.

**Step 2 — expected boot sequence in console**

You must see all four of these lines (values will differ):

```
[boot:low]  fetching snapshot (vfs=opfs)
[boot:low]  snapshot loaded — cursor=1128 pruned=0
[boot:low]  SSE stream open (cursor=1128)
[boot:mid]  fetching snapshot (vfs=opfs)
[boot:mid]  snapshot loaded — cursor=1128 pruned=0
[boot:mid]  SSE stream open (cursor=1128)
[boot:high] fetching snapshot (vfs=opfs)
[boot:high] snapshot loaded — cursor=1128 pruned=0
[boot:high] SSE stream open (cursor=1128)
[boot:moon] fetching snapshot (vfs=opfs)
[boot:moon] snapshot loaded — cursor=1128 pruned=0
[boot:moon] SSE stream open (cursor=1128)
```

All four buckets (low, mid, high, moon) boot in parallel. Order may vary.

**Step 3 — VFS check**

- `vfs=opfs` means SharedArrayBuffer is available and OPFS is in use. ✅
- `vfs=memory` means the page is missing COOP/COEP headers — re-confirm you
  opened `http://localhost:8000/app/` (not `file://`).

**Step 4 — snapshot integrity check (from terminal)**

```bash
curl -so /tmp/low.db --compressed http://localhost:8000/snapshot/low
file /tmp/low.db
```

Expected: `SQLite 3.x database, last written using SQLite version 3.x`

If it says `gzip compressed data`, the HTTP client is not decompressing. Use
`--compressed` flag as shown; the browser decompresses automatically.

```bash
sqlite3 /tmp/low.db \
  'SELECT COUNT(*) as total,
          COUNT(CASE WHEN source_type="live"     THEN 1 END) as live,
          COUNT(CASE WHEN source_type="upcoming" THEN 1 END) as upcoming
   FROM arb_opportunities;'
```

A result of `0|0|0` is valid — it means no arbs are above the `low` bucket threshold
at this moment. The ETL may not have found qualifying opportunities recently.

---

### Phase C — live SSE deltas

**Goal:** confirm that ETL-produced events are pushed to the browser and update
the in-browser SQLite state within 5 seconds.

**Step 1 — watch the SSE stream from the terminal**

```bash
curl -sN "http://localhost:8000/stream/low?cursor=0"
# leave running; Ctrl-C to stop
```

Each line looks like:
```
event: upsert
data: {"opportunity_id":42,"canonical_home":"Arsenal","canonical_away":"Chelsea",...}

event: delete
data: {"opportunity_id":42}
```

If nothing appears within 30 seconds, the ETL has no current arbitrage data for
the `low` bucket. Check:

```bash
curl -s http://localhost:8000/buckets
# {"low":0,"mid":0,"high":0,"moon":0} → ETL found no arbs right now; not an error
```

```bash
curl -s http://localhost:8000/health
# "samples" value should be increasing on each call if ETL is running
```

**Step 2 — confirm deltas appear in the browser console**

With the app open at `http://localhost:8000/app/` and DevTools Console visible,
each SSE event that arrives produces one of:

```
[sse:low] upsert #42 Arsenal v Chelsea (4.12%)
[sse:low] delete #42
```

Followed by the Svelte store updating and the UI re-rendering.

**Step 3 — confirm expiry cleanup runs**

Every 5 seconds the client runs `runExpiryCleanup()`. If rows are removed:

```
[expiry:low] pruned N row(s)
```

This line only appears when at least one row was actually deleted. Its absence
while the ETL is quiet is normal.

**Step 4 — verify staleness thresholds**

Client-side expiry rules (from `src/sync/protocol.js`):

| source_type | deleted after |
|-------------|---------------|
| `live` | `last_seen_at` > 10 s ago |
| `upcoming` | `last_seen_at` > 600 s ago |

`start_time` is NOT used for expiry. The ETL schema documents it as a static
fixture context field only (denormalized from the matcher for display). Once a
match kicks off, bookmakers stop quoting upcoming odds; the scanner stops
detecting the arb and `last_seen_at` goes stale naturally.

---

### Phase D — Svelte UI

**Goal:** confirm the full Svelte UI renders, bucket tabs switch feeds, the status
bar updates in real time, and opportunity cards display leg detail.

**Step 1 — build**

```bash
npm run build:web
```

Expect: `compiled with N warnings` (no errors).

**Step 2 — open the app**

Navigate to `http://localhost:8000/app/` in Chrome or Firefox.

**Step 3 — initial render**

What you should see immediately after page load:

- Four tabs across the top: **Low** (3–5%), **Mid** (5–8%), **High** (8–15%), **Moon** (≥15%).
- A status bar below the tabs showing a coloured dot, the active bucket name, a count, and "updated Xs ago".
- Either a list of opportunity cards OR the empty-state message:
  *"No arbitrage opportunities in low right now."*

If the page is blank (white screen), open DevTools → Console and look for
JavaScript errors. Common cause: webpack build did not complete without errors.

**Step 4 — status bar dot colours**

| Dot colour | Meaning |
|------------|---------|
| Amber/yellow | `connecting` — boot in progress |
| Green | `live` — snapshot loaded and SSE open |
| Red | `error` — boot failed (check console for stack trace) |

All four buckets boot simultaneously. The dot for the active tab turns green once
that bucket's SSE stream is open. Switch tabs to verify each bucket's dot.

**Step 5 — tab switching**

Click each tab. The list area updates to show arbs from that bucket only.
The status bar updates to show the count and last-update time for the selected bucket.
The active tab's underline accent colour changes: blue (low), purple (mid),
amber (high), red (moon).

**Step 6 — badge counts**

If a bucket has ≥1 arb, a small numbered badge appears in the top-right of that
tab button. Counts update every time the SSE stream delivers a delta.

**Step 7 — opportunity cards (when arbs are present)**

Each card shows:
- **Header row:** `Home Team v Away Team` on the left; `+X.XX%` profit margin on the right.
- **Meta row:** competition tag (if present), country tag (if present), source type tag (`live` or `upcoming`), kick-off date/time (EAT, `DD HH:MM` format).
- **Legs:** one row per leg — bookmaker name, outcome label, decimal odd `@X.XX`, stake amount. If `fetch_url` is present the stake is a hyperlink; clicking it opens the bookmaker page in a new tab.
- **Footer:** total stake, guaranteed return, guaranteed profit.

**Step 8 — live arbs update within 5 seconds**

Open DevTools → Console. Watch for:

```
[sse:low] upsert #N Home v Away (X.XX%)
```

Within one second of this log line appearing, the UI card list should update
(new card appears or existing card's values change). No manual refresh needed.

**Step 9 — dark mode**

Open your OS dark-mode setting. Reload the page. The background should switch to
dark (`--bg: #0f172a`) and text to light (`--text-primary: #f1f5f9`). This is
driven by `prefers-color-scheme` in `src/ui/theme.js`.

**Step 10 — all four buckets via terminal cross-check**

```bash
for b in low mid high moon; do
  echo -n "$b: "
  curl -so /tmp/${b}.db --compressed http://localhost:8000/snapshot/${b}
  sqlite3 /tmp/${b}.db 'SELECT COUNT(*) FROM arb_opportunities;'
done
```

The counts shown here represent what was in the snapshot at download time.
The browser may have pruned some rows since then via expiry cleanup.
A count of `0` for all buckets means the ETL currently finds no qualifying arbs —
this is normal during quiet market periods, not a bug.

---

## Backend API quick reference

All endpoints at `http://localhost:8000`.

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/health` | GET | `{ ok, samples, last_run_id, state_db_mtime }` |
| `/meta` | GET | bucket ranges, stale thresholds, heartbeat interval |
| `/buckets` | GET | `{ low: N, mid: N, high: N, moon: N }` current counts |
| `/metrics` | GET | EMA timing stats |
| `/snapshot/{bucket}` | GET | gzip SQLite file; response headers: `X-Cursor`, `X-Row-Count` |
| `/stream/{bucket}?cursor=N` | GET | SSE stream: `upsert`, `delete`, `snapshot_stale` events |
| `/app/*` | GET | static files from `dist/web/` with COOP/COEP headers |

Bucket profit-margin ranges:

| Bucket | bps range | % range |
|--------|-----------|---------|
| `low` | 200–499 | 2–5% |
| `mid` | 500–799 | 5–8% |
| `high` | 800–1499 | 8–15% |
| `moon` | ≥1500 | ≥15% |

One basis point = 0.01%. `profit_margin_bps=412` means a 4.12% guaranteed margin.

---

## Architecture rules (must not violate)

1. **Never hardcode `{ vfs: 'opfs' }`.**  Always call `detectVFS(sqlite3)` from
   `src/sync/storage.js`.  VFS by target: web → opfs, ext background → memory,
   telegram → opfs with memory fallback.

2. **`sync/` modules have zero Svelte and zero DOM imports.**  The Firefox MV2
   background page imports `sync/` directly; there is no Svelte runtime there.

3. **The local SQLite DB is the single source of truth.**  Svelte stores are
   reactive views over DB queries, not independent state.  Re-query after every
   delta; never manually merge SSE payloads into stores.

4. **Never query `arb_view` for display.**  The view uses backend staleness
   thresholds.  The client deletes rows on its own tighter schedule
   (10 s live / 600 s upcoming).  After `runExpiryCleanup()` has run, query
   `arb_opportunities JOIN arb_legs` directly — all remaining rows are
   displayable with no additional status filter.

5. **Timestamp contract — two formats coexist:**
   - `last_seen_at` → `YYYY-MM-DDTHH:MM:SS+03:00` (EAT with explicit UTC offset).
     SQLite's `unixepoch()` / `julianday()` honour the offset and convert to UTC
     automatically. Staleness arithmetic is in real seconds. This is the only
     field used for expiry decisions.
   - `start_time` → `YYYY-MM-DD HH:MM:SS` (EAT wall-clock, no offset suffix).
     Display-only. The ETL schema explicitly states it is NOT used for status
     computation — it was only used by the matcher for team-name verification.
     Do not use `start_time` in any expiry or staleness predicate.

6. **COOP/COEP headers are set by the backend on `/app/*`.**  Do not add them
   to any Webpack dev server config.

7. **Firefox MV2 only** (not MV3).  `manifest_version: 2`,
   `background.persistent: true`, `background.scripts` (not `service_worker`).
   Use `browser.runtime.*` (WebExtensions API), never `chrome.*`.

8. **No CSS frameworks** that conflict with Telegram's `themeParams` CSS variables.
   Use CSS custom properties everywhere; `src/ui/theme.js` sets them per platform.

---

## Troubleshooting

**`vfs=memory` when expecting `opfs`**
The page is missing COOP/COEP headers. Access via `http://localhost:8000/app/`
not `file://`. Verify with:
```bash
curl -I http://localhost:8000/app/
# must include cross-origin-embedder-policy and cross-origin-opener-policy
```

**`sqlite3_deserialize failed (rc=N)`**
The snapshot bytes are corrupted or truncated. Run:
```bash
curl -so /tmp/low.db --compressed http://localhost:8000/snapshot/low
file /tmp/low.db   # must say "SQLite 3.x database"
```
If it says `gzip compressed data`, the HTTP client is not decompressing the response.

**White screen / blank page after build**
Open DevTools → Console. If you see `Uncaught SyntaxError` or `Cannot find module`,
the build may have an error that was masked. Rerun `npm run build:web` and look for
`ERROR` lines in the output.

**No SSE events appearing in console**
```bash
curl -sN "http://localhost:8000/stream/low?cursor=0" | head -20
```
If nothing arrives within 30 s, the ETL has no qualifying arbs. Check:
```bash
curl -s http://localhost:8000/buckets
```

**All bucket counts are 0**
This is normal when the ETL's most recent scans found no arbitrage opportunities
above the minimum threshold (200 bps). It is not a bug. The UI displays the
empty-state message in this case.

**`dist/web/` permission errors during build**
The `dist/` tree may be root-owned if Docker wrote to it first. Fix with:
```bash
sudo chown -R $USER:$USER dist/
```

**Webpack `Critical dependency` warnings from sqlite-wasm**
Benign. sqlite-wasm creates workers with a dynamically-built URL that webpack
cannot statically analyse. Worker files are present in `dist/web/sqlite-wasm/`
via `CopyWebpackPlugin` and fetched at runtime via `locateFile` in `src/db/init.js`.

**Status bar dot stays amber (connecting) indefinitely**
Check the DevTools console for `[boot:X]` log lines. If `fetching snapshot` appears
but `snapshot loaded` does not, the snapshot download failed. Run:
```bash
curl -so /tmp/low.db --compressed http://localhost:8000/snapshot/low && file /tmp/low.db
```

**Extension background page not receiving SSE**
Background page console is separate from the browser DevTools console.
Open it via `about:debugging` → Inspect next to the extension name.
