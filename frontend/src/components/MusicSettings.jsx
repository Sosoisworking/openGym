// Settings → Music: Spotify on the workout screen (lib/spotify.js, components/MusicStrip.jsx).
// Set up once per browser: the person makes a Spotify app of their own on Spotify's developer
// site, gives it this app's address to come back to, and pastes its Client ID here. Then it is
// one switch for the strip and one choice of when it shows.
import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { copyText } from '../lib/clipboard.js'
import { useSpotify, isConnected, isClientId, canConnect, redirectUri, beginConnect, disconnect, setStripPrefs, clearNotice, DASHBOARD } from '../lib/spotify.js'
import { confirmSheet } from '../sheets.jsx'
import { Row, Section, Switch, Segmented, Button, TextField } from './ui.jsx'

// What came of a trip to Spotify's sign-in, shown once back here (lib/spotify.js finishConnect).
const NOTICE = {
  connected: 'Spotify connected. It shows on the workout screen.',
  denied: 'Spotify was not connected: the access was not given.',
  failed: 'Spotify could not be connected. Check the Client ID and the Redirect URI, then try again.',
  notallowed: 'Spotify did not let this account in. In your app on developer.spotify.com, add your Spotify email under User Management.',
  lost: 'The sign-in came back to a different browser. Start it again from here.',
  offline: 'No connection to Spotify. Try again.',
}

export default function MusicSettings() {
  const sp = useSpotify()
  const toast = useUI(s => s.toast)
  const [cid, setCid] = useState(sp.clientId || '')
  const [going, setGoing] = useState(false)
  const connected = isConnected(sp)
  const secure = canConnect()
  const redirect = redirectUri()

  useEffect(() => {
    if (!sp.notice) return
    toast(t(NOTICE[sp.notice] || NOTICE.failed))
    clearNotice()
  }, [sp.notice])

  if (connected) return <>
    <Section>
      <Row icon="music" iconTint="var(--green)" title="Spotify" accessory="check"
        subtitle={sp.name ? t('Connected as {0}', sp.name) : t('Connected')} />
    </Section>
    <Section footer={sp.show ? t('Only while resting keeps the screen clear during a set: the strip shows up with the rest timer.') : undefined}>
      <Row icon="play" iconTint="var(--green)" title={t('Show on the workout screen')}>
        <Switch checked={sp.show} onChange={v => setStripPrefs({ show: v })} aria-label={t('Show on the workout screen')} />
      </Row>
      {sp.show && <Row icon="clock" iconTint="var(--orange)" title={t('When')}>
        <Segmented className="seg-inline"
          options={[{ value: 'workout', label: t('Whole workout') }, { value: 'rest', label: t('Only while resting') }]}
          value={sp.when} onChange={v => setStripPrefs({ when: v })} />
      </Row>}
    </Section>
    <Section footer={t('Each phone or browser connects on its own; the sign-in is not synced. Disconnect also forgets the Client ID here.')}>
      <Row icon="xmark" iconTint="var(--red)" title={t('Disconnect')} danger onClick={() => confirmSheet({
        title: t('Disconnect Spotify?'),
        message: t('The strip goes from the workout screen on this device. To take the access back on Spotify’s side too: spotify.com → Account → Manage apps.'),
        confirmText: t('Disconnect'), danger: true,
        onConfirm: () => { disconnect(); setCid('') },
      })} />
    </Section>
  </>

  const valid = isClientId(cid)
  const connect = async () => {
    if (!valid || going) return
    setGoing(true)
    try { await beginConnect(cid) } catch (e) { toast(t(e.message)); setGoing(false) }
  }
  const copy = async () => toast(await copyText(redirect) ? t('Copied') : t('Could not copy. Select the address and copy it.'))

  return <>
    <Section footer={t('See what’s playing on the workout screen, with play, pause and skip. Needs Spotify Premium.')}>
      <Row icon="music" iconTint="var(--green)" title="Spotify"
        subtitle={sp.busy ? t('Connecting…') : sp.lost ? t('Spotify ended the sign-in. Connect again.') : t('Not connected')} />
    </Section>

    {!secure && <Section>
      <Row icon="lock" iconTint="var(--orange)" title={t('Needs a secure address')}
        subtitle={t('Spotify only signs in on an https:// address. Open Tarnished at its https address to set this up.')} />
    </Section>}

    <Section title={t('Set up once')}>
      <div className="m-steps">
        <div className="m-step">
          <span className="m-num" aria-hidden="true">1</span>
          <p>{t('Open')} <a href={DASHBOARD} target="_blank" rel="noopener noreferrer">developer.spotify.com/dashboard</a> {t('and create an app. Any name works.')}</p>
        </div>
        <div className="m-step">
          <span className="m-num" aria-hidden="true">2</span>
          <div className="m-step-b">
            <p>{t('Add this as a Redirect URI, and tick Web API:')}</p>
            <div className="m-copy cal-link">
              <input className="input" readOnly value={redirect} aria-label={t('Redirect URI')} onFocus={e => e.target.select()} />
              <Button size="sm" variant="tinted" onClick={copy}>{t('Copy')}</Button>
            </div>
            {/* Spotify takes http only on a loopback IP: "localhost" is refused. */}
            {location.hostname === 'localhost' && <span className="m-hint">{t('Spotify does not take “localhost”. Open the app at 127.0.0.1 instead, or at its https address.')}</span>}
          </div>
        </div>
        <div className="m-step">
          <span className="m-num" aria-hidden="true">3</span>
          <div className="m-step-b">
            <label htmlFor="spotify-cid">{t('Paste the app’s Client ID:')}</label>
            <TextField id="spotify-cid" className="m-cid" value={cid} onChange={e => setCid(e.target.value)}
              placeholder={t('32 letters and numbers')} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              enterKeyHint="go" onKeyDown={e => { if (e.key === 'Enter') connect() }} />
            {cid.trim() && !valid && <span className="m-hint">{t('A Client ID is 32 letters and numbers, from your app’s Settings page.')}</span>}
          </div>
        </div>
      </div>
    </Section>

    <Button variant="primary" disabled={!valid || !secure || going || sp.busy} onClick={connect}>
      {going || sp.busy ? t('Connecting…') : t('Connect Spotify')}
    </Button>
    <p className="sect-f m-foot">{t('Your phone talks to Spotify directly. The sign-in stays on this device; Tarnished’s server never sees it.')}</p>
  </>
}
