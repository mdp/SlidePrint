export type PrintOrientation = "portrait" | "landscape";

export const getPrintOrientation = (
  width: number,
  height: number,
): PrintOrientation => height > width ? "portrait" : "landscape";
