import { HandlerFinderFn, HandlerFn } from ".";
import { fixHiDPI } from "../utils/hidpi";
import { runAutoCapture, AutoCaptureAdapter } from "../utils/autoCapture";
import { sendRightArrow } from "../utils/sendKeyEvent";

// Testing example: https://decksend.net/1241bfeba72f516a

// Counter elements provided by user
const currentEl = () => document.querySelector('.deck-viewer-current-page') as HTMLElement | null
const totalEl = () => document.querySelector('.deck-viewer-page-count') as HTMLElement | null

const getCurrent = () => {
  const text = currentEl()?.textContent?.trim();
  const n = text ? parseInt(text, 10) : NaN;
  return Number.isFinite(n) ? n : 0;
}

const getSlideCount = () => {
  const text = totalEl()?.textContent?.trim();
  const n = text ? parseInt(text, 10) : NaN;
  return Number.isFinite(n) ? n : 0;
}

// Prefer the container the user specified
const findSlideElement = (): Element | null => {
  const elById = document.getElementById('deck-content');
  if (elById) return elById;
  const candidates = [
    '#deck-slideshow-container',
    '.deck-slideshow-page:not(.hidden) img',
    '.deck-slideshow-page:not(.hidden) canvas',
    '.deck-viewer img',
    '.deck-viewer canvas',
    '.deck-viewer',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

const getDimensions = () => {
  const el = findSlideElement();
  if (!el) return null;
  const rects = el.getClientRects();
  if (!rects || !rects[0]) return null;
  return fixHiDPI(rects[0]);
}

// Advance: prefer clicking a next arrow if present, else ArrowRight
const clickNext = () => {
  const selectors = [
    'button[title="Next"], button[aria-label="Next"]',
    '.deck-next, .next, .arrow-right',
  ];
  for (const sel of selectors) {
    const btn = document.querySelector(sel) as HTMLElement | null;
    if (btn) { btn.click(); return; }
  }
  sendRightArrow();
}

export const getHandlerFor: HandlerFinderFn = (url: string) => {
  // https://decksend.net/1241bfeba72f516a (hex id)
  if (/^https:\/\/decksend\.net\/[a-f0-9]+$/i.test(url)) return handler;
  return null;
}

export const handler: HandlerFn = async () => {
  const adapter: AutoCaptureAdapter = {
    ready: async () => {
      const start = Date.now();
      while (Date.now() - start < 4000) {
        if (currentEl() && totalEl()) return;
        await new Promise(r => setTimeout(r, 120));
      }
    },
    getTotal: getSlideCount,
    getCurrent: getCurrent,
    getDimensions: () => getDimensions(),
    next: () => clickNext(),
    debounceAfterNextMs: 650,
  };
  await runAutoCapture(adapter);
}

export const getCounts = () => {
  const current = getCurrent();
  const total = getSlideCount();
  return (current && total) ? { current, total } : null;
}
