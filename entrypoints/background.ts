import { Slide } from "../types/Slide";
import { onMessage, ensureContentReady, sendToTab } from "../utils/messageHandling";

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

  browser.runtime.onMessage.addListener(onMessage({
    'sidepanel:opened': async () => {
      // Clear slides at side panel open (fresh session)
      currentSlides = [];
      return true as const;
    },
    'auto:capture': async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return false as const;
      currentSlides = [];
      const ready = await ensureContentReady(tab.id);
      if (!ready) return false as const;
      await sendToTab(tab.id, 'content:start-capture');
      return true as const;
    },
    'content:capture-page': async (data) => {
      const image = await browser.tabs.captureVisibleTab({ format: 'jpeg', quality: 90 });
      currentSlides.push({ img: image, dimensions: data?.dimensions || null });
      try { await browser.runtime.sendMessage({ event: 'slides:updated' }); } catch {}
      if (data?.done) {
        await browser.tabs.create({ url: browser.runtime.getURL('/output.html') });
        try { await browser.runtime.sendMessage({ event: 'output:opened' }); } catch {}
      }
      return true as const;
    },
    'output:ready': async () => {
      return currentSlides;
    },
    'open:output': async () => {
      await browser.tabs.create({ url: browser.runtime.getURL('/output.html') });
      return true as const;
    },
    'auto:progress': async (data) => {
      try { await browser.runtime.sendMessage({ event: 'auto:progress', data }); } catch {}
      return true as const;
    },
    'slides:remove': async (data) => {
      const idx = data?.index ?? -1;
      if (idx >= 0 && idx < currentSlides.length) {
        currentSlides.splice(idx, 1);
      }
      return currentSlides;
    },
    'slides:move': async (data) => {
      const from = data?.from ?? -1;
      let to = data?.to ?? -1;
      if (from >= 0 && from < currentSlides.length) {
        if (to < 0) to = 0;
        if (to >= currentSlides.length) to = currentSlides.length - 1;
        const [item] = currentSlides.splice(from, 1);
        currentSlides.splice(to, 0, item);
      }
      return currentSlides;
    },
    'reset': async () => {
      currentSlides = [];
      return true as const;
    }
  }))

  // Keyboard command handler to open side panel and start selection
  try {
    // @ts-ignore chrome may not exist in all browsers
    if (typeof chrome !== 'undefined' && chrome.commands) {
      // @ts-ignore
      chrome.commands.onCommand.addListener(async (command: string) => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return
        if (command === 'toggle-sidepanel-select') {
          if (!tab.url) return
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
            const rect = await sendToTab(tab.id, 'content:select-area')
            const origin = new URL(tab.url).origin
            const key = `selection:${origin}`
            await browser.storage.local.set({ [key]: rect?.result || rect })
          } catch {}
        }
      })
    }
  } catch {}
});
