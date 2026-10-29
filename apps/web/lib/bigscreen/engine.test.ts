import { describe, expect, it } from "vitest";
import { canPreload } from "./engine";
import type { PlayerBlock } from "./types";

const video: PlayerBlock = { id: "v", kind: "video", src: "v.mp4" };
const image: PlayerBlock = { id: "i", kind: "image", src: "i.jpg", durationSec: 5 };

describe("canPreload", () => {
  it("never loads a second video while one plays in light mode", () => {
    expect(canPreload(true, video, { ...video, id: "v2" })).toBe(false);
  });
  it("still preloads around a single video in light mode", () => {
    expect(canPreload(true, image, video)).toBe(true);
    expect(canPreload(true, video, image)).toBe(true);
    expect(canPreload(true, undefined, video)).toBe(true);
  });
  it("preloads everything otherwise", () => {
    expect(canPreload(false, video, video)).toBe(true);
  });
});
