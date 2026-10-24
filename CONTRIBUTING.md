# Working on Tarnished

Tarnished is small on purpose: easy to read, easy to self-host, light on dependencies. These are
the house rules for keeping it that way.

## Project layout

```
frontend/  React + Vite app (src/views, src/components, src/store, src/lib). Builds to static files.
           android/ and ios/ are the Capacitor shells for the standalone app (docs/MOBILE.md).
api/       Backend: server.js on plain node:http. coach/ is the optional AI coach; openapi.yaml
           documents every route; calendar-events.js, ics.js and google-calendar.js are the
           calendar export (docs/GOOGLE_CALENDAR.md).
web/       Multi-stage Dockerfile (builds the frontend, serves it with nginx) and the nginx template.
mcp/       Optional read-only MCP server for LLM clients (Claude Desktop, Cursor, ...).
docs/      User and operator guides (index: docs/README.md); docs/dev/ has feature design notes.
catalogue/ The exercise catalogue: one JSON file per exercise, and the licensed 180 px stills and
           animations in media/ (catalogue/README.md).
```

## Running for development

```bash
cp .env.example .env
docker compose up -d --build      # api + web on :8080

cd frontend && npm install && npm run dev   # hot reload, proxies /api to :3000
cd frontend && npm test
cd api && npm test
cd mcp && npm test
```

CI runs Node 22, the same as the Dockerfiles. On Node 25 or newer, Node's own `localStorage` gets
in the way of the frontend tests; run them with `NODE_OPTIONS=--no-experimental-webstorage`.

## Guidelines

- **Keep it dependency-light.** The frontend uses React, React Router and Zustand; a new
  dependency on either side needs a reason the existing code can't meet.
- **Match the style.** Small components, clear names, comments that say *why*. State lives in the
  Zustand store (`src/store`), pure helpers in `src/lib`. There is no linter or formatter config,
  so follow the surrounding code.
- **Colours come from the tokens** at the top of `frontend/src/index.css` (dark first, light
  under `[data-theme="light"]`). A hard-coded colour in a component is almost always a bug in
  light mode.
- **Training logic gets a unit test.** Anything that decides what you lift next, reads a logged
  session back, or counts a habit streak belongs in a pure helper in `src/lib` with a test beside
  it. These rules are easy to get subtly wrong and nearly impossible to check by clicking.
- **Synced data merges per entry.** New per-day or per-item data goes into a stamped map
  (`STAMPED_MAPS` in `frontend/src/lib/sync-merge.js` and `api/sync-stamps.js`), with removals
  written as stamped empty entries, so two devices editing at once keep both changes.
- **English only.** The `t()` calls stay (they format and pluralise), but there are no other
  language packs to update.
- **Don't commit** `data/`, and don't add or replace anything in `catalogue/media/`: the stills
  and animations are licensed from Gym visual for openGym and its non-commercial forks, 180 px at
  most, and may not be fed to AI tools (see [NOTICE.md](NOTICE.md)).
- **Click through what you touched** in a browser, the workout flow included, before calling it
  done.

## Licence

Tarnished is a fork of [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos and
stays under the [GNU AGPL v3](LICENSE): anyone you host it for can ask for the source, and changes
stay open. The third-party pieces and their licences are in [NOTICE.md](NOTICE.md).
