import { HandlerFinderFn, HandlerFn } from "."
import { fixHiDPI } from "../utils/hidpi"
import { sendRightArrow } from "../utils/sendKeyEvent"
import { runAutoCapture, parseCounter, AutoCaptureAdapter } from "../utils/autoCapture"
import { sendToBg } from "../utils/messageHandling"

const counterEl = () => document.querySelector(".toolbar-page-indicator")
const readCounts = () => parseCounter(counterEl()?.textContent)
const getSlideCount = () => readCounts()?.total || 0
const getCurrent = () => readCounts()?.current || 0

type DocSendPageImage = Pick<HTMLImageElement, "dataset" | "src" | "currentSrc" | "complete" | "naturalWidth">
type NumberedPage = Pick<HTMLImageElement, "dataset">
type DocSendPageData = {
  directImageUrl?: unknown
  imageUrl?: unknown
}

export type DocSendLayout = {
  bodyIsVertical: boolean
  hasVerticalViewer: boolean
  pageCount: number
  activePageCount: number
}

export const isPdfLayout = ({
  bodyIsVertical,
  hasVerticalViewer,
  pageCount,
  activePageCount,
}: DocSendLayout) =>
  pageCount > 1 && (
    bodyIsVertical ||
    hasVerticalViewer ||
    activePageCount > 1
  )

const isPlaceholder = (url: string) =>
  !url || url.includes("/public/blank.gif") || url.includes("/static/whitey-")

export const sortPdfPages = <T extends NumberedPage>(images: T[]): T[] =>
  [...images].sort((a, b) =>
    Number(a.dataset.pagenum || Number.MAX_SAFE_INTEGER) -
    Number(b.dataset.pagenum || Number.MAX_SAFE_INTEGER)
  )

export const getLoadedPageUrl = (image: DocSendPageImage): string | null => {
  const url = image.currentSrc || image.src
  return image.complete && image.naturalWidth > 0 && !isPlaceholder(url) ? url : null
}

export const getPageDataImageUrl = (data: DocSendPageData): string | null => {
  const url = typeof data.directImageUrl === "string"
    ? data.directImageUrl
    : data.imageUrl
  return typeof url === "string" && url.startsWith("https://") && !isPlaceholder(url)
    ? url
    : null
}

const pdfPageImages = () => {
  const selector = ".carousel-inner .item img.page-view[data-pagenum][data-url]"
  const pages = Array.from(document.querySelectorAll<HTMLImageElement>(selector))
  const activePageCount = document.querySelectorAll(
    ".carousel-inner .item.active img.page-view[data-pagenum][data-url]"
  ).length

  if (!isPdfLayout({
    bodyIsVertical: document.body.classList.contains("vertical"),
    hasVerticalViewer: document.querySelector(".viewer.vertical") !== null,
    pageCount: pages.length,
    activePageCount,
  })) {
    return []
  }

  return sortPdfPages(pages)
}

const resolvePageUrl = async (image: HTMLImageElement): Promise<string> => {
  const loadedUrl = getLoadedPageUrl(image)
  if (loadedUrl) return loadedUrl

  const pageDataUrl = image.dataset.url
  if (!pageDataUrl) {
    throw new Error(`DocSend page ${image.dataset.pagenum || "unknown"} has no data URL`)
  }

  const response = await fetch(pageDataUrl, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  })
  if (!response.ok) {
    throw new Error(
      `DocSend page ${image.dataset.pagenum || "unknown"} request failed (${response.status})`
    )
  }

  const url = getPageDataImageUrl(await response.json())
  if (!url) {
    throw new Error(`DocSend page ${image.dataset.pagenum || "unknown"} returned no image URL`)
  }
  return url
}

const runPdfCapture = async (pages: HTMLImageElement[]) => {
  const images: string[] = []

  for (let index = 0; index < pages.length; index++) {
    try {
      await browser.runtime.sendMessage({
        event: "auto:progress",
        data: { current: index + 1, total: pages.length },
      })
    } catch {}
    images.push(await resolvePageUrl(pages[index]))
  }

  await sendToBg("content:add-images", { images })
}

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

export const handler: HandlerFn = async () => {
    const pages = pdfPageImages()
    if (pages.length > 1) {
      await runPdfCapture(pages)
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
