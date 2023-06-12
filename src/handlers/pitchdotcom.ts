import { HandlerFinderFn, HandlerFn } from "."
import { sendRightArrow } from "../utils/sendKeyEvent"
import { sleep } from "../utils/sleep"

const getSlideCount = () => {
  const [countEl] = document.querySelectorAll(".player-v2-chrome-controls-slide-count")
  if (countEl) {
    const countStr = countEl.textContent?.split('/')[1]
    if (countStr) return parseInt(countStr, 10)
  }
  return 0
}

const getDimensions = () => {
  const imageElement = document.querySelectorAll(".slide-wrapper")[0]
  if (!imageElement) return null
  return imageElement.getClientRects()[0]
}

export const getHandlerFor: HandlerFinderFn = (url: string) => {
    // https://pitch.com/public/uuid/uuid
    if (url.match(/https\:\/\/pitch\.com\/public\/[a-f0-9\-]+/)) return handler
    return null
}

export const handler: HandlerFn = async () => {
    const slideCount = getSlideCount()
    for(let slide=1; slide <= slideCount; slide++) {
        const dimensions = getDimensions() || {}
        await chrome.runtime.sendMessage({event: 'capture', done: slide === slideCount, dimensions})
        sendRightArrow()
        await sleep(600)
    }
}