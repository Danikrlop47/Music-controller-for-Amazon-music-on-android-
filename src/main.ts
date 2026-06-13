import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { mountCompanionUi } from './companion-ui'
import { GlassesHud } from './glasses-hud'
import { MediaController } from './media/media-controller'

const bridge = await waitForEvenAppBridge()
const controller = new MediaController(bridge)

const hud = new GlassesHud(bridge)
await hud.ensurePage()

controller.subscribe(snapshot => {
  void hud.render(snapshot)
})

const unbindHud = hud.bindEvents({
  onPlayPause: () => void controller.sendAction('playPause'),
  onNext: () => void controller.sendAction('next'),
  onPrevious: () => void controller.sendAction('previous'),
})

const appRoot = document.querySelector<HTMLElement>('#app')
if (appRoot) mountCompanionUi(controller, appRoot)

controller.setSource('demo')
console.log('[app] Amazon Music Controller ready — demo mode active')

window.addEventListener('beforeunload', () => {
  controller.dispose()
  unbindHud()
})
