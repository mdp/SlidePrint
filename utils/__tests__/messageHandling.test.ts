import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as MH from '../messageHandling'

// Minimal browser polyfill for tests
declare global {
  // eslint-disable-next-line no-var
  var browser: any
}

describe('messageHandling helpers', () => {
  beforeEach(() => {
    globalThis.browser = {
      runtime: {
        sendMessage: vi.fn(),
      },
      tabs: {
        sendMessage: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue(undefined),
      },
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sendToBg unwraps envelope responses', async () => {
    browser.runtime.sendMessage.mockResolvedValue({ result: true, error: null })
    const res = await MH.sendToBg('open:output')
    expect(res).toBe(true)
    expect(browser.runtime.sendMessage).toHaveBeenCalled()
  })

  it('sendToTab unwraps envelope and supports types', async () => {
    browser.tabs.sendMessage.mockResolvedValue({ result: true, error: null })
    const res = await MH.sendToTab(1, 'content:ready')
    expect(res).toBe(true)
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, { event: 'content:ready', data: undefined })
  })

  it('sendToBg times out when no response', async () => {
    browser.runtime.sendMessage.mockReturnValue(new Promise(() => {}))
    await expect(MH.sendToBg('open:output', undefined, { timeoutMs: 10 })).rejects.toThrow(/timed out/)
  })

  it('onMessage routes to the correct handler and wraps result in envelope', async () => {
    const listener = MH.onMessage({
      'content:get-counts': async () => ({ current: 1, total: 10 }),
    })
    const send = vi.fn()
    await listener({ event: 'content:get-counts' }, { id: 'x' } as any, send)
    // allow the microtask chain in asyncMessageHandler to resolve
    await Promise.resolve()
    expect(send).toHaveBeenCalledWith({ result: { current: 1, total: 10 }, error: null })
  })

  it('ensureContentReady retries, injects, then succeeds', async () => {
    browser.tabs.sendMessage
      .mockRejectedValueOnce(new Error('no listener'))
      .mockResolvedValueOnce(true as any)
    const ok = await MH.ensureContentReady(123, { retries: 2, delayMs: 1 })
    expect(ok).toBe(true)
    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2)
    expect(browser.scripting.executeScript).toHaveBeenCalled()
  })
})
