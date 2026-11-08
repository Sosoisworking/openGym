// Spotify on the workout screen (Settings → Music, components/MusicStrip.jsx): what is playing,
// with previous, play/pause and next.
//
// The phone talks to Spotify itself: Authorization Code with PKCE, no client secret and no
// server in the middle. It works on mobile data with the home server out of reach, and the
// sign-in never leaves this browser. Each person brings their own Spotify app (a Client ID from
// developer.spotify.com), since Spotify only lets an app's owner and a handful of people they
// name use it before Spotify reviews it. The controls need Spotify Premium; reading what plays
// does not.
//
// Device-local, not part of S. S is the training log that syncs and goes into a backup; a
// Spotify sign-in is a fact about this browser, so it sits in its own localStorage entry with the
// Client ID, the account's name and the two strip choices.
import { create } from 'zustand'
import { appBase } from './app-base.js'

const KEY = 'tarnished_spotify_v1'
const PENDING = 'tarnished_spotify_pending'
export const ACCOUNTS = 'https://accounts.spotify.com'
export const API = 'https://api.spotify.com/v1'
export const SCOPES = 'user-read-playback-state user-modify-playback-state'
export const DASHBOARD = 'https://developer.spotify.com/dashboard'
export const POLL_MS = 5000
// What is saved; everything else in the store (`now`, `busy`, `notice`) lasts as long as the page.
const SAVED = ['clientId', 'access', 'refresh', 'exp', 'name', 'lost', 'show', 'when']
const DEFAULTS = { clientId: '', access: null, refresh: null, exp: 0, name: '', lost: false, show: true, when: 'workout' }

const storage = () => { try { return globalThis.localStorage || null } catch { return null } }
const readJson = key => { try { return JSON.parse(storage()?.getItem(key) || 'null') } catch { return null } }
const writeJson = (key, v) => { try { v == null ? storage()?.removeItem(key) : storage()?.setItem(key, JSON.stringify(v)) } catch { /* private mode: lasts for this page */ } }

function loadSaved() {
  const s = readJson(KEY)
  const out = { ...DEFAULTS }
  if (s && typeof s === 'object') for (const k of SAVED) if (k in s) out[k] = s[k]
  if (out.when !== 'rest') out.when = 'workout'
  out.show = out.show !== false
  return out
}

export const useSpotify = create(() => ({ ...loadSaved(), now: null, busy: false, notice: null }))

function save(patch) {
  useSpotify.setState(patch)
  const s = useSpotify.getState()
  writeJson(KEY, Object.fromEntries(SAVED.map(k => [k, s[k]])))
}

/** Signed in: a refresh token on this device. */
export const isConnected = s => !!s?.refresh

/** A Spotify Client ID: 32 hex characters. */
export const isClientId = s => /^[0-9a-f]{32}$/i.test(String(s || '').trim())

/**
 * The address Spotify sends the sign-in back to: this app's own root, a subpath deployment
 * included. The root rather than a path of its own, because nginx sends any path that is not a
 * file back to the root (web/nginx.conf.template) and a path would not survive that.
 */
export const redirectUri = (loc = location) => loc.origin + appBase(loc)

/** The browser can do PKCE: a secure context with SubtleCrypto (HTTPS, or localhost). */
export const canConnect = () => !!globalThis.crypto?.subtle && globalThis.isSecureContext !== false

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function randomString(n = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  // RFC 7636's unreserved characters, one per byte.
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  return Array.from(bytes, b => abc[b % abc.length]).join('')
}
export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(digest))
}

export function authorizeUrl({ clientId, redirect, challenge, state }) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, scope: SCOPES, redirect_uri: redirect,
    code_challenge_method: 'S256', code_challenge: challenge, state,
  })
  return ACCOUNTS + '/authorize?' + q
}

