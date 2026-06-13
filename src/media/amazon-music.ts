/** Amazon Music on Android */
export const AMAZON_MUSIC_PACKAGE = 'com.amazon.mp3'

export const AMAZON_MUSIC_PLAY_STORE =
  'https://play.google.com/store/apps/details?id=com.amazon.mp3'

/** Opens Amazon Music on Android via intent URL (Even Hub WebView). */
export const AMAZON_MUSIC_LAUNCH_INTENT =
  `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${AMAZON_MUSIC_PACKAGE};end`

export const SETUP_STEPS = [
  'Install Amazon Music from the Play Store',
  'Open Amazon Music and start playing any song',
  'Return here and switch to Live mode',
  'Control playback from the glasses ring or phone UI',
] as const

export function isAmazonMusicSession(appPackage?: string): boolean {
  if (!appPackage) return true
  return appPackage === AMAZON_MUSIC_PACKAGE || appPackage.includes('amazon')
}

export function openAmazonMusic(): void {
  const isAndroid = /Android/i.test(navigator.userAgent)
  if (isAndroid) {
    window.location.href = AMAZON_MUSIC_LAUNCH_INTENT
    return
  }
  window.open(AMAZON_MUSIC_PLAY_STORE, '_blank', 'noopener')
}

export function isAndroidEvenApp(): boolean {
  return (
    /Android/i.test(navigator.userAgent) &&
    typeof (window as Window & { _listenEvenAppMessage?: unknown })._listenEvenAppMessage ===
      'function'
  )
}
