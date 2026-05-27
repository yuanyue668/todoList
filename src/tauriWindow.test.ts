import { describe, expect, it } from "vitest";
import { REVEAL_STRIP_SIZE, getEdgeWindowPosition, isCursorInsideVisibleStrip } from "./tauriWindow";

describe("edge window positions", () => {
  it("keeps a wide enough visible strip for pointer reveal on the left edge", () => {
    const hidden = getEdgeWindowPosition(
      "left",
      true,
      { x: 0, y: 120 },
      { width: 360, height: 640 },
      { width: 1920, height: 1080 }
    );

    expect(REVEAL_STRIP_SIZE).toBeGreaterThanOrEqual(24);
    expect(hidden).toEqual({ x: REVEAL_STRIP_SIZE - 360, y: 120 });
  });

  it("reveals to the visible edge position", () => {
    const revealed = getEdgeWindowPosition(
      "left",
      false,
      { x: -336, y: 120 },
      { width: 360, height: 640 },
      { width: 1920, height: 1080 }
    );

    expect(revealed).toEqual({ x: 0, y: 120 });
  });

  it("detects the cursor inside the visible left reveal strip", () => {
    expect(
      isCursorInsideVisibleStrip(
        "left",
        { x: 12, y: 200 },
        { x: -779, y: 120 },
        { width: 795, height: 541 }
      )
    ).toBe(true);
  });

  it("ignores the cursor outside the visible left reveal strip", () => {
    expect(
      isCursorInsideVisibleStrip(
        "left",
        { x: 80, y: 200 },
        { x: -779, y: 120 },
        { width: 795, height: 541 }
      )
    ).toBe(false);
  });
});
