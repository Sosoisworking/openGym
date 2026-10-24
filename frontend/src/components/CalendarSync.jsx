// Settings → Calendar sync: what goes to a calendar app (workouts, the plan ahead, habits), the
// Google Calendar connection, and the subscription link any calendar app can read. Both ways out
// run on the server (api/calendar-events.js); the choices here live in the profile (`S.calSync`),
// so the server reads them from the same document it syncs.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { fmtAgo, localTZ } from '../lib/format.js'
import { copyText } from '../lib/clipboard.js'
import { MOBILE } from '../lib/mobile.js'
import { confirmSheet } from '../sheets.jsx'
import { Row, Section, Switch } from './ui.jsx'

const toast = msg => useUI.getState().toast(msg)
const OUTCOME = {
  connected: 'Google Calendar connected. Your workouts are on their way.',
  denied: 'Google Calendar was not connected: the access was not given.',
  failed: 'Google Calendar could not be connected. Try again.',
  'not-configured': 'This server is not set up for Google Calendar.',
}
const open = url => (MOBILE ? window.open(url, '_blank', 'noopener') : window.location.assign(url))

/** The profile's calendar choices, defaults filled in. */
export const calPrefs = S => {
  const c = S?.calSync || {}
  return { workouts: c.workouts !== false, plan: c.plan !== false, habits: c.habits !== false }
}

