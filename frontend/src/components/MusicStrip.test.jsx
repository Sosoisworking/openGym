// @vitest-environment happy-dom
// The Spotify strip on the workout screen and Settings → Music (lib/spotify.js): what it shows
// in each state, when it shows, and what its buttons and switches do.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MusicStrip from './MusicStrip.jsx'
import MusicSettings from './MusicSettings.jsx'
import { useSpotify, _reload } from '../lib/spotify.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const navs = vi.hoisted(() => [])
vi.mock('react-router-dom', () => ({ useNavigate: () => to => navs.push(to) }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: vi.fn() }))

const CID = '0123456789abcdef0123456789abcdef'
const json = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status })
const TRACK = {
  is_playing: true,
  item: {
    uri: 'spotify:track:1', name: 'Blinding Lights', artists: [{ name: 'The Weeknd' }],
    album: { images: [{ url: 'https://i.scdn.co/mid', width: 300 }] }, external_urls: { spotify: 'https://open.spotify.com/track/1' },
  },
}
let player, control, calls, toast, host, root
const signedIn = (patch = {}) => useSpotify.setState({ clientId: CID, access: 'A1', refresh: 'R1', exp: Date.now() + 3600_000, name: 'Soso', ...patch })

beforeEach(() => {
  localStorage.clear()
  _reload()
  navs.length = 0
  calls = []
  player = () => json(200, TRACK)
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    calls.push((opts.method || 'GET') + ' ' + String(url).replace('https://api.spotify.com/v1', ''))
    if (String(url).includes('/me/player?')) return player()
    if (String(url).includes('/me/player/')) return control()
    throw new TypeError('Failed to fetch')
  })
  control = () => json(204)
  toast = vi.fn()
  useUI.setState({ timer: null, work: null, toast })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete globalThis.fetch
  document.body.className = ''
})

const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => {}) }
const mount = async el => { act(() => root.render(el)); await settle() }
const strip = () => host.querySelector('#music')

