import { HandlerFinderFn, HandlerFn } from "."
import { fixHiDPI } from "../utils/hidpi"
import { runAutoCapture, parseCounter, AutoCaptureAdapter } from "../utils/autoCapture"


class SpecialKeyboardEvent extends KeyboardEvent {
  constructor(type: string, keyboardEventInit: KeyboardEventInit & {target: HTMLElement} | undefined) {
    super(type, keyboardEventInit)
  }
}

const counterEl = () => document.querySelector('button[title="Next page"]')?.previousElementSibling as HTMLElement | null
const readCounts = () => parseCounter(counterEl()?.innerText)
const getSlideCount = () => readCounts()?.total || 0
const getCurrent = () => readCounts()?.current || 0

const getDimensions = () => {
  const imageElement = document.querySelectorAll("body > div > div > div.flex.flex-shrink-0.py-10 > div")[0]
  if (!imageElement) return null
  return fixHiDPI(imageElement.getClientRects()[0])
}


export const getHandlerFor: HandlerFinderFn = (url: string) => {
    // https://docsend.com/view/base32
    if (url.toLocaleLowerCase().match(/https\:\/\/decks\.visible\.vc\/[a-zA-Z0-9\_\-]+/)) return handler
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
      next: () => document.dispatchEvent(new SpecialKeyboardEvent('keydown', { key: 'ArrowRight', target: document.body } as any)),
      debounceAfterNextMs: 600,
    }
    await runAutoCapture(adapter)
}

export const getCounts = () => readCounts()
