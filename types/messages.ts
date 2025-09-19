import type { Slide } from "./Slide";

// Map each event to its request and response types
export type MessageMap = {
  'content:ready': { req: void; res: true | boolean };
  'content:start-capture': { req: void; res: true | boolean };
  'content:capture-page': { req: { done?: boolean; dimensions?: DOMRect | null; preScaled?: boolean } | undefined; res: true | void };
  'content:select-area': { req: void; res: DOMRect };
  'content:get-counts': { req: void; res: { current: number; total: number } | null };
  'select:done': { req: DOMRect; res: true | boolean };

  'output:ready': { req: void; res: Slide[] };
  'open:output': { req: void; res: true | boolean };
  'popup:opened': { req: void; res: true | boolean };
  'select:start': { req: void; res: true | boolean };
  'reset': { req: void; res: true | void };
  'slides:remove': { req: { index: number }; res: Slide[] };
  'slides:move': { req: { from: number; to: number }; res: Slide[] };
  'auto:capture': { req: void; res: true | boolean };
  'auto:progress': { req: { current?: number; total?: number } | undefined; res: true | boolean };

  // Popup events kept for completeness (unused today)
  'popup:can-print': { req: void; res: boolean };
  'popup:print': { req: void; res: void };
};
