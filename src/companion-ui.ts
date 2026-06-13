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
          <div class="artwork" id="artwork">♫</div>
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
      </section>

      <section class="card demo-section" id="demo-section">
        <h2>Demo playlist</h2>
        <ul class="demo-tracks" id="demo-tracks"></ul>
      </section>

      <section class="card hints">
        <h2>Glasses controls</h2>
        <ul>
          <li><strong>Tap</strong> → play / pause</li>
          <li><strong>Ring scroll up</strong> → next track</li>
          <li><strong>Ring scroll down</strong> → previous track</li>
          <li><strong>Double-click</strong> → exit app</li>
          <li>Live mode reads the active Android media session (Amazon Music)</li>
        </ul>
      </section>
    </div>
  `

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
  const demoSection = root.querySelector<HTMLElement>('#demo-section')!
  const demoTracksList = root.querySelector<HTMLElement>('#demo-tracks')!

  for (const [i, track] of DEMO_TRACKS.entries()) {
    const li = document.createElement('li')
    li.dataset.index = String(i)
    li.innerHTML = `
      <div class="track-name">${track.title}</div>
      <div class="track-meta">${track.artist} · ${track.album}</div>
    `
    demoTracksList.appendChild(li)
  }

  function renderStatus(snapshot: MediaSnapshot): void {
    modeLiveBtn.classList.toggle('active', snapshot.source === 'live')
    modeDemoBtn.classList.toggle('active', snapshot.source === 'demo')
    demoSection.hidden = snapshot.source === 'live'

    if (snapshot.source === 'live') {
      if (snapshot.status === 'loading') {
        statusLine.textContent = 'Connecting to media session…'
        statusLine.className = 'status-line loading'
      } else if (snapshot.status === 'ok') {
        statusLine.textContent = `Live · Amazon Music · updated ${snapshot.updatedAt.toLocaleTimeString()}`
        statusLine.className = 'status-line ok'
      } else if (snapshot.status === 'no_session') {
        statusLine.textContent = snapshot.error ?? 'No active media session'
        statusLine.className = 'status-line error'
      } else {
        statusLine.textContent = snapshot.error ?? 'Media session error'
        statusLine.className = 'status-line error'
      }
    } else {
      statusLine.textContent = 'Demo mode — simulated tracks'
      statusLine.className = 'status-line'
    }
  }

  function render(snapshot: MediaSnapshot): void {
    const { track, isPlaying, position } = snapshot

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

    demoTracksList.querySelectorAll('li').forEach((li, i) => {
      const idx = DEMO_TRACKS.findIndex(t => t.title === track.title && t.artist === track.artist)
      li.classList.toggle('active', i === idx)
    })

    renderStatus(snapshot)
  }

  controller.subscribe(render)

  btnPlay.addEventListener('click', () => void controller.sendAction('playPause'))
  btnPrev.addEventListener('click', () => void controller.sendAction('previous'))
  btnNext.addEventListener('click', () => void controller.sendAction('next'))

  modeLiveBtn.addEventListener('click', () => controller.setSource('live'))
  modeDemoBtn.addEventListener('click', () => controller.setSource('demo'))

  demoTracksList.addEventListener('click', e => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('li')
    if (!li?.dataset.index) return
    controller.selectDemoTrack(Number(li.dataset.index))
  })
}
