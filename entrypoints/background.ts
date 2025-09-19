import { Slide } from "../types/Slide";
import { onMessage, ensureContentReady, sendToTab } from "../utils/messageHandling";

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });


  let currentSlides: Slide[] = []
  let offscreenPort: chrome.runtime.Port | null = null

  function updateBadge(count?: number) {
    const val = typeof count === 'number' ? count : currentSlides.length
    const text = val > 0 ? String(val) : ''
    try {
      // @ts-ignore
      if (chrome?.action?.setBadgeText) {
        // @ts-ignore
        chrome.action.setBadgeText({ text })
        try { // optional; ignore if not supported
          // @ts-ignore
          chrome.action.setBadgeBackgroundColor?.({ color: '#4f46e5' })
        } catch {}
      } else if (browser?.action?.setBadgeText) {
        // @ts-ignore types may differ across browsers
        browser.action.setBadgeText({ text })
        try { (browser.action as any).setBadgeBackgroundColor?.({ color: '#4f46e5' }) } catch {}
      }
    } catch {}
  }

  function waitForPort(timeoutMs = 1500): Promise<boolean> {
    const start = Date.now()
    return new Promise((resolve) => {
      const id = setInterval(() => {
        if (offscreenPort) { clearInterval(id); resolve(true) }
        else if (Date.now() - start > timeoutMs) { clearInterval(id); resolve(false) }
      }, 50)
    })
  }

  async function ensureOffscreen() {
    if (offscreenPort) return
    try {
      // @ts-ignore
      if (chrome?.offscreen) {
        try {
          // @ts-ignore check if exists
          // no hasDocument in types; try create guarded
          await chrome.offscreen.createDocument({
            url: '/offscreen.html',
            reasons: ['USER_MEDIA' as any],
            justification: 'Screenshot capture for SlidePrint',
          })
        } catch {}
      }
    } catch {}
  }

  // Accept a connection from the offscreen document
  try {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'offscreen') {
        offscreenPort = port
        port.onDisconnect.addListener(() => { if (offscreenPort === port) offscreenPort = null })
      }
    })
  } catch {}

  // With action popup, clicking the icon is handled by the browser.
  // We ensure the offscreen document exists on popup open instead.

  browser.runtime.onMessage.addListener(onMessage({
    'popup:opened': async () => {
      // Prepare offscreen doc in user-gesture context when possible
      await ensureOffscreen()
      return true as const
    },
    'select:start': async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab?.url) return false as const
      const ready = await ensureContentReady(tab.id)
      if (!ready) return false as const
      try {
        const rect = await sendToTab(tab.id, 'content:select-area')
        const origin = new URL(tab.url).origin
        const key = `selection:${origin}`
        await browser.storage.local.set({ [key]: rect })
      } catch {
        return false as const
      }
      // Attempt to reopen the popup immediately after selection completes
      try {
        // @ts-ignore
        if (chrome?.action?.openPopup) await chrome.action.openPopup()
      } catch {}
      return true as const
    },
    'auto:capture': async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return false as const;
      const ready = await ensureContentReady(tab.id);
      if (!ready) return false as const;
      await sendToTab(tab.id, 'content:start-capture');
      return true as const;
    },
    'select:done': async (rect, sender) => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const url = tab?.url
        if (url) {
          const origin = new URL(url).origin
          const key = `selection:${origin}`
          await browser.storage.local.set({ [key]: rect })
        }
      } catch {}
      try { if (chrome?.action?.openPopup) await chrome.action.openPopup() } catch {}
      return true as const
    },
    'content:capture-page': async (data, sender) => {
      try {
        // Prefer offscreen port when available
        if (offscreenPort) {
          const id = Math.random().toString(36).slice(2)
          const result: { ok: boolean, image?: string } = await new Promise((resolve) => {
            const onMsg = (msg: any) => {
              if (msg && msg.id === id) {
                offscreenPort?.onMessage.removeListener(onMsg)
                resolve(msg)
              }
            }
            offscreenPort?.onMessage.addListener(onMsg)
            offscreenPort?.postMessage({ type: 'capture', id })
          })
          if (!result.ok || !result.image) throw new Error('offscreen capture failed')
          currentSlides.push({ img: result.image, dimensions: data?.dimensions || null, preScaled: !!data?.preScaled });
        } else {
          const image = await captureVisible()
          currentSlides.push({ img: image, dimensions: data?.dimensions || null, preScaled: !!data?.preScaled });
        }
        updateBadge()
      } catch (e) {
        console.warn('captureVisibleTab failed', e)
        try {
          await browser.runtime.sendMessage({ event: 'capture:need-permission' })
        } catch {}
        return true as const
      }
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
      updateBadge()
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
      updateBadge(0)
      return true as const;
    }
  }))

  // Keyboard command handler to start selection and reopen popup on finish
  try {
    // @ts-ignore chrome may not exist in all browsers
    if (typeof chrome !== 'undefined' && chrome.commands) {
      // @ts-ignore
      chrome.commands.onCommand.addListener(async (command: string) => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return
        if (command === 'toggle-popup-select') {
          if (!tab.url) return
          try { await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['injected.js'] }) } catch {}
          try {
            const rect = await sendToTab(tab.id, 'content:select-area')
            const origin = new URL(tab.url).origin
            const key = `selection:${origin}`
            await browser.storage.local.set({ [key]: rect })
          } catch {}
          try { if (chrome?.action?.openPopup) await chrome.action.openPopup() } catch {}
        }
      })
    }
  } catch {}
});
  async function captureVisible(): Promise<string> {
    try {
      return await browser.tabs.captureVisibleTab({ format: 'jpeg', quality: 95 })
    } catch (e1) {
      try {
        const [active] = await browser.tabs.query({ active: true, currentWindow: true })
        // @ts-ignore chrome may exist
        if (typeof chrome !== 'undefined' && chrome.tabs && active?.windowId != null) {
          return await new Promise<string>((resolve, reject) => {
            try {
              // @ts-ignore callback style
              chrome.tabs.captureVisibleTab(active.windowId, { format: 'jpeg', quality: 95 }, (dataUrl: string | undefined) => {
                // @ts-ignore
                const err = chrome.runtime?.lastError
                if (!dataUrl || err) reject(err || new Error('captureVisibleTab returned empty'))
                else resolve(dataUrl)
              })
            } catch (err) { reject(err) }
          })
        }
      } catch {}
      throw e1
    }
  }
