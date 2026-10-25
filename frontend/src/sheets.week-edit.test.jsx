// @vitest-environment happy-dom
// Edit week: every weekday's routine changed on a copy and written at once with Update week, a
// combined day kept as it was unless it is changed, and Cancel leaving the plan alone.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { weekEditorSheet } from './sheets.jsx'
import { bindUI } from './components/ui.jsx'

bindUI(useUI)   // the day pickers open their sheet through it, as the app does at boot

const mounted = []
const S = () => useStore.getState().S
function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const rowFor = (host, day) => [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent.startsWith(day))
const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent === label)
// Opens the day's picker over the editor and picks `label`.
function pick(editor, day, label) {
  act(() => { rowFor(editor, day).click() })
  const picker = renderTop()
  const option = [...picker.querySelectorAll('button.lrow')].find(b => b.querySelector('.lrow-t')?.textContent === label)
  act(() => { option.click() })
}

const R = (id, name) => ({ id, name, emoji: 'barbell', ex: [{ id: '0025', sets: 3, reps: 8 }] })
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState(s => ({ S: { ...s.S, weekStart: 1, active: null,
    routines: [R('push', 'Push'), R('pull', 'Pull'), R('legs', 'Legs'), R('abs', 'Abs')],
    week: { 1: ['push'], 3: ['pull'], 5: ['legs', 'abs'] } } }))
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('Edit week', () => {
  it('lists the seven days with what each trains', () => {
    weekEditorSheet()
    const host = renderTop()
    const rows = [...host.querySelectorAll('.lrow')]
    expect(rows.map(r => r.querySelector('.lrow-t').textContent)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    expect(rows.map(r => r.querySelector('.lrow-v').textContent)).toEqual(['Push', 'Rest day', 'Pull', 'Rest day', 'Legs + Abs', 'Rest day', 'Rest day'])
    expect(button(host, 'Update week').disabled).toBe(true)   // nothing changed yet
  })

  it('changes nothing until Update week, then writes every changed day at once', () => {
    weekEditorSheet()
    const editor = renderTop()
    pick(editor, 'Wednesday', 'Rest day')
    pick(editor, 'Thursday', 'Pull')
    expect(S().week[3]).toEqual(['pull'])                      // still the old plan
    expect(rowFor(editor, 'Thursday').querySelector('.lrow-v').textContent).toBe('Pull')
    act(() => { button(editor, 'Update week').click() })
    expect(S().week[3]).toBeUndefined()
    expect(S().week[4]).toEqual(['pull'])
    expect(S().week[1]).toEqual(['push'])                      // untouched days stay
    expect(S().week[5]).toEqual(['legs', 'abs'])               // and a combined day stays combined
    expect(useUI.getState().toastMsg).toBe('Week updated: 2 days changed')
  })

  it('turns a combined day into a single routine when one is picked for it', () => {
    weekEditorSheet()
    const editor = renderTop()
    pick(editor, 'Friday', 'Legs')
    act(() => { button(editor, 'Update week').click() })
    expect(S().week[5]).toEqual(['legs'])
  })

  it('leaves the plan alone on Cancel', () => {
    const before = structuredClone(S().week)
    weekEditorSheet()
    const editor = renderTop()
    pick(editor, 'Monday', 'Rest day')
    act(() => { button(editor, 'Cancel').click() })
    expect(S().week).toEqual(before)
    expect(useUI.getState().sheets).toHaveLength(0)
  })
})
