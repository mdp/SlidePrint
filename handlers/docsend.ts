import { HandlerFinderFn, HandlerFn } from "."
import { capturePageMessage } from "../utils/messageHandling"
import { fixHiDPI } from "../utils/hidpi"
import { sendRightArrow } from "../utils/sendKeyEvent"
import { sleep } from "../utils/sleep"

const getSlideCount = () => {
  const [countEl] = document.querySelectorAll(".toolbar-page-indicator")
  if (countEl) {
    const countStr = countEl.textContent?.split('/')[1].trim()
    if (countStr) return parseInt(countStr, 10)
  }
  return 0
}

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
    const slideCount = getSlideCount()
    for(let slide=1; slide <= slideCount; slide++) {
        const dimensions = getDimensions() || undefined
        await capturePageMessage(slide === slideCount, dimensions)
        sendRightArrow()
        await sleep(600)
    }
}