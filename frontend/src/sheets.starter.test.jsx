// @vitest-environment happy-dom
// The split chooser is where a split can quietly do the wrong thing: overwrite a weekday without
// asking, ask when there was nothing to overwrite, or apply a split the user cancelled. Tapping a
// split shows its week first; "Use this split" is what loads it.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { loadStarterPlan, starterPlanSheet } from './sheets.jsx'

const mounted = []

const S = () => useStore.getState().S
// S.week[day] is a routine-id list; a split writes a one-element list per day.
const nameOn = day => S().routines.find(r => r.id === [].concat(S().week[day] ?? [])[0])?.name

// Renders whatever sheet is on top and returns its host element.
function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}

const rowFor = (host, name) => [...host.querySelectorAll('.item')].find(el => el.querySelector('.tt')?.textContent === name)
const buttonFor = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent === label)
const chip = (host, label) => [...host.querySelectorAll('.chip')].find(b => b.textContent === label)

// Opens the chooser, taps a split and returns its preview.
function preview(name) {
  starterPlanSheet()
  const chooser = renderTop()
  act(() => { rowFor(chooser, name).click() })
  return renderTop()
}
// …and uses it.
function choose(name) {
  const host = preview(name)
  act(() => { buttonFor(host, 'Use this split').click() })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState(s => ({
    S: { ...s.S, routines: [{ id: 'mine', name: 'My routine', emoji: 'star', ex: [] }], week: {}, active: null, customEx: [], weekStart: 1 },
  }))
  document.body.innerHTML = ''
})

afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
})

describe('split chooser', () => {
  it('lists every split with its day count', () => {
    starterPlanSheet()
    const host = renderTop()
    expect([...host.querySelectorAll('.item .tt')].map(el => el.textContent)).toEqual([
      'Push / Pull / Legs', 'Push / Pull / Legs + Abs', 'Push / Pull / Legs + Upper / Lower', 'Upper / Lower',
      'Full body', 'Bro split', 'Batman split', '5×5',
    ])
    expect(rowFor(host, 'Upper / Lower').querySelector('.ss').textContent).toContain('4 days a week')
    expect(rowFor(host, 'Batman split').querySelector('.ss').textContent).toContain('6 days a week')
  })

  it('shows a split’s week before loading anything: each day, its exercises, and the rest days', () => {
    const host = preview('Batman split')
    expect(S().routines).toHaveLength(1)                 // nothing loaded by looking
    const days = [...host.querySelectorAll('.split-day')]
    expect(days.map(d => d.querySelector('.split-wd').textContent)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])
    expect(days[2].classList.contains('rest')).toBe(true)  // Wednesday off
    expect(days[0].querySelector('b').textContent).toBe('Chest / Shoulders / Biceps')
    const first = [...days[0].querySelectorAll('.split-ex li')]
    expect(first[0].textContent).toBe('Barbell Incline Bench Press3 × 6–8')
    expect(first.at(-1).textContent).toBe('Kettlebell circuit 120 min')
    expect(days[6].textContent).toContain('Active recovery')
  })

  it('loads straight away when the split’s weekdays are free, without asking', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 0: ['mine'], 6: ['mine'] } } }))
    choose('Upper / Lower')

    expect(useUI.getState().sheets).toHaveLength(0)   // no confirmation, and the chooser is closed
    expect(nameOn(1)).toBe('Upper A')
    expect(nameOn(2)).toBe('Lower A')
    expect(nameOn(4)).toBe('Upper B')
    expect(nameOn(5)).toBe('Lower B')
    expect(S().week[0]).toEqual(['mine'])             // untouched weekdays stay put
    expect(S().week[6]).toEqual(['mine'])
    expect(S().routines[0].name).toBe('My routine')   // and nothing is deleted
    expect(useUI.getState().toastMsg).toBe('Upper / Lower loaded')
  })

  it('loading the same split twice reuses its routines instead of duplicating them', () => {
    expect(loadStarterPlan('upper-lower')).toBe(true)
    const ids = S().routines.map(r => r.id)
    const week = structuredClone(S().week)
    expect(loadStarterPlan('upper-lower')).toBe(true)
    expect(S().routines.map(r => r.id)).toEqual(ids)
    expect(S().routines.filter(r => r.name === 'Upper A')).toHaveLength(1)
    expect(S().week).toEqual(week)
  })

  it('asks first when a weekday the split wants is already taken', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 3: ['mine'] } } }))
    choose('Full body')

    const confirm = renderTop()
    expect(confirm.querySelector('h3').textContent).toBe('Use Full body?')
    expect(confirm.textContent).toContain('Monday, Wednesday and Friday')
    expect(S().week[3]).toEqual(['mine'])                  // nothing applied yet
    expect(S().routines).toHaveLength(1)

    act(() => { buttonFor(confirm, 'Use this split').click() })
    expect(nameOn(1)).toBe('Full body A')
    expect(nameOn(3)).toBe('Full body B')
    expect(nameOn(5)).toBe('Full body C')
  })

  it('leaves everything alone when the confirmation is cancelled', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 1: ['mine'] } } }))
    const before = structuredClone(S())
    choose('5×5')

    const confirm = renderTop()
    act(() => { buttonFor(confirm, 'Cancel').click() })
    expect(S()).toEqual(before)
    expect(useUI.getState().toastMsg).toBe('')
  })

  it('does not ask when only weekdays outside the split are occupied', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 2: ['mine'], 4: ['mine'] } } }))   // Tue + Thu
    choose('5×5')                                                                // wants Mon/Wed/Fri
    expect(useUI.getState().sheets).toHaveLength(0)
    expect(nameOn(1)).toBe('5×5 A')
  })
})

