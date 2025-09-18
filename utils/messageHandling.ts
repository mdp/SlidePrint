import type { Slide } from "../types/Slide";
import type { MessageMap } from "../types/messages";

// Toggle verbose debug logging for messaging
const DEBUG = false;

type Envelope = { result: any; error: any };

// Low-level async envelope wrapper for runtime.onMessage listeners
export function asyncMessageHandler<T>(
  fn: (request: { event: string; data?: T }, sender: browser.runtime.MessageSender) => Promise<any>
): (request: any, sender: browser.runtime.MessageSender, sendResponse: (response: any) => void) => any {
  return (request, sender, sendResponse) => {
    if (DEBUG) console.log("asyncMessageHandler:", request);
    fn(request, sender)
      .then((result) => {
        if (DEBUG) console.log("asyncMessageHandler result:", result);
        sendResponse({ result, error: null });
      })
      .catch((err) => {
        if (DEBUG) console.warn("asyncMessageHandler error:", err);
        sendResponse({ result: null, error: String(err?.message || err) });
      });
    return true;
  };
}

// Typed message helpers ----------------------------------------------------

function unwrap<R>(resp: any): R {
  // Support both envelope and raw responses for tolerance
  if (resp && typeof resp === 'object' && 'result' in resp && 'error' in resp) {
    const env = resp as Envelope;
    if (env.error) throw new Error(String(env.error));
    return env.result as R;
  }
  return resp as R;
}

export async function sendToTab<E extends keyof MessageMap>(
  tabId: number,
  event: E,
  data?: MessageMap[E]['req'],
  opts?: { timeoutMs?: number }
): Promise<MessageMap[E]['res']> {
  const payload = { event, data } as any;
  const promise = browser.tabs.sendMessage(tabId, payload).then(unwrap<MessageMap[E]['res']>);
  if (!opts?.timeoutMs) return promise;
  return withTimeout(promise, opts.timeoutMs, `tabs.sendMessage(${String(event)}) timed out`);
}

export async function sendToBg<E extends keyof MessageMap>(
  event: E,
  data?: MessageMap[E]['req'],
  opts?: { timeoutMs?: number }
): Promise<MessageMap[E]['res']> {
  const payload = { event, data } as any;
  const promise = browser.runtime.sendMessage(payload).then(unwrap<MessageMap[E]['res']>);
  if (!opts?.timeoutMs) return promise;
  return withTimeout(promise, opts.timeoutMs, `runtime.sendMessage(${String(event)}) timed out`);
}

export function onMessage(handlers: Partial<{
  [E in keyof MessageMap]: (data: MessageMap[E]['req'], sender: browser.runtime.MessageSender) => Promise<MessageMap[E]['res']> | MessageMap[E]['res']
}>) {
  return asyncMessageHandler<any>(async (req, sender) => {
    const key = req?.event as keyof MessageMap;
    const handler = handlers[key];
    if (!handler) return null;
    return await handler(req?.data, sender);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(message)), ms);
    p.then((v) => { clearTimeout(to); resolve(v); }, (e) => { clearTimeout(to); reject(e); });
  });
}

// Shared readiness util ----------------------------------------------------

export async function ensureContentReady(tabId: number, opts?: { retries?: number; delayMs?: number; inject?: boolean }): Promise<boolean> {
  const retries = opts?.retries ?? 8;
  const delayMs = opts?.delayMs ?? 160;
  const inject = opts?.inject ?? true;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await sendToTab(tabId, 'content:ready');
      if (res === true) return true;
    } catch {}
    if (inject) {
      try { await browser.scripting.executeScript({ target: { tabId }, files: ['injected.js'] }); } catch {}
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

// Convenience wrappers (kept for call sites) -------------------------------

export async function printMessage() {
  return await sendToBg('popup:print');
}

export async function captureSnapshot() {
  return await sendToBg('content:capture-snapshot' as any);
}

export async function startCaptureMessage(tabId: number) {
  return await sendToTab(tabId, 'content:start-capture');
}

export async function capturePageMessage(done: boolean, dimensions?: DOMRect) {
  await sendToBg('content:capture-page', { done, dimensions: dimensions || null });
}

export async function outputReady() {
  return await sendToBg('output:ready');
}

export async function selectArea(tabId: number): Promise<DOMRect> {
  return await sendToTab(tabId, 'content:select-area');
}

export async function openOutput() {
  return await sendToBg('open:output');
}

export async function removeSlide(index: number) {
  return await sendToBg('slides:remove', { index });
}

export async function moveSlide(from: number, to: number) {
  return await sendToBg('slides:move', { from, to });
}

export async function autoCapture() {
  return await sendToBg('auto:capture');
}

export async function getCounts(tabId: number): Promise<{ current: number, total: number } | null> {
  return await sendToTab(tabId, 'content:get-counts');
}

// Back-compat types used by callers
export type MessageData = {
  dimensions?: DOMRect
  done?: boolean
  canPrint?: boolean
}
