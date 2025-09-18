import { Slide } from "../types/Slide"

type ValidEvents = 'content:ready' |
    'popup:can-print' | 'popup:opened' | 'popup:print' | 'output:ready' | 'content:can-print' | 'content:start-capture' | 'content:capture-page' |
    'content:capture-snapshot' | 'content:select-area' | 'content:get-counts' |
    'open:output' | 'output:opened' | 'reset' | 'slides:remove' | 'slides:move' | 'slides:updated' | 'auto:capture' | 'auto:progress'

interface MessageRequest<T> {
  event: ValidEvents
  data?: T
}

export type MessageData = {
  dimensions?: DOMRect
  done?: boolean
  canPrint?: boolean
}

export function asyncMessageHandler<T>
    (fn: (request: MessageRequest<T>, sender: browser.runtime.MessageSender) => Promise<any>): (request: any, sender: browser.runtime.MessageSender, sendResponse: (response: any) => void) => any {
        return(request, sender, sendResponse) => {
            console.log("asyncMessageHandler:", request)
            fn(request, sender)
                .then((result) => {
                    console.log("asyncMessageHandler result:", result)
                    sendResponse({ result, error: null })
                })
                .catch((err) => {
                    console.log("asyncMessageHandler error:", err)
                    sendResponse({ result: null, error: err })
                })
            return true
        }
}

export async function asyncTabMessage<T, R>(tabId: number, message: MessageRequest<T>): Promise<R> {
    console.log(browser.tabs.sendMessage)
    const result = await browser.tabs.sendMessage(tabId, message)
    if (result.error) {
        throw new Error(result.error)
    } else {
        return result.result
    }
}

export async function asyncRuntimeMessage<T, R>(message: MessageRequest<T>): Promise<R> {
    console.log("asyncRuntimeMessage", message)
    const result = await browser.runtime.sendMessage(message)
    if (result.error) {
        throw new Error(result.error)
    } else {
        return result.result
    }
}

export async function printMessage() {
    return await asyncRuntimeMessage<void, void>({ event: 'popup:print'})
}

export async function captureSnapshot() {
    return await asyncRuntimeMessage<void, void>({ event: 'content:capture-snapshot'})
}


export async function startCaptureMessage(tabId: number) {
    return await asyncTabMessage<void, boolean>(tabId, {event: 'content:start-capture'})
}

export async function capturePageMessage(done: boolean, dimensions?: DOMRect) {
    console.log("Pagemessage", done, dimensions)
    await asyncRuntimeMessage<MessageData, void>({event: 'content:capture-page', data: {done, dimensions}})
}

export async function outputReady() {
    return await asyncRuntimeMessage<void, Slide[]>({ event: 'output:ready'})
}

export async function selectArea(tabId: number): Promise<DOMRect> {
    return await asyncTabMessage<void, DOMRect>(tabId, { event: 'content:select-area' })
}

export async function openOutput() {
    return await asyncRuntimeMessage<void, void>({ event: 'open:output' })
}

export async function removeSlide(index: number) {
    return await asyncRuntimeMessage<{ index: number }, Slide[]>({ event: 'slides:remove', data: { index } })
}

export async function moveSlide(from: number, to: number) {
    return await asyncRuntimeMessage<{ from: number, to: number }, Slide[]>({ event: 'slides:move', data: { from, to } })
}

export async function autoCapture() {
    return await asyncRuntimeMessage<void, void>({ event: 'auto:capture' })
}

export async function getCounts(tabId: number): Promise<{ current: number, total: number } | null> {
    return await asyncTabMessage<void, { current: number, total: number } | null>(tabId, { event: 'content:get-counts' })
}
