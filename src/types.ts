export type MediaAction = 'play' | 'pause' | 'playPause' | 'next' | 'previous'

export type MediaSource = 'live' | 'demo'

export type MediaStatus = 'ok' | 'no_session' | 'loading' | 'error'

export interface TrackInfo {
  title: string
  artist: string
  album: string
  duration: number
}

export interface MediaSnapshot {
  track: TrackInfo
  isPlaying: boolean
  position: number
  source: MediaSource
  status: MediaStatus
  error?: string
  updatedAt: Date
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}
