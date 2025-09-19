import { HandlerFinderFn, HandlerFn } from "."
import { fixHiDPI } from "../utils/hidpi"
import { sendRightArrow } from "../utils/sendKeyEvent"
import { runAutoCapture, parseCounter, AutoCaptureAdapter } from "../utils/autoCapture"

const counterEl = () => document.querySelector(".player-v2-chrome-controls-slide-count")
const readCounts = () => parseCounter(counterEl()?.textContent)
const getSlideCount = () => readCounts()?.total || 0
const getCurrent = () => readCounts()?.current || 0

const getDimensions = () => {
  const imageElement = document.querySelectorAll(".slide-wrapper")[0]
  if (!imageElement) return null
  return fixHiDPI(imageElement.getClientRects()[0])
}

export const getHandlerFor: HandlerFinderFn = (url: string) => {
    // https://pitch.com/public/uuid/uuid
    if (url.match(/https\:\/\/pitch\.com\/public\/[a-f0-9\-]+/)) return handler
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
      next: () => sendRightArrow(),
      debounceAfterNextMs: 600,
    }
    await runAutoCapture(adapter)
}

export const getCounts = () => readCounts()
