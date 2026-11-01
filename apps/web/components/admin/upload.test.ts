import { afterEach, describe, expect, it, vi } from "vitest";
import { videoSize } from "./upload";

/** A stand-in <video> that fires one of its handlers once given a src. */
function stubVideo(fire: (v: Record<string, unknown>) => void) {
  const v: Record<string, unknown> = { removeAttribute: () => {} };
  Object.defineProperty(v, "src", { set: () => queueMicrotask(() => fire(v)) });
  vi.stubGlobal("document", { createElement: () => v });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
}

const clip = new File([], "a.mov", { type: "video/quicktime" });

describe("videoSize", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("skips files that aren't video", async () => {
    expect(await videoSize(new File([], "a.png", { type: "image/png" }))).toEqual({});
  });
  it("reads the size, also from a video recognised only by its name", async () => {
    stubVideo((v) => {
      Object.assign(v, { videoWidth: 3840, videoHeight: 2160 });
      (v.onloadedmetadata as () => void)();
    });
    expect(await videoSize(new File([], "a.mkv"))).toEqual({ width: 3840, height: 2160 });
  });
  it("is unknown when the browser can't read the file", async () => {
    stubVideo((v) => (v.onerror as () => void)());
    expect(await videoSize(clip)).toEqual({});
  });
  it("gives up after 5 s", async () => {
    vi.useFakeTimers();
    stubVideo(() => {});
    const size = videoSize(clip);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await size).toEqual({});
  });
});
