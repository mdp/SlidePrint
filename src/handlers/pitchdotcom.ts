import { HandlerFinderFn, HandlerFn } from "."
import { capturePageMessage } from "../utils/messageHandling"
import { fixHiDPI } from "../utils/hidpi"
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
  return fixHiDPI(imageElement.getClientRects()[0])
}

export const getHandlerFor: HandlerFinderFn = (url: string) => {
    // old https://pitch.com/public/uuid/uuid
    if (url.match(/https\:\/\/pitch\.com\/public\/[a-f0-9\-]+/)) return handler
    // new https://pitch.com/v/name-uid
    if (url.match(/https\:\/\/pitch\.com\/v\/[a-f0-9\-]+/)) return handler
    return null
}

export const handler: HandlerFn = async () => {
    const slideCount = getSlideCount()
    for(let slide=1; slide <= slideCount; slide++) {
        const dimensions = getDimensions() || undefined
        await capturePageMessage(slide === slideCount, dimensions)
        sendRightArrow()
        await sleep(600)
    }
}