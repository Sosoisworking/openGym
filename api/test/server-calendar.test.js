/* The calendar routes through the real server.js in a child: the subscription link (made, read
   without a session, replaced, turned off) and the Google Calendar round trip (consent link,
   callback, first sync, a save followed by a sync, disconnect) against a fake Google on a port of
   its own. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const USERS = [{ id: 'u_cal', name: 'Cal', created: new Date().toISOString() }, { id: 'u_other', name: 'Other', created: new Date().toISOString() }];
const mint = uid => { const p = `${uid}:${Date.now() + 86400000}:0`; return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url'); };
const auth = uid => ({ Authorization: 'Bearer ' + mint(uid), 'Content-Type': 'application/json' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);

function profile(name = 'Push') {
  const now = Date.now();
  return { unit: 'kg', routines: [], week: {}, dayPlan: {}, calSync: { tz: 'UTC' },
    workouts: [{ id: 'w1', d: todayUTC(), name, start: now - 3600000, end: now - 600000, entries: [] }] };
}

async function fakeGoogle(t) {
  const g = { events: new Map(), calendars: 0, revoked: [] };
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', d => raw += d);
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/token') {
        const p = new URLSearchParams(raw);
        if (p.get('grant_type') === 'authorization_code' && p.get('code') === 'good') return send(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600 });
        if (p.get('grant_type') === 'refresh_token') return send(200, { access_token: 'a2', expires_in: 3600 });
        return send(400, { error: 'invalid_grant' });
      }
      if (u.pathname === '/revoke') { g.revoked.push(new URLSearchParams(raw).get('token')); return send(200); }
      if (req.headers.authorization?.startsWith('Bearer ') !== true) return send(401, {});
      if (u.pathname === '/cal/calendars' && req.method === 'POST') return send(200, { id: 'cal' + g.calendars++ });
      const m = /^\/cal\/calendars\/[^/]+\/events(?:\/(\w+))?$/.exec(u.pathname);
      if (m) {
        const body = raw ? JSON.parse(raw) : null;
        const id = m[1] || body?.id;
        if (req.method === 'POST') { if (g.events.has(id)) return send(409, {}); g.events.set(id, body); return send(200, body); }
        if (req.method === 'PUT') { if (!g.events.has(id)) return send(404, {}); g.events.set(id, body); return send(200, body); }
        if (req.method === 'DELETE') { g.events.delete(id); return send(204); }
      }
      send(500, {});
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  g.base = `http://127.0.0.1:${srv.address().port}`;
  return g;
}

async function startServer(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-cal-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users: USERS, creds: [], subs: [], invites: [] }));
  fs.writeFileSync(path.join(dataDir, 'state-u_cal.json'), JSON.stringify(profile()));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'https://gym.example', RP_ID: 'gym.example', GOOGLE_SYNC_DELAY_MS: '50', ...env },
  });
  const h = { log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  return h;
}

test('the subscription link: made, read without a session, replaced, turned off', async t => {
  const h = await startServer(t);
  assert.deepEqual(await (await fetch(h.api + '/api/calendar/feed', { headers: auth('u_cal') })).json(), { url: null });
  const { url } = await (await fetch(h.api + '/api/calendar/feed', { method: 'POST', headers: auth('u_cal') })).json();
  assert.match(url, /^https:\/\/gym\.example\/api\/calendar\/[A-Za-z0-9_-]{32}\.ics$/);
  const feedPath = new URL(url).pathname;

  const ics = await fetch(h.api + feedPath);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /^text\/calendar/);
  const text = await ics.text();
  assert.match(text, /BEGIN:VCALENDAR/);
  assert.match(text, /SUMMARY:Push/);

  const again = await (await fetch(h.api + '/api/calendar/feed', { method: 'POST', headers: auth('u_cal') })).json();
  assert.notEqual(again.url, url);
  assert.equal((await fetch(h.api + feedPath)).status, 404, 'the old link stops working');
  assert.equal((await fetch(h.api + new URL(again.url).pathname)).status, 200);

  await fetch(h.api + '/api/calendar/feed', { method: 'DELETE', headers: auth('u_cal') });
  assert.equal((await fetch(h.api + new URL(again.url).pathname)).status, 404);
  assert.equal((await fetch(h.api + '/api/calendar/' + 'x'.repeat(40) + '.ics')).status, 404);
});

test('google: off without a client, and every route but status says so', async t => {
  const h = await startServer(t);
  assert.deepEqual(await (await fetch(h.api + '/api/google/status', { headers: auth('u_cal') })).json(), { enabled: false, connected: false });
  assert.equal((await fetch(h.api + '/api/google/connect', { method: 'POST', headers: auth('u_cal'), body: '{}' })).status, 404);
  const cfg = await (await fetch(h.api + '/api/config', { headers: auth('u_cal') })).json();
  assert.equal(cfg.google_calendar, undefined);
});

test('google: consent, callback, first sync, a save that syncs, disconnect', async t => {
  const g = await fakeGoogle(t);
  const h = await startServer(t, {
    GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret',
    GOOGLE_TOKEN_URL: g.base + '/token', GOOGLE_REVOKE_URL: g.base + '/revoke', GOOGLE_API_BASE: g.base + '/cal',
  });
  const cfg = await (await fetch(h.api + '/api/config', { headers: auth('u_cal') })).json();
  assert.equal(cfg.google_calendar, true);

  const { url } = await (await fetch(h.api + '/api/google/connect', { method: 'POST', headers: auth('u_cal'), body: JSON.stringify({ tz: 'America/Toronto' }) })).json();
  const consent = new URL(url);
  assert.equal(consent.searchParams.get('redirect_uri'), 'https://gym.example/api/google/callback');
  const state = consent.searchParams.get('state');

  // a forged state, and another signed-in profile finishing someone else's flow, both fail
  const forged = await fetch(h.api + '/api/google/callback?code=good&state=' + encodeURIComponent(state.slice(0, -2) + 'xx'), { redirect: 'manual' });
  assert.match(forged.headers.get('location'), /google=failed$/);
  const other = await fetch(h.api + '/api/google/callback?code=good&state=' + encodeURIComponent(state), { redirect: 'manual', headers: { Authorization: 'Bearer ' + mint('u_other') } });
  assert.match(other.headers.get('location'), /google=failed$/);

  const back = await fetch(h.api + '/api/google/callback?code=good&state=' + encodeURIComponent(state), { redirect: 'manual' });
  assert.equal(back.status, 302);
  assert.equal(back.headers.get('location'), 'https://gym.example/#/settings/calendar?google=connected');

  for (let i = 0; i < 100 && !g.events.size; i++) await sleep(20);
  assert.equal(g.events.size, 1, h.log);
  assert.equal([...g.events.values()][0].summary, 'Push');
  let st = await (await fetch(h.api + '/api/google/status', { headers: auth('u_cal') })).json();
  assert.equal(st.connected, true);
  assert.equal(st.events, 1);

  // a save, and the calendar follows a moment later
  const put = await fetch(h.api + '/api/data', { method: 'PUT', headers: auth('u_cal'), body: JSON.stringify({ state: profile('Push (heavy)') }) });
  assert.equal(put.status, 200);
  for (let i = 0; i < 100 && [...g.events.values()][0].summary !== 'Push (heavy)'; i++) await sleep(20);
  assert.equal([...g.events.values()][0].summary, 'Push (heavy)');

  const now = await (await fetch(h.api + '/api/google/sync', { method: 'POST', headers: auth('u_cal') })).json();
  assert.equal(now.ok, true);
  assert.equal(now.sent, 0);

  await fetch(h.api + '/api/google/disconnect', { method: 'POST', headers: auth('u_cal') });
  assert.deepEqual(g.revoked, ['r']);
  st = await (await fetch(h.api + '/api/google/status', { headers: auth('u_cal') })).json();
  assert.equal(st.connected, false);
  assert.equal((await fetch(h.api + '/api/google/sync', { method: 'POST', headers: auth('u_cal') })).status, 409);
});
