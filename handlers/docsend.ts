import { HandlerFinderFn, HandlerFn } from "."
import { fixHiDPI } from "../utils/hidpi"
import { sendRightArrow } from "../utils/sendKeyEvent"
import { runAutoCapture, parseCounter, AutoCaptureAdapter } from "../utils/autoCapture"
import { sendToBg } from "../utils/messageHandling"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const counterEl = () => document.querySelector(".toolbar-page-indicator")
const readCounts = () => parseCounter(counterEl()?.textContent)
const getSlideCount = () => readCounts()?.total || 0
const getCurrent = () => readCounts()?.current || 0

const isPdfMode = () =>
  document.body.classList.contains('vertical') ||
  document.querySelector('.viewer.vertical') !== null

const getDimensions = () => {
  const imageElement = document.querySelectorAll(".item.active .viewer_content-container")[0]
  if (!imageElement) return null
  return fixHiDPI(imageElement.getClientRects()[0])
}

export const getHandlerFor: HandlerFinderFn = (url: string) => {
    // https://docsend.com/view/base32
    if (url.toLocaleLowerCase().match(/https\:\/\/([a-zA-Z0-9]+\.)?docsend\.com\/view\/[a-z0-9]+/)) return handler
    return null
}

// Find the scrollable parent of an element
function findScrollableParent(el: Element): Element | null {
  let parent = el.parentElement
  while (parent) {
    const style = getComputedStyle(parent)
    const overflowY = style.overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

// Capture a page that may be taller than viewport by capturing in chunks and stitching
async function captureAndStitchPage(img: HTMLImageElement): Promise<string> {
  const viewportHeight = window.innerHeight
  const pageHeight = img.offsetHeight
  const pageWidth = img.offsetWidth

  // Find the scrollable container
  const scrollContainer = findScrollableParent(img) || document.documentElement
  console.log(`[SlidePrint] Scroll container:`, scrollContainer.tagName, scrollContainer.className)

  // Calculate chunk size - use most of viewport but leave margin
  const chunkHeight = Math.floor(viewportHeight * 0.8)
  const numChunks = Math.ceil(pageHeight / chunkHeight)

  console.log(`[SlidePrint] Page: ${pageHeight}px tall, viewport: ${viewportHeight}px, chunks: ${numChunks}`)

  const chunks: string[] = []
  const chunkHeights: number[] = []

  // Get header offset from initial position (space above the image)
  const initialRect = img.getBoundingClientRect()
  const headerOffset = Math.max(0, initialRect.top)
  console.log(`[SlidePrint] Header offset: ${headerOffset}px`)

  for (let chunk = 0; chunk < numChunks; chunk++) {
    const yOffsetInPage = chunk * chunkHeight
    const remainingHeight = pageHeight - yOffsetInPage
    const thisChunkHeight = Math.min(chunkHeight, remainingHeight)

    // Get current image position
    const rect = img.getBoundingClientRect()
    // We want to scroll so that the chunk portion is just below the header
    // Target: rect.top + yOffsetInPage = headerOffset
    const scrollByAmount = (rect.top + yOffsetInPage) - headerOffset

    console.log(`[SlidePrint] Chunk ${chunk}: scrollBy ${scrollByAmount}px (rect.top=${rect.top}, yOffset=${yOffsetInPage}, container.scrollTop=${scrollContainer.scrollTop})`)

    // Scroll the container
    if (Math.abs(scrollByAmount) > 5) {
      scrollContainer.scrollTop += scrollByAmount
      await sleep(150)
    }

    // Verify scroll happened
    const newRect = img.getBoundingClientRect()
    console.log(`[SlidePrint] After scroll: rect.top=${newRect.top}, container.scrollTop=${scrollContainer.scrollTop}`)

    await sleep(450) // Rate limit for Chrome capture API

    // Capture from just below the header, where the image content is
    const captureX = newRect.left
    const captureY = headerOffset  // Always start at the header offset
    const captureHeight = Math.min(thisChunkHeight, viewportHeight - headerOffset)

    // Build dimensions for this chunk
    const dims = fixHiDPI({
      x: captureX,
      y: captureY,
      width: pageWidth,
      height: captureHeight,
      top: captureY,
      left: captureX,
      right: captureX + pageWidth,
      bottom: captureY + captureHeight,
      toJSON() { return { x: this.x, y: this.y, width: this.width, height: this.height, top: this.top, left: this.left, right: this.right, bottom: this.bottom } }
    } as DOMRect)

    // Capture this chunk via background
    const chunkData = await sendToBg('content:capture-chunk', { dimensions: dims })
    chunks.push(chunkData)
    chunkHeights.push(captureHeight)
  }

  // If only one chunk, return directly
  if (chunks.length === 1) {
    return chunks[0]
  }

  // Stitch chunks together
  return await stitchImages(chunks, chunkHeights, pageWidth)
}

async function stitchImages(chunks: string[], chunkHeights: number[], width: number): Promise<string> {
  const dpr = window.devicePixelRatio || 1
  const totalHeight = chunkHeights.reduce((a, b) => a + b, 0)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(totalHeight * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')

  let yPos = 0
  for (let i = 0; i < chunks.length; i++) {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load chunk'))
      img.src = chunks[i]
    })
    ctx.drawImage(img, 0, yPos)
    yPos += img.height
  }

  return canvas.toDataURL('image/jpeg', 0.95)
}

async function runPdfCapture() {
  const pageImages = document.querySelectorAll('img.page-view') as NodeListOf<HTMLImageElement>
  const total = pageImages.length

  for (let i = 0; i < total; i++) {
    const img = pageImages[i]

    // Progress update
    try {
      await browser.runtime.sendMessage({
        event: 'auto:progress',
        data: { current: i + 1, total }
      })
    } catch {}

    // Ensure image is loaded by scrolling to it first
    img.scrollIntoView({ behavior: 'instant', block: 'start' })
    await sleep(400)

    // Wait for image to be loaded
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise<void>((resolve) => {
        img.onload = () => resolve()
        setTimeout(resolve, 2000) // timeout fallback
      })
    }

    try {
      const imageData = await captureAndStitchPage(img)
      const isLast = i === total - 1
      await sendToBg('content:add-image', { imageData, done: isLast })
    } catch (e) {
      console.warn(`Failed to capture page ${i + 1}:`, e)
    }
  }
}

export const handler: HandlerFn = async () => {
    if (isPdfMode()) {
      await runPdfCapture()
      return
    }

    const adapter: AutoCaptureAdapter = {
      ready: async () => {
        const start = Date.now();
        while (Date.now() - start < 3000) {
          if (counterEl()) return;
          await new Promise(r => setTimeout(r, 100));
        }
      },
      getTotal: getSlideCount,
      getCurrent: getCurrent,
      getDimensions: () => getDimensions(),
      next: () => sendRightArrow(),
      debounceAfterNextMs: 600,
    }
    await runAutoCapture(adapter)
}

export const getCounts = () => readCounts()
