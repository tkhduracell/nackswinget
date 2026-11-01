import { describe, expect, it } from "vitest";
import { hasUhdSource, transcodeConfig, transcodeProgress } from "./transcode";

const start = Date.parse("2026-10-31T15:00:00Z");
const at = (sec: number) => start + sec * 1000;
const job = { state: "RUNNING", startTime: "2026-10-31T15:00:00Z" };

describe("transcodeProgress", () => {
  it("is unknown while queued or without a start time", () => {
    expect(transcodeProgress({ state: "PENDING" }, { size: 1 }, at(10))).toBeNull();
    expect(transcodeProgress({ state: "RUNNING" }, { size: 1 }, at(10))).toBeNull();
    expect(transcodeProgress({ state: "RUNNING", startTime: "not a time" }, { size: 1 }, at(10))).toBeNull();
  });
  it("grows with the time since the start against overhead plus clip length", () => {
    // 30 s overhead + 30 s clip = 60 s expected.
    expect(transcodeProgress(job, { durationSec: 30, size: 1 }, at(30))).toBe(50);
    expect(transcodeProgress(job, { durationSec: 30, size: 1 }, at(0))).toBe(0);
  });
  it("estimates the length from the file size, and stops at 95", () => {
    expect(transcodeProgress(job, { size: 60 * 1024 * 1024 }, at(30))).toBe(50);
    expect(transcodeProgress(job, { durationSec: 30, size: 1 }, at(600))).toBe(95);
  });
});

describe("transcodeConfig", () => {
  const outputs = (uhd: boolean) => transcodeConfig(true, uhd).muxStreams.map((m) => m.key);

  it("adds a 4K rendition only when asked for", () => {
    expect(outputs(false)).toEqual(["720", "1080"]);
    expect(outputs(true)).toEqual(["720", "1080", "2160"]);
  });

  it("leaves out audio for a silent clip", () => {
    expect(transcodeConfig(false, true).muxStreams.at(-1)?.elementaryStreams).toEqual(["v2160"]);
  });
});

describe("hasUhdSource", () => {
  it("needs a source at least 2160 px tall, so nothing is upscaled", () => {
    expect(hasUhdSource({ height: 2160 })).toBe(true);
    expect(hasUhdSource({ height: 3840 })).toBe(true);
    expect(hasUhdSource({ height: 1920 })).toBe(false);
    expect(hasUhdSource({})).toBe(false);
  });
});
