import { getHandlerFor } from '../brieflink'

it("should work with a docsend url", () => {
  expect(getHandlerFor("https://brieflink.com/v/123abc")).not.toBe(null)
})

it("should ignore non brieflink slide urls", () => {
  expect(getHandlerFor("https://brieflink.com/help")).toBe(null)
})