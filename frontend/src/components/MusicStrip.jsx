// The Spotify strip on the workout screen (Settings → Music, lib/spotify.js): the song, the
// artist and the cover, with previous, play/pause and next. Docked at the bottom edge during a
// set; with the rest bar up it sits on top of it, and the two read as one piece whose divider is
// the rest's progress line (index.css, body.music). App.jsx mounts it on a running workout only.
//
// It asks Spotify what is playing every few seconds, only while it is mounted and the page is in
// front. No signal: the strip steps aside and comes back by itself on the next answer.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { useSpotify, isConnected, nowPlaying, control, POLL_MS } from '../lib/spotify.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

const OPEN_SPOTIFY = 'https://open.spotify.com/'

// The poller's "look again now", for a button that just changed what plays.
let pollNow = null
const pollSoon = (ms = 700) => setTimeout(() => pollNow?.(), ms)

/** Whether the strip is wanted at all: switched on, signed in (or signed out by Spotify, which it
 *  says), and for "Only while resting" a rest on the clock. */
export const stripWanted = (sp, resting) => !!sp.show && (isConnected(sp) || !!sp.lost) && (sp.when !== 'rest' || resting)

function usePoll(on) {
  useEffect(() => {
    if (!on) return
    let stopped = false, timer = null, inflight = false, again = false
    const run = async () => {
      if (stopped) return
      if (inflight) { again = true; return }
      clearTimeout(timer)
      // Hidden: nothing is asked until the page is back in front (visibilitychange below).
      if (document.visibilityState === 'hidden') return
      inflight = true
      let wait = POLL_MS
      try {
        const now = await nowPlaying()
        if (!stopped) useSpotify.setState({ now })
      } catch (e) {
        if (e.retryAfter) wait = e.retryAfter
        // Signed out: lib/spotify.js marked it, and `on` turns false with it.
        else if (!e.signedOut && !stopped) useSpotify.setState({ now: { kind: 'offline' } })
      } finally {
        inflight = false
      }
      if (stopped) return
      if (again) { again = false; wait = 0 }
      timer = setTimeout(run, wait)
    }
    const onShow = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onShow)
    pollNow = run
    run()
    return () => {
      stopped = true
      clearTimeout(timer)
      if (pollNow === run) pollNow = null
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [on])
}

const CONTROL_FAILED = {
  premium: 'Play, pause and skip need Spotify Premium.',
  nodevice: 'Start Spotify on a phone or speaker first.',
}

async function tap(action) {
  const before = useSpotify.getState().now
  // The button answers at once; the next poll says what Spotify really did.
  if (action === 'play' || action === 'pause') useSpotify.setState({ now: { ...before, kind: action === 'play' ? 'playing' : 'paused' } })
  try {
    await control(action)
  } catch (e) {
    useSpotify.setState({ now: before })
    useUI.getState().toast(t(e.offline ? 'No connection to Spotify.' : CONTROL_FAILED[e.reason] || 'Spotify did not take that. Try again.'))
  }
  pollSoon()
}

export default function MusicStrip() {
  const sp = useSpotify()
  const resting = useUI(s => !!s.timer)
  const nav = useNavigate()
  // Asked for the whole workout whichever "When" is chosen, so a strip that waits for the rest
  // has its song ready the moment the rest starts.
  usePoll(!!sp.show && isConnected(sp))
  const now = sp.lost ? { kind: 'signedout' } : sp.now
  const visible = stripWanted(sp, resting) && !!now && now.kind !== 'offline'
  // index.css: the page keeps room for the strip, and the rest bar joins it.
  useEffect(() => {
    document.body.classList.toggle('music', visible)
    return () => document.body.classList.remove('music')
  }, [visible])
  if (!visible) return null

  if (now.kind === 'signedout' || now.kind === 'idle') return (
    <section id="music" className={now.kind} aria-label={t('Spotify')}>
      <span className="m-art">
        {now.kind === 'idle' ? <Icon name="spotify" className="m-logo" /> : <Icon name="link" />}
      </span>
      <span className="m-msg">{now.kind === 'idle' ? t('Nothing playing') : t('Spotify signed out')}</span>
      {now.kind === 'idle'
        ? <a className="m-act" href={OPEN_SPOTIFY} target="_blank" rel="noopener noreferrer">{t('Open Spotify')}</a>
        : <button type="button" className="m-act" onClick={() => nav('/settings/music')}>{t('Reconnect')}</button>}
    </section>
  )

  const playing = now.kind === 'playing'
  return (
    <section id="music" className={now.kind} aria-label={t('Spotify')}>
      {/* The cover, the song and Spotify's icon are one link back to it, as their rules ask. */}
      <a className="m-song" href={now.url || OPEN_SPOTIFY} target="_blank" rel="noopener noreferrer"
        aria-label={(now.by ? t('{0} by {1}', now.name, now.by) : now.name) + '. ' + t('Open in Spotify')}>
        <span className="m-art">{now.image ? <img src={now.image} alt="" /> : <Icon name="music" />}</span>
        <span className="m-txt">
          <span className="m-name">{now.name}</span>
          {now.by && <span className="m-by">{now.by}</span>}
        </span>
        <Icon name="spotify" className="m-logo" />
      </a>
      <button type="button" className="m-btn" aria-label={t('Previous track')} onClick={() => tap('previous')}><Icon name="skipBack" /></button>
      <button type="button" className="m-btn m-pp" aria-label={t(playing ? 'Pause music' : 'Play music')}
        onClick={() => tap(playing ? 'pause' : 'play')}><Icon name={playing ? 'pause' : 'play'} /></button>
      <button type="button" className="m-btn" aria-label={t('Next track')} onClick={() => tap('next')}><Icon name="skipForward" /></button>
    </section>
  )
}
