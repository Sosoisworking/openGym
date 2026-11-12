# Tarnished: project review and work plan

Written 2026-11-10 against commit `c9a2e012` ("Spotify strip on Home too"), `main`, clean tree.
This file is the hand-off for a later session (Opus 5.5) to execute. It is self-contained:
read `CLAUDE.md` first, then this.

## 1. How to use this plan

- Work the phases in order unless Soso picks otherwise. Each task says what, where, how, and how to check it.
- Line numbers are as of `c9a2e012`. If one is off, search for the quoted text.
- Tasks marked **Needs D-n** wait for that decision in section 6. Ask Soso those questions up front, in one go.
- Do not commit or push unless Soso asks. When asked: one commit per task, message ends with
  `Co-Authored-By: Claude <noreply@anthropic.com>`, identity `-c user.name=Sohaib -c user.email=sohaib07112010@gmail.com`.
- Show the diff or the command before anything destructive (file deletions, `git rm`, lockfile rewrites).
- After every task run the three test suites (section 3). A task is not done while a suite is red.

## 2. Rules that apply to every task

1. Never touch upstream `DuarteSantos8/openGym`: no PRs, issues, comments, or remote. The only remote is `origin` = `Sosoisworking/openGym`.
2. Keep the AGPL licence, "Based on openGym by Duarte Santos", and "Media licensed for use in openGym only" (that last string must never say Tarnished).
3. Exercise media (`catalogue/media`) must never be read or screenshotted by an AI. Run dev servers with `MEDIA_TARGET=http://127.0.0.1:9`.
4. These internal `opengym` identifiers carry compatibility and must not be renamed: storage key `gym_state_v1`; service-worker caches `opengym-rt-<hash>`, `opengym-media-v1`, `opengym-device`, `/opengym-device-id`; push tag `opengym`; `opengym_plan` format key; `opengym-backup.json`; reset-code salt `opengym-reset:`; error code `'not-opengym'`; MCP env `OPENGYM_DATA` / `OPENGYM_UID`.
5. Do not run `npm run build` into `frontend/dist`: the phone server serves it and each rebuild changes the service-worker stamp on Soso's phone. Measure with `npx vite build --outDir <scratch dir> --emptyOutDir`.
6. Soso's real data is in `./data`. Never edit, move or delete it. Do not read or move `.env`.
7. Google Calendar is dormant and "morning update" has no spec yet (section 7). Do not start either.
8. No new dependencies without a reason the existing code cannot meet. No linter, no TypeScript: match the style by hand.
9. Do not state test passwords in chat (`scripts/seed-accounts.local.json` is gitignored).

## 3. Baseline (verify before starting)

```bash
cd frontend && NODE_OPTIONS=--no-experimental-webstorage npx vitest run   # 400 files, 4921 tests
cd api && npm test                                                        # 610 tests
cd mcp && npm test                                                        # 95 tests
node scripts/catalogue/validate.mjs && node scripts/catalogue/check-media.mjs
node scripts/catalogue/build.mjs --check                                  # FAILS today, see F2
```

`NODE_OPTIONS` is only needed on Node 25+ (the Mac has 26; CI runs 22). All three suites were green at the baseline.

## 4. What the review covered

Read in full: everything Tarnished added (habits, calendar events, ICS, Google Calendar, Spotify, music strip and settings, web update, month calendar, calendar sync UI), the workflows, Dockerfiles, compose, nginx template, docs, package manifests, `npm audit` and `npm outdated` for all three packages, and a scratch production build.
Sampled, not read line by line: the upstream bulk (`api/server.js` 2858 lines, `useStore.js` 1986, `Workout.jsx` 2089, `sheets.jsx` 3512). No device testing in this review; the 46-case phone checklist already passed except K1 (Google Calendar, blocked).

**Verdict.** The code is in good shape: suites green, no secrets tracked or ever committed, the added modules are small, pure and tested. What needs work is around the code: the real data has no backup or permanent home, the fork still carries upstream leftovers (dead CI, stale docs and links, a find-and-replace grammar slip in user-facing text), and dev and API dependencies have open advisories. Performance is a minor item (F7).

## 5. Findings

