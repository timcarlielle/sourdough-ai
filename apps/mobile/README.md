# Sourdough AI — iOS app

Expo (React Native) companion app for a self-hosted Sourdough AI server. On first launch
the user enters their server URL, logs in, and gets a personal access token stored in the
iOS keychain (expo-secure-store). All API calls go straight to their own server.

## Screens

- **Onboarding** — server URL entry, validated against `GET /api/meta`
- **Login** — email/password → `POST /api/auth/mobile` → bearer token
- **Dashboard** — starter status, prediction, live sensor readings, current bake
- **Feedings** — list, quick-add, and (when the server has AI enabled) voice logging
- **Bakes** — list with active-bake badge
- **Settings** — account/server info, change server, log out

## Development

```bash
# from the repo root
npm install
cd apps/mobile
npx expo start          # scan the QR with Expo Go, or press i for the iOS simulator
```

Point the app at a running server. For a simulator against your dev server use
`http://localhost:3000`; for a physical phone on your LAN use `http://<your-mac-ip>:3000`
(plain-HTTP LAN access is allowed via `NSAllowsLocalNetworking`).

## Networking / ATS

`app.json` sets `NSAllowsArbitraryLoads: false` and `NSAllowsLocalNetworking: true`:
HTTPS is required for remote servers, plain HTTP is allowed for local-network addresses.
Recommend self-hosters put their server behind Caddy or Tailscale for remote HTTPS
(see `docs/self-hosting.md`).

## Building & App Store release (EAS)

One-time: create an [Expo account](https://expo.dev), an Apple Developer account ($99/yr),
and run `npm i -g eas-cli && eas login`. The bundle id is `com.sourdoughai.app` (change it
in `app.json` to one under your Apple team).

```bash
eas build --platform ios --profile preview      # internal install / TestFlight
eas build --platform ios --profile production   # App Store build
eas submit --platform ios                       # upload to App Store Connect
```

Flow: internal TestFlight → external TestFlight beta → App Store submission.

### App Review notes (important)

Bring-your-own-server apps get rejected when reviewers can't log in. Before submitting:

1. Stand up a **demo server**: a small VPS running the docker-compose stack behind HTTPS,
   seeded with a demo account and some data.
2. In App Store Connect → App Review Information, provide the demo server URL and the
   demo account credentials, and explain the model: "This app is a client for the
   open-source, self-hosted Sourdough AI server (like Home Assistant or Plex); users
   run their own server."
3. Expect 1–2 review cycles; answer questions by pointing at the public GitHub repo.

## Server compatibility

The app requires a server exposing `GET /api/meta` and `POST /api/auth/mobile`
(server v1.0+). `meta.minMobileVersion` is reserved for future compatibility gating.
