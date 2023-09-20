import { Slide } from "../types/Slide"

type ValidEvents = 'content:ready' | 'popup:can-print' | 'popup:opened' | 'popup:print' | 'output:ready' | 'content:can-print' | 'content:start-capture' | 'content:capture-page' | 'reset'

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
    (fn: (request: MessageRequest<T>, sender: chrome.runtime.MessageSender) => Promise<any>): (request: any, sender: chrome.runtime.MessageSender, callback: (response: any) => void) => boolean {
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
    const result = await chrome.tabs.sendMessage(tabId, message)
    if (result.error) {
        throw new Error(result.error)
    } else {
        return result.result
    }
}

export async function asyncRuntimeMessage<T, R>(message: MessageRequest<T>): Promise<R> {
    console.log("asyncRuntimeMessage", message)
    const result = await chrome.runtime.sendMessage(message)
    if (result.error) {
        throw new Error(result.error)
    } else {
        return result.result
    }
}

export async function printMessage() {
    return await asyncRuntimeMessage<void, void>({ event: 'popup:print'})
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
