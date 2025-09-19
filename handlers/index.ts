import { getHandlerFor as docsendGetHandlerFor, getCounts as docsendGetCounts } from "./docsend"
import { getHandlerFor as pitchGetHandlerFor, getCounts as pitchGetCounts } from "./pitchdotcom"
import { getHandlerFor as brieflinkHandlerFor, getCounts as brieflinkGetCounts } from "./brieflink"
import { getHandlerFor as visibleVCGetHandlerFor, getCounts as visibleVCGetCounts } from "./visibledotvc"
import { getHandlerFor as decksendGetHandlerFor, getCounts as decksendGetCounts } from "./decksend"

export type HandlerFn = (document: Document) => Promise<void>
export type HandlerFinderFn = (url: string) => Function | null


let matchers = [
    pitchGetHandlerFor,
    docsendGetHandlerFor,
    brieflinkHandlerFor,
    visibleVCGetHandlerFor,
    decksendGetHandlerFor,
]

type CountsFn = () => { current: number, total: number } | null
const countsMap: Array<{match: (url: string) => Function | null, fn: CountsFn}> = [
  { match: pitchGetHandlerFor, fn: () => pitchGetCounts() },
  { match: docsendGetHandlerFor, fn: () => docsendGetCounts() },
  { match: brieflinkHandlerFor, fn: () => brieflinkGetCounts() },
  { match: visibleVCGetHandlerFor, fn: () => visibleVCGetCounts() },
  { match: decksendGetHandlerFor, fn: () => decksendGetCounts() },
]

export const findHandlerFor = (url: string) => {
    for (const matcher of matchers) {
        const handler =  matcher(url)
        if (handler) return handler
    }
    return null
}

export const findCountsFor = (url: string): CountsFn | null => {
  for (const { match, fn } of countsMap) {
    const handler = match(url)
    if (handler) return fn
  }
  return null
}
