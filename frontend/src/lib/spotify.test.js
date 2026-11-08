// @vitest-environment happy-dom
// Spotify (Settings → Music): the PKCE sign-in and its way back, the tokens kept fresh on this
// device, and what GET /me/player and the buttons are read as.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  useSpotify, isConnected, isClientId, redirectUri, authorizeUrl, challengeFor, randomString, beginConnect,
  takeCallback, finishConnect, accessToken, spotifyFetch, playbackFrom, pickImage, nowPlaying, control, disconnect, _reload,
  SCOPES,
} from './spotify.js'

const CID = '0123456789abcdef0123456789abcdef'
const KEY = 'tarnished_spotify_v1'
const PENDING = 'tarnished_spotify_pending'
const json = (status, body, headers = {}) => new Response(body == null ? null : JSON.stringify(body), { status, headers })

let calls
const route = handlers => {
  calls = []
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? String(opts.body) : null, auth: opts.headers?.Authorization || null })
    for (const [match, reply] of handlers) if (String(url).includes(match)) return typeof reply === 'function' ? reply(url, opts) : reply.clone()
    throw new TypeError('Failed to fetch')
  })
}
const signedIn = (patch = {}) => useSpotify.setState({ clientId: CID, access: 'A1', refresh: 'R1', exp: Date.now() + 3600_000, lost: false, ...patch })

beforeEach(() => { localStorage.clear(); _reload() })
afterEach(() => { delete globalThis.fetch })

describe('setting up', () => {
  it('knows a Client ID when it sees one', () => {
    expect(isClientId(CID)).toBe(true)
    expect(isClientId('  ' + CID.toUpperCase() + ' ')).toBe(true)
    expect(isClientId(CID.slice(1))).toBe(false)
    expect(isClientId(CID.slice(1) + 'g')).toBe(false)
    expect(isClientId('')).toBe(false)
  })

  it('comes back to the app’s own root, a subpath deployment included', () => {
    expect(redirectUri({ origin: 'https://sosos-pantheon.local:5173', pathname: '/' })).toBe('https://sosos-pantheon.local:5173/')
    expect(redirectUri({ origin: 'https://gym.example', pathname: '/myGym/index.html' })).toBe('https://gym.example/myGym/')
  })

  it('asks for the two playback scopes with an S256 challenge', async () => {
    const verifier = randomString(64)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{64}$/)
    const challenge = await challengeFor(verifier)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
    const u = new URL(authorizeUrl({ clientId: CID, redirect: 'https://x.local/', challenge, state: 'st' }))
    expect(u.origin + u.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: 'code', client_id: CID, scope: SCOPES, redirect_uri: 'https://x.local/',
      code_challenge_method: 'S256', code_challenge: challenge, state: 'st',
    })
    expect(SCOPES).toBe('user-read-playback-state user-modify-playback-state')
  })

  it('remembers the verifier and goes to Spotify in this window', async () => {
    const loc = { origin: 'https://x.local', pathname: '/', assign: vi.fn() }
    await beginConnect(' ' + CID + ' ', loc)
    const pending = JSON.parse(localStorage.getItem(PENDING))
    expect(pending).toMatchObject({ clientId: CID, redirect: 'https://x.local/' })
    const u = new URL(loc.assign.mock.calls[0][0])
    expect(u.searchParams.get('state')).toBe(pending.state)
    expect(u.searchParams.get('code_challenge')).toBe(await challengeFor(pending.verifier))
    expect(useSpotify.getState().clientId).toBe(CID)
    await expect(beginConnect('nope', loc)).rejects.toThrow(/Client ID/)
  })
})

