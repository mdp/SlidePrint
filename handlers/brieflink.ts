import { HandlerFinderFn, HandlerFn } from "."
import { capturePageMessage } from "../utils/messageHandling"
import { fixHiDPI } from "../utils/hidpi"
import { sleep } from "../utils/sleep"

const getSlideCount = () => {
  const countEl = document.querySelector(".DeckSlider_ButtonContainer")
  if (countEl) {
    const countStr = countEl.textContent?.split('/')[1]
    if (countStr) return parseInt(countStr, 10)
  }
  return 0
}

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
    const slideCount = getSlideCount()
    console.log("SlideCount", slideCount)
    for(let slide=1; slide <= slideCount; slide++) {
        const dimensions = getDimensions() || undefined
        console.log("Dimensions", dimensions)
        await capturePageMessage(slide === slideCount, dimensions)
        console.log("Sending Right Arrow")
        window.dispatchEvent(new KeyboardEvent('keyup', {'key': 'ArrowRight'}));
        await sleep(600)
    }
}