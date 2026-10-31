import { describe, expect, it } from "vitest";
import { canPreload, videoWindow } from "./engine";
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

describe("videoWindow", () => {
  it("plays the whole clip when nothing is cut", () => {
    expect(videoWindow({}, 20)).toEqual({ start: 0, end: 20 });
    expect(videoWindow({}, null)).toEqual({ start: 0, end: null });
  });
  it("cuts seconds away at the start and the end", () => {
    expect(videoWindow({ trimStart: 3, trimEnd: 2.5 }, 20)).toEqual({ start: 3, end: 17.5 });
    // Length still unknown: the end cut waits for it.
    expect(videoWindow({ trimStart: 3, trimEnd: 2 }, null)).toEqual({ start: 3, end: null });
  });
  it("still honours an older duration, counted from the cut", () => {
    expect(videoWindow({ durationSec: 8 }, 20)).toEqual({ start: 0, end: 8 });
    expect(videoWindow({ trimStart: 5, durationSec: 8 }, 20)).toEqual({ start: 5, end: 13 });
  });
  it("ignores a cut that would leave under a second", () => {
    expect(videoWindow({ trimStart: 10, trimEnd: 9.5 }, 20)).toEqual({ start: 0, end: 20 });
  });
});
