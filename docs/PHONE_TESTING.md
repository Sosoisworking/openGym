# Testing on your phone

How to run a development copy of Tarnished on your Mac and use it on your iPhone as a real
Home Screen app, over your home Wi-Fi. No Docker, no domain, no account anywhere.

An iPhone treats a web app as an app only over HTTPS: Add to Home Screen as a full-screen app,
opening offline, notifications, passkeys. Over plain `http://<your-mac>:5173` it is a browser tab,
and the service worker never registers. So this sets up HTTPS with a certificate the phone trusts.

## Once: a certificate the phone trusts

```bash
sh scripts/phone-cert.sh
```

This makes a small certificate authority of your own in `certs/` (gitignored), and from it a
certificate for this Mac's network name (`<name>.local`, from System Settings → General → Sharing)
and its current Wi-Fi address. The authority is limited (X.509 name constraints) to that `.local`
name and private network addresses, so trusting it on the phone does not let it stand in for any
real website. Keep `certs/ca.key` private anyway.

On the iPhone:

1. Send `certs/ca.crt` to it: AirDrop from Finder, or e-mail it to yourself and open the
   attachment.
2. Settings → **Profile Downloaded** → Install.
3. Settings → General → About → **Certificate Trust Settings** → switch on
   *Tarnished local test CA*.

When the Mac's Wi-Fi address changes, run the script again. It renews the Mac's certificate from
the same authority, so the phone keeps trusting it. Remove the profile from the phone
(General → VPN & Device Management) when you are done.

## Each time: the two servers

The API, with password sign-in on (passkeys may not work on a `.local` address) and the HTTPS
address as its origin:

```bash
cd api && DATA_DIR=../data RP_ID=<name>.local ORIGIN=https://<name>.local:5173 PASSWORD_LOGIN=1 node server.js
```

The built web app over HTTPS, in a second terminal. `vite preview` serves the production build,
so the service worker and the Home Screen install behave as they would on a real server:

```bash
cd frontend && npm run build && API_ORIGIN=https://<name>.local:5173 HTTPS_CERT=../certs/server.crt HTTPS_KEY=../certs/server.key npx vite preview --host 0.0.0.0 --port 5173
```

Then open `https://<name>.local:5173` in Safari on the phone (or `https://<wifi-address>:5173`),
and Share → **Add to Home Screen**. The installed app keeps its own data apart from Safari, so the
two work as two devices signed in to one profile, which is handy for testing sync.

`HTTPS_CERT` and `HTTPS_KEY` also work with `npm run dev`, for hot reload over HTTPS; the service
worker only behaves like production under `vite preview`.

Example data for a test profile: `node scripts/seed-demo.mjs --profile soso` (see the script's
header).
