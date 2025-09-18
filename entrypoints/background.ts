import { Slide } from "../types/Slide";
import { MessageData, asyncMessageHandler } from "../utils/messageHandling";

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });


  let currentSlides: Slide[] = []

  // Ask Chrome to open the side panel when the action icon is clicked
  try {
    // @ts-ignore
    if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      // @ts-ignore
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    }
  } catch {}

  // Open side panel when the extension icon is clicked (Chrome only)
  try {
    // Prefer Chrome API when available
    // @ts-ignore
    if (typeof chrome !== 'undefined' && chrome.action) {
      // @ts-ignore
      chrome.action.onClicked.addListener(async (tab) => {
        try {
          // @ts-ignore
          if (chrome.sidePanel) {
            // @ts-ignore
            await chrome.sidePanel.setOptions({ enabled: true, path: '/sidepanel.html', tabId: tab?.id })
            // @ts-ignore
            await chrome.sidePanel.open({ tabId: tab?.id })
            return
          }
        } catch (e) {
          console.log('Could not open side panel', e)
        }
        // Fallback: open the side panel UI as a normal tab
        await browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') })
      })
    } else if (browser.action) {
      browser.action.onClicked.addListener(async (_tab) => {
        await browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') })
      })
    }
  } catch {}

  browser.runtime.onMessage.addListener(asyncMessageHandler<MessageData>(async (request, _sender) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (request.event === 'sidepanel:opened') {
      // Clear slides at side panel open (fresh session)
      currentSlides = []
      return true
    } else if (request.event === 'auto:capture') {
      if (tab && tab.id) {
        currentSlides = []
        // Ensure content script is ready before we message it
        const ensureReady = async () => {
          for (let i = 0; i < 8; i++) {
            try {
              const ping = await browser.tabs.sendMessage(tab.id!, { event: 'content:ready' })
              if (ping?.result === true || ping === true) return true
            } catch {}
            try { await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['injected.js'] }) } catch {}
            await new Promise(r => setTimeout(r, 150))
          }
          return false
        }
        const ready = await ensureReady()
        if (!ready) return false
        // Kick off site-specific automated capture via content script
        await browser.tabs.sendMessage(tab.id, { event: 'content:start-capture' })
        return true
      }
    } else if (request.event === 'content:capture-page') {
      console.log("capture page", request)
      const image = await browser.tabs.captureVisibleTab({ format: 'jpeg', quality: 90 })
      currentSlides.push({ img: image, dimensions: request.data?.dimensions || null })
      if (request.data?.done) {
        await browser.tabs.create({ url: browser.runtime.getURL('/output.html') })
        try { await browser.runtime.sendMessage({ event: 'output:opened' }) } catch {}
      }
      return true
    } else if (request && request.event === 'output:ready') {
      return currentSlides
    } else if (request && request.event === 'open:output') {
      await browser.tabs.create({ url: browser.runtime.getURL('/output.html') })
      return true
    } else if (request && request.event === 'slides:remove' && typeof request.data?.index === 'number') {
      const idx = request.data.index
      if (idx >= 0 && idx < currentSlides.length) {
        currentSlides.splice(idx, 1)
      }
      return currentSlides
    } else if (request && request.event === 'slides:move' && typeof request.data?.from === 'number' && typeof request.data?.to === 'number') {
      const from = request.data.from
      let to = request.data.to
      if (from >= 0 && from < currentSlides.length) {
        if (to < 0) to = 0
        if (to >= currentSlides.length) to = currentSlides.length - 1
        const [item] = currentSlides.splice(from, 1)
        currentSlides.splice(to, 0, item)
      }
      return currentSlides
    } else if (request && request.event === 'reset') {
      currentSlides = []
    }

    return null
  }))

  // Keyboard command handler to open side panel and start selection
  try {
    // @ts-ignore chrome may not exist in all browsers
    if (typeof chrome !== 'undefined' && chrome.commands) {
      // @ts-ignore
      chrome.commands.onCommand.addListener(async (command: string) => {
        if (command !== 'toggle-sidepanel-select') return
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) return
        try {
          await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['injected.js'] })
        } catch {}
        try {
          // Open side panel for current window
          // @ts-ignore
          if (chrome.sidePanel) {
            // @ts-ignore
            await chrome.sidePanel.setOptions({ enabled: true, path: '/sidepanel.html', tabId: tab.id })
            // @ts-ignore
            await chrome.sidePanel.open({ windowId: tab.windowId })
          }
        } catch {}

        // Ask the page to select area and persist it per-origin
        try {
          const rect = await browser.tabs.sendMessage(tab.id, { event: 'content:select-area' })
          const origin = new URL(tab.url).origin
          const key = `selection:${origin}`
          await browser.storage.local.set({ [key]: rect?.result || rect })
        } catch {}
      })
    }
  } catch {}
});
