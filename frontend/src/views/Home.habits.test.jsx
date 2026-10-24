// @vitest-environment happy-dom
// Home's calendar card switches between the week strip and the whole month, and remembers which;
// the habits card shows today's habits and folds away with its switch in Settings.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { withHabit, withTick } from '../lib/habits.js'
import Home from './Home.jsx'

const daySheet = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), daySheet: (...a) => daySheet(...a), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

let host, root
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T12:00:00'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  daySheet.mockClear()
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

const mountWith = extra => {
  const habits = withHabit({}, 'Water', new Date('2026-09-01T08:00:00').getTime(), 'w').map
  useStore.setState(s => ({
    S: { ...s.S, routines: [], workouts: [], bodyweight: [], dayPlan: {}, week: {}, active: null, habits,
      habitLog: withTick({}, '2026-09-15', 'w', true, 1), calView: 'week', ...extra },
    user: null,
  }))
  act(() => root.render(<Home />))
}
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)

describe('the calendar card', () => {
  it('shows the week with a habit dot under a day the habit was done', () => {
    mountWith()
    expect(host.querySelector('.week')).toBeTruthy()
    expect(host.querySelector('.cal-grid')).toBe(null)
    const tue = [...host.querySelectorAll('.wday')].find(d => d.querySelector('.num').textContent === '15')
    expect(tue.querySelectorAll('.habit-dots b')).toHaveLength(1)
  })

  it('switches to the month, remembers it, and opens a day from it', () => {
    mountWith()
    act(() => button('Month').click())
    expect(useStore.getState().S.calView).toBe('month')
    expect(host.querySelector('.cal-grid')).toBeTruthy()
    expect(host.textContent).toContain('September')
    act(() => [...host.querySelectorAll('.cal-d')].find(b => b.querySelector('span').textContent === '3').click())
    expect(daySheet).toHaveBeenCalledWith('2026-09-03')
  })
})

describe('the habits card', () => {
  it('lists today’s habits with the count done', () => {
    mountWith({ habitLog: withTick({}, '2026-09-16', 'w', true, 1) })
    expect(host.querySelector('.habit-name').textContent).toBe('Water')
    expect(host.querySelector('.habit-count').textContent).toBe('1 of 1')
  })

  it('folds away with its switch', () => {
    mountWith({ showHabitsCard: false })
    expect(host.querySelector('.habit-name')).toBe(null)
  })
})
