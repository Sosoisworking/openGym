// "Update now" for the web app (Settings → About & updates): the newest build the server has,
// without waiting for the browser to get round to it.
//
// A build is a new service worker (public/sw.js carries the build's hash, vite.config.js), and
// the shell is fetched network-first, so a reload is what runs the new code. What a reload alone
// misses is the app on an iPhone's home screen: it comes back from memory rather than loading
// again, and nothing asks the server whether sw.js changed. So the button asks (reg.update()),
// lets a new worker finish installing (it caches the new build for offline use), then reloads.
//
// A new build the browser already put in place while this page was open shows up as a
// `controllerchange`; that page is running the old code, so the button reloads it too.

let hadController = false
let newerActive = false

/** From start-up (main.jsx): notes a worker taking over from the one this page started with. */
export function watchForUpdates(sw = globalThis.navigator?.serviceWorker) {
  if (!sw) return
  hadController = !!sw.controller
  sw.addEventListener('controllerchange', () => {
    if (hadController) newerActive = true
    hadController = true
  })
}

// Until the new worker is in charge (or gave up), at most `ms`: then the reload goes ahead anyway,
// since the network-first shell serves the new build either way.
function settled(worker, ms) {
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(done, ms)
    if (worker.state === 'activated' || worker.state === 'redundant') return done()
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || worker.state === 'redundant') done()
    })
  })
}

/**
 * Updates to the server's newest build. Resolves 'updated' (and reloads) when there was one,
 * 'latest' when this page already runs it; throws when the server could not be asked.
 */
export async function updateNow({ sw = globalThis.navigator?.serviceWorker, reload = () => location.reload(), wait = 20_000 } = {}) {
  const reg = await sw?.getRegistration?.()
  // No worker (a dev server, plain http): nothing is cached, so a reload is the whole update.
  if (!reg) { reload(); return 'updated' }
  await reg.update()
  const next = reg.installing || reg.waiting
  if (next) await settled(next, wait)
  else if (!newerActive) return 'latest'
  reload()
  return 'updated'
}

/** When this copy was built, for "This build: 8 Nov, 18:31" (vite.config.js __BUILD_TIME__). */
export const buildTime = () => (typeof __BUILD_TIME__ !== 'undefined' && __BUILD_TIME__) || null

// Test seam.
export function _resetWebUpdate() { hadController = false; newerActive = false }