| ID | Severity | Finding | Where |
|---|---|---|---|
| F1 | High (operational) | Real data lives only in `./data` on a laptop, served by `vite preview` + node. No backup, no permanent host. | `./data`, `.claude/launch.json` |
| F2 | Medium | Catalogue workflow fails on `main`: `catalogue/browse/*.md` are out of date. | `.github/workflows/catalogue.yml:27` |
| F3 | Medium | "an Tarnished" in user-facing text (find-and-replace of "an openGym"). | `components/ServerSync.jsx:86`; `lib/plan-share.js:33,224`; `lib/backup-media.js:86,94,102`; `lib/api.js:277` (all under `frontend/src`) |
| F4 | Medium | Dependency advisories. Frontend: 0 in production deps, 15 in dev tooling incl. `vite` (it serves the real app via `vite preview`). API: 7, incl. direct dep `undici`. MCP: 6, incl. direct dep `zod`. | `frontend/`, `api/`, `mcp/` `package.json` |
| F5 | Medium | `docker-publish.yml` pushes `ghcr.io/.../tarnished-api|web:edge` on every push to `main`; nothing uses those images. | `.github/workflows/docker-publish.yml` |
| F6 | Medium | Web Settings row "Get the Android app" opens an empty releases page. | `frontend/src/views/Settings.jsx:831-833`; `lib/update.js:14-16` |
| F7 | Low | No route code-splitting: all ~20 views are static imports. Main chunk 1,149 kB (356 gzip). The service worker downloads every chunk at install anyway, so splitting saves parse time at launch, not data. | `frontend/src/App.jsx:31-50, 208-234`; `frontend/scripts/sw-stamp.mjs` |
| F8 | Medium | Push fails on `.local`/IP hosts: the default VAPID subject is `ORIGIN`, which Apple rejects (403 BadJwtToken). Docs say the default is fine. | `api/server.js:219`; `docs/SELF_HOSTING.md:635` |
| F9 | Low | `CLAUDE.md` is wrong: says a `media` compose service and three services (there are two; media is baked in from `catalogue/media`), and "no prebuilt images" while F5 publishes them. | `CLAUDE.md:41,76,145` |
| F10 | Low | Spotify is undocumented (README and `docs/` never mention it); "Update now" and the rest-bar sound toggle are also missing. Music settings copy predates the Home strip. | `README.md`, `docs/`; `frontend/src/components/MusicSettings.jsx:15,75` |
| F11 | Low | Stale upstream docs and links: `docker compose pull` / prebuilt images, issues and discussions links (both disabled on the fork), opengym.ch, GitLab CI diagram. | `docs/SELF_HOSTING.md:30,36,660-664,796,806,817`; `docs/FAQ.md:30,84,107-109`; `docs/MOBILE.md:4`; `docs/README.md:53`; `.github/ISSUE_TEMPLATE/config.yml`; `docs/diagrams/ci.mmd`; `api/openapi.yaml:4,12,124` |
| F12 | Low | Fork leftovers: `renovate.json`, `scripts/ci/fork-mr-pipelines.py`, Nix lines in `.gitignore:22`, `test.yml:16` lists a `coach` branch that does not exist, `catalogue.yml:7` watches two removed folders, stale comments in `.github/dependabot.yml:38-41,98`, Umami analytics plugin in `frontend/vite.config.js:49-55`. | as listed |
| F13 | Low | Dead after English-only: `scripts/exercise-name-sources/` (576 K), `scripts/instruction-sources/` (744 K), `scripts/de-name-rules.mjs`, `scripts/catalogue/import-names.mjs`; the Arabic RTL pre-paint line in `frontend/index.html:14`. | as listed |
| F14 | Low | Renaming a habit can create two habits with the same name (`withHabitName` has no duplicate check; adding one does). | `frontend/src/lib/habits.js:72-77` |
| F15 | Low | No dedicated tests for `MonthCalendar.jsx`, `MusicSettings.jsx`, or the day sheet (`DaySheet`, `frontend/src/sheets.jsx:2798`). | as listed |
| F16 | Low | `user-scalable=no` blocks pinch zoom; only one `prefers-reduced-motion` rule and three `focus-visible` rules in `index.css`. | `frontend/index.html:5`; `frontend/src/index.css` |
| F17 | Low | Versions and identity still upstream's: packages are `opengym-frontend`/`gym-api`/`opengym-mcp` at 1.4.1, `CHANGELOG.md` is 158 KB of upstream history, the GitHub repo description and homepage still point at opengym.ch. | `*/package.json`, `CHANGELOG.md` |
| F18 | Low (dormant) | Google Calendar: the OAuth callback completes without checking a browser-bound nonce; `syncNow` re-runs itself on "calendar gone" with no retry cap; deleting the feed link writes no audit line. | `api/google-calendar.js:182-204`; `api/server.js:2357` |
| F19 | Watch only | Habit ticks and removed habits are never pruned. State files are 16-57 KB against a 5 MB cap, so nothing to do now. | `frontend/src/lib/habits.js`; `api/server.js:96` |

