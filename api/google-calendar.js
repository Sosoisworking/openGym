// Google Calendar sync: a profile's workouts, plan and habits (calendar-events.js) kept in a
// calendar of their own, "Tarnished", in the user's Google account.
//
// Access is the narrowest scope Google has for this, `calendar.app.created`: make secondary
// calendars and manage the events on those only. Tarnished never sees or touches the user's other
// calendars. It needs the instance's own OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET,
// docs/GOOGLE_CALENDAR.md); without one the whole feature is off and every route says so.
//
// One file per connected profile under DATA_DIR/google/ (0600): the refresh token, the calendar's
// id and what was last sent — per event its content hash, day and kind (`synced`). A sync sends
// only what changed since: an event Google already has as it is costs nothing, so syncing after
// every save is cheap. Event ids are derived from the event's own uid (eventId), so sending the
// same event twice updates it instead of making a second one, even after the file was lost.
//
// What a sync removes: an event whose thing is gone (a workout deleted, a day unticked, a plan
// changed) while its day is still inside the window calendar-events.js covers, and every event of
// a kind the profile switched off. An event that only aged out of the window stays in Google: last
// spring's workouts do not disappear because they are older than 90 days.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { calendarEvents, calSyncPrefs, todayIn, windowOf, shiftDay } from './calendar-events.js';

export const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const PREF_OF = { workout: 'workouts', plan: 'plan', habits: 'habits' };
// Google's event colours closest to the app's: sage for a workout, graphite for the plan, basil for habits.
const COLOR = { workout: '2', plan: '8', habits: '10' };
const PARALLEL = 4;

export class GoogleError extends Error {
  constructor(message, { status = 502, code = 'google' } = {}) { super(message); this.status = status; this.code = code; }
}

/** A Google event id for our uid: base32hex (0-9, a-v), stable, 34 characters. */
export const eventId = uid => 'tn' + crypto.createHash('sha256').update(String(uid)).digest('hex').slice(0, 32);
const hashOf = e => crypto.createHash('sha256').update(JSON.stringify([e.kind, e.day, e.summary, e.description, e.start ?? null, e.end ?? null])).digest('base64url').slice(0, 22);
const nextDay = iso => shiftDay(iso, 1);

/** Our event as the body Google's Events API takes. */
export function googleEvent(e) {
  const body = {
    id: eventId(e.uid), status: 'confirmed', summary: e.summary, description: e.description || '',
    colorId: COLOR[e.kind], reminders: { useDefault: false },
    extendedProperties: { private: { tarnished: e.uid } },
  };
  if (Number.isFinite(e.start)) {
    body.start = { dateTime: new Date(e.start).toISOString() };
    body.end = { dateTime: new Date(Number.isFinite(e.end) ? e.end : e.start + 3600000).toISOString() };
  } else {
    body.start = { date: e.day };
    body.end = { date: nextDay(e.day) };
    body.transparency = 'transparent';
  }
  return body;
}

const SAFE_UID = /^[\w-]{1,80}$/;

