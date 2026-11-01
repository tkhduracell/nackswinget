import { describe, expect, it } from "vitest";
import type { MediaDoc } from "./media";
import { hasUhdSource, transcodeConfig, transcodeProgress, uhdTranscodeConfig, wantsUhd } from "./transcode";

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
  it("makes 720p and 1080p, and leaves out audio for a silent clip", () => {
    expect(transcodeConfig(true).muxStreams.map((m) => m.key)).toEqual(["720", "1080"]);
    expect(transcodeConfig(false).muxStreams[0].elementaryStreams).toEqual(["v720"]);
  });
});

describe("uhdTranscodeConfig", () => {
  const size = (clip: { width: number; height: number }) => uhdTranscodeConfig(clip, false).elementaryStreams[0];

  it("makes only the 4K file, without audio for a silent clip", () => {
    expect(uhdTranscodeConfig({ width: 3840, height: 2160 }, true).muxStreams).toEqual([{ key: "2160", container: "mp4", elementaryStreams: ["v2160", "a"] }]);
    expect(uhdTranscodeConfig({ width: 3840, height: 2160 }, false).muxStreams[0].elementaryStreams).toEqual(["v2160"]);
  });

  it("fits inside 3840x2160, so an ultrawide clip isn't upscaled", () => {
    expect(size({ width: 3840, height: 2160 })).toMatchObject({ videoStream: { h264: { heightPixels: 2160 } } });
    expect(size({ width: 2160, height: 3840 })).toMatchObject({ videoStream: { h264: { heightPixels: 2160 } } });
    expect(size({ width: 3840, height: 1600 })).toMatchObject({ videoStream: { h264: { widthPixels: 3840 } } });
  });
});

describe("hasUhdSource", () => {
  it("needs a source reaching 3840 wide or 2160 tall", () => {
    expect(hasUhdSource({ width: 3840, height: 2160 })).toBe(true);
    expect(hasUhdSource({ width: 3840, height: 1600 })).toBe(true);
    expect(hasUhdSource({ width: 2160, height: 3840 })).toBe(true);
    expect(hasUhdSource({ width: 1920, height: 1080 })).toBe(false);
    expect(hasUhdSource({})).toBe(false);
  });
});

describe("wantsUhd", () => {
  const clip = (over: Partial<MediaDoc>): MediaDoc => ({ id: "v", kind: "video", name: "v", path: "v", contentType: "", size: 1, alt: "", variants: [], status: "ready", width: 3840, height: 2160, renditions: { src720: "720.mp4" }, createdAt: "", createdBy: "", ...over });

  it("is a ready video from a 4K source, also while its job runs", () => {
    expect(wantsUhd(clip({}))).toBe(true);
    expect(wantsUhd(clip({ uhdJobName: "job" }))).toBe(true);
  });
  it("stops once the 4K file exists or its job failed, so a failure isn't retried forever", () => {
    expect(wantsUhd(clip({ renditions: { src720: "720.mp4", src2160: "2160.mp4" } }))).toBe(false);
    expect(wantsUhd(clip({ uhdError: "nej" }))).toBe(false);
  });
  it("skips smaller, unfinished and deleted videos, and other files", () => {
    expect(wantsUhd(clip({ height: 1080, width: 1920 }))).toBe(false);
    expect(wantsUhd(clip({ width: undefined, height: undefined }))).toBe(false);
    expect(wantsUhd(clip({ status: "processing" }))).toBe(false);
    expect(wantsUhd(clip({ deletedAt: "2026-11-01" }))).toBe(false);
    expect(wantsUhd(clip({ kind: "image" }))).toBe(false);
  });
});