## 6. Decisions for Soso (ask first)

| ID | Question | Recommended |
|---|---|---|
| D1 | Where does the backup of `./data` go, and how often? | A dated `tar.gz` to a folder outside the repo that already syncs (iCloud Drive or similar), daily. |
| D2 | Move off the laptop to a permanent host? | Yes: "kage" (WSL2 + Docker) behind a real HTTPS hostname. See Phase 8 for what breaks. |
| D3 | `docker-publish.yml`: delete or keep? | Delete. Compose builds from source. |
| D4 | "Get the Android app" row: hide until a release exists, or cut an APK release? | Hide. |
| D5 | Issues/discussions links: enable them on the fork or remove the links? | Remove the links. |
| D6 | Versioning: reset to Tarnished `0.1.0` and start a fresh `CHANGELOG.md` (old one kept as `docs/CHANGELOG-openGym.md`)? | Yes. |
| D7 | Update the GitHub repo description and homepage? (Outward-facing; Soso approves the text.) | Yes. |
| D8 | Deep i18n removal (`S.lang`, `default-lang.js`, `RTL_LANGS`, `DEFAULT_LANG` env)? | No. Moderate risk, little gain. Only the dead files in F13. |

## 7. Tasks

### Phase 1: protect the data (F1). Needs D1.

- **1.1 Backup script.** Add `scripts/backup-data.sh`: `tar czf "<dest>/tarnished-backup-$(date +%F).tar.gz" data/`, keep the newest 14, exit non-zero on failure. The destination comes from an argument or env var, never hard-coded. Document it in `docs/SELF_HOSTING.md` section 6 (line 564). Check: run it, list the archive with `tar tzf`, confirm `db.json`, `secret`, `vapid.json` and every `state-*.json` are inside.
- **1.2 Schedule.** Give Soso the exact `launchd`/cron line to install themselves; do not change system settings for them.
- **1.3 Restore drill.** Extract one archive into a scratch dir, start the API against it on a spare port (`cd api && DATA_DIR=<scratch>/data PORT=3999 node server.js`), confirm `GET /api/health` answers. Write the steps into the same docs section.

### Phase 2: quick wins, no decisions needed

- **2.1 Fix "an Tarnished" (F3).** Change "an Tarnished" to "a Tarnished" at the sites in F3 and in the tests that assert or name them: `api.pair-probe.test.js:59,63`, `backup-media.test.js:97,103,106`, `plan-share.test.js:305`, `api.test.js:77`, `import-csv.hostile.test.js:129`. Keep the error code `'not-opengym'`. Check: `grep -rnE "\ban Tarnished" frontend/src docs README.md` prints nothing (plain `grep "an Tarnished"` also matches "other th-an Tarnished", which is correct text).
- **2.2 Regenerate the catalogue browse pages (F2).** `node scripts/catalogue/build.mjs`, then confirm `git status` shows only `catalogue/browse/*.md` changed, then `node scripts/catalogue/build.mjs --check` passes. In `catalogue.yml:7` drop `frontend/src/exercise-names/**` and `frontend/src/exercise-desc/**`.
- **2.3 Dependencies (F4).** One package at a time, tests after each.
  - `api`: `npm audit fix` (no `--force`). Expect 0 left; `undici` lands at 7.30.2 or later.
  - `mcp`: `npm audit fix` (no `--force`). The remaining `zod` advisory needs zod 4, which is parked.
  - `frontend`: `npm update` (in-range: vite 8.3.x, react 19.3.x, react-router-dom 7.18.x, zustand 5.1.x, Capacitor 7.6.x), then `npm audit`. `happy-dom` 21 is a major: try it, keep it only if all 4921 tests pass unchanged. Leave Capacitor 8 and vitest 5 parked.
  - Check: suites green, `npm audit --omit=dev` is 0 in `frontend` and `api`, and a scratch build succeeds.