export default function CalendarSync() {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const [google, setGoogle] = useState(null)
  const [feed, setFeed] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const prefs = calPrefs(S)
  // The zone travels with the choices, so "today" on the server is the user's today.
  const setPref = (k, v) => update(s => { s.calSync = { ...(s.calSync || {}), [k]: v, tz: localTZ() } })

  const refresh = () => {
    api('/api/google/status').then(setGoogle).catch(() => setGoogle({ enabled: false, connected: false, unreachable: true }))
    api('/api/calendar/feed').then(r => setFeed(r.url || null)).catch(() => setFeed(null))
  }
  useEffect(() => {
    if (!user) return
    refresh()
    // Back from Google in the phone's browser: look again when the app comes to the front.
    const onShow = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [user?.id])
  // The consent round trip comes back here as #/settings/calendar?google=… (api/server.js
  // /api/google/callback). Read once, off the address, then taken out of it so a reload is quiet.
  useEffect(() => {
    const hash = window.location.hash || ''
    const outcome = new URLSearchParams(hash.split('?')[1] || '').get('google')
    if (!outcome || !OUTCOME[outcome]) return
    toast(t(OUTCOME[outcome]))
    try { history.replaceState(history.state, '', hash.split('?')[0]) } catch { /* the toast was the point */ }
  }, [])

  if (!user) return <Section footer={t('Habits and workouts always show on the calendar in Tarnished itself (Home → Month).')}>
    <Row icon="cloudSlash" iconTint="var(--grey)" title={t('Calendar sync needs your server')}
      subtitle={t('Sign in to a Tarnished server to send your workouts, plan and habits to Google Calendar or any calendar app.')} />
  </Section>

  const run = async (fn, done) => {
    if (busy) return
    setBusy(true)
    try { const r = await fn(); if (done) done(r) } catch (e) { toast(e.message || t('That did not work. Try again.')) } finally { setBusy(false) }
  }
  const connect = () => run(() => api('/api/google/connect', { method: 'POST', body: JSON.stringify({ tz: localTZ() }) }), r => open(r.url))
  const syncNow = () => run(() => api('/api/google/sync', { method: 'POST', body: '{}' }), r => {
    setGoogle(r.status)
    toast(r.sent || r.removed ? t('Synced: {0} sent, {1} removed.', r.sent, r.removed) : t('Google Calendar is up to date.'))
  })
  const disconnect = () => confirmSheet({
    title: t('Disconnect Google Calendar?'),
    message: t('Tarnished stops updating it. The Tarnished calendar and its events stay in your Google account, to keep or delete there.'),
    confirmText: t('Disconnect'), danger: true,
    onConfirm: () => run(() => api('/api/google/disconnect', { method: 'POST', body: '{}' }), () => setGoogle(g => ({ ...g, connected: false, revoked: false }))),
  })
  const newLink = () => run(() => api('/api/calendar/feed', { method: 'POST', body: '{}' }), r => setFeed(r.url))
  const replaceLink = () => confirmSheet({
    title: t('Make a new link?'),
    message: t('The current link stops working, in every calendar that subscribed to it.'),
    confirmText: t('Make a new link'), onConfirm: newLink,
  })
  const linkOff = () => confirmSheet({
    title: t('Turn the link off?'), message: t('Calendars that subscribed to it stop getting updates.'),
    confirmText: t('Turn off'), danger: true,
    onConfirm: () => run(() => api('/api/calendar/feed', { method: 'DELETE' }), () => setFeed(null)),
  })
  const copy = async () => toast(await copyText(feed) ? t('Link copied') : t('Could not copy. Select the address and copy it.'))
  const webcal = feed ? feed.replace(/^https?:/, 'webcal:') : null

  const gStatus = google?.connected
    ? (google.lastError ? google.lastError
      : google.lastSync ? t('Last synced {0}', fmtAgo(google.lastSync)) : t('The first sync is on its way.'))
    : null

  return <>
    <Section title={t('What goes to the calendar')}>
      <Row icon="dumbbell" iconTint="var(--green)" title={t('Workouts')} subtitle={t('Every session you log, at the time you trained.')}>
        <Switch checked={prefs.workouts} onChange={v => setPref('workouts', v)} />
      </Row>
      <Row icon="calendar" iconTint="var(--orange)" title={t('Planned sessions')} subtitle={t('The next two weeks of your plan, as all-day events.')}>
        <Switch checked={prefs.plan} onChange={v => setPref('plan', v)} />
      </Row>
      <Row icon="checkCircle" iconTint="var(--teal)" title={t('Habits')} subtitle={t('A line a day: which habits you ticked off.')}>
        <Switch checked={prefs.habits} onChange={v => setPref('habits', v)} />
      </Row>
    </Section>

    <Section title={t('Google Calendar')} footer={google?.enabled === false
      ? t('Google Calendar needs this server’s admin to add a Google sign-in client first (docs/GOOGLE_CALENDAR.md). The calendar link below works without it.')
      : t('Tarnished makes a calendar of its own in your Google account and only ever touches that one.')}>
      {google == null ? <Row icon="clock" iconTint="var(--grey)" title={t('Checking…')} />
        : google.enabled === false ? <Row icon="cloudSlash" iconTint="var(--grey)" title={google.unreachable ? t('The server did not answer') : t('Not set up on this server')} />
        : google.connected ? <>
          <Row icon="checkCircle" iconTint="var(--green)" title={t('Connected')} subtitle={gStatus} />
          {google.calendarUrl && <Row icon="calendar" iconTint="var(--blue)" title={t('Open in Google Calendar')} accessory="chevron"
            onClick={() => window.open(google.calendarUrl, '_blank', 'noopener')} />}
          <Row icon="repeat" iconTint="var(--blue)" title={busy ? t('Syncing…') : t('Sync now')} onClick={syncNow} />
          <Row icon="xmark" iconTint="var(--red)" title={t('Disconnect')} danger onClick={disconnect} />
        </>
        : <Row icon="calendar" iconTint="var(--blue)" accessory="chevron"
          title={google.revoked ? t('Connect Google Calendar again') : t('Connect Google Calendar')}
          subtitle={google.revoked ? t('Google stopped letting Tarnished in, so the calendar is no longer updated.') : t('Sign in with Google and pick the account to use.')}
          onClick={connect} />}
    </Section>

    <Section title={t('Calendar link')} footer={t('Any calendar app can subscribe to this private address: Apple Calendar, Outlook, or Google Calendar → Other calendars → From URL. Calendars fetch it again every few hours. Google reads it from its own servers, so this server has to be reachable from the internet. Anyone with the link sees your calendar, so keep it to yourself.')}>
      {feed === undefined ? <Row icon="clock" iconTint="var(--grey)" title={t('Checking…')} />
        : feed ? <>
          <div className="lrow cal-link"><input className="input" readOnly value={feed} aria-label={t('Calendar link')} onFocus={e => e.target.select()} /></div>
          <Row icon="copy" iconTint="var(--blue)" title={t('Copy link')} onClick={copy} />
          <Row icon="link" iconTint="var(--blue)" title={t('Subscribe in a calendar app')} accessory="chevron" onClick={() => window.open(webcal, '_blank', 'noopener')} />
          <Row icon="reset" iconTint="var(--orange)" title={t('Make a new link')} onClick={replaceLink} />
          <Row icon="xmark" iconTint="var(--red)" title={t('Turn the link off')} danger onClick={linkOff} />
        </>
        : <Row icon="link" iconTint="var(--blue)" title={t('Make a calendar link')} subtitle={t('For Apple Calendar, Outlook or any app that subscribes to a calendar by address.')} onClick={newLink} />}
    </Section>
  </>
}
