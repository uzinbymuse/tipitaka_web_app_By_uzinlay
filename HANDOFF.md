# HANDOFF — Tipitaka web app on Vercel + Turso

> **Purpose:** a complete handoff for another Muse agent taking over this
> project. Read this file + `SELFHOST.md` first, then verify the live site
> yourself before changing anything. **Never trust a previous agent's
> "verified" claim — re-check live.**
>
> Language: Burmese (user's working language). Technical terms in English.
> Last updated: 2026-11-11 ~15:44 +0630. Status: **LIVE and verified.**

---

## 1. Project in one paragraph

The user's Pali Tipitaka + Myanmar web reader (Flask app, v7.78) was
rebuilt to run **free, with no server**: the 4 SQLite databases live on
**Turso** (dedicated account), the Flask app runs on **Vercel** serverless.
The original VPS site (`https://tipi.upanna.top/`) still exists and is
separate — this Vercel site is the free rebuild, not a replacement.

- **Live site:** https://tipitaka-web-three.vercel.app
  (`tipitaka-web.vercel.app` was taken, so Vercel added `-three`.)
- **Repo (fork):** https://github.com/uzinbymuse/tipitaka_web_app_By_uzinlay
  (public fork of `uzinlay85/tipitaka_web_app_By_uzinlay`, main branch)
- **Upstream original:** https://github.com/uzinlay85/tipitaka_web_app_By_uzinlay
- **Vercel project:** `tipitaka-web`, account **"Zin Ko's projects"** (Hobby),
  Git-connected — pushing to `main` auto-deploys to Production.
- **Self-host guide:** `SELFHOST.md` in this repo (full setup + keep-alive methods).

## 2. Architecture

| Piece | Detail |
|---|---|
| App | Flask 3, `app.py` (~2,700 lines, v7.78). Serves `/`, `/api/*`, static + templates. |
| Turso adapter | `db_turso.py` (libsql 0.1.11). Dual mode: Turso when `TURSO_*` env vars are set, local SQLite files otherwise. |
| Vercel entry | `api/index.py` — only `from app import app` (+ sys.path fix). **Keep `app` as the Flask instance itself.** |
| `vercel.json` | `{"functions": {"api/index.py": {"maxDuration": 60}}}` — **NO `rewrites` (see §5, critical).** |
| Python | 3.12 (`.python-version`). `requirements.txt`: flask, python-docx, libsql==0.1.11. |

## 3. Turso — 4 databases (dedicated account, do NOT mix)

- **Account/org: `tipidatamuse`** — a separate Tipitaka-only Turso account.
  **Never mix with the user's other Turso account `zinko2026`**
  (which holds outline-hub + linkhouse DBs).
- Location: `aws-ap-south-1`. URLs look like
  `libsql://tipitaka-<name>-tipidatamuse.aws-ap-south-1.turso.io`.
- Tokens: **read-only** for pali/mm/nissaya, **read-write** for sync.
  Tokens live ONLY in Vercel env vars + the Turso CLI auth on the VM.
  **Never print, record, or commit a token.**

| DB | Turso name | Contents (verified 2026-11-11) | Env vars |
|---|---|---|---|
| Pali | `tipitaka-pali` | 192 books, 59,008 pages, 923,695 wordlist rows | `TURSO_PALI_URL` / `TURSO_PALI_TOKEN` |
| Myanmar | `tipitaka-mm` | 60 books, 23,390 pages (`mm_pages` table) | `TURSO_MM_URL` / `TURSO_MM_TOKEN` |
| Nissaya | `tipitaka-nissaya` | 39,093 glosses, 114 book_ids | `TURSO_NISSAYA_URL` / `TURSO_NISSAYA_TOKEN` |
| Sync | `tipitaka-sync` | 1 account, 9 devices, 49 annotations, 1,374 history | `TURSO_SYNC_URL` / `TURSO_SYNC_TOKEN` |

- **Free-tier rule: a DB archives after 10 days with no queries.**
  Keep-alive is mandatory — see §6.
- **Pali empty-create bug (2026-11-11):** the first `turso db create
  tipitaka-pali --from-file` created an EMPTY DB (0 tables, "Creating
  database" took 823 ms). mm/nissaya/sync creates worked. Fix was
  destroy + re-create (import 8m). **Never trust a `--from-file`
  create's exit code — always verify tables + row counts after.**

## 4. What was done (2026-11-11)

1. Forked `uzinlay85/tipitaka_web_app_By_uzinlay` → `uzinbymuse/...`
   (commit `c441eee` base). Per-repo author
   `zin muse <clip-sector-arena@duck.com>` (see §7).
2. Code swap (commit `fc55316`): `db_turso.py`, `app.py` dual mode,
   `api/index.py`, `vercel.json`, `requirements.txt`, `.python-version`.
   Smoke-tested 7/7 local mode + 7/7 Turso mode (script:
   `~/workspace/tipitaka-smoke/smoke.py` — in-process test client).
3. `SELFHOST.md` (commit `81cf6dc`): free self-host guide in Burmese.
4. All 4 DBs uploaded to Turso + verified by row counts (see §3).
5. Vercel project `tipitaka-web` created; all 8 env vars set; first deploy
   hit a Vercel **identity verification** (6-digit code to
   `clip-sector-arena@duck.com`) — the user reads the code from his inbox
   and sends it; the code expires in minutes, so it must be entered promptly.
6. Deploy went Ready but **all routes returned Flask 404** — diagnosed
   and fixed (see §5, the most important lesson).
7. Live verification **10/10 PASS** (2026-11-11 ~15:06): health,
   books 192, book, page, nissaya available, pali search, mm books 60,
   mm phrase search "ဘုရား" total **12,513**, stats, homepage (137 KB).
8. Keep-alive cron set up (VM, every 72h, test run succeeded) + UptimeRobot
   monitor added by the user (homepage only — does NOT touch the DBs).
9. Keep-alive methods documented in `SELFHOST.md` (commit `2cb13a0`).

## 5. The 404 lesson — READ THIS BEFORE TOUCHING `vercel.json`

**Vercel now routes rewritten requests by the REWRITTEN destination
path** (the runtime itself logs this warning: *"Internal rewrites in
backend framework projects now route requests using the rewritten
destination path"*). So a `vercel.json` rewrite like
`{"source": "/(.*)", "destination": "/api/index"}` forces Flask to see
`PATH_INFO=/api/index` for EVERY request → no route matches → **all
routes 404** (proven by Vercel runtime logs: Flask received
`GET /api/index` for `/`, `/api/health`, `/favicon.ico` alike).
The `/api/index.py` destination does the same (`GET /api/index.py`).

**Fix = REMOVE the rewrite entirely.** With no rewrite, Vercel's
Flask-framework routing passes the ORIGINAL path to the app and all
routes work. **Never add a rewrite back** — not to `/api/index`, not to
`/api/index.py`, not for any path. If a future Vercel change breaks
routing again, check the runtime logs for what path Flask actually
receives before changing anything.

Two more facts from the diagnosis:
- Both debug wrappers tried in `api/index.py` were **bypassed by the
  runtime** (a plain-function `app` replacement, and an `app.wsgi_app`
  middleware) — Flask handled requests directly in both cases. The
  runtime serves the Flask app itself; do not assume a wrapper in
  `api/index.py` runs. Keep `api/index.py` minimal (`from app import app`).
- The runtime log line to look for is the Werkzeug access log, e.g.
  `127.0.0.1 - - [11/Nov/2026 08:34:12] "GET /api/index HTTP/1.1" 404 -`
  — the path inside the quotes is what Flask actually received.

## 6. Keep-alive (Turso 10-day archive rule)

**Current method (in use):** a scheduled job `tipitaka-turso-keep-alive`
runs every **72 hours** on the agent VM, pinging all 4 DBs with the Turso
CLI (`turso db shell <name> "SELECT 1;"`). Silent when all 4 respond;
alerts the user (in the "Tipitaka Vercel + Turso" side chat, in Burmese)
if any DB fails. First scheduled run: Nov 14, 2026 ~15:13 +0630.
Manual test run Nov 11 15:14 SUCCEEDED.

**Do NOT switch methods without the user's say-so.** The user declined
switching to Vercel Cron on 2026-11-11 ("for now, keep using what you
set up"). The Vercel Cron method is fully documented in `SELFHOST.md`
§5 Method B (needs a `/api/keep-alive` endpoint + a `crons` entry in
`vercel.json`; Hobby allows once per day, UTC, fires within the hour) —
implement it only if the user asks.

Other documented methods (see `SELFHOST.md` §5 for details):
- **UptimeRobot (user-set):** monitor on the homepage only — watches
  uptime but does NOT touch the DBs (homepage renders HTML only,
  `/api/health` returns `{"ok":true}` without a DB query). It CAN touch
  3 of 4 DBs via `/api/books` (Pali), `/api/mm/books` (MM),
  `/api/nissaya/available/<book_id>` (Nissaya) — but NOT Sync (sync
  endpoints are POST-only; `/api/bookmarks` + `/api/recent` are retired, 410).
- **GitHub Actions:** possible, but GitHub auto-disables scheduled
  workflows after 60 days of repo inactivity, and it needs Turso tokens
  as secrets.

## 7. Standing rules (user-set, do not re-decide)

- **Vercel updates in place ONLY** — never delete + redrop a project
  (it can change the domain suffix). Update via git push (this project
  is Git-connected) or the Overview-page drop.
- **Commits to `uzinbymuse` repos MUST be authored**
  `zin muse <clip-sector-arena@duck.com>` — Vercel Hobby blocks deploys
  from other authors on private repos. Set per-repo, never globally.
- **Push method for uzinbymuse repos:** the `gh` credential helper
  FAILS with "Repository not found" — push with the token embedded in
  the URL for that one command only, never store it in `.git/config`:
  `TOKEN=$(gh auth token) && git -c credential.helper= push "https://x-access-token:${TOKEN}@github.com/<owner>/<repo>.git" main; unset TOKEN`
- **Never expose secrets:** no Turso tokens, no PATs, no OTPs, no
  `STATS_TOKEN`, no passwords — not in chat, files, logs, or the repo.
- **Do NOT confuse the two VPSs:** the Tipitaka live server is RackNerd
  `172.245.210.149:2213` (`/opt/tipitaka`, user `zinko`); the VPN/Amnezia
  VPS is `192.238.244.231`. They are different machines.
- **The original VPS site (`tipi.upanna.top`) is separate** — this Vercel
  project does not change it, and its repo (`uzinlay85/...`) uses a
  repo-scoped PAT in the remote URL (plain `git push`, never ask for it).
- **User's phone is ground truth** for the live site. A desktop/browser
  pass is not a phone pass. If he says a feature doesn't show, re-check
  the exact mode/page he saw.

## 8. Known caveats (verified, not bugs)

- **Myanmar phrase search is slow (~8 s):** full `LIKE` scan over
  23,390 `mm_pages` rows on remote Turso. Transient timeouts on cold
  start are possible (first call after idle can exceed 60 s); retry
  usually succeeds in ~8 s. A fix would be an FTS index or a
  narrower scan — not yet attempted.
- **`pali_word` search total=0 for "dhamma"/"buddha" is EXPECTED**
  (exact-form wordlist; the same query returns 0 against the local
  SQLite files too). Do not "fix" it.
- **`/api/stats` is cached 1 hour** (counts only change on DB rebuild).
- **`/api/export` (docx)** is under Vercel's 4.5 MB response cap —
  exporting a whole large book can exceed it.
- **PRAGMA `foreign_keys` is skipped on Turso**, so `ON DELETE CASCADE`
  won't fire there (orphan rows only if an account is deleted).
- **`executescript` over Hrana (libsql remote) is unproven** — the sync
  schema init uses it; it worked in practice, but treat it as a risk.

## 9. Pending / next steps

- [x] **Add the site to the My Sites hub** (`https://alllinksbyzinmuse.vercel.app`)
  — DONE 2026-11-11: new card "Tipitaka Pali Reader (Vercel)" added to the hub
  (commit `1317510` in `uzinbymuse/alllinksbyzinmuse`, index.html), verified live:
  21 cards, footer updated. The old VPS card (tipi.upanna.top) stays as-is.
- [ ] **User's phone check** of https://tipitaka-web-three.vercel.app
  (he has not confirmed it on his phone yet).
- [ ] Keep-alive: first scheduled run Nov 14, 2026 — confirm it fires
  and stays silent; if a DB ever fails, alert the user (Burmese) in the
  Tipitaka Vercel + Turso side chat.
- [ ] Optional, only if the user asks: switch keep-alive to Vercel Cron
  (see §6 + `SELFHOST.md` §5 Method B); switch the mm phrase search to
  an FTS index for speed.
- [ ] Do NOT re-pitch anything the user already declined (PWA, PDF
  export, custom domains for courses, Vercel Cron switch for now).

## 10. How to verify the live site (run these, don't trust memory)

```bash
BASE=https://tipitaka-web-three.vercel.app
curl -s $BASE/api/health                                  # {"ok":true}
curl -s $BASE/api/books | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"  # 192
curl -s $BASE/api/mm/books | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"  # 60
curl -s "$BASE/api/search?q=%E1%80%98%E1%80%AF%E1%80%9B%E1%80%AC%E1%80%B8&type=mm_phrase" | head -c 200  # total 12513 (takes ~8s)
curl -s $BASE/api/stats                                   # books 192, mm_books 60, pages 59008, mm_pages 23390
curl -s -o /dev/null -w "%{http_code}\n" $BASE/            # 200
```

Turso checks (CLI authenticated as `tipidatamuse` on the VM):
```bash
/home/hatch/.turso/bin/turso db shell tipitaka-pali "SELECT count(*) FROM books;"        # 192
/home/hatch/.turso/bin/turso db shell tipitaka-mm "SELECT count(*) FROM mm_pages;"        # 23390
/home/hatch/.turso/bin/turso db shell tipitaka-nissaya "SELECT count(*) FROM nissaya;"    # 39093 (table name may vary; check schema first)
```

## 11. Key files

| File | What it is |
|---|---|
| `SELFHOST.md` | Free self-host guide (Burmese) + complete keep-alive methods |
| `HANDOFF.md` | This file |
| `app.py` | Flask app (v7.78, dual local/Turso mode) |
| `db_turso.py` | libsql adapter (`turso_enabled`, `connect_turso`) |
| `api/index.py` | Vercel entrypoint — keep minimal (see §5) |
| `vercel.json` | `functions` maxDuration 60 only — **no rewrites, no crons (yet)** |
| `requirements.txt` | flask, python-docx, libsql==0.1.11 |
| `.python-version` | 3.12 |

---

*If anything in this file contradicts what you observe live, trust the
live observation, fix the file, and tell the user what changed.*
