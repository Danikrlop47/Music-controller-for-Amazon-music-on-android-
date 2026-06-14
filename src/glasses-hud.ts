import {
  EvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import {
  CONTROLS_PANEL_H,
  CONTROLS_PANEL_W,
  CONTROLS_PANEL_X,
  DISPLAY_H,
  DISPLAY_W,
  INFO_PANEL_H,
  INFO_PANEL_W,
} from './layout/display'
import {
  actionLabel,
  formatDuration,
  truncate,
  type MediaSnapshot,
} from './types'

const EVENT_LAYER_ID = 1
const INFO_CONTAINER_ID = 2
const CONTROLS_CONTAINER_ID = 3

function normalizeEventType(raw: unknown): OsEventTypeList | undefined {
  if (raw === undefined || raw === null) return undefined
  return OsEventTypeList.fromJson(raw)
}

/** Resolve OS input events — click often arrives as sysEvent.eventSource only. */
function resolveEventType(event: EvenHubEvent): OsEventTypeList | undefined {
  const fromText = normalizeEventType(event.textEvent?.eventType)
  if (fromText !== undefined) return fromText

  const fromList = normalizeEventType(event.listEvent?.eventType)
  if (fromList !== undefined) return fromList

  const fromSys = normalizeEventType(event.sysEvent?.eventType)
  if (fromSys !== undefined) return fromSys

  const json = event.jsonData as { eventType?: unknown; eventSource?: unknown } | undefined
  const fromJson = normalizeEventType(json?.eventType)
  if (fromJson !== undefined) return fromJson

  // Single tap: G2 firmware / simulator sends eventSource without eventType
  if (
    event.sysEvent?.eventSource != null &&
    event.sysEvent.eventType == null &&
    !event.sysEvent.imuData
  ) {
    return OsEventTypeList.CLICK_EVENT
  }

  if (
    json?.eventSource != null &&
    json.eventType == null &&
    !event.textEvent &&
    !event.listEvent
  ) {
    return OsEventTypeList.CLICK_EVENT
  }

  return undefined
}

function formatInfoPanel(snapshot: MediaSnapshot): string {
  const { track, isPlaying, position } = snapshot
  const state = isPlaying ? '> Playing' : '|| Paused'
  const progress =
    track.duration > 0
      ? `${formatDuration(position)} / ${formatDuration(track.duration)}`
      : formatDuration(position)

  return [
    'NOW PLAYING',
    '',
    truncate(track.title, 28),
    truncate(track.artist, 28),
    track.album ? truncate(track.album, 28) : '',
    '',
    state,
    progress,
  ]
    .filter(Boolean)
    .join('\n')
}

function formatControlsPanel(snapshot: MediaSnapshot): string {
  if (snapshot.lastAction) {
    return ['', `>> ${actionLabel(snapshot.lastAction)}`, ''].join('\n')
  }

  const lines = [
    'CONTROLS',
    '',
    'Tap = play/pause',
    'Scroll up = next',
    'Scroll dn = prev',
    'Dbl-click = exit',
  ]

  if (snapshot.source === 'live') {
    if (snapshot.status === 'no_session') {
      lines.push('', 'No session', 'Open Amazon', 'Music first')
    } else if (snapshot.status === 'ok') {
      lines.push('', 'Amazon Music', 'connected')
    }
  } else {
    lines.push('', 'Demo mode')
  }

  return lines.join('\n')
}

export class GlassesHud {
  private pageReady = false
  private updateQueue: Promise<void> = Promise.resolve()
  private lastInfoKey = ''
  private lastControlsKey = ''

  constructor(private bridge: EvenAppBridge) {}

  private pageContainers() {
    const eventLayer = new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: DISPLAY_W,
      height: DISPLAY_H,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 0,
      containerID: EVENT_LAYER_ID,
      containerName: 'events',
      content: ' ',
      isEventCapture: 1,
    })

    const infoPanel = new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: INFO_PANEL_W,
      height: INFO_PANEL_H,
      borderWidth: 1,
      borderColor: 5,
      paddingLength: 2,
      containerID: INFO_CONTAINER_ID,
      containerName: 'now-playing',
      content: 'Loading…',
      isEventCapture: 0,
    })

    const controlsPanel = new TextContainerProperty({
      xPosition: CONTROLS_PANEL_X,
      yPosition: 0,
      width: CONTROLS_PANEL_W,
      height: CONTROLS_PANEL_H,
      borderWidth: 1,
      borderColor: 5,
      paddingLength: 2,
      containerID: CONTROLS_CONTAINER_ID,
      containerName: 'controls',
      content: 'Controls',
      isEventCapture: 0,
    })

    return { eventLayer, infoPanel, controlsPanel }
  }

  async init(): Promise<void> {
    const { eventLayer, infoPanel, controlsPanel } = this.pageContainers()

    const result = await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 3,
        textObject: [eventLayer, infoPanel, controlsPanel],
      }),
    )

    this.pageReady = result === 0
    console.log('[hud] page created:', this.pageReady ? 'ok' : `failed (${result})`)
  }

  async rebuild(): Promise<void> {
    const { eventLayer, infoPanel, controlsPanel } = this.pageContainers()

    const ok = await this.bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 3,
        textObject: [eventLayer, infoPanel, controlsPanel],
      }),
    )

    this.pageReady = ok
    console.log('[hud] page rebuilt:', ok ? 'ok' : 'failed')
  }

  async ensurePage(): Promise<void> {
    await this.init()
    if (!this.pageReady) await this.rebuild()
  }

  render(snapshot: MediaSnapshot): Promise<void> {
    if (!this.pageReady) return Promise.resolve()

    const infoText = formatInfoPanel(snapshot)
    const controlsText = formatControlsPanel(snapshot)
    const infoKey = `${infoText}|${snapshot.isPlaying}|${Math.floor(snapshot.position)}`
    const controlsKey = `${controlsText}|${snapshot.status}|${snapshot.lastAction ?? ''}`

    if (infoKey === this.lastInfoKey && controlsKey === this.lastControlsKey) {
      return Promise.resolve()
    }

    this.lastInfoKey = infoKey
    this.lastControlsKey = controlsKey

    this.updateQueue = this.updateQueue.then(async () => {
      const infoOk = await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: INFO_CONTAINER_ID,
          containerName: 'now-playing',
          contentOffset: 0,
          contentLength: infoText.length,
          content: infoText,
        }),
      )
      if (!infoOk) console.warn('[hud] info textContainerUpgrade failed')

      const controlsOk = await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: CONTROLS_CONTAINER_ID,
          containerName: 'controls',
          contentOffset: 0,
          contentLength: controlsText.length,
          content: controlsText,
        }),
      )
      if (!controlsOk) console.warn('[hud] controls textContainerUpgrade failed')
    })

    return this.updateQueue
  }

  bindEvents(handlers: {
    onPlayPause: () => void
    onNext: () => void
    onPrevious: () => void
  }): () => void {
    let lastEventAt = 0
    const DEBOUNCE_MS = 250

    const handleType = (type: OsEventTypeList | undefined): void => {
      if (type == null) return

      const now = Date.now()
      if (now - lastEventAt < DEBOUNCE_MS) return
      lastEventAt = now

      if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        void this.bridge.shutDownPageContainer(1)
        return
      }

      if (type === OsEventTypeList.CLICK_EVENT) {
        handlers.onPlayPause()
        return
      }

      if (type === OsEventTypeList.SCROLL_TOP_EVENT) {
        handlers.onNext()
        return
      }

      if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        handlers.onPrevious()
        return
      }

      if (
        type === OsEventTypeList.SYSTEM_EXIT_EVENT ||
        type === OsEventTypeList.ABNORMAL_EXIT_EVENT
      ) {
        this.pageReady = false
      }
    }

    return this.bridge.onEvenHubEvent(event => {
      const type = resolveEventType(event)
      handleType(type)
    })
  }
}
