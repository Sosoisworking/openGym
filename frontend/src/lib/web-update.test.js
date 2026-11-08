// "Update now" (Settings → About & updates, web): ask the server for its newest build, let a new
// service worker finish installing, reload; say so when there is nothing newer.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateNow, watchForUpdates, buildTime, _resetWebUpdate } from './web-update.js'

// A ServiceWorkerContainer and registration, as far as updateNow uses them.
function fakeSW({ controller = {}, found = null } = {}) {
  const listeners = {}
  const reg = { installing: null, waiting: null, update: vi.fn(async () => { if (found) reg.installing = found }) }
  return {
    controller,
    reg,
    getRegistration: vi.fn(async () => reg),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) },
    fire: type => (listeners[type] || []).forEach(fn => fn()),
  }
}
function fakeWorker(state = 'installing') {
  const listeners = []
  return {
    state,
    addEventListener: (_, fn) => listeners.push(fn),
    go(next) { this.state = next; listeners.forEach(fn => fn()) },
  }
}

beforeEach(() => _resetWebUpdate())

describe('updateNow', () => {
  it('nothing newer on the server: no reload, "latest"', async () => {
    const sw = fakeSW()
    const reload = vi.fn()
    expect(await updateNow({ sw, reload })).toBe('latest')
    expect(sw.reg.update).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it('a newer build: waits for its worker to take over, then reloads', async () => {
    const worker = fakeWorker()
    const sw = fakeSW({ found: worker })
    const reload = vi.fn()
    const done = updateNow({ sw, reload })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(reload).not.toHaveBeenCalled()
    worker.go('installed')
    expect(reload).not.toHaveBeenCalled()
    worker.go('activated')
    expect(await done).toBe('updated')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a worker that never settles does not hold the reload for ever', async () => {
    vi.useFakeTimers()
    try {
      const sw = fakeSW({ found: fakeWorker() })
      const reload = vi.fn()
      const done = updateNow({ sw, reload, wait: 5000 })
      await vi.advanceTimersByTimeAsync(5000)
      expect(await done).toBe('updated')
      expect(reload).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('a newer build that took over while this page ran: reloads straight away', async () => {
    const sw = fakeSW({ controller: {} })
    watchForUpdates(sw)
    sw.fire('controllerchange')
    const reload = vi.fn()
    expect(await updateNow({ sw, reload })).toBe('updated')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('the first worker taking a page that had none is not an update', async () => {
    const sw = fakeSW({ controller: null })
    watchForUpdates(sw)
    sw.fire('controllerchange')
    const reload = vi.fn()
    expect(await updateNow({ sw, reload })).toBe('latest')
  })

  it('no service worker (a dev server, plain http): a reload is the update', async () => {
    const reload = vi.fn()
    expect(await updateNow({ sw: { getRegistration: async () => undefined }, reload })).toBe('updated')
    expect(await updateNow({ sw: undefined, reload })).toBe('updated')
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('the server out of reach: it throws, and nothing reloads', async () => {
    const sw = fakeSW()
    sw.reg.update.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const reload = vi.fn()
    await expect(updateNow({ sw, reload })).rejects.toThrow()
    expect(reload).not.toHaveBeenCalled()
  })
})

it('knows when this copy was built', () => {
  // vite.config.js defines it for the build and for the tests alike
  expect(new Date(buildTime()).getTime()).not.toBeNaN()
})
