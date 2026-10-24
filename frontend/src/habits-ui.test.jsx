// @vitest-environment happy-dom
// Habits on screen: added in the field, ticked off and struck through, removed with an Undo, and
// shown on the calendar as a dot per habit on the day it was done; the day sheet lists them.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { calendarSheet, daySheet } from './sheets.jsx'
import { HabitRows, HabitAdd } from './components/Habits.jsx'
import { habitList, isDone, withHabit, withTick, HABIT_COLORS } from './lib/habits.js'

const clone = v => JSON.parse(JSON.stringify(v))
const S = () => useStore.getState().S
const mounted = []

function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
const mountTopSheet = () => {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const type = (el, value) => {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const at = iso => new Date(iso + 'T08:00:00').getTime()

function install(extra = {}) {
  const st = clone(DEF)
  Object.assign(st, { routines: [], week: {}, dayPlan: {}, active: null, workouts: [], weighIn: false }, extra)
  useStore.setState({ S: st, user: null })
}
const withHabits = (...names) => {
  let habits = {}
  names.forEach((n, i) => { habits = withHabit(habits, n, at('2026-09-01'), 'h' + i).map })
  return habits
}

beforeEach(() => {
  // Wednesday 16 September 2026, midday.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T12:00:00'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '', toastAction: null })
  document.body.innerHTML = ''
  install()
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
  vi.useRealTimers()
})

describe('the habit field', () => {
  it('adds what you type, and empties itself for the next one', () => {
    const host = mount(<><HabitRows /><HabitAdd /></>)
    const input = host.querySelector('.habit-add input')
    act(() => type(input, 'Drink 2 L of water'))
    act(() => host.querySelector('.habit-add').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(habitList(S()).map(h => h.name)).toEqual(['Drink 2 L of water'])
    expect(input.value).toBe('')
    expect(host.querySelector('.habit-name').textContent).toBe('Drink 2 L of water')
  })

  it('says so instead of adding the same habit twice', () => {
    install({ habits: withHabits('Read') })
    const host = mount(<HabitAdd />)
    act(() => type(host.querySelector('input'), 'read'))
    act(() => host.querySelector('.habit-add').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(habitList(S())).toHaveLength(1)
    expect(useUI.getState().toastMsg).toBe('You already track “read”.')
  })
})

describe('ticking off', () => {
  it('strikes a done habit through and records the day', () => {
    install({ habits: withHabits('Water', 'Read') })
    const host = mount(<HabitRows />)
    const rows = () => [...host.querySelectorAll('.habit-row')]
    act(() => rows()[1].querySelector('[role="checkbox"]').click())
    expect(isDone(S(), '2026-09-16', 'h1')).toBe(true)
    expect(rows().map(r => r.classList.contains('done'))).toEqual([false, true])
    act(() => rows()[1].querySelector('[role="checkbox"]').click())
    expect(isDone(S(), '2026-09-16', 'h1')).toBe(false)
  })

  it('removes a habit in edit mode, and Undo brings it back', () => {
    install({ habits: withHabits('Water', 'Read') })
    const host = mount(<HabitRows editing />)
    act(() => host.querySelector('[aria-label="Remove Water"]').click())
    expect(habitList(S()).map(h => h.name)).toEqual(['Read'])
    expect(useUI.getState().toastMsg).toBe('Removed “Water”')
    act(() => useUI.getState().runToastAction())
    expect(habitList(S()).map(h => h.name)).toEqual(['Water', 'Read'])
  })
})

describe('the calendar', () => {
  it('shows a dot in the habit’s colour on each day it was done', () => {
    let log = withTick({}, '2026-09-14', 'h1', true, at('2026-09-14'))
    log = withTick(log, '2026-09-15', 'h0', true, at('2026-09-15'))
    install({ habits: withHabits('Water', 'Read'), habitLog: log })
    calendarSheet('2026-09-01')
    const host = mountTopSheet()
    const cell = n => [...host.querySelectorAll('.cal-d')].find(b => b.querySelector('span').textContent === String(n))
    expect([...cell(14).querySelectorAll('.habit-dots b')].map(b => b.style.background)).toEqual([HABIT_COLORS[1]])
    expect([...cell(15).querySelectorAll('.habit-dots b')].map(b => b.style.background)).toEqual([HABIT_COLORS[0]])
    expect(cell(13).querySelector('.habit-dots')).toBe(null)
    expect(cell(14).title).toBe('1 of 2 habits')
    // the legend names each habit next to its colour
    expect(host.querySelector('.cal-legend').textContent).toContain('Water')
  })

  it('opens the day, where a done habit is struck through and can be unticked', () => {
    install({ habits: withHabits('Water', 'Read'), habitLog: withTick({}, '2026-09-14', 'h1', true, at('2026-09-14')) })
    calendarSheet('2026-09-01')
    const cal = mountTopSheet()
    act(() => [...cal.querySelectorAll('.cal-d')].find(b => b.querySelector('span').textContent === '14').click())
    const day = mountTopSheet()
    expect(day.querySelector('h3').textContent).toContain('14')
    expect(day.textContent).toContain('Habits · 1 of 2')
    const read = [...day.querySelectorAll('.habit-row')].find(r => r.textContent.includes('Read'))
    expect(read.classList.contains('done')).toBe(true)
    act(() => read.querySelector('[role="checkbox"]').click())
    expect(isDone(S(), '2026-09-14', 'h1')).toBe(false)
  })

  it('does not offer ticks on a day still to come', () => {
    install({ habits: withHabits('Water') })
    daySheet('2026-09-20')
    const day = mountTopSheet()
    expect(day.querySelector('.habit-row')).toBe(null)
    expect(day.textContent).toContain('Habits can be ticked on the day.')
  })
})
