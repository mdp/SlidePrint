import { Slide } from "../types/Slide";
import { MessageData, asyncMessageHandler, startCaptureMessage } from "../utils/messageHandling";
import browser from "webextension-polyfill"

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });


  let currentSlides: Slide[] = []

  browser.runtime.onMessage.addListener(asyncMessageHandler<MessageData>(async (request, _sender) => {
    const [tab] = await browser.tabs.query({ active: true });
    if (request.event === 'popup:opened') {
      if (tab && tab.id) {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/content.js']
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
      const image = await browser.tabs.captureVisibleTab({ format: 'jpeg', quality: 90 })
      currentSlides.push({ img: image, dimensions: request.data?.dimensions || null })
      if (request.data?.done) {
        await browser.tabs.create({ url: browser.runtime.getURL('./output.html') })
      }
      return true
    } else if (request && request.event === 'output:ready') {
      return currentSlides
    } else if (request && request.event === 'reset') {
      currentSlides = []
    }

    return null
  }))
});