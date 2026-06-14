import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { isAndroidEvenApp } from './amazon-music'
import {
  fetchRemoteMediaState,
  filterAmazonMusicState,
  onMediaSessionChange,
  probeBridgeCapabilities,
  sendRemoteMediaAction,
  type BridgeCapabilities,
} from './android-bridge'
import { DEMO_TRACKS } from './demo-tracks'
import type {
  ControlFeedback,
  MediaAction,
  MediaSnapshot,
  MediaSource,
  TrackInfo,
} from '../types'

const POLL_INTERVAL_MS = 1500
const DEMO_TICK_MS = 1000
const FEEDBACK_MS = 900
const LIVE_TICK_MS = 1000

type Listener = (snapshot: MediaSnapshot) => void

export class MediaController {
  private listeners = new Set<Listener>()
  private source: MediaSource = 'demo'
  private trackIndex = 0
  private liveTrack: TrackInfo | null = null
  private liveArtworkUrl?: string
  private liveAppPackage?: string
  private isPlaying = false
  private position = 0
  private status: MediaSnapshot['status'] = 'ok'
  private error?: string
  private lastAction: ControlFeedback = null
  private bridgeCaps: BridgeCapabilities = { canReadSession: false, canControl: false }
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private demoTimer: ReturnType<typeof setInterval> | null = null
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null
  private updatedAt = new Date()
  private unbindMediaSession: (() => void) | null = null
  private actionInFlight = false

  constructor(private bridge: EvenAppBridge) {}

  async init(): Promise<void> {
    this.bridgeCaps = await probeBridgeCapabilities(this.bridge)
    this.unbindMediaSession = onMediaSessionChange(() => {
      if (this.source === 'live') void this.pollLive()
    })
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): MediaSnapshot {
    const track =
      this.source === 'live' && this.liveTrack
        ? this.liveTrack
        : DEMO_TRACKS[this.trackIndex]

    return {
      track,
      isPlaying: this.isPlaying,
      position: this.position,
      source: this.source,
      status: this.status,
      error: this.error,
      updatedAt: this.updatedAt,
      artworkUrl: this.source === 'live' ? this.liveArtworkUrl : undefined,
      appPackage: this.source === 'live' ? this.liveAppPackage : undefined,
      lastAction: this.lastAction,
      bridgeAvailable: this.bridgeCaps.canReadSession || this.bridgeCaps.canControl,
    }
  }

  getSource(): MediaSource {
    return this.source
  }

  getBridgeCapabilities(): BridgeCapabilities {
    return this.bridgeCaps
  }

  setSource(source: MediaSource): void {
    if (this.source === source) return
    this.source = source
    this.stopTimers()
    this.lastAction = null

    if (source === 'live') {
      this.status = 'loading'
      this.notify()
      void this.pollLive()
      this.pollTimer = setInterval(() => void this.pollLive(), POLL_INTERVAL_MS)
      this.startLiveTick()
    } else {
      this.status = 'ok'
      this.error = undefined
      this.liveTrack = null
      this.startDemoTimer()
      this.notify()
    }
  }

  async refreshLive(): Promise<void> {
    if (this.source !== 'live') return
    this.status = 'loading'
    this.notify()
    await this.pollLive()
  }

  async sendAction(action: MediaAction, _fromGlasses = false): Promise<void> {
    if (this.actionInFlight) return
    this.actionInFlight = true

    const feedback: ControlFeedback =
      action === 'playPause' || action === 'play' || action === 'pause'
        ? 'playPause'
        : action === 'next'
          ? 'next'
          : action === 'previous'
            ? 'previous'
            : null

    if (feedback) this.flashAction(feedback)

    try {
      if (this.source === 'live') {
        if (action === 'playPause') this.isPlaying = !this.isPlaying
        else if (action === 'play') this.isPlaying = true
        else if (action === 'pause') this.isPlaying = false
        this.touch()
        this.notify()

        await sendRemoteMediaAction(this.bridge, action)
        await this.pollLive()
        return
      }

      switch (action) {
        case 'play':
          this.isPlaying = true
          this.startDemoTimer()
          break
        case 'pause':
          this.isPlaying = false
          this.stopDemoTimer()
          break
        case 'playPause':
          this.isPlaying = !this.isPlaying
          if (this.isPlaying) this.startDemoTimer()
          else this.stopDemoTimer()
          break
        case 'next':
          this.trackIndex = (this.trackIndex + 1) % DEMO_TRACKS.length
          this.position = 0
          this.isPlaying = true
          this.startDemoTimer()
          break
        case 'previous':
          if (this.position > 3) {
            this.position = 0
          } else {
            this.trackIndex = (this.trackIndex - 1 + DEMO_TRACKS.length) % DEMO_TRACKS.length
            this.position = 0
          }
          this.isPlaying = true
          this.startDemoTimer()
          break
      }

      this.touch()
      this.notify()
    } finally {
      this.actionInFlight = false
    }
  }

  selectDemoTrack(index: number): void {
    if (index < 0 || index >= DEMO_TRACKS.length) return
    this.trackIndex = index
    this.position = 0
    this.isPlaying = true
    this.startDemoTimer()
    this.touch()
    this.notify()
  }

  dispose(): void {
    this.stopTimers()
    this.unbindMediaSession?.()
    this.listeners.clear()
  }

  /** Prefer live on Android Even App; demo elsewhere. */
  autoSelectSource(): void {
    this.setSource(isAndroidEvenApp() ? 'live' : 'demo')
  }

  private async pollLive(): Promise<void> {
    const remote = filterAmazonMusicState(await fetchRemoteMediaState(this.bridge))

    if (remote) {
      this.liveTrack = { ...remote.track }
      this.liveArtworkUrl = remote.artworkUrl
      this.liveAppPackage = remote.appPackage
      this.isPlaying = remote.isPlaying
      this.position = remote.position
      this.status = 'ok'
      this.error = undefined
    } else {
      this.status = 'no_session'
      this.error = 'Start Amazon Music and play a song, then tap Refresh.'
    }

    this.touch()
    this.notify()
  }

  private flashAction(action: ControlFeedback): void {
    this.lastAction = action
    this.notify()

    if (this.feedbackTimer) clearTimeout(this.feedbackTimer)
    this.feedbackTimer = setTimeout(() => {
      this.lastAction = null
      this.notify()
    }, FEEDBACK_MS)
  }

  private startLiveTick(): void {
    this.stopLiveTick()
    this.tickTimer = setInterval(() => {
      if (this.source !== 'live' || !this.isPlaying) return
      const duration = this.liveTrack?.duration ?? 0
      if (duration > 0 && this.position >= duration) return
      this.position += 1
      this.touch()
      this.notify()
    }, LIVE_TICK_MS)
  }

  private stopLiveTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  private startDemoTimer(): void {
    this.stopDemoTimer()
    if (!this.isPlaying) return

    this.demoTimer = setInterval(() => {
      const track = DEMO_TRACKS[this.trackIndex]
      this.position += 1
      if (track.duration > 0 && this.position >= track.duration) {
        this.trackIndex = (this.trackIndex + 1) % DEMO_TRACKS.length
        this.position = 0
      }
      this.touch()
      this.notify()
    }, DEMO_TICK_MS)
  }

  private stopDemoTimer(): void {
    if (this.demoTimer) {
      clearInterval(this.demoTimer)
      this.demoTimer = null
    }
  }

  private stopTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.stopLiveTick()
    this.stopDemoTimer()
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer)
      this.feedbackTimer = null
    }
  }

  private touch(): void {
    this.updatedAt = new Date()
  }

  private notify(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
