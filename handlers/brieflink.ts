import { HandlerFinderFn, HandlerFn } from "."
import { fixHiDPI } from "../utils/hidpi"
import { runAutoCapture, parseCounter, AutoCaptureAdapter } from "../utils/autoCapture"
import { sendRightArrow } from "../utils/sendKeyEvent"

const counterEl = () => document.querySelector(".DeckSlider_ButtonContainer")
const readCounts = () => parseCounter(counterEl()?.textContent)
const getSlideCount = () => readCounts()?.total || 0
const getCurrent = () => readCounts()?.current || 0

const getDimensions = () => {
  const imageElement = document.querySelectorAll(".DeckGalleryPageContainer")[0]
  if (!imageElement) return null
  return fixHiDPI(imageElement.getClientRects()[0])
}

export const getHandlerFor: HandlerFinderFn = (url: string) => {
    // https://brieflink.com/v/hash
    if (url.match(/https\:\/\/brieflink\.com\/v\/[a-f0-9\-]+/)) return handler
    return null
}

export const handler: HandlerFn = async () => {
    const adapter: AutoCaptureAdapter = {
      ready: async () => {
        const start = Date.now();
        while (Date.now() - start < 3000) {
          if (counterEl()) return;
          await new Promise(r => setTimeout(r, 100));
        }
      },
      getTotal: getSlideCount,
      getCurrent: getCurrent,
      getDimensions: () => getDimensions(),
      next: () => {
        // Some sites respond to keyup; use a more permissive event
        try { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })); } catch { sendRightArrow() }
      },
      debounceAfterNextMs: 600,
    }
    await runAutoCapture(adapter)
}

export const getCounts = () => readCounts()