describe('the way back', () => {
  const back = (search, pathname = '/') => ({ loc: { search, pathname, origin: 'https://x.local' }, hist: { replaceState: vi.fn() } })
  const pend = state => localStorage.setItem(PENDING, JSON.stringify({ verifier: 'v', state, clientId: CID, redirect: 'https://x.local/' }))

  it('takes the code off the address and opens on Settings → Music', () => {
    pend('s1')
    const { loc, hist } = back('?code=C1&state=s1')
    expect(takeCallback(loc, hist)).toEqual({ code: 'C1', pending: { verifier: 'v', state: 's1', clientId: CID, redirect: 'https://x.local/' } })
    expect(hist.replaceState).toHaveBeenCalledWith(null, '', '/#/settings/music')
    expect(localStorage.getItem(PENDING)).toBe(null)
  })

  it('keeps any other query and the subpath', () => {
    pend('s1')
    const { loc, hist } = back('?x=1&code=C1&state=s1', '/gym/')
    takeCallback(loc, hist)
    expect(hist.replaceState).toHaveBeenCalledWith(null, '', '/gym/?x=1#/settings/music')
  })

  it('a refusal, a stranger’s state and a plain address', () => {
    pend('s1')
    expect(takeCallback(...Object.values(back('?error=access_denied&state=s1')))).toEqual({ notice: 'denied' })
    pend('s1')
    expect(takeCallback(...Object.values(back('?code=C1&state=other')))).toEqual({ notice: 'lost' })
    // Back in a browser that never started it: nothing pending there.
    expect(takeCallback(...Object.values(back('?code=C1&state=s1')))).toEqual({ notice: 'lost' })
    const { loc, hist } = back('?link=abc')
    expect(takeCallback(loc, hist)).toBe(null)
    expect(hist.replaceState).not.toHaveBeenCalled()
  })

  it('trades the code for tokens and keeps the account’s name', async () => {
    route([
      ['/api/token', json(200, { access_token: 'A1', refresh_token: 'R1', expires_in: 3600 })],
      ['/v1/me', json(200, { display_name: 'Soso', id: 'soso1' })],
    ])
    await finishConnect({ code: 'C1', pending: { verifier: 'v', state: 's', clientId: CID, redirect: 'https://x.local/' } })
    const body = Object.fromEntries(new URLSearchParams(calls[0].body))
    expect(body).toEqual({ grant_type: 'authorization_code', code: 'C1', redirect_uri: 'https://x.local/', client_id: CID, code_verifier: 'v' })
    expect(calls[1].auth).toBe('Bearer A1')
    const s = useSpotify.getState()
    expect(isConnected(s)).toBe(true)
    expect(s).toMatchObject({ name: 'Soso', notice: 'connected', busy: false })
    // saved for the next visit, the page-only fields not
    _reload()
    expect(useSpotify.getState()).toMatchObject({ clientId: CID, refresh: 'R1', name: 'Soso', show: true, when: 'workout', notice: null })
  })

  it('an account the app does not let in yet is not connected', async () => {
    route([
      ['/api/token', json(200, { access_token: 'A1', refresh_token: 'R1', expires_in: 3600 })],
      ['/v1/me', json(403, { error: { status: 403, message: 'Check settings on developer.spotify.com/dashboard, the user may not be registered.' } })],
    ])
    await finishConnect({ code: 'C1', pending: { verifier: 'v', state: 's', clientId: CID, redirect: 'https://x.local/' } })
    expect(isConnected(useSpotify.getState())).toBe(false)
    expect(useSpotify.getState().notice).toBe('notallowed')
  })

  it('a code Spotify will not trade, and no network', async () => {
    route([['/api/token', json(400, { error: 'invalid_grant' })]])
    await finishConnect({ code: 'C1', pending: { verifier: 'v', state: 's', clientId: CID, redirect: 'https://x.local/' } })
    expect(useSpotify.getState().notice).toBe('failed')
    route([])
    await finishConnect({ code: 'C1', pending: { verifier: 'v', state: 's', clientId: CID, redirect: 'https://x.local/' } })
    expect(useSpotify.getState().notice).toBe('offline')
    await finishConnect({ notice: 'denied' })
    expect(useSpotify.getState().notice).toBe('denied')
  })
})

describe('the tokens', () => {
  it('uses the access token while it lasts, then refreshes once for every caller', async () => {
    signedIn()
    route([])
    expect(await accessToken()).toBe('A1')
    expect(calls).toHaveLength(0)
    signedIn({ exp: Date.now() + 30_000 })   // inside the last minute
    route([['/api/token', json(200, { access_token: 'A2', expires_in: 3600 })]])
    const [a, b] = await Promise.all([accessToken(), accessToken()])
    expect([a, b]).toEqual(['A2', 'A2'])
    expect(calls).toHaveLength(1)
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({ grant_type: 'refresh_token', refresh_token: 'R1', client_id: CID })
    // no new refresh token in the answer: the old one is kept
    expect(useSpotify.getState()).toMatchObject({ access: 'A2', refresh: 'R1' })
  })

  it('takes a new refresh token when Spotify hands one out', async () => {
    signedIn({ exp: 0 })
    route([['/api/token', json(200, { access_token: 'A2', refresh_token: 'R2', expires_in: 3600 })]])
    await accessToken()
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ access: 'A2', refresh: 'R2' })
  })

  it('a refresh Spotify refuses is a sign-in that ended, the Client ID kept', async () => {
    signedIn({ exp: 0, name: 'Soso' })
    route([['/api/token', json(400, { error: 'invalid_grant' })]])
    await expect(accessToken()).rejects.toMatchObject({ signedOut: true })
    expect(useSpotify.getState()).toMatchObject({ refresh: null, access: null, lost: true, clientId: CID, name: 'Soso' })
  })

  it('no network is not a sign-out', async () => {
    signedIn({ exp: 0 })
    route([])
    await expect(accessToken()).rejects.toMatchObject({ offline: true })
    expect(useSpotify.getState()).toMatchObject({ refresh: 'R1', lost: false })
  })

  it('a 401 from the API gets one retry with a fresh token', async () => {
    signedIn()
    let n = 0
    route([
      ['/api/token', json(200, { access_token: 'A2', expires_in: 3600 })],
      ['/v1/me/player', () => (++n === 1 ? json(401, { error: { status: 401 } }) : json(204))],
    ])
    expect(await nowPlaying()).toEqual({ kind: 'idle' })
    expect(calls.map(c => c.auth || c.url)).toEqual(['Bearer A1', 'https://accounts.spotify.com/api/token', 'Bearer A2'])
  })
})

