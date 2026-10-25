#!/usr/bin/env node
// Fills a demo profile on a running Tarnished server with about twelve weeks of example data, so
// every screen has something to show while you review it: the starter Push/Pull/Legs plan with
// its logged sessions, effort ratings, body weight and measurements (frontend/src/lib/demoSeed.js,
// the generator behind the demo build), plus five daily habits with believable streaks and two
// day notes.
//
//   node scripts/seed-demo.mjs                        # the "Demo" profile, server at http://127.0.0.1:3000
//   node scripts/seed-demo.mjs --profile soso         # Soso's test profile
//   node scripts/seed-demo.mjs http://127.0.0.1:3000 --profile soso
//   node scripts/seed-demo.mjs --into "Your name"      # a profile you made yourself in the app
//
// --profile makes the profile if it is missing and signs in with its name and password (below);
// the server needs PASSWORD_LOGIN=1, which works over plain http on a LAN, where passkeys do not.
// --into fills a profile that already exists, whatever it signs in with: it finds the profile in
// the local data folder (DATA_DIR, default ./data) and signs the request with that folder's
// session key, so it only works on the machine running the server. Either way, running it again
// replaces the profile's data with fresh example data.
//
// For local review only. Never point this at a server other people use.
import { buildDemoState } from '../frontend/src/lib/demoSeed.js'
import { isoOf } from '../frontend/src/lib/format.js'
import { withHabit, withTick } from '../frontend/src/lib/habits.js'
import { withDayNote } from '../frontend/src/lib/day-notes.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The test profiles. Their passwords stay out of the repository: they are read from
// scripts/seed-accounts.local.json (gitignored), { "demo": "…", "soso": "…" }, or for any profile
// from SEED_PASSWORD. Test values for a local dev server only.
export const PROFILES = {
  demo: { name: 'Demo' },
  soso: { name: 'Soso' },
}
const LOCAL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-accounts.local.json')
const passwordFor = key => {
  if (process.env.SEED_PASSWORD) return process.env.SEED_PASSWORD
  try { const p = JSON.parse(fs.readFileSync(LOCAL, 'utf8'))[key]; if (p) return p } catch { /* no local file */ }
  throw new Error(`no password for "${key}": put it in ${LOCAL} as { "${key}": "…" }, or set SEED_PASSWORD`)
}

const args = process.argv.slice(2)
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
const INTO = opt('--into')
const pick = opt('--profile') || 'demo'
const PROFILE = INTO ? null : PROFILES[pick]
if (!INTO && !PROFILE) throw new Error(`no profile "${pick}": use one of ${Object.keys(PROFILES).join(', ')}`)
const API = (args.find(a => /^https?:\/\//.test(a)) || 'http://127.0.0.1:3000').replace(/\/+$/, '')

const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d }
const at = (n, h = 8) => { const d = day(n); d.setHours(h, 0, 0, 0); return d.getTime() }

// A small seeded random, so every run makes the same believable month.
let seed = 11
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280

function habitsFor(S) {
  const plan = [
    // name, added (days ago), share of days ticked, ticked today
    ['Drink 2 L of water', 84, 0.9, true],
    ['Sleep 8 hours', 84, 0.65, false],
    ['10,000 steps', 70, 0.6, true],
    ['Stretch for 10 minutes', 56, 0.45, false],
    ['Read for 20 minutes', 21, 0.7, true],
  ]
  let habits = {}, log = {}
  const ids = []
  for (const [name, added] of plan) {
    const r = withHabit(habits, name, at(added, 7))
    habits = r.map
    ids.push(r.id)
  }
  plan.forEach(([, added, share, today], i) => {
    for (let n = added; n >= 1; n--) if (rnd() < share) log = withTick(log, isoOf(day(n)), ids[i], true, at(n, 21))
    // the last few days in a row, so the streaks have something to count
    for (let n = 1; n <= (i === 0 ? 6 : 2); n++) log = withTick(log, isoOf(day(n)), ids[i], true, at(n, 21))
    if (today) log = withTick(log, isoOf(day(0)), ids[i], true, at(0, 9))
  })
  S.habits = habits
  S.habitLog = log
}

function dayNotesFor(S) {
  // Two days off with a reason, on days nothing was logged.
  const trained = new Set(S.workouts.map(w => w.d))
  const free = [...Array(60).keys()].map(n => isoOf(day(n + 3))).filter(d => !trained.has(d))
  let notes = {}
  if (free[4]) notes = withDayNote(notes, free[4], { tag: 'sick', text: 'Head cold' }, at(7, 12))
  if (free[15]) notes = withDayNote(notes, free[15], { tag: 'travel', text: 'Weekend away' }, at(30, 12))
  S.dayNotes = notes
}

async function call(path, init = {}, cookie) {
  const r = await fetch(API + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  })
  const body = await r.json().catch(() => ({}))
  return { status: r.status, body, cookie: (r.headers.get('set-cookie') || '').split(';')[0] }
}

async function signIn() {
  const cfg = await call('/api/config')
  if (cfg.status !== 200) throw new Error(`no Tarnished server at ${API} (HTTP ${cfg.status})`)
  if (!cfg.body.password_login) throw new Error('the server has password sign-in off: start it with PASSWORD_LOGIN=1')
  const creds = JSON.stringify({ name: PROFILE.name, password: passwordFor(pick) })
  const made = await call('/api/register/password', { method: 'POST', body: creds })
  if (made.status === 200) return { cookie: made.cookie, created: true }
  if (made.body.code !== 'name-taken') throw new Error(`could not make the demo profile: ${made.body.error || made.status}`)
  const back = await call('/api/login/password', { method: 'POST', body: creds })
  if (back.status !== 200) throw new Error(`could not sign in to the demo profile: ${back.body.error || back.status}`)
  return { cookie: back.cookie, created: false }
}

// A session for an existing profile, made the way the server makes one (api/server.js makeSession:
// `uid:expiry:version`, HMAC-SHA256 with DATA_DIR/secret), sent as a bearer token.
function sessionFor(name) {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
  const db = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'))
  const want = name.trim().toLowerCase()
  const user = db.users.find(u => String(u.name || '').trim().toLowerCase() === want)
  if (!user) throw new Error(`no profile called "${name}" in ${dir}/db.json: make it in the app first`)
  const secret = fs.readFileSync(path.join(dir, 'secret'), 'utf8').trim()
  const payload = `${user.id}:${Date.now() + 600000}:${user.sv || 0}`
  return { name: user.name, auth: 'Bearer ' + payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url') }
}

const S = buildDemoState()
habitsFor(S)
dayNotesFor(S)
S.calSync = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
S._ts = Date.now()

const target = INTO ? sessionFor(INTO) : null
const { cookie, created } = INTO ? { cookie: null, created: false } : await signIn()
const put = await call('/api/data', { method: 'PUT', body: JSON.stringify({ state: S }), headers: target ? { Authorization: target.auth } : {} }, cookie)
if (put.status !== 200) throw new Error(`the server refused the data: ${put.body.error || put.status}`)
console.log(`${created ? 'Made' : 'Filled'} the "${target ? target.name : PROFILE.name}" profile: ${S.workouts.length} workouts, ` +
  `${S.bodyweight.length} weigh-ins, ${Object.keys(S.habits).length} habits, ${Object.keys(S.habitLog).length} ticks.`)
