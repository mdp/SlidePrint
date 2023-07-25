import { getHandlerFor } from '../docsend'

it("should work with a docsend url", () => {
  expect(getHandlerFor("https://docsend.com/view/abc234")).not.toBe(null)
})

it("should work with a custom subdomain docsend url", () => {
  expect(getHandlerFor("https://foo.docsend.com/view/abc234")).not.toBe(null)
})

it("should ignore non docsend slide urls", () => {
  expect(getHandlerFor("https://docsend.com/help")).toBe(null)
})