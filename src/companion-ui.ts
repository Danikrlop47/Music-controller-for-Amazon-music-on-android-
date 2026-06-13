import {
  AMAZON_MUSIC_PACKAGE,
  openAmazonMusic,
  SETUP_STEPS,
} from './media/amazon-music'
import { DEMO_TRACKS } from './media/demo-tracks'
import type { MediaController } from './media/media-controller'
import { formatDuration, type MediaSnapshot } from './types'

export function mountCompanionUi(
  controller: MediaController,
  root: HTMLElement,
): void {
  root.innerHTML = `
    <div class="shell">
      <header>
        <p class="eyebrow">Even G2 · Music Controller</p>
        <h1>Amazon Music</h1>
        <p class="subtitle">Control playback from your glasses or phone</p>
      </header>

      <section class="card now-playing-card">
        <div class="now-playing">
          <div class="artwork" id="artwork">AM</div>
          <p class="track-title" id="track-title">—</p>
          <p class="track-artist" id="track-artist">—</p>
          <p class="track-album" id="track-album"></p>
          <span class="play-state paused" id="play-state">Paused</span>
          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-times">
              <span id="time-current">0:00</span>
              <span id="time-total">0:00</span>
            </div>
          </div>
          <div class="controls">
            <button type="button" class="ctrl-btn" id="btn-prev" aria-label="Previous">⏮</button>
            <button type="button" class="ctrl-btn primary" id="btn-play" aria-label="Play/Pause">▶</button>
            <button type="button" class="ctrl-btn" id="btn-next" aria-label="Next">⏭</button>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Mode</h2>
        <div class="mode-toggle">
          <button type="button" id="mode-live" class="mode-btn">Live (Amazon Music)</button>
          <button type="button" id="mode-demo" class="mode-btn active">Demo</button>
        </div>
        <p class="status-line" id="status-line">Demo mode — simulated tracks</p>
        <button type="button" id="refresh-btn" class="secondary" hidden>Refresh session</button>
      </section>

      <section class="card setup-card" id="setup-section">
        <h2>Amazon Music setup</h2>
        <ol class="setup-steps" id="setup-steps"></ol>
        <div class="setup-actions">
          <button type="button" id="open-amazon-btn" class="primary-btn">Open Amazon Music</button>
        </div>
        <p class="bridge-status" id="bridge-status"></p>
      </section>

      <section class="card demo-section" id="demo-section">
        <h2>Demo playlist</h2>
        <p class="demo-hint">Use demo mode to test glasses controls in the simulator.</p>
        <ul class="demo-tracks" id="demo-tracks"></ul>
      </section>

      <section class="card hints">
        <h2>Glasses controls</h2>
        <ul>
          <li><strong>Tap</strong> → play / pause</li>
          <li><strong>Ring scroll up</strong> → next track</li>
          <li><strong>Ring scroll down</strong> → previous track</li>
          <li><strong>Double-click</strong> → exit app</li>
        </ul>
      </section>
    </div>
  `

  const artwork = root.querySelector<HTMLElement>('#artwork')!
  const trackTitle = root.querySelector<HTMLElement>('#track-title')!
  const trackArtist = root.querySelector<HTMLElement>('#track-artist')!
  const trackAlbum = root.querySelector<HTMLElement>('#track-album')!
  const playState = root.querySelector<HTMLElement>('#play-state')!
  const progressFill = root.querySelector<HTMLElement>('#progress-fill')!
  const timeCurrent = root.querySelector<HTMLElement>('#time-current')!
  const timeTotal = root.querySelector<HTMLElement>('#time-total')!
  const btnPlay = root.querySelector<HTMLButtonElement>('#btn-play')!
  const btnPrev = root.querySelector<HTMLButtonElement>('#btn-prev')!
  const btnNext = root.querySelector<HTMLButtonElement>('#btn-next')!
  const modeLiveBtn = root.querySelector<HTMLButtonElement>('#mode-live')!
  const modeDemoBtn = root.querySelector<HTMLButtonElement>('#mode-demo')!
  const statusLine = root.querySelector<HTMLElement>('#status-line')!
  const refreshBtn = root.querySelector<HTMLButtonElement>('#refresh-btn')!
  const demoSection = root.querySelector<HTMLElement>('#demo-section')!
  const setupSection = root.querySelector<HTMLElement>('#setup-section')!
  const demoTracksList = root.querySelector<HTMLElement>('#demo-tracks')!
  const setupSteps = root.querySelector<HTMLElement>('#setup-steps')!
  const bridgeStatus = root.querySelector<HTMLElement>('#bridge-status')!
  const openAmazonBtn = root.querySelector<HTMLButtonElement>('#open-amazon-btn')!

  for (const step of SETUP_STEPS) {
    const li = document.createElement('li')
    li.textContent = step
    setupSteps.appendChild(li)
  }

  for (const [i, track] of DEMO_TRACKS.entries()) {
    const li = document.createElement('li')
    li.dataset.index = String(i)
    li.innerHTML = `
      <div class="track-name">${track.title}</div>
      <div class="track-meta">${track.artist} · ${track.album}</div>
    `
    demoTracksList.appendChild(li)
  }

  const caps = controller.getBridgeCapabilities()
  if (caps.canReadSession || caps.canControl) {
    bridgeStatus.textContent = `Native media bridge detected (${caps.detectedMethod ?? 'ok'})`
    bridgeStatus.className = 'bridge-status ok'
  } else {
    bridgeStatus.textContent =
      'Native bridge not detected — controls use media key fallback on device'
    bridgeStatus.className = 'bridge-status'
  }

  function renderStatus(snapshot: MediaSnapshot): void {
    modeLiveBtn.classList.toggle('active', snapshot.source === 'live')
    modeDemoBtn.classList.toggle('active', snapshot.source === 'demo')
    demoSection.hidden = snapshot.source === 'live'
    setupSection.hidden = snapshot.source === 'demo'
    refreshBtn.hidden = snapshot.source !== 'live'

    if (snapshot.source === 'live') {
      if (snapshot.status === 'loading') {
        statusLine.textContent = 'Connecting to Amazon Music session…'
        statusLine.className = 'status-line loading'
      } else if (snapshot.status === 'ok') {
        const pkg =
          snapshot.appPackage === AMAZON_MUSIC_PACKAGE ? 'Amazon Music' : 'Media app'
        statusLine.textContent = `Live · ${pkg} · updated ${snapshot.updatedAt.toLocaleTimeString()}`
        statusLine.className = 'status-line ok'
      } else if (snapshot.status === 'no_session') {
        statusLine.textContent = snapshot.error ?? 'No active media session'
        statusLine.className = 'status-line error'
      } else {
        statusLine.textContent = snapshot.error ?? 'Media session error'
        statusLine.className = 'status-line error'
      }
    } else {
      statusLine.textContent = 'Demo mode — test glasses controls here'
      statusLine.className = 'status-line'
    }
  }

  function render(snapshot: MediaSnapshot): void {
    const { track, isPlaying, position, artworkUrl } = snapshot

    trackTitle.textContent = track.title
    trackArtist.textContent = track.artist
    trackAlbum.textContent = track.album
    playState.textContent = isPlaying ? 'Playing' : 'Paused'
    playState.className = `play-state ${isPlaying ? 'playing' : 'paused'}`
    btnPlay.textContent = isPlaying ? '⏸' : '▶'

    const pct = track.duration > 0 ? Math.min(100, (position / track.duration) * 100) : 0
    progressFill.style.width = `${pct}%`
    timeCurrent.textContent = formatDuration(position)
    timeTotal.textContent = formatDuration(track.duration)

    if (artworkUrl) {
      artwork.style.backgroundImage = `url(${artworkUrl})`
      artwork.style.backgroundSize = 'cover'
      artwork.style.backgroundPosition = 'center'
      artwork.textContent = ''
    } else {
      artwork.style.backgroundImage = ''
      artwork.textContent = 'AM'
    }

    demoTracksList.querySelectorAll('li').forEach((li, i) => {
      const idx = DEMO_TRACKS.findIndex(t => t.title === track.title && t.artist === track.artist)
      li.classList.toggle('active', snapshot.source === 'demo' && i === idx)
    })

    renderStatus(snapshot)
  }

  controller.subscribe(render)

  btnPlay.addEventListener('click', () => void controller.sendAction('playPause'))
  btnPrev.addEventListener('click', () => void controller.sendAction('previous'))
  btnNext.addEventListener('click', () => void controller.sendAction('next'))

  modeLiveBtn.addEventListener('click', () => controller.setSource('live'))
  modeDemoBtn.addEventListener('click', () => controller.setSource('demo'))
  refreshBtn.addEventListener('click', () => void controller.refreshLive())
  openAmazonBtn.addEventListener('click', () => openAmazonMusic())

  demoTracksList.addEventListener('click', e => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('li')
    if (!li?.dataset.index) return
    controller.setSource('demo')
    controller.selectDemoTrack(Number(li.dataset.index))
  })
}
