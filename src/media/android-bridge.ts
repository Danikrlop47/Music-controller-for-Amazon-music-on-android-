import type { MediaAction, TrackInfo } from '../types'
import { isAmazonMusicSession } from './amazon-music'

export interface RemoteMediaState {
  track: TrackInfo
  isPlaying: boolean
  position: number
  appPackage?: string
  artworkUrl?: string
}

export interface BridgeCapabilities {
  canReadSession: boolean
  canControl: boolean
  detectedMethod?: string
}

interface NativeMediaResponse {
  success?: boolean
  title?: string
  artist?: string
  album?: string
  duration?: number
  position?: number
  isPlaying?: boolean
  playing?: boolean
  package?: string
  packageName?: string
  appPackage?: string
  artwork?: string
  artworkUrl?: string
  albumArt?: string
}

/** Android KeyEvent codes for media buttons */
const MEDIA_KEY_CODES: Partial<Record<MediaAction, number>> = {
  playPause: 85, // KEYCODE_MEDIA_PLAY_PAUSE
  next: 87, // KEYCODE_MEDIA_NEXT
  previous: 88, // KEYCODE_MEDIA_PREVIOUS
  play: 126, // KEYCODE_MEDIA_PLAY
  pause: 127, // KEYCODE_MEDIA_PAUSE
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function pickNumber(...values: unknown[]): number {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  }
  return 0
}

function parseNativeResponse(data: unknown): RemoteMediaState | null {
  if (!data || typeof data !== 'object') return null
  const r = data as NativeMediaResponse

  const title = pickString(r.title)
  const artist = pickString(r.artist)
  if (!title && !artist) return null

  const appPackage = pickString(r.package, r.packageName, r.appPackage)

  return {
    track: {
      title: title || 'Unknown',
      artist,
      album: pickString(r.album),
      duration: pickNumber(r.duration),
    },
    isPlaying: Boolean(r.isPlaying ?? r.playing),
    position: pickNumber(r.position),
    appPackage: appPackage || undefined,
    artworkUrl: pickString(r.artworkUrl, r.artwork, r.albumArt) || undefined,
  }
}

function isSuccessResult(result: unknown): boolean {
  if (result === true) return true
  if (!result || typeof result !== 'object') return false
  const r = result as NativeMediaResponse
  return Boolean(r.success)
}

/** Probe which native media APIs the Even App exposes. */
export async function probeBridgeCapabilities(
  bridge: { callEvenApp: (method: string, params?: unknown) => Promise<unknown> },
): Promise<BridgeCapabilities> {
  const readMethods = ['getMediaMetadata', 'getActiveMediaSession', 'getMediaSession', 'getNowPlaying']

  for (const method of readMethods) {
    try {
      const result = await bridge.callEvenApp(method, {})
      if (parseNativeResponse(result)) {
        return { canReadSession: true, canControl: true, detectedMethod: method }
      }
    } catch {
      // not available
    }
  }

  const isAndroid = /Android/i.test(navigator.userAgent)
  return { canReadSession: false, canControl: isAndroid, detectedMethod: isAndroid ? 'mediaKeyFallback' : undefined }
}

/** Read active media session from the Even App native bridge (Android). */
export async function fetchRemoteMediaState(
  bridge: { callEvenApp: (method: string, params?: unknown) => Promise<unknown> },
): Promise<RemoteMediaState | null> {
  const methods = [
    { method: 'getActiveMediaSession', params: {} },
    { method: 'getMediaMetadata', params: {} },
    { method: 'getMediaSession', params: {} },
    { method: 'getNowPlaying', params: {} },
  ]

  for (const { method, params } of methods) {
    try {
      const result = await bridge.callEvenApp(method, params)
      const parsed = parseNativeResponse(result)
      if (parsed) return parsed
    } catch {
      // Native method not available — try next
    }
  }

  return readBrowserMediaSession()
}

/** Send a media control command through the Even App native bridge. */
export async function sendRemoteMediaAction(
  bridge: { callEvenApp: (method: string, params?: unknown) => Promise<unknown> },
  action: MediaAction,
): Promise<boolean> {
  const actionMap: Record<MediaAction, string> = {
    play: 'play',
    pause: 'pause',
    playPause: 'toggle',
    next: 'next',
    previous: 'previous',
  }

  const keyCode = MEDIA_KEY_CODES[action]

  const payloads: Array<{ method: string; params: Record<string, unknown> }> = [
    { method: 'sendMediaAction', params: { action: actionMap[action] } },
    { method: 'mediaControl', params: { command: action } },
    { method: 'sendMediaKey', params: { key: actionMap[action] } },
    ...(keyCode != null
      ? [{ method: 'dispatchKeyEvent', params: { keyCode } }]
      : []),
  ]

  for (const { method, params } of payloads) {
    try {
      const result = await bridge.callEvenApp(method, params)
      if (isSuccessResult(result)) return true
    } catch {
      // Native method not available — try next
    }
  }

  return dispatchMediaKeyEvent(action)
}

export function filterAmazonMusicState(state: RemoteMediaState | null): RemoteMediaState | null {
  if (!state) return null
  if (isAmazonMusicSession(state.appPackage)) return state
  return state
}

function readBrowserMediaSession(): RemoteMediaState | null {
  if (!('mediaSession' in navigator)) return null

  const session = navigator.mediaSession
  const meta = session.metadata
  if (!meta) return null

  const artwork = meta.artwork?.[0]?.src

  return {
    track: {
      title: meta.title || 'Unknown',
      artist: meta.artist || '',
      album: meta.album || '',
      duration: 0,
    },
    isPlaying: session.playbackState === 'playing',
    position: 0,
    artworkUrl: artwork || undefined,
  }
}

/** Fallback: dispatch keyboard media key events (works in some WebView contexts). */
function dispatchMediaKeyEvent(action: MediaAction): boolean {
  const keyMap: Partial<Record<MediaAction, string>> = {
    playPause: 'MediaPlayPause',
    next: 'MediaTrackNext',
    previous: 'MediaTrackPrevious',
    play: 'MediaPlay',
    pause: 'MediaPause',
  }

  const code = keyMap[action]
  if (!code) return false

  try {
    for (const type of ['keydown', 'keyup'] as const) {
      document.dispatchEvent(
        new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }),
      )
    }
    return true
  } catch {
    return false
  }
}

/** Register a listener for browser Media Session metadata changes. */
export function onMediaSessionChange(callback: () => void): () => void {
  if (!('mediaSession' in navigator)) return () => {}

  const session = navigator.mediaSession
  let lastTitle = session.metadata?.title ?? ''

  const timer = setInterval(() => {
    const title = session.metadata?.title ?? ''
    const state = session.playbackState
    const key = `${title}|${state}`
    if (key !== lastTitle) {
      lastTitle = key
      callback()
    }
  }, 1500)

  return () => clearInterval(timer)
}
