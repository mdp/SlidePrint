import { findHandlerFor, findCountsFor } from '../handlers';
import { asyncMessageHandler } from '../utils/messageHandling';
import { capturePageMessage } from '../utils/messageHandling';
import { fixHiDPI } from '../utils/hidpi';

export default defineUnlistedScript({
  main() {
    const handler = findHandlerFor(window.location.href)

    browser.runtime.onMessage.addListener(asyncMessageHandler<null>(async (request, _sender) => {
      // Site-specific auto-capture for supported sites
      if (request.event === 'content:start-capture' && handler) {
        try {
          await handler(window.document)
        } catch (e) {
          console.log("Content Handler Error:", e)
        }
        return true
      }

      // Generic selection flow for any site
      if (request.event === 'content:select-area') {
        const rect = await createSelectionOverlay()
        const fixed = fixHiDPI(rect)
        return fixed
      }

      if (request.event === 'content:ready') {
        return true
      }

      if (request.event === 'content:get-counts') {
        const countsFn = findCountsFor(window.location.href)
        if (!countsFn) return null
        return countsFn()
      }

      return false
    }))

    // Page-level quick capture: Shift+K captures using saved selection for this origin
    window.addEventListener('keydown', async (e: KeyboardEvent) => {
      if (!e.shiftKey) return
      const key = e.key
      if (key !== 'K' && key !== 'k') return
      try {
        const origin = window.location.origin
        const selKey = `selection:${origin}`
        // @ts-ignore browser.storage is available in content script
        const saved = await browser.storage.local.get(selKey)
        const rect = saved?.[selKey]
        if (rect) {
          await capturePageMessage(false, rect as any)
        }
      } catch (err) {
        console.log('Shift+K capture failed', err)
      }
    }, { capture: true })
  }
});

function createSelectionOverlay(): Promise<DOMRect> {
  return new Promise((resolve, reject) => {
    // Overlay
    const overlay = document.createElement('div')
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0px',
      zIndex: '2147483647',
      cursor: 'crosshair',
      background: 'rgba(0,0,0,0.05)'
    } as CSSStyleDeclaration)

    // Instruction banner
    const hint = document.createElement('div')
    hint.textContent = 'Drag to select an area. Press Esc to cancel.'
    Object.assign(hint.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(17,24,39,0.9)',
      color: '#fff',
      padding: '6px 10px',
      borderRadius: '8px',
      fontSize: '13px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      zIndex: '2147483647'
    } as CSSStyleDeclaration)
    overlay.appendChild(hint)

    // Selection box
    const box = document.createElement('div')
    Object.assign(box.style, {
      position: 'absolute',
      border: '2px dashed #4f46e5',
      background: 'rgba(79,70,229,0.1)'
    } as CSSStyleDeclaration)
    overlay.appendChild(box)

    let startX = 0, startY = 0
    let endX = 0, endY = 0

    function onMouseDown(e: MouseEvent) {
      startX = e.clientX
      startY = e.clientY
      endX = startX
      endY = startY
      updateBox()
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp, { once: true })
    }

    function onMouseMove(e: MouseEvent) {
      endX = e.clientX
      endY = e.clientY
      updateBox()
    }

    function updateBox() {
      const x = Math.min(startX, endX)
      const y = Math.min(startY, endY)
      const w = Math.abs(endX - startX)
      const h = Math.abs(endY - startY)
      Object.assign(box.style, {
        left: x + 'px',
        top: y + 'px',
        width: w + 'px',
        height: h + 'px',
      } as CSSStyleDeclaration)
    }

    function cleanup(rect?: DOMRect) {
      window.removeEventListener('mousemove', onMouseMove)
      overlay.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      overlay.remove()
      if (rect) resolve(rect)
    }

    function onMouseUp() {
      const x = Math.min(startX, endX)
      const y = Math.min(startY, endY)
      const w = Math.abs(endX - startX)
      const h = Math.abs(endY - startY)
      const rect = new DOMRect(x, y, w, h)
      cleanup(rect)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        cleanup()
        reject(new Error('selection-cancelled'))
      }
    }

    overlay.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    document.documentElement.appendChild(overlay)
  })
}
