import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { fetchRemoteMediaState, sendRemoteMediaAction } from './android-bridge'
import { DEMO_TRACKS } from './demo-tracks'
import type { MediaAction, MediaSnapshot, MediaSource, TrackInfo } from '../types'

const POLL_INTERVAL_MS = 2000
const DEMO_TICK_MS = 1000

type Listener = (snapshot: MediaSnapshot) => void

export class MediaController {
  private listeners = new Set<Listener>()
  private source: MediaSource = 'demo'
  private trackIndex = 0
  private liveTrack: TrackInfo | null = null
  private isPlaying = false
  private position = 0
  private status: MediaSnapshot['status'] = 'ok'
  private error?: string
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private demoTimer: ReturnType<typeof setInterval> | null = null
  private updatedAt = new Date()

  constructor(private bridge: EvenAppBridge) {}

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
    }
  }

  getSource(): MediaSource {
    return this.source
  }

  setSource(source: MediaSource): void {
    if (this.source === source) return
    this.source = source
    this.stopTimers()

    if (source === 'live') {
      this.status = 'loading'
      this.notify()
      void this.pollLive()
      this.pollTimer = setInterval(() => void this.pollLive(), POLL_INTERVAL_MS)
    } else {
      this.status = 'ok'
      this.error = undefined
      this.startDemoTimer()
      this.notify()
    }
  }

  async sendAction(action: MediaAction): Promise<void> {
    if (this.source === 'live') {
      await sendRemoteMediaAction(this.bridge, action)
      await this.pollLive()
      return
    }

    switch (action) {
      case 'play':
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
      case 'pause':
        this.isPlaying = false
        this.stopDemoTimer()
        break
    }

    this.touch()
    this.notify()
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
    this.listeners.clear()
  }

  private async pollLive(): Promise<void> {
    const remote = await fetchRemoteMediaState(this.bridge)

    if (remote) {
      this.liveTrack = { ...remote.track }
      this.isPlaying = remote.isPlaying
      this.position = remote.position
      this.status = 'ok'
      this.error = undefined
    } else {
      this.status = 'no_session'
      this.error = 'No active media session. Start Amazon Music on your phone.'
    }

    this.touch()
    this.notify()
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
    this.stopDemoTimer()
  }

  private touch(): void {
    this.updatedAt = new Date()
  }

  private notify(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