describe('a split with exercises of its own', () => {
  it('adds the Batman split’s exercises to yours, and only once however often it is loaded', () => {
    choose('Batman split')
    const names = () => S().customEx.map(c => c.n)
    expect(names()).toEqual(['Archer pull', 'Bayesian curl', 'Kettlebell circuit 1', 'Kettlebell circuit 2', 'Kettlebell circuit 3'])
    expect(nameOn(0)).toBe('Active recovery')
    expect(S().week[3]).toBeUndefined()                     // Wednesday stays a rest day
    loadStarterPlan('batman')
    expect(names()).toHaveLength(5)
    expect(S().routines.filter(r => r.name === 'Back / Triceps')).toHaveLength(1)
  })
})

describe('split preview, fitted to equipment', () => {
  const home = { id: 'home', name: 'Home', equipment: ['dumbbell'] }
  const exIds = () => S().routines.slice(1).flatMap(r => r.ex.map(e => e.id))

  it('points to Settings when there is no profile, and offers no chips', () => {
    starterPlanSheet()
    expect(renderTop().textContent).toContain('Add an equipment profile in Settings')
    const host = preview('Push / Pull / Legs')
    expect(host.querySelector('.chip')).toBeNull()
  })

  it('loads the split as written unless a profile is picked', () => {
    useStore.setState(s => ({ S: { ...s.S, equipProfiles: [home], activeEquipId: 'home', equipFilterOn: false } }))
    const host = preview('Push / Pull / Legs')
    expect(chip(host, 'As written').className).toContain('on')
    act(() => { buttonFor(host, 'Use this split').click() })
    expect(exIds()).toContain('0025')   // the barbell bench press
  })

  it('starts on the profile the library is filtered by, and fits the split to it', () => {
    useStore.setState(s => ({ S: { ...s.S, equipProfiles: [home], activeEquipId: 'home', equipFilterOn: true } }))
    const host = preview('Push / Pull / Legs')
    expect(chip(host, 'Home').className).toContain('on')
    act(() => { buttonFor(host, 'Use this split').click() })
    expect(exIds()).not.toContain('0025')
    expect(useUI.getState().toastMsg).toMatch(/^Push \/ Pull \/ Legs loaded, fitted to "Home": \d+ swapped, \d+ dropped$/)
  })

  it('lets you pick a profile by hand', () => {
    useStore.setState(s => ({ S: { ...s.S, equipProfiles: [home], activeEquipId: '', equipFilterOn: false } }))
    const host = preview('5×5')
    act(() => { chip(host, 'Home').click() })
    act(() => { buttonFor(host, 'Use this split').click() })
    expect(exIds()).not.toContain('0043')   // no barbell squat on a dumbbell-only profile
  })

  it('adds a fitted split beside a same-named routine with other exercises, instead of reusing it', () => {
    loadStarterPlan('ppl')
    loadStarterPlan('ppl', { id: 'home', name: 'Home', equipment: ['dumbbell'] })
    const pushes = S().routines.filter(r => r.name === 'Push')
    expect(pushes).toHaveLength(2)
    expect(pushes[0].ex.map(e => e.id)).not.toEqual(pushes[1].ex.map(e => e.id))
    expect(S().week[1]).toEqual([pushes[1].id])
  })

  it('still reuses the routines when the same fitted split is loaded twice', () => {
    loadStarterPlan('ppl', home)
    loadStarterPlan('ppl', home)
    expect(S().routines.filter(r => r.name === 'Push')).toHaveLength(1)
  })
})

describe('loadStarterPlan', () => {
  it('two different splits add independent routines', () => {
    loadStarterPlan('ppl')
    const first = S().routines.slice(1).map(r => r.id)
    loadStarterPlan('full-body')
    const second = S().routines.slice(4).map(r => r.id)
    expect(S().routines).toHaveLength(7)
    expect(new Set([...first, ...second]).size).toBe(6)
  })

  it('refuses a split it does not know and changes nothing', () => {
    const before = structuredClone(S())
    expect(loadStarterPlan('nope')).toBe(false)
    expect(loadStarterPlan(undefined)).toBe(false)
    expect(S()).toEqual(before)
    expect(useUI.getState().toastMsg).toBe('')
  })
})
