import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { MediaAction, TrackInfo } from '../types'

export interface RemoteMediaState {
  track: TrackInfo
  isPlaying: boolean
  position: number
}

interface NativeMediaResponse {
  success?: boolean
  title?: string
  artist?: string
  album?: string
  duration?: number
  position?: number
  isPlaying?: boolean
}

function parseNativeResponse(data: unknown): RemoteMediaState | null {
  if (!data || typeof data !== 'object') return null
  const r = data as NativeMediaResponse
  if (!r.title && !r.artist) return null

  return {
    track: {
      title: r.title ?? 'Unknown',
      artist: r.artist ?? '',
      album: r.album ?? '',
      duration: typeof r.duration === 'number' ? r.duration : 0,
    },
    isPlaying: Boolean(r.isPlaying),
    position: typeof r.position === 'number' ? r.position : 0,
  }
}

/** Read active media session from the Even App native bridge (Android). */
export async function fetchRemoteMediaState(
  bridge: EvenAppBridge,
): Promise<RemoteMediaState | null> {
  const methods = ['getMediaMetadata', 'getActiveMediaSession', 'getMediaSession']

  for (const method of methods) {
    try {
      const result = await bridge.callEvenApp(method, {})
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
  bridge: EvenAppBridge,
  action: MediaAction,
): Promise<boolean> {
  const actionMap: Record<MediaAction, string> = {
    play: 'play',
    pause: 'pause',
    playPause: 'toggle',
    next: 'next',
    previous: 'previous',
  }

  const payloads = [
    { method: 'sendMediaAction', params: { action: actionMap[action] } },
    { method: 'mediaControl', params: { command: action } },
    { method: 'sendMediaKey', params: { key: actionMap[action] } },
  ]

  for (const { method, params } of payloads) {
    try {
      const result = await bridge.callEvenApp(method, params)
      if (result === true || (result && typeof result === 'object' && (result as NativeMediaResponse).success)) {
        return true
      }
    } catch {
      // Native method not available — try next
    }
  }

  return dispatchMediaKeyEvent(action)
}

function readBrowserMediaSession(): RemoteMediaState | null {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.metadata) return null

  const meta = navigator.mediaSession.metadata
  return {
    track: {
      title: meta.title || 'Unknown',
      artist: meta.artist || '',
      album: meta.album || '',
      duration: 0,
    },
    isPlaying: navigator.mediaSession.playbackState === 'playing',
    position: 0,
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
    document.dispatchEvent(
      new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }),
    )
    return true
  } catch {
    return false
  }
}