/** Off to Spotify's sign-in, in this window (an installed web app keeps its storage that way). */
export async function beginConnect(clientId, loc = location) {
  const id = String(clientId || '').trim()
  if (!isClientId(id)) throw new Error('That does not look like a Client ID: it is 32 letters and numbers.')
  if (!canConnect()) throw new Error('Spotify needs this page on HTTPS.')
  const verifier = randomString(64)
  const state = randomString(16)
  const redirect = redirectUri(loc)
  writeJson(PENDING, { verifier, state, clientId: id, redirect, at: Date.now() })
  save({ clientId: id })
  loc.assign(authorizeUrl({ clientId: id, redirect, challenge: await challengeFor(verifier), state }))
}

/**
 * The way back from Spotify: `?code=…&state=…` (or `?error=…&state=…`) on the app's root. Read
 * once at start-up, before the router looks at the address, and taken off it so a reload or a
 * bookmark does not carry the code around; the app then opens on Settings → Music, where the
 * outcome shows. Returns what to finish with, or null when the address has nothing of ours.
 */
export function takeCallback(loc = location, hist = history) {
  const q = new URLSearchParams(loc.search || '')
  const state = q.get('state'), code = q.get('code'), error = q.get('error')
  if (!state || !(code || error)) return null
  const pending = readJson(PENDING)
  writeJson(PENDING, null)
  for (const k of ['code', 'state', 'error', 'error_description']) q.delete(k)
  const rest = q.toString()
  try { hist.replaceState(null, '', loc.pathname + (rest ? '?' + rest : '') + '#/settings/music') } catch { /* the outcome still shows */ }
  // Back in a browser that did not start it (an iPhone opening the link in Safari rather than the
  // installed app, which keeps its own storage), or a second trip back with the same address.
  if (!pending || pending.state !== state) return { notice: 'lost' }
  if (error || !code) return { notice: error === 'access_denied' ? 'denied' : 'failed' }
  return { code, pending }
}

async function tokenRequest(params) {
  let res
  try {
    res = await fetch(ACCOUNTS + '/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params),
    })
  } catch { throw Object.assign(new Error('offline'), { offline: true }) }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error_description || body.error || 'token ' + res.status), { status: res.status, code: body.error })
  return body
}

const tokensFrom = (r, keep) => ({
  access: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000,
  // Spotify may hand out a new refresh token with each refresh; the old one keeps working until
  // it does, so keep it when none came.
  refresh: r.refresh_token || keep,
})

/** Finishes what takeCallback found: the code for tokens, then the account's name. */
export async function finishConnect(cb) {
  if (!cb) return
  if (cb.notice) { useSpotify.setState({ notice: cb.notice }); return }
  useSpotify.setState({ busy: true })
  try {
    const r = await tokenRequest({
      grant_type: 'authorization_code', code: cb.code, redirect_uri: cb.pending.redirect,
      client_id: cb.pending.clientId, code_verifier: cb.pending.verifier,
    })
    save({ clientId: cb.pending.clientId, ...tokensFrom(r, null), lost: false, name: '' })
    const res = await spotifyFetch('/me').catch(() => null)
    // An app still in development mode lets in only the accounts named in its dashboard: Spotify
    // gives the tokens all the same and then refuses every call.
    if (res?.status === 403) {
      save({ access: null, refresh: null, exp: 0 })
      useSpotify.setState({ notice: 'notallowed' })
      return
    }
    const me = res?.ok ? await res.json().catch(() => null) : null
    if (me) save({ name: me.display_name || me.id || '' })
    useSpotify.setState({ notice: 'connected', now: null })
  } catch (e) {
    useSpotify.setState({ notice: e.offline ? 'offline' : 'failed' })
  } finally {
    useSpotify.setState({ busy: false })
  }
}

