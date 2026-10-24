# Calendar sync

Tarnished can put your workouts, the plan ahead and your habits into a calendar app, in two ways.
Both live in **Settings → Calendar sync** and both need you to be signed in to your server (guest
mode and a phone kept local have no server to do it).

| | Calendar link | Google Calendar |
|---|---|---|
| Works with | Any app that subscribes by address: Apple Calendar, Outlook, Google Calendar, Thunderbird | Google Calendar |
| Setup | None | An OAuth client of your own (below), once per server |
| How fresh | Whenever the app fetches it again: Apple and Outlook every hour or so, Google every few hours up to a day | Seconds after every change, plus every six hours |
| Server must be reachable from the internet | Only for Google's "From URL", which fetches from Google's servers | No: your server calls Google, not the other way round (except the one sign-in redirect, which your own browser makes) |

What goes out, in both cases, is up to each profile (the three switches on the page):

- **Workouts**: every session of the last 90 days, at the time it was trained, with its exercises,
  sets, volume and PRs.
- **Planned sessions**: the next 14 days of the plan, as all-day events. A day you train turns into
  the workout instead.
- **Habits**: one all-day event per day with at least one habit ticked: "Habits 3/5", listing which.

## The calendar link

Settings → Calendar sync → **Make a calendar link**. Copy it into your calendar app:

- **Google Calendar** (web): Other calendars → **+** → From URL.
- **Apple Calendar**: File → New Calendar Subscription (or tap "Subscribe in a calendar app").
- **Outlook**: Add calendar → Subscribe from web.

The link is the only key to the calendar, so anyone holding it can read it. **Make a new link** if
one got out: the old one stops working at once.

## Google Calendar

Tarnished asks Google for one permission, `calendar.app.created`: make calendars of its own and
manage the events in them. It makes a calendar called **Tarnished** and never sees or changes any
other calendar in the account. Disconnecting hands the access back; the Tarnished calendar stays in
your Google account to keep or delete.

### One-time setup: an OAuth client for your server

Google only lets an app ask for calendar access with a client registered in a Google Cloud project.
This is free and takes about ten minutes.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project, for
   example `tarnished`.
2. **APIs & Services → Library**: find **Google Calendar API** and press **Enable**.
3. **Google Auth Platform** (the OAuth consent screen):
   - **Branding**: app name `Tarnished`, your e-mail as the support and developer contact.
   - **Audience**: user type **External**. Add your own Google account under **Test users**.
   - **Data access**: **Add or remove scopes**, filter for `calendar.app.created`, tick
     `.../auth/calendar.app.created`, save.
4. **Clients → Create client**: type **Web application**. Under **Authorized redirect URIs** add
   your server's address followed by `/api/google/callback`, exactly as `ORIGIN` is in your `.env`:
   - `https://gym.example.com/api/google/callback` for a real deployment
   - `http://localhost:8080/api/google/callback` for a local test (Google allows plain http for
     localhost only)
5. Copy the **Client ID** and **Client secret** into `.env` and restart:

   ```bash
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

   ```bash
   docker compose up -d
   ```

6. In the app: Settings → Calendar sync → **Connect Google Calendar**, pick your account, allow.
   You land back on the same page with "Google Calendar connected", and the first sync starts.

### "Testing" or "In production"

While the app's publishing status is **Testing**, only the test users you listed can connect, and
Google expires the access after **7 days**: Tarnished then shows "Connect Google Calendar again".
For a server you run for yourself and a few people, set the status to **In production** under
Audience. Google then shows a "Google hasn't verified this app" screen the first time (Advanced →
Go to Tarnished), because verification is for apps offered to the public. Nothing about the access
changes, and it no longer expires.

### When something goes wrong

- **"redirect_uri_mismatch"** on Google's page: the redirect URI on the client is not exactly
  `ORIGIN` + `/api/google/callback`. Check `http` vs `https`, the port and any trailing slash. Set
  `GOOGLE_REDIRECT_URI` only if Google must come back somewhere else than `ORIGIN`.
- **"Not set up on this server"** in Settings: `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is
  missing from the API container's environment.
- **The Tarnished calendar was deleted in Google**: the next sync makes a new one and sends
  everything again.
- **Events look stale**: Settings → Calendar sync → **Sync now** shows what Google answered.

### What the server keeps

One file per connected profile under `data/google/` (readable by the server only): the refresh
token Google issued, the calendar's id, and a fingerprint of each event last sent, so a sync only
sends what changed. Deleting a profile, or disconnecting, removes the file and revokes the token.
