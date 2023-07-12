import { Slide } from "./types/Slide";
import { asyncMessageHandler, canPrintMessage, startCaptureMessage } from "./utils/messageHandling";

let currentSlides: Slide[] = []

export type MessageData = {
  dimensions?: DOMRect
  done?: boolean
}

chrome.runtime.onMessage.addListener(asyncMessageHandler<MessageData>(async (request, _sender) => {
  if (request.event === 'popup:opened') {
    const [tab] = await chrome.tabs.query({ active: true });
    if (tab && tab.url && tab.id) {
      try {
        const canPrint = await canPrintMessage(tab.id)
        return canPrint
      } catch (e) {
        console.log("Tab message error", e)
        return false
      }
    } else {
      return null
    }
  } else if (request.event === 'popup:print') {
    const [tab] = await chrome.tabs.query({ active: true });
    if (tab && tab.url && tab.id) {
      currentSlides = []
      await startCaptureMessage(tab.id)
    }
  } else if (request.event === 'content:capture-page') {
    console.log("capture page", request)
    const image = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 90 })
    currentSlides.push({ img: image, dimensions: request.data?.dimensions || null })
    if (request.data?.done) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('./src/output/index.html') })
    }
    return true
  } else if (request && request.event === 'output:ready') {
    return currentSlides
  } else if (request && request.event === 'reset') {
    currentSlides = []
  }

  return null
}))
