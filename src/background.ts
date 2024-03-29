import { Slide } from "./types/Slide";
import { MessageData, asyncMessageHandler, startCaptureMessage } from "./utils/messageHandling";
// @ts-ignore
import scriptPath from './content?script'

let currentSlides: Slide[] = []

chrome.runtime.onMessage.addListener(asyncMessageHandler<MessageData>(async (request, _sender) => {
  const [tab] = await chrome.tabs.query({ active: true });
  if (request.event === 'popup:opened') {
    if (tab && tab.id) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [scriptPath]
      });
      return true
    }
  } else if (request.event === 'popup:print') {
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
