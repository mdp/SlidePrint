// Offscreen doc: establishes a port to background and performs capture on demand

// Establish a named port so background can find us
const port = chrome.runtime.connect({ name: 'offscreen' })

port.onMessage.addListener(async (msg) => {
  if (!msg || msg.type !== 'capture') return
  try {
    // First try Promise API
    try {
      // @ts-ignore
      const image = await browser.tabs.captureVisibleTab({ format: 'jpeg', quality: 90 })
      port.postMessage({ id: msg.id, ok: true, image })
      return
    } catch {}
    // Fallback to callback API with window targeting
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    chrome.tabs.captureVisibleTab(active?.windowId, { format: 'jpeg', quality: 90 }, (dataUrl) => {
      // @ts-ignore
      const err = chrome.runtime?.lastError
      if (!dataUrl || err) {
        port.postMessage({ id: msg.id, ok: false, error: String(err || 'capture failed') })
      } else {
        port.postMessage({ id: msg.id, ok: true, image: dataUrl })
      }
    })
  } catch (e) {
    port.postMessage({ id: msg.id, ok: false, error: String((e as any)?.message || e) })
  }
})

