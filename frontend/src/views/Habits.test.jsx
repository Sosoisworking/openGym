// @vitest-environment happy-dom
// The habit card's summary line: how many of the days since the habit was added it was done.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { withHabit, withTick } from '../lib/habits.js'
import Habits from './Habits.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

let host, root
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T12:00:00'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

const mountWith = (addedAt, habitLog = {}) => {
  const habits = withHabit({}, 'Water', new Date(addedAt).getTime(), 'w').map
  useStore.setState(s => ({ S: { ...s.S, habits, habitLog }, user: null }))
  act(() => root.render(<Habits />))
  return host.querySelector('.habit-meta').textContent
}

describe('the habit summary line', () => {
  it('counts the days since the habit was added', () => {
    expect(mountWith('2026-09-12T08:00:00', withTick({}, '2026-09-15', 'w', true, 1))).toContain('1 of the last 5 days')
  })

  it('says "today" for a habit added today, not "1 of the last 1 days"', () => {
    expect(mountWith('2026-09-16T08:00:00')).toContain('not done yet today')
    act(() => root.unmount()); root = createRoot(host)
    const meta = mountWith('2026-09-16T08:00:00', withTick({}, '2026-09-16', 'w', true, 1))
    expect(meta).toContain('done today')
    expect(meta).not.toContain('of the last')
  })
})
