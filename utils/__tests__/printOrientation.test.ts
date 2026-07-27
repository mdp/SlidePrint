import { describe, expect, it } from "vitest";
import { getPrintOrientation } from "../printOrientation";

describe("getPrintOrientation", () => {
  it("uses portrait for images taller than they are wide", () => {
    expect(getPrintOrientation(1200, 1600)).toBe("portrait");
  });

  it("uses landscape for images wider than they are tall", () => {
    expect(getPrintOrientation(1600, 1200)).toBe("landscape");
  });

  it("uses landscape for square images", () => {
    expect(getPrintOrientation(1200, 1200)).toBe("landscape");
  });
});
