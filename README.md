# Amazon Music Controller for Even Realities G2

Control **Amazon Music** on Android from your **Even Realities G2** smart glasses. This is an Even Hub mini-app (WebView + SDK) with a phone companion UI and a dedicated glasses HUD.

## Features

- **G2 glasses HUD** — now playing info (title, artist, album, progress) plus on-screen control hints
- **Phone companion UI** — play / pause / next / previous, mode toggle, Amazon Music setup guide
- **Live mode** — reads the active Android media session and sends control commands to Amazon Music
- **Demo mode** — simulated playlist for testing in the desktop simulator without Amazon Music running
- **Ring / touch controls** — tap, scroll, and double-click mapped to playback actions

## Requirements

- [Node.js](https://nodejs.org/) 20+ (22+ recommended)
- [Even Hub](https://evenrealities.com/) companion app on Android (v2.0.0+)
- Even Realities G2 glasses + ring
- Amazon Music installed on the same Android phone (`com.amazon.mp3`)

## Quick start

```bash
npm install
npm run demo
```

This starts the Vite dev server and the G2 desktop simulator together.

- **Companion UI:** http://localhost:5173/
- **Simulator only:** `npm run simulate` (with `npm run dev` running separately)
- **Real glasses (dev):** `npm run dev` then `npm run qr` — scan the QR code in Even Hub

## Amazon Music setup (Live mode)

1. Install [Amazon Music](https://play.google.com/store/apps/details?id=com.amazon.mp3) on your Android phone
2. Open Amazon Music and start playing a song
3. Launch this app in the Even Hub companion
4. Switch to **Live (Amazon Music)** in the companion UI
5. Control playback from the glasses ring or the phone buttons

If no session is detected, tap **Refresh session** or use **Open Amazon Music** in the setup card.

Live mode uses the Even App native bridge to read media metadata and send play/pause/next/previous commands. On device, it tries several bridge methods and falls back to Android media key events.

## Glasses controls

| Input | Action |
|-------|--------|
| Tap | Play / pause |
| Ring scroll up | Next track |
| Ring scroll down | Previous track |
| Double-click | Exit app |

When an action is triggered, the glasses HUD briefly shows feedback (e.g. `>> NEXT TRACK`).

## Build & install

```bash
npm run build    # Typecheck + production bundle → dist/
npm run pack     # Create amazon-music-controller.ehpk
```

Install the `.ehpk` package through Even Hub, or load the dev server on your phone via QR during development.

> **Note:** Even Hub app names must be 20 characters or fewer — the manifest uses **Amazon Music Ctrl**.

## Project structure

```
├── app.json              # Even Hub manifest
├── index.html            # Companion UI shell + styles
├── src/
│   ├── main.ts           # App bootstrap
│   ├── glasses-hud.ts    # G2 display (SDK text containers)
│   ├── companion-ui.ts   # Phone-side controls + setup
│   ├── media/
│   │   ├── media-controller.ts   # Playback state (live + demo)
│   │   ├── android-bridge.ts     # Native media session bridge
│   │   ├── amazon-music.ts       # Amazon Music intents & constants
│   │   └── demo-tracks.ts        # Simulated playlist
│   ├── layout/display.ts # G2 display dimensions (576×288)
│   └── types.ts
├── vite.config.ts
└── package.json
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server on port 5173 (LAN accessible) |
| `npm run demo` | Dev server + G2 simulator |
| `npm run simulate` | G2 simulator only |
| `npm run build` | Production build |
| `npm run pack` | Package as `.ehpk` for distribution |
| `npm run qr` | Print QR code for loading on real glasses |

## Architecture

This app follows the standard Even Hub pattern:

1. **Companion UI** — HTML/CSS in the phone WebView (`companion-ui.ts`)
2. **Glasses HUD** — SDK text containers, not DOM (`glasses-hud.ts`)
3. **Shared state** — `MediaController` with subscribe/notify feeds both UIs
4. **Bridge** — `@evenrealities/even_hub_sdk` for device communication

G2 display layout (576×288):

- **Left (360px)** — now playing text panel
- **Right (216px)** — control hints / action feedback

## License

Private project. Even Hub SDK is MIT-licensed — see `@evenrealities/even_hub_sdk`.
