import { HandlerFinderFn, HandlerFn } from "."
import { fixHiDPI } from "../utils/hidpi"
import { sendRightArrow } from "../utils/sendKeyEvent"
import { runAutoCapture, parseCounter, AutoCaptureAdapter } from "../utils/autoCapture"

const counterEl = () => document.querySelector(".toolbar-page-indicator")
const readCounts = () => parseCounter(counterEl()?.textContent)
const getSlideCount = () => readCounts()?.total || 0
const getCurrent = () => readCounts()?.current || 0

const getDimensions = () => {
  const imageElement = document.querySelectorAll(".item.active .viewer_content-container")[0]
  if (!imageElement) return null
  return fixHiDPI(imageElement.getClientRects()[0])
}


export const getHandlerFor: HandlerFinderFn = (url: string) => {
    // https://docsend.com/view/base32
    if (url.toLocaleLowerCase().match(/https\:\/\/([a-zA-Z0-9]+\.)?docsend\.com\/view\/[a-z0-9]+/)) return handler
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
