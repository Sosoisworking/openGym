// @vitest-environment happy-dom
// The rest bar's speaker: one tap turns the timer sound (S.sound) off or on, and a rest that is
// already counting down follows it.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RestTimer from './RestTimer.jsx'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { chime, unlock } from '../lib/sound.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn() }))

let host, root, originalS

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(chime).mockClear()
  vi.mocked(unlock).mockClear()
  originalS = useStore.getState().S
  useStore.setState({ S: { ...originalS, sound: true } })
  useUI.setState({ timer: null, work: null, timerFlashId: 0 })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.render(null))
  useUI.getState().stopRest()
  useStore.setState({ S: originalS })
  host.remove()
  vi.useRealTimers()
})

const speaker = () => host.querySelector('#timer .sound')

describe('the rest bar sound button', () => {
  it('turns the timer sound off and on again', () => {
    act(() => useUI.getState().startRest(60))
    act(() => root.render(<RestTimer />))
    expect(speaker().getAttribute('aria-pressed')).toBe('true')
    expect(speaker().querySelector('[data-icon]').dataset.icon).toBe('speaker')

    act(() => speaker().click())
    expect(useStore.getState().S.sound).toBe(false)
    expect(speaker().getAttribute('aria-pressed')).toBe('false')
    expect(speaker().querySelector('[data-icon]').dataset.icon).toBe('speakerOff')
    expect(unlock).not.toHaveBeenCalled()

    // On again is a tap, so the audio is unlocked then (iOS)
    act(() => speaker().click())
    expect(useStore.getState().S.sound).toBe(true)
    expect(unlock).toHaveBeenCalledWith(true)
  })

  it('sits first in the row, so the timer buttons keep their places', () => {
    act(() => useUI.getState().startRest(60))
    act(() => root.render(<RestTimer />))
    expect(host.querySelector('#timer .acts').firstElementChild).toBe(speaker())
  })

  it('muted mid-rest, the end of that rest makes no sound', () => {
    act(() => useUI.getState().startRest(5))
    act(() => root.render(<RestTimer />))
    act(() => speaker().click())
    act(() => vi.advanceTimersByTime(6000))
    expect(useUI.getState().timer.ready).toBe(true)
    expect(chime).not.toHaveBeenCalled()
  })

  it('left on, the end of the rest chimes', () => {
    act(() => useUI.getState().startRest(5))
    act(() => root.render(<RestTimer />))
    act(() => vi.advanceTimersByTime(6000))
    expect(chime).toHaveBeenCalled()
  })
})
