// @vitest-environment happy-dom
// Settings → Calendar sync: the three switches write the profile's choices (with its time zone),
// and the Google and link sections follow what the server says.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const answers = {}
const calls = []
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (path, opts = {}) => {
    calls.push([opts.method || 'GET', path])
    const a = answers[(opts.method || 'GET') + ' ' + path]
    if (a instanceof Error) throw a
    return typeof a === 'function' ? a(opts) : a
  }),
}))
vi.mock('../sheets.jsx', () => ({ confirmSheet: o => o.onConfirm() }))
const { default: CalendarSync } = await import('./CalendarSync.jsx')

let host, root
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => {}) }
const rowTitled = text => [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === text)
async function mount(user = { id: 'u1', name: 'Soso' }) {
  useStore.setState({ S: JSON.parse(JSON.stringify(DEF)), user })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<CalendarSync />))
  await flush()
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  calls.length = 0
  for (const k of Object.keys(answers)) delete answers[k]
  answers['GET /api/google/status'] = { enabled: true, connected: false }
  answers['GET /api/calendar/feed'] = { url: null }
  useUI.setState({ toastMsg: '' })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('Calendar sync', () => {
  it('says it needs a server when nobody is signed in, and asks the server nothing', async () => {
    await mount(null)
    expect(host.textContent).toContain('Calendar sync needs your server')
    expect(calls).toEqual([])
  })

  it('records the time zone as soon as the page opens', async () => {
    await mount()
    expect(useStore.getState().S.calSync.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('writes each switch into the profile with the time zone', async () => {
    await mount()
    const habits = rowTitled('Habits')
    act(() => habits.querySelector('[role="switch"], button, input').click())
    const c = useStore.getState().S.calSync
    expect(c.habits).toBe(false)
    expect(typeof c.tz).toBe('string')
  })

  it('offers to connect Google, and sends the browser to the consent page', async () => {
    answers['POST /api/google/connect'] = { url: 'https://accounts.example/consent' }
    const assign = vi.fn()
    const orig = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, assign, hash: '' } })
    try {
      await mount()
      await act(async () => rowTitled('Connect Google Calendar').click())
      await flush()
      expect(assign).toHaveBeenCalledWith('https://accounts.example/consent')
    } finally { Object.defineProperty(window, 'location', { configurable: true, value: orig }) }
  })

  it('shows a connection with its last sync, syncs on demand, and disconnects', async () => {
    answers['GET /api/google/status'] = { enabled: true, connected: true, lastSync: Date.now() - 120000, calendarUrl: 'https://calendar.google.com/x' }
    answers['POST /api/google/sync'] = { ok: true, sent: 2, removed: 0, status: { enabled: true, connected: true, lastSync: Date.now() } }
    answers['POST /api/google/disconnect'] = { ok: true }
    await mount()
    expect(rowTitled('Connected').textContent).toContain('2 minutes ago')
    await act(async () => rowTitled('Sync now').click())
    await flush()
    expect(useUI.getState().toastMsg).toBe('Synced: 2 sent, 0 removed.')
    await act(async () => rowTitled('Disconnect').click())
    await flush()
    expect(calls).toContainEqual(['POST', '/api/google/disconnect'])
    expect(rowTitled('Connect Google Calendar')).toBeTruthy()
  })

  it('says so when the server has no Google client', async () => {
    answers['GET /api/google/status'] = { enabled: false, connected: false }
    await mount()
    expect(rowTitled('Not set up on this server')).toBeTruthy()
  })

  it('makes a calendar link, then offers to copy, replace or turn it off', async () => {
    answers['POST /api/calendar/feed'] = { url: 'https://gym.example/api/calendar/abc.ics' }
    answers['DELETE /api/calendar/feed'] = { ok: true }
    await mount()
    await act(async () => rowTitled('Make a calendar link').click())
    await flush()
    expect(host.querySelector('.cal-link input').value).toBe('https://gym.example/api/calendar/abc.ics')
    expect(rowTitled('Copy link')).toBeTruthy()
    await act(async () => rowTitled('Turn the link off').click())
    await flush()
    expect(host.querySelector('.cal-link')).toBe(null)
  })
})