export function createGoogleCalendar({
  dataDir, clientId, clientSecret, redirectUri, scope = DEFAULT_SCOPE,
  authUrlBase = 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl = 'https://oauth2.googleapis.com/token',
  revokeUrl = 'https://oauth2.googleapis.com/revoke',
  apiBase = 'https://www.googleapis.com/calendar/v3',
  fetch: fetchFn = globalThis.fetch, readState = () => null, syncDelayMs = 20000, log = console,
} = {}) {
  const enabled = !!(clientId && clientSecret && redirectUri);
  const dir = path.join(dataDir, 'google');
  const file = uid => {
    if (!SAFE_UID.test(String(uid))) throw new GoogleError('bad profile id', { status: 400 });
    return path.join(dir, uid + '.json');
  };
  const load = uid => { try { return JSON.parse(fs.readFileSync(file(uid), 'utf8')); } catch { return null; } };
  const save = (uid, rec) => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const f = file(uid), tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 });
    fs.renameSync(tmp, f);
  };

  async function form(url, params) {
    let r;
    try {
      r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    } catch (e) { throw new GoogleError('Google could not be reached: ' + e.message); }
    let body = null;
    try { body = await r.json(); } catch { /* revoke answers with an empty body */ }
    return { status: r.status, body };
  }

  async function freshToken(uid, rec) {
    if (rec.access && rec.accessExp > Date.now() + 60000) return rec.access;
    const { status, body } = await form(tokenUrl, { grant_type: 'refresh_token', refresh_token: rec.refresh, client_id: clientId, client_secret: clientSecret });
    if (status === 400 || status === 401) {
      // invalid_grant: the user took the access back in their Google account, or it expired.
      rec.revoked = true;
      rec.lastError = 'Google no longer lets Tarnished in. Connect again in Settings.';
      save(uid, rec);
      throw new GoogleError(rec.lastError, { status: 409, code: 'revoked' });
    }
    if (status !== 200 || !body?.access_token) throw new GoogleError(`Google refused a token refresh (HTTP ${status})`);
    rec.access = body.access_token;
    rec.accessExp = Date.now() + (Number(body.expires_in) || 3600) * 1000;
    return rec.access;
  }

  async function api(uid, rec, method, pathname, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await freshToken(uid, rec);
      let r;
      try {
        r = await fetchFn(apiBase + pathname, {
          method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) { throw new GoogleError('Google could not be reached: ' + e.message); }
      if (r.status === 401 && attempt === 0) { rec.access = null; continue; }   // a token that died early
      let json = null;
      if (r.status !== 204) { try { json = await r.json(); } catch { json = null; } }
      return { status: r.status, json };
    }
  }

  async function makeCalendar(uid, rec, tz) {
    const { status, json } = await api(uid, rec, 'POST', '/calendars', {
      summary: 'Tarnished', description: 'Workouts, planned sessions and habits from Tarnished.', timeZone: tz || 'UTC',
    });
    if (status !== 200 || !json?.id) throw new GoogleError(`Google would not create the Tarnished calendar (HTTP ${status})`);
    rec.calendarId = json.id;
    rec.synced = {};
    return json.id;
  }

  const calPath = rec => '/calendars/' + encodeURIComponent(rec.calendarId) + '/events';

  async function putEvent(uid, rec, e, known) {
    const body = googleEvent(e);
    const update = () => api(uid, rec, 'PUT', calPath(rec) + '/' + body.id, body);
    const insert = () => api(uid, rec, 'POST', calPath(rec), body);
    let r = known ? await update() : await insert();
    // Known but gone (deleted by hand in Google): make it again. New but the id is taken (sent
    // before and the file lost, or deleted and still held by Google as cancelled): update it,
    // which with status "confirmed" also brings a cancelled one back.
    if (known && (r.status === 404 || r.status === 410)) r = await insert();
    else if (!known && r.status === 409) r = await update();
    return r;
  }

  async function deleteEvent(uid, rec, u) {
    const r = await api(uid, rec, 'DELETE', calPath(rec) + '/' + eventId(u));
    return r.status === 200 || r.status === 204 || r.status === 404 || r.status === 410;
  }

  // Runs `jobs` (async functions) PARALLEL at a time; stops starting new ones after a failure.
  async function pool(jobs) {
    let i = 0, failure = null;
    const worker = async () => {
      while (i < jobs.length && !failure) {
        const job = jobs[i++];
        try { await job(); } catch (e) { failure = failure || e; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
    if (failure) throw failure;
  }

  const running = new Map();   // uid -> promise of the sync in flight
  const again = new Set();     // uids with a save that came in while their sync ran

  async function syncNow(uid, S, opts = {}) {
    const rec = load(uid);
    if (!rec || rec.revoked || !S) return null;
    const prefs = calSyncPrefs(S);
    const today = opts.today || todayIn(prefs.tz);
    const events = calendarEvents(S, { today, prefs });
    const want = new Map(events.map(e => [e.uid, e]));
    const counts = { sent: 0, removed: 0, unchanged: 0 };
    rec.synced = rec.synced && typeof rec.synced === 'object' ? rec.synced : {};
    try {
      if (!rec.calendarId) await makeCalendar(uid, rec, prefs.tz);
      const jobs = [];
      let calendarGone = false;
      for (const e of events) {
        const h = hashOf(e), prev = rec.synced[e.uid];
        if (prev?.h === h) { counts.unchanged++; continue; }
        jobs.push(async () => {
          const r = await putEvent(uid, rec, e, !!prev);
          if (r.status === 200) { rec.synced[e.uid] = { h, d: e.day, k: e.kind }; counts.sent++; return; }
          // putEvent already made a missing event again, so a 404 here is the calendar itself gone.
          if (r.status === 404) { calendarGone = true; throw new GoogleError('calendar gone', { code: 'calendar-gone' }); }
          throw new GoogleError(r.status === 403 || r.status === 429 ? 'Google asked Tarnished to slow down. It will try again later.' : `Google refused an event (HTTP ${r.status})`);
        });
      }
      for (const [u, v] of Object.entries(rec.synced)) {
        if (want.has(u)) continue;
        const off = !prefs[PREF_OF[v?.k]];
        const [from, to] = windowOf(v?.k, today);
        if (!off && !(v?.d >= from && v?.d <= to)) continue;
        jobs.push(async () => { if (await deleteEvent(uid, rec, u)) { delete rec.synced[u]; counts.removed++; } });
      }
      try { await pool(jobs); }
      catch (e) {
        // The user deleted the whole Tarnished calendar in Google: make a new one and send everything again.
        if (!calendarGone) throw e;
        await makeCalendar(uid, rec, prefs.tz);
        save(uid, rec);
        return syncNow(uid, S, opts);
      }
      rec.lastSync = Date.now();
      rec.lastError = null;
      save(uid, rec);
      return counts;
    } catch (e) {
      rec.lastError = e instanceof GoogleError ? e.message : 'The sync with Google stopped: ' + e.message;
      save(uid, rec);
      throw e;
    }
  }

  /** Syncs `uid` now; a call while one runs waits for it and then runs once more. `opts.today` pins the date (tests). */
  function sync(uid, S, opts) {
    if (running.has(uid)) { again.add(uid); return running.get(uid); }
    const p = syncNow(uid, S, opts).finally(() => {
      running.delete(uid);
      if (again.delete(uid)) schedule(uid, 0);
    });
    running.set(uid, p);
    return p;
  }

  const timers = new Map();
  /** A sync of `uid` a little later, after the saves of a burst of edits have landed. */
  function schedule(uid, delay = syncDelayMs) {
    if (!enabled || !load(uid)) return;
    clearTimeout(timers.get(uid));
    const t = setTimeout(() => {
      timers.delete(uid);
      sync(uid, readState(uid)).catch(e => log.warn?.('google sync', uid, e.message));
    }, delay);
    t.unref?.();
    timers.set(uid, t);
  }

  return {
    enabled,

    /** Where to send the browser to ask the user; `state` comes back on the callback. */
    authUrl(state) {
      const q = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope,
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
      });
      return authUrlBase + '?' + q.toString();
    },

    /** The callback's code turned into a connection, with the Tarnished calendar made. */
    async connect(uid, code, tz) {
      const { status, body } = await form(tokenUrl, { grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri });
      if (status !== 200 || !body?.access_token) throw new GoogleError(`Google refused the sign-in (HTTP ${status})`, { status: 400, code: 'exchange' });
      if (!body.refresh_token) throw new GoogleError('Google gave no lasting access. Remove Tarnished under your Google account’s third-party access, then connect again.', { status: 400, code: 'no-refresh' });
      const old = load(uid);
      const rec = {
        refresh: body.refresh_token, access: body.access_token, accessExp: Date.now() + (Number(body.expires_in) || 3600) * 1000,
        scope: body.scope || scope, connectedAt: Date.now(),
        // Reconnecting keeps the calendar it had and what was sent to it.
        calendarId: old?.calendarId || null, synced: old?.calendarId ? old.synced || {} : {},
      };
      if (!rec.calendarId) await makeCalendar(uid, rec, tz);
      save(uid, rec);
      return this.status(uid);
    },

    status(uid) {
      const rec = load(uid);
      if (!rec) return { enabled, connected: false };
      return {
        enabled, connected: !rec.revoked, revoked: !!rec.revoked, connectedAt: rec.connectedAt || null,
        lastSync: rec.lastSync || null, lastError: rec.lastError || null, events: Object.keys(rec.synced || {}).length,
        calendarUrl: rec.calendarId ? 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(rec.calendarId) : null,
      };
    },

    /** Forgets the connection and takes the access back from Google. The calendar stays in Google. */
    async disconnect(uid) {
      const rec = load(uid);
      clearTimeout(timers.get(uid));
      timers.delete(uid);
      if (!rec) return;
      try { await form(revokeUrl, { token: rec.refresh }); } catch (e) { log.warn?.('google revoke', e.message); }
      try { fs.unlinkSync(file(uid)); } catch { /* gone already */ }
    },

    sync,
    schedule,

    /** Every connected profile, a sync each: the plan's window moves on with the days. */
    tick() {
      let names = [];
      try { names = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { return; }
      names.forEach((f, i) => schedule(f.slice(0, -5), Math.min(syncDelayMs, 1000) + i * 2000));
    },
  };
}
