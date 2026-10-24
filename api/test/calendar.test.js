/* The calendar export: what a profile looks like as events (calendar-events.js), the same events
   as an iCalendar feed (ics.js), and the Google Calendar sync (google-calendar.js) against a fake
   Google that records every request. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calendarEvents, calSyncPrefs, todayIn, shiftDay, WORKOUT_DAYS } from '../calendar-events.js';
import { toICS, fold, escapeText } from '../ics.js';
import { createGoogleCalendar, eventId, googleEvent } from '../google-calendar.js';

const TODAY = '2026-10-21';   // a Wednesday
const at = (iso, hh = 18) => Date.parse(`${iso}T${String(hh).padStart(2, '0')}:00:00Z`);

function profile(over = {}) {
  return {
    unit: 'kg',
    routines: [{ id: 'push', name: 'Push', ex: [] }, { id: 'pull', name: 'Pull', ex: [] }],
    week: { 1: ['push'], 3: ['pull'], 5: ['push'] },
    dayPlan: {},
    workouts: [
      { id: 'w1', d: '2026-10-19', name: 'Push', start: at('2026-10-19'), end: at('2026-10-19', 19), vol: 5200, prs: ['x'],
        entries: [{ id: '0001', sets: [{ done: true }, { done: true }, { done: false }] }] },
      { id: 'old', d: '2025-01-01', name: 'Ancient', start: at('2025-01-01'), end: at('2025-01-01', 19), entries: [] },
    ],
    habits: {
      water: { name: 'Water', c: 0, at: at('2026-10-01', 8), _ts: 1 },
      read: { name: 'Read', c: 1, at: at('2026-10-20', 8), _ts: 1 },
      gone: { _ts: 5 },
    },
    habitLog: {
      '2026-10-19:water': { done: 1, _ts: 1 },
      '2026-10-20:water': { done: 1, _ts: 1 },
      '2026-10-20:read': { done: 1, _ts: 1 },
      '2026-10-18:water': { _ts: 9 },          // unticked
    },
    calSync: { tz: 'UTC' },
    ...over,
  };
}

test('a workout is a timed event; one older than the window is left out', () => {
  const ev = calendarEvents(profile(), { today: TODAY });
  const w = ev.filter(e => e.kind === 'workout');
  assert.deepEqual(w.map(e => e.uid), ['w-w1']);
  assert.equal(w[0].start, at('2026-10-19'));
  assert.equal(w[0].end, at('2026-10-19', 19));
  assert.equal(w[0].description, '1 exercise · 2 sets · 5,200 kg lifted\n1 personal record\nLogged in Tarnished');
});

test('the plan is an all-day event per day ahead, from today, skipping a day already trained', () => {
  const S = profile();
  S.workouts.push({ id: 'w2', d: TODAY, name: 'Pull', start: at(TODAY, 7), end: at(TODAY, 8), entries: [] });
  const plan = calendarEvents(S, { today: TODAY }).filter(e => e.kind === 'plan');
  // Wed 21 trained, so the next plan days are Fri 23 (push), Mon 26 (push), Wed 28 (pull), …
  assert.equal(plan[0].uid, 'p-2026-10-23');
  assert.equal(plan[0].summary, 'Planned: Push');
  assert.equal(plan[0].start, undefined);
  assert.ok(plan.every(e => e.day >= TODAY && e.day <= shiftDay(TODAY, 13)));
  assert.ok(!plan.some(e => e.day === TODAY));
});

test('a weekday with two routines names both', () => {
  const plan = calendarEvents(profile({ week: { 5: ['push', 'pull'] } }), { today: TODAY }).filter(e => e.kind === 'plan');
  assert.equal(plan.find(e => e.day === '2026-10-23').summary, 'Planned: Push + Pull');
});

test('a rest override takes the planned day away', () => {
  const plan = calendarEvents(profile({ dayPlan: { '2026-10-23': 'rest' } }), { today: TODAY }).filter(e => e.kind === 'plan');
  assert.ok(!plan.some(e => e.day === '2026-10-23'));
});

test('habits are one event per day with a tick, done out of the habits that counted that day', () => {
  const h = calendarEvents(profile(), { today: TODAY }).filter(e => e.kind === 'habits');
  assert.deepEqual(h.map(e => [e.day, e.summary]), [['2026-10-19', 'Habits 1/1'], ['2026-10-20', 'Habits 2/2']]);
  assert.equal(h[1].description, '✓ Water\n✓ Read');
});

test('each kind can be switched off', () => {
  const ev = calendarEvents(profile({ calSync: { workouts: false, habits: false, tz: 'UTC' } }), { today: TODAY });
  assert.deepEqual([...new Set(ev.map(e => e.kind))], ['plan']);
  assert.deepEqual(calSyncPrefs({}), { workouts: true, plan: true, habits: true, tz: 'UTC' });
  assert.equal(calSyncPrefs({ reminder: { tz: 'America/Toronto' } }).tz, 'America/Toronto');
});

test('today is the profile’s own date', () => {
  const late = new Date('2026-10-22T02:00:00Z');   // 22:00 on the 21st in Toronto
  assert.equal(todayIn('America/Toronto', late), '2026-10-21');
  assert.equal(todayIn('Not/AZone', late), '2026-10-22');
});

test('the iCalendar feed: timed and all-day events, escaped text, folded lines', () => {
  const ics = toICS(calendarEvents(profile(), { today: TODAY }), { now: at(TODAY, 12) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.match(ics, /UID:w-w1@tarnished\r\nDTSTAMP:20261021T120000Z\r\nDTSTART:20261019T180000Z\r\nDTEND:20261019T190000Z/);
  assert.match(ics, /UID:h-2026-10-20@tarnished\r\nDTSTAMP:\d{8}T\d{6}Z\r\nDTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021\r\nTRANSP:TRANSPARENT/);
  assert.equal(escapeText('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const long = 'SUMMARY:' + 'é'.repeat(60);
  assert.equal(fold(long).split('\r\n ').join(''), long);
});

// ---- Google ----

function fakeGoogle({ failRefresh = false } = {}) {
  const calls = [];
  const events = new Map();      // id -> body
  const calendars = new Set();
  let n = 0;
  const reply = (status, body) => ({ status, json: async () => { if (body === undefined) throw new Error('empty'); return body; } });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body && init.headers?.['Content-Type'] === 'application/json' ? JSON.parse(init.body) : init.body;
    calls.push({ method: init.method || 'GET', path: u.pathname, body });
    if (u.pathname === '/token') {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'authorization_code') return reply(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 3600, scope: 'calendar.app.created' });
      if (failRefresh) return reply(400, { error: 'invalid_grant' });
      return reply(200, { access_token: 'a' + (++n + 1), expires_in: 3600 });
    }
    if (u.pathname === '/revoke') return reply(200);
    if (u.pathname === '/cal/calendars' && init.method === 'POST') { const id = 'cal' + calendars.size; calendars.add(id); return reply(200, { id }); }
    const m = /^\/cal\/calendars\/([^/]+)\/events(?:\/(\w+))?$/.exec(u.pathname);
    if (m) {
      const cal = decodeURIComponent(m[1]);
      if (!calendars.has(cal)) return reply(404, { error: { code: 404 } });
      const id = m[2] || body.id;
      const key = cal + '/' + id;
      if (init.method === 'POST') { if (events.has(key)) return reply(409, {}); events.set(key, body); return reply(200, body); }
      if (init.method === 'PUT') { if (!events.has(key)) return reply(404, {}); events.set(key, body); return reply(200, body); }
      if (init.method === 'DELETE') { if (!events.has(key)) return reply(410, {}); events.delete(key); return reply(204); }
    }
    return reply(500, {});
  };
  return { fetch, calls, events, calendars, writes: () => calls.filter(c => /\/events/.test(c.path)) };
}

function setup(t, opts) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const g = fakeGoogle(opts);
  const google = createGoogleCalendar({
    dataDir, clientId: 'id', clientSecret: 'secret', redirectUri: 'https://gym.example/api/google/callback',
    tokenUrl: 'https://g.test/token', revokeUrl: 'https://g.test/revoke', apiBase: 'https://g.test/cal', fetch: g.fetch, log: { warn() {} },
  });
  return { g, google, dataDir };
}
const withToday = S => ({ ...S, calSync: { ...S.calSync, tz: 'UTC' } });

test('google: the consent link asks for offline access to app-made calendars only', () => {
  const google = createGoogleCalendar({ dataDir: os.tmpdir(), clientId: 'cid', clientSecret: 's', redirectUri: 'https://gym.example/api/google/callback' });
  const u = new URL(google.authUrl('st'));
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.app.created');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('state'), 'st');
  assert.equal(createGoogleCalendar({ dataDir: os.tmpdir() }).enabled, false);
});

test('google: connecting makes the Tarnished calendar; a sync sends each event once', async t => {
  const { g, google, dataDir } = setup(t);
  const st = await google.connect('u1', 'code', 'America/Toronto');
  assert.equal(st.connected, true);
  assert.deepEqual([...g.calendars], ['cal0']);
  assert.equal(g.calls.find(c => c.path === '/cal/calendars').body.timeZone, 'America/Toronto');
  assert.equal(fs.statSync(path.join(dataDir, 'google', 'u1.json')).mode & 0o777, 0o600);

  const S = withToday(profile());
  const first = await google.sync('u1', S, { today: TODAY });
  assert.ok(first.sent > 0);
  assert.equal(g.events.size, first.sent);
  const w = g.events.get('cal0/' + eventId('w-w1'));
  assert.equal(w.summary, 'Push');
  assert.equal(w.colorId, '2');

  g.calls.length = 0;
  const second = await google.sync('u1', S, { today: TODAY });
  assert.equal(second.sent, 0);
  assert.equal(g.writes().length, 0, 'nothing changed, nothing sent');
});

test('google: an edit is an update, a removal a delete, a kind switched off goes', async t => {
  const { g, google } = setup(t);
  await google.connect('u1', 'code', 'UTC');
  const S = withToday(profile());
  // Ticks relative to the real today, so they sit inside the habit window whatever the date.
  const today = todayIn('UTC');
  S.habitLog = { [today + ':water']: { done: 1, _ts: 1 } };
  S.habits.water.at = Date.now() - 5 * 86400000;
  S.workouts = [{ id: 'wt', d: today, name: 'Push', start: Date.now() - 7200000, end: Date.now() - 3600000, entries: [] }];
  await google.sync('u1', S);
  const hid = 'cal0/' + eventId('h-' + today);
  assert.ok(g.events.has(hid));

  g.calls.length = 0;
  S.workouts[0].name = 'Push (heavy)';
  await google.sync('u1', S);
  assert.deepEqual(g.writes().map(c => c.method), ['PUT']);
  assert.equal(g.events.get('cal0/' + eventId('w-wt')).summary, 'Push (heavy)');

  S.habitLog[today + ':water'] = { _ts: 2 };      // unticked
  await google.sync('u1', S);
  assert.ok(!g.events.has(hid));

  S.habitLog[today + ':water'] = { done: 1, _ts: 3 };
  await google.sync('u1', S);
  assert.ok(g.events.has(hid), 'ticked again: back');
  S.calSync = { tz: 'UTC', habits: false };
  await google.sync('u1', S);
  assert.ok(!g.events.has(hid), 'habits switched off: gone');
  assert.ok(g.events.has('cal0/' + eventId('w-wt')), 'the workout stays');
});

test('google: an event that only aged out of the window stays in the calendar', async t => {
  const { g, google, dataDir } = setup(t);
  await google.connect('u1', 'code', 'UTC');
  const today = todayIn('UTC');
  const S = withToday(profile({ habits: {}, habitLog: {}, week: {} }));
  S.workouts = [{ id: 'w90', d: shiftDay(today, -WORKOUT_DAYS), name: 'Old', start: Date.now() - WORKOUT_DAYS * 86400000, end: Date.now() - WORKOUT_DAYS * 86400000 + 3600000, entries: [] }];
  await google.sync('u1', S);
  assert.ok(g.events.has('cal0/' + eventId('w-w90')));
  // a day later the workout is out of the window: pretend by moving its day back in the record
  const f = path.join(dataDir, 'google', 'u1.json');
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  rec.synced['w-w90'].d = shiftDay(today, -WORKOUT_DAYS - 1);
  fs.writeFileSync(f, JSON.stringify(rec));
  S.workouts = [];
  await google.sync('u1', S);
  assert.ok(g.events.has('cal0/' + eventId('w-w90')), 'not deleted');
});

test('google: an id Google still holds is updated, and a deleted calendar is made again', async t => {
  const { g, google, dataDir } = setup(t);
  await google.connect('u1', 'code', 'UTC');
  const S = withToday(profile({ habits: {}, habitLog: {}, week: {} }));
  const today = todayIn('UTC');
  S.workouts = [{ id: 'x', d: today, name: 'Legs', start: Date.now() - 3600000, end: Date.now(), entries: [] }];
  await google.sync('u1', S);
  // the local record lost: the next sync meets a 409 and updates
  fs.writeFileSync(path.join(dataDir, 'google', 'u1.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(dataDir, 'google', 'u1.json'), 'utf8')), synced: {} }));
  g.calls.length = 0;
  await google.sync('u1', S);
  assert.deepEqual(g.writes().map(c => c.method), ['POST', 'PUT']);

  // the user deleted the whole calendar in Google
  g.calendars.clear();
  S.workouts[0].name = 'Legs 2';
  await google.sync('u1', S);
  assert.equal(g.calendars.size, 1, 'a calendar exists again');
  const cal = [...g.calendars][0];
  assert.equal(g.events.get(cal + '/' + eventId('w-x')).summary, 'Legs 2');
});

test('google: access taken back in Google shows as revoked, and disconnect forgets it', async t => {
  const { google, dataDir } = setup(t, { failRefresh: true });
  await google.connect('u1', 'code', 'UTC');
  const f = path.join(dataDir, 'google', 'u1.json');
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  rec.accessExp = 0;
  fs.writeFileSync(f, JSON.stringify(rec));
  await assert.rejects(google.sync('u1', withToday(profile())), /no longer lets Tarnished in/);
  const st = google.status('u1');
  assert.equal(st.connected, false);
  assert.equal(st.revoked, true);
  await google.disconnect('u1');
  assert.equal(google.status('u1').connected, false);
  assert.ok(!fs.existsSync(f));
});

test('google: an all-day event ends the next day and does not block the calendar', () => {
  const e = googleEvent({ uid: 'p-2026-10-31', kind: 'plan', day: '2026-10-31', summary: 'Planned: Push', description: '' });
  assert.deepEqual(e.start, { date: '2026-10-31' });
  assert.deepEqual(e.end, { date: '2026-11-01' });
  assert.equal(e.transparency, 'transparent');
  assert.match(e.id, /^[0-9a-v]{5,1024}$/);
});