let refreshing = null
/** A live access token, refreshed when it is within a minute of running out. */
export async function accessToken({ force = false } = {}) {
  const s = useSpotify.getState()
  if (!s.refresh) throw Object.assign(new Error('signed out'), { signedOut: true })
  if (!force && s.access && s.exp - 60_000 > Date.now()) return s.access
  refreshing ||= tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh, client_id: s.clientId })
    .then(r => { save(tokensFrom(r, s.refresh)); return r.access_token })
    .catch(e => {
      // Spotify ended the sign-in (the access was removed in the account, the app was deleted):
      // the strip says so and Settings offers to connect again, with the Client ID kept.
      if (e.status === 400 || e.status === 401) {
        save({ access: null, refresh: null, exp: 0, lost: true })
        throw Object.assign(new Error('signed out'), { signedOut: true })
      }
      throw e
    })
    .finally(() => { refreshing = null })
  return refreshing
}

/** A Web API call with the token, and one retry with a fresh token if Spotify says it expired. */
export async function spotifyFetch(path, { method = 'GET', body } = {}) {
  const call = token => fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let res
  try {
    res = await call(await accessToken())
    if (res.status === 401) res = await call(await accessToken({ force: true }))
  } catch (e) {
    if (e.signedOut || e.offline) throw e
    throw Object.assign(new Error('offline'), { offline: true })
  }
  return res
}

// The smallest picture that still fills `px` device pixels, else the largest there is.
export function pickImage(images, px = 132) {
  const list = (images || []).filter(i => i?.url).sort((a, b) => (a.width || 0) - (b.width || 0))
  return (list.find(i => (i.width || 0) >= px) || list.at(-1))?.url || null
}

/**
 * GET /me/player, read into what the strip shows: `idle` when nothing plays (204, or no item,
 * an advert say), else `playing` or `paused` with the track or episode.
 */
export function playbackFrom(p) {
  const it = p?.item
  if (!it) return { kind: 'idle' }
  return {
    kind: p.is_playing ? 'playing' : 'paused',
    id: it.uri || it.id || it.name,
    name: it.name || '',
    by: (it.artists || []).map(a => a?.name).filter(Boolean).join(', ') || it.show?.name || '',
    image: pickImage(it.album?.images || it.images || it.show?.images),
    url: it.external_urls?.spotify || null,
  }
}

/** What is playing, into the store. Throws { offline } or { signedOut }; { retryAfter } on 429. */
export async function nowPlaying() {
  const res = await spotifyFetch('/me/player?additional_types=episode')
  if (res.status === 429) throw Object.assign(new Error('slow down'), { retryAfter: (Number(res.headers.get('Retry-After')) || 30) * 1000 })
  if (res.status === 204) return { kind: 'idle' }
  if (!res.ok) throw Object.assign(new Error('player ' + res.status), { status: res.status })
  return playbackFrom(await res.json().catch(() => null))
}

const CONTROLS = {
  play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'],
  next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'],
}
/**
 * One of the strip's buttons. Resolves when Spotify took it; throws with `reason`: 'premium'
 * (the account has no Premium), 'nodevice' (nothing is open to play on) or 'failed'.
 */
export async function control(action) {
  const [method, path] = CONTROLS[action] || []
  if (!method) throw new Error('unknown control ' + action)
  const res = await spotifyFetch(path, { method })
  if (res.ok) return
  const body = await res.json().catch(() => ({}))
  const why = body?.error?.reason
  throw Object.assign(new Error(body?.error?.message || 'control ' + res.status), {
    reason: why === 'PREMIUM_REQUIRED' ? 'premium' : (why === 'NO_ACTIVE_DEVICE' || res.status === 404) ? 'nodevice' : 'failed',
  })
}

export const setStripPrefs = patch => save(patch)
export const clearNotice = () => useSpotify.setState({ notice: null })

/** Forgets the sign-in and the Client ID on this device. */
export function disconnect() {
  writeJson(KEY, null)
  writeJson(PENDING, null)
  useSpotify.setState({ ...DEFAULTS, now: null, busy: false, notice: null })
}

// Test seam: the saved entry read again, as on a fresh page.
export function _reload() { useSpotify.setState({ ...loadSaved(), now: null, busy: false, notice: null }); refreshing = null }