describe('what plays', () => {
  const track = {
    is_playing: true,
    item: {
      uri: 'spotify:track:1', name: 'Blinding Lights', artists: [{ name: 'The Weeknd' }, { name: 'Guest' }],
      album: { images: [{ url: 'big', width: 640 }, { url: 'mid', width: 300 }, { url: 'small', width: 64 }] },
      external_urls: { spotify: 'https://open.spotify.com/track/1' },
    },
  }
  it('reads a track, an episode, and nothing', () => {
    expect(playbackFrom(track)).toEqual({ kind: 'playing', id: 'spotify:track:1', name: 'Blinding Lights', by: 'The Weeknd, Guest', image: 'mid', url: 'https://open.spotify.com/track/1' })
    expect(playbackFrom({ ...track, is_playing: false }).kind).toBe('paused')
    expect(playbackFrom({ is_playing: true, item: { uri: 'e', name: 'Ep 4', show: { name: 'A Podcast' }, images: [{ url: 'ep', width: 64 }] } }))
      .toMatchObject({ kind: 'playing', name: 'Ep 4', by: 'A Podcast', image: 'ep' })
    // an advert plays without an item
    expect(playbackFrom({ is_playing: true, item: null, currently_playing_type: 'ad' })).toEqual({ kind: 'idle' })
    expect(playbackFrom(null)).toEqual({ kind: 'idle' })
  })

  it('picks the smallest cover that fills the strip', () => {
    expect(pickImage([{ url: 'a', width: 64 }, { url: 'b', width: 640 }, { url: 'c', width: 300 }])).toBe('c')
    expect(pickImage([{ url: 'a', width: 64 }])).toBe('a')
    expect(pickImage([])).toBe(null)
  })

  it('asks the player with episodes included; 204 is nothing, 429 says when to ask again', async () => {
    signedIn()
    route([['/v1/me/player', json(200, track)]])
    expect((await nowPlaying()).name).toBe('Blinding Lights')
    expect(calls[0].url).toBe('https://api.spotify.com/v1/me/player?additional_types=episode')
    route([['/v1/me/player', json(429, null, { 'Retry-After': '12' })]])
    await expect(nowPlaying()).rejects.toMatchObject({ retryAfter: 12_000 })
    route([])
    await expect(nowPlaying()).rejects.toMatchObject({ offline: true })
  })
})

describe('the buttons', () => {
  it('play, pause, next and previous', async () => {
    signedIn()
    route([['/v1/me/player', json(204)]])
    for (const a of ['play', 'pause', 'next', 'previous']) await control(a)
    expect(calls.map(c => c.method + ' ' + c.url.replace('https://api.spotify.com/v1', ''))).toEqual([
      'PUT /me/player/play', 'PUT /me/player/pause', 'POST /me/player/next', 'POST /me/player/previous',
    ])
  })

  it('says why Spotify would not', async () => {
    signedIn()
    route([['/v1/me/player', json(403, { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } })]])
    await expect(control('pause')).rejects.toMatchObject({ reason: 'premium' })
    route([['/v1/me/player', json(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } })]])
    await expect(control('play')).rejects.toMatchObject({ reason: 'nodevice' })
    route([['/v1/me/player', json(403, { error: { status: 403, reason: 'UNKNOWN' } })]])
    await expect(control('next')).rejects.toMatchObject({ reason: 'failed' })
  })
})

it('disconnect forgets everything on this device', () => {
  signedIn({ name: 'Soso', show: false, when: 'rest' })
  localStorage.setItem(KEY, JSON.stringify(useSpotify.getState()))
  localStorage.setItem(PENDING, '{}')
  disconnect()
  expect(localStorage.getItem(KEY)).toBe(null)
  expect(localStorage.getItem(PENDING)).toBe(null)
  expect(useSpotify.getState()).toMatchObject({ clientId: '', refresh: null, name: '', show: true, when: 'workout' })
})

it('a signed-out device makes no API call', async () => {
  route([])
  await expect(spotifyFetch('/me')).rejects.toMatchObject({ signedOut: true })
  expect(calls).toHaveLength(0)
})
