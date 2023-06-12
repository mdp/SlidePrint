import { Slide } from "./types/Slide";

let currentSlides: Slide[] = []

chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true });
  if (tab && tab.url && tab.id) {
    currentSlides = []
    await chrome.tabs.sendMessage(tab.id, { event: "print" })
  }
});

chrome.runtime.onMessage.addListener(
  (request, _sender, sendResponse) => {
    (async () => {
      if (!request && request.event) sendResponse(false)
      if (request.event === 'capture') {
        const image = await chrome.tabs.captureVisibleTab({format: 'jpeg', quality: 90})
        console.log(request.dimensions)
        currentSlides.push({img: image, dimensions: request.dimensions as DOMRect || null})
        if (request.done) {
          await chrome.tabs.create({ url: chrome.runtime.getURL('./src/output/index.html') })
        }
        sendResponse(true)
      }
      else if (request && request.event === 'output-ready') {
        sendResponse(currentSlides)
        currentSlides = []
      }
    })();
    return true;
  }
);