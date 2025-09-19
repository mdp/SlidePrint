import { capturePageMessage } from "./messageHandling";

export interface AutoCaptureAdapter {
  // Optional: wait until necessary DOM is present
  ready?: () => Promise<void>;
  // Total number of slides/pages
  getTotal: () => number;
  // Current (1-based) slide index
  getCurrent: () => number;
  // The rectangle to capture (device-pixel adjusted elsewhere if needed)
  getDimensions: () => DOMRect | null;
  // Advance to the next slide/page
  next: () => void | Promise<void>;
  // Optional debounce after next() before checking current
  debounceAfterNextMs?: number;
}

export const parseCounter = (text?: string | null): { current: number; total: number } | null => {
  if (!text) return null;
  const m = String(text).trim().match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const current = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (!Number.isFinite(current) || !Number.isFinite(total)) return null;
  return { current, total };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitForNext(
  getCurrent: () => number,
  prevCurrent: number,
  timeoutMs = 5000,
  pollMs = 120,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cur = getCurrent();
    if (cur && cur !== prevCurrent) return true;
    await sleep(pollMs);
  }
  return false;
}

export async function runAutoCapture(adapter: AutoCaptureAdapter) {
  if (adapter.ready) await adapter.ready();

  const total = adapter.getTotal();
  let current = adapter.getCurrent();
  if (!total || !current || current > total) return;

  const remaining = total - current + 1;

  for (let i = 0; i < remaining; i++) {
    try { await browser.runtime.sendMessage({ event: 'auto:progress', data: { current, total } }) } catch {}
    const dims = adapter.getDimensions() || undefined;
    const isLast = i === remaining - 1;
    await capturePageMessage(isLast, dims, true);

    if (!isLast) {
      const prev = current;
      await Promise.resolve(adapter.next());
      const debounce = adapter.debounceAfterNextMs ?? 600;
      if (debounce > 0) await sleep(debounce);
      const advanced = await waitForNext(adapter.getCurrent, prev);
      if (!advanced) break;
      current = adapter.getCurrent();
    }
  }
}
