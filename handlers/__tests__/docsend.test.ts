import { expect, it } from 'vitest'
import {
  getHandlerFor,
  getLoadedPageUrl,
  getPageDataImageUrl,
  isPdfLayout,
  sortPdfPages,
} from '../docsend'

it("should work with a docsend url", () => {
  expect(getHandlerFor("https://docsend.com/view/abc234")).not.toBe(null)
})

it("should work with a custom subdomain docsend url", () => {
  expect(getHandlerFor("https://foo.docsend.com/view/abc234")).not.toBe(null)
})

it("should ignore non docsend slide urls", () => {
  expect(getHandlerFor("https://docsend.com/help")).toBe(null)
})

it("sorts PDF page images numerically", () => {
  const page10 = { dataset: { pagenum: "10" } }
  const page2 = { dataset: { pagenum: "2" } }
  const page1 = { dataset: { pagenum: "1" } }

  expect(sortPdfPages([page10, page2, page1]))
    .toEqual([page1, page2, page10])
})

it("returns the loaded full-resolution page URL", () => {
  const image = {
    dataset: { pagenum: "1" },
    src: "https://cdn.example.com/page/1",
    currentSrc: "https://cdn.example.com/page/1",
    complete: true,
    naturalWidth: 1200,
  }

  expect(getLoadedPageUrl(image)).toBe("https://cdn.example.com/page/1")
})

it("ignores unloaded DocSend placeholder images", () => {
  const image = {
    dataset: { pagenum: "12" },
    src: "https://assets.docsend.com/public/blank.gif",
    currentSrc: "https://assets.docsend.com/public/blank.gif",
    complete: true,
    naturalWidth: 1,
  }

  expect(getLoadedPageUrl(image)).toBe(null)
})

it("extracts the direct image URL from DocSend page data", () => {
  expect(getPageDataImageUrl({
    imageUrl: "https://cdn.example.com/fallback",
    directImageUrl: "https://cdn.example.com/direct",
  })).toBe("https://cdn.example.com/direct")
})

it("rejects invalid DocSend page data", () => {
  expect(getPageDataImageUrl({ directImageUrl: "javascript:alert(1)" })).toBe(null)
  expect(getPageDataImageUrl({ imageUrl: "https://assets.docsend.com/public/blank.gif" })).toBe(null)
})

it("identifies a vertical DocSend PDF", () => {
  expect(isPdfLayout({
    bodyIsVertical: true,
    hasVerticalViewer: false,
    pageCount: 15,
    activePageCount: 15,
  })).toBe(true)
})

it("identifies a PDF when DocSend marks every page active", () => {
  expect(isPdfLayout({
    bodyIsVertical: false,
    hasVerticalViewer: false,
    pageCount: 15,
    activePageCount: 15,
  })).toBe(true)
})

it("does not treat a multi-slide carousel as a PDF", () => {
  expect(isPdfLayout({
    bodyIsVertical: false,
    hasVerticalViewer: false,
    pageCount: 15,
    activePageCount: 1,
  })).toBe(false)
})
