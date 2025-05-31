import { getHandlerFor as docsendGetHandlerFor } from "./docsend"
import { getHandlerFor as pitchGetHandlerFor } from "./pitchdotcom"
import { getHandlerFor as brieflinkHandlerFor } from "./brieflink"
import { getHandlerFor as visibleVCGetHandlerFor } from "./visibledotvc"

export type HandlerFn = (document: Document) => Promise<void>
export type HandlerFinderFn = (url: string) => Function | null


let matchers = [
    pitchGetHandlerFor,
    docsendGetHandlerFor,
    brieflinkHandlerFor,
    visibleVCGetHandlerFor,
]

export const findHandlerFor = (url: string) => {
    for (const matcher of matchers) {
        const handler =  matcher(url)
        if (handler) return handler
    }
    return null
}