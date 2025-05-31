export const fixHiDPI = (orig: DOMRect): DOMRect => {
  const newDOMRect = orig.toJSON()
  const devicePixelRatio = window.devicePixelRatio
  if (devicePixelRatio > 1) {
    let props = ['x', 'y', 'top', 'bottom', 'left', 'right', 'height', 'width']
    for(const prop of props) {
      newDOMRect[prop] = newDOMRect[prop] * devicePixelRatio
    }
  }
  return newDOMRect
}