- **2.4 Fix `CLAUDE.md` (F9).** Lines 41 and 145: two services (`api`, `web`); exercise media is copied into the web image from `catalogue/media` at build. Line 76: make it agree with the D3 outcome.
- **2.5 Music settings copy (F10).** `MusicSettings.jsx:15` to "Spotify connected. It shows on Home and the workout screen."; `:75` to mention Home too. Update `MusicStrip`/settings tests if they assert the old text.
- **2.6 VAPID warning (F8).** After `api/server.js:219`: when `VAPID_SUBJECT` is not a `mailto:` and its hostname is an IP address, ends in `.local`, or has no dot, log one startup warning saying Apple rejects it and to set `VAPID_SUBJECT=mailto:you@your-domain`. Put the hostname test in a small pure function with a unit test in `api/test/`. Correct `docs/SELF_HOSTING.md:635` and add the same note to `docs/PHONE_TESTING.md`. Do not change the default itself.

### Phase 3: stale docs and links (F11). 3.2 needs D5, 3.3 needs D4.

- **3.1** `docs/SELF_HOSTING.md` (lines in F11) and `docs/FAQ.md:84`: replace `docker compose pull` / prebuilt-image text with `git pull && docker compose up -d --build`. Delete `docs/diagrams/ci.mmd` if nothing links to it (grep first). `api/openapi.yaml:4,12,124`: remove opengym.ch, use a neutral example host.
- **3.2** Issues/discussions links in `docs/FAQ.md:107-109`, `docs/README.md:53`, `.github/ISSUE_TEMPLATE/config.yml`: per D5.
- **3.3** `Settings.jsx:831-833`: per D4. If hiding, remove the web row and keep the native update check in `lib/update.js` (it already handles a 404). Fix `docs/FAQ.md:30` and `docs/MOBILE.md:4` to match. Update `Settings` tests that expect the row.

### Phase 4: repo hygiene (F5, F12, F13). 4.1 needs D3.

For each deletion: grep for references first, show Soso the `git rm` list, then delete.

- **4.1** `docker-publish.yml`: delete, or keep and document, per D3.
- **4.2** Delete `renovate.json`, `scripts/ci/`, the Nix lines in `.gitignore`; `test.yml:16` becomes `branches: [main]`; fix the stale `dependabot.yml` comments; remove the Umami plugin from `vite.config.js`.
- **4.3** Delete `scripts/exercise-name-sources/`, `scripts/instruction-sources/`, `scripts/de-name-rules.mjs`, `scripts/catalogue/import-names.mjs`. At review time the only references were inside those files themselves. Remove the RTL line at `frontend/index.html:14` (keep the rest of the pre-paint script).
- Check: suites green, catalogue checks pass, scratch build succeeds.

### Phase 5: performance (F7). Measure first; drop the phase if the gain is small.

The service worker fetches every built chunk at install (`lazyAssets` in `frontend/scripts/sw-stamp.mjs` lists all JS and CSS chunks), so lazy screens work offline with no extra work, and splitting does not reduce what a phone downloads. The only gain is less JavaScript to parse when the app starts.

- **5.1 Measure.** Scratch build, serve it, and record cold-start time to the Home screen in Chrome with 4x CPU throttling (median of 5 runs).
- **5.2 Lazy routes.** In `App.jsx` turn these into `React.lazy` imports under one `Suspense` around `<Routes>` with a plain empty fallback: `CoachChat`, `CoachIntake`, `CoachSetup`, `Admin`, `Stats`, `ProgressPhotos`, `Measurements`, `StructuralBalance`, `Muscles`. Keep `Home`, `Workout`, `Plan`, `RoutineEdit`, `History`, `Library`, `Habits`, `Settings`, `Login` static: they must open instantly mid-workout.
- **5.3 Confirm offline.** In the scratch build's `sw.js`, the stamped lazy list must name the new route chunks.
- **5.4** The build prints `INEFFECTIVE_DYNAMIC_IMPORT` for `store/useUI.js`, `lib/media-prefetch.js`, `sheets.jsx`, `lib/scan-web.js`. For each, make the import consistently static or consistently dynamic. `scan-web.js` (pulls in `jsQR`, 130 kB) is the one worth making truly dynamic.
- Check: measure again as in 5.1. Keep the change only if cold start improves by 10% or more; otherwise revert and say so. Tests that render `App` may need `findBy*` instead of `getBy*`.

### Phase 6: hardening and tests (F14, F15, F16)

- **6.1** `withHabitName`: refuse a name another live habit already has (case-insensitive, same rule as adding). Unit tests in `lib/habits.test.js`; the UI shows the same message as the add path.
- **6.2** Add tests: `MonthCalendar.test.jsx` (month grid, today, marked days, tapping a day), `MusicSettings.test.jsx` (not connected, connected, switches, disconnect), a `DaySheet` test (workout, plan, weigh-in, habits shown; ticking a past day).
- **6.3** Remove `user-scalable=no` from `frontend/index.html:5`, then check on the phone that inputs do not zoom on focus (they need font-size 16px or more). Wrap the view fade and sheet animations in `prefers-reduced-motion`.
- **6.4 Optional.** A `script-src 'self'` CSP in `web/nginx.conf.template` (needs a hash for the inline pre-paint script in `index.html`, and `connect-src` for Spotify). Worth it because Spotify tokens sit in `localStorage`. Skip unless Soso wants it.

### Phase 7: docs and identity (F10, F17). 7.2 needs D6, 7.3 needs D7.

- **7.1** Write `docs/SPOTIFY.md` (create your own Spotify developer app, Redirect URI = the app's root URL, paste the Client ID in Settings, Premium needed for controls, per-device sign-in, web only), link it from `docs/README.md` and `README.md`. Add "Update now" and the rest-bar sound toggle to the README feature list.
- **7.2** Versions and changelog per D6. Package `name` fields may change; nothing reads them at runtime (grep to confirm).
- **7.3** Repo description/homepage per D7, with `gh repo edit` on `Sosoisworking/openGym` only, after Soso approves the exact text.

### Phase 8: permanent host (F1). Needs D2. Plan with Soso before doing anything.

Moving to a real HTTPS hostname fixes push (VAPID), the Google redirect, and makes the calendar link reachable. It also has these consequences, which Soso must hear first:
passkeys are bound to the hostname and stop working (`docs/SELF_HOSTING.md:718`), so before the move every real profile must have a password set in Settings, and the new host must run with `PASSWORD_LOGIN=1`, so each person can sign in with the password and add a new passkey there; Spotify must be reconnected and the new Redirect URI added in the Spotify dashboard; push must be re-enabled; the home-screen app must be re-added.
Steps: back up (Phase 1), also export a JSON backup from the app (Settings, Data & backup) as a second net, set passwords, copy `data/` to the host, set `RP_ID`/`ORIGIN`/`VAPID_SUBJECT` per `docs/SELF_HOSTING.md` sections 2-3 and `docs/SELF_HOSTING_HTTPS.md`, `docker compose up -d --build`, sign in, verify sync, then retire the laptop server.

## 8. Parked (do not start)

- **Google Calendar.** Dormant by Soso's choice. When it returns: fix F18 first (a `SameSite=Lax` nonce cookie bound to the OAuth `state`, a single retry on "calendar gone", an audit line on feed delete). Connect procedure is in `docs/GOOGLE_CALENDAR.md`; Google refuses `.local` redirects, so it needs `localhost` or the Phase 8 host.
- **Morning update.** Waiting for Soso's spec. Hook points for later: the reminder tick in `api/server.js` (`REMINDER_TICK_MS`, line 446; loop at 503-533), `api/push-messages.js`, `api/nudge.js`, and `api/calendar-events.js` for "what is on today".
- zod 4 in `mcp`, Capacitor 8, vitest 5, deep i18n removal (D8), splitting the very large files (`sheets.jsx`, `server.js`, `Workout.jsx`).

## 9. Done means

Per task: the check in the task passes, all three suites are green, and nothing in section 2 was broken.
Overall: `catalogue.yml` and `test.yml` green on `main`, `npm audit --omit=dev` clean in `frontend` and `api`, no "an Tarnished" in the app, a tested backup exists, and `CLAUDE.md` matches the repo.
