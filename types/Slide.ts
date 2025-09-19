export type Slide = {
    img: string
    dimensions?: DOMRect | null
    // true if dimensions are already scaled to device pixels (auto-capture via fixHiDPI)
    // false/undefined if dimensions are in CSS pixels (manual selection)
    preScaled?: boolean
}
