import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { mountCompanionUi } from './companion-ui'
import { GlassesHud } from './glasses-hud'
import { MediaController } from './media/media-controller'

const bridge = await waitForEvenAppBridge()
const controller = new MediaController(bridge)
await controller.init()

const hud = new GlassesHud(bridge)
await hud.ensurePage()

controller.subscribe(snapshot => {
  void hud.render(snapshot)
})

const unbindHud = hud.bindEvents({
  onPlayPause: () => void controller.sendAction('playPause', true),
  onNext: () => void controller.sendAction('next', true),
  onPrevious: () => void controller.sendAction('previous', true),
})

const appRoot = document.querySelector<HTMLElement>('#app')
if (appRoot) mountCompanionUi(controller, appRoot)

controller.autoSelectSource()

// Start demo playback when in demo mode so glasses HUD shows activity immediately
if (controller.getSource() === 'demo') {
  void controller.sendAction('play')
}

console.log('[app] Amazon Music Controller ready')

window.addEventListener('beforeunload', () => {
  controller.dispose()
  unbindHud()
})