describe('the strip', () => {
  it('shows the song, its artist and cover, Spotify’s icon, and links back to Spotify', async () => {
    signedIn()
    await mount(<MusicStrip />)
    expect(strip().className).toBe('playing')
    expect(strip().querySelector('.m-name').textContent).toBe('Blinding Lights')
    expect(strip().querySelector('.m-by').textContent).toBe('The Weeknd')
    expect(strip().querySelector('.m-art img').getAttribute('src')).toBe('https://i.scdn.co/mid')
    const link = strip().querySelector('a.m-song')
    expect(link.getAttribute('href')).toBe('https://open.spotify.com/track/1')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.querySelector('[data-icon="spotify"]')).not.toBe(null)
    expect([...strip().querySelectorAll('button')].map(b => b.getAttribute('aria-label'))).toEqual(['Previous track', 'Pause music', 'Next track'])
    expect(document.body.classList.contains('music')).toBe(true)
  })

  it('is not there while switched off or never connected, and asks Spotify nothing then', async () => {
    await mount(<MusicStrip />)
    expect(strip()).toBe(null)
    signedIn({ show: false })
    await mount(<MusicStrip />)
    expect(strip()).toBe(null)
    expect(calls).toEqual([])
    expect(document.body.classList.contains('music')).toBe(false)
  })

  it('“Only while resting” waits for the rest timer, with the song already known', async () => {
    signedIn({ when: 'rest' })
    await mount(<MusicStrip />)
    expect(strip()).toBe(null)
    expect(calls).toEqual(['GET /me/player?additional_types=episode'])
    act(() => useUI.setState({ timer: { left: 60, total: 60 } }))
    expect(strip().querySelector('.m-name').textContent).toBe('Blinding Lights')
  })

  it('nothing playing offers to open Spotify', async () => {
    signedIn()
    player = () => json(204)
    await mount(<MusicStrip />)
    expect(strip().className).toBe('idle')
    expect(strip().querySelector('.m-msg').textContent).toBe('Nothing playing')
    expect(strip().querySelector('a.m-act').getAttribute('href')).toBe('https://open.spotify.com/')
  })

  it('no signal: the strip steps aside, and comes back on the next answer', async () => {
    vi.useFakeTimers()
    try {
      signedIn()
      player = () => { throw new TypeError('Failed to fetch') }
      await mount(<MusicStrip />)
      expect(strip()).toBe(null)
      expect(document.body.classList.contains('music')).toBe(false)
      player = () => json(200, TRACK)
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(strip().querySelector('.m-name').textContent).toBe('Blinding Lights')
    } finally { vi.useRealTimers() }
  })

  it('signed out by Spotify: says so, and Reconnect goes to Settings → Music', async () => {
    useSpotify.setState({ clientId: CID, refresh: null, lost: true })
    await mount(<MusicStrip />)
    expect(strip().className).toBe('signedout')
    expect(strip().querySelector('.m-msg').textContent).toBe('Spotify signed out')
    act(() => strip().querySelector('.m-act').click())
    expect(navs).toEqual(['/settings/music'])
  })

  it('pause answers at once, and the controls are Spotify’s', async () => {
    signedIn()
    await mount(<MusicStrip />)
    act(() => strip().querySelector('.m-pp').click())
    expect(strip().className).toBe('paused')
    expect(strip().querySelector('.m-pp').getAttribute('aria-label')).toBe('Play music')
    await settle()
    expect(calls).toContain('PUT /me/player/pause')
    act(() => strip().querySelectorAll('.m-btn')[2].click())
    await settle()
    expect(calls).toContain('POST /me/player/next')
  })

  it('a button Spotify refuses goes back, and says why', async () => {
    signedIn()
    control = () => json(403, { error: { status: 403, reason: 'PREMIUM_REQUIRED' } })
    await mount(<MusicStrip />)
    act(() => strip().querySelector('.m-pp').click())
    await settle()
    expect(strip().className).toBe('playing')
    expect(toast).toHaveBeenCalledWith('Play, pause and skip need Spotify Premium.')
  })

  it('stacks on the rest bar: the bar publishes its height and loses its round top', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(/body\.resting #music\{bottom:var\(--timer-h,0px\)/)
    expect(css).toMatch(/body\.no-tabbar\.music #timer\{border-radius:0;box-shadow:none\}/)
    const timer = readFileSync(resolve(process.cwd(), 'src/components/RestTimer.jsx'), 'utf8')
    expect(timer).toMatch(/setProperty\('--timer-h'/)
  })
})

describe('Settings → Music', () => {
  const titles = () => [...host.querySelectorAll('.lrow .lrow-t')].map(e => e.textContent)
  const connectBtn = () => [...host.querySelectorAll('.btn.primary')].find(b => /Connect/.test(b.textContent))
  const type = (input, v) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  it('not connected: the three steps, this app’s address to copy, and Connect once the ID looks right', async () => {
    await mount(<MusicSettings />)
    expect(titles()).toEqual(['Spotify'])
    expect(host.querySelector('.lrow-s').textContent).toBe('Not connected')
    expect(host.querySelectorAll('.m-step')).toHaveLength(3)
    expect(host.querySelector('.m-copy input').value).toBe(location.origin + '/')
    expect(host.querySelector('.m-step a').getAttribute('href')).toBe('https://developer.spotify.com/dashboard')
    expect(connectBtn().disabled).toBe(true)
    const cid = host.querySelector('#spotify-cid')
    const idHint = () => host.querySelectorAll('.m-step')[2].querySelector('.m-hint')
    type(cid, 'abc')
    expect(idHint().textContent).toMatch(/32 letters and numbers/)
    expect(connectBtn().disabled).toBe(true)
    type(cid, CID)
    expect(idHint()).toBe(null)
    expect(connectBtn().disabled).toBe(false)
    // the test page is on localhost, which Spotify refuses as a redirect: the step says so
    expect(host.querySelectorAll('.m-step')[1].querySelector('.m-hint').textContent).toMatch(/127\.0\.0\.1/)
  })

  it('connected: who, the strip switch and when, and Disconnect after asking', async () => {
    signedIn()
    await mount(<MusicSettings />)
    expect(titles()).toEqual(['Spotify', 'Show on the workout screen', 'When', 'Disconnect'])
    expect(host.querySelector('.lrow-s').textContent).toBe('Connected as Soso')
    const seg = [...host.querySelectorAll('.seg button')]
    expect(seg.map(b => b.textContent)).toEqual(['Whole workout', 'Only while resting'])
    expect(seg[0].getAttribute('aria-pressed')).toBe('true')
    act(() => seg[1].click())
    expect(useSpotify.getState().when).toBe('rest')
    expect(JSON.parse(localStorage.getItem('tarnished_spotify_v1')).when).toBe('rest')
    act(() => host.querySelector('[role="switch"]').click())
    expect(useSpotify.getState().show).toBe(false)
    expect(titles()).not.toContain('When')
    act(() => [...host.querySelectorAll('.lrow')].find(r => r.textContent === 'Disconnect').click())
    const opts = vi.mocked(confirmSheet).mock.calls.at(-1)[0]
    expect(opts.danger).toBe(true)
    act(() => opts.onConfirm())
    expect(useSpotify.getState().refresh).toBe(null)
    expect(titles()).toEqual(['Spotify'])
  })

  it('says how the trip to Spotify went, once', async () => {
    useSpotify.setState({ notice: 'denied' })
    await mount(<MusicSettings />)
    expect(toast).toHaveBeenCalledWith('Spotify was not connected: the access was not given.')
    expect(useSpotify.getState().notice).toBe(null)
  })
})
