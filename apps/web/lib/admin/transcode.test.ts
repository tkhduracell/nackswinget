import { describe, expect, it } from "vitest";
import { transcodeProgress } from "./transcode";

const start = Date.parse("2026-10-31T15:00:00Z");
const at = (sec: number) => start + sec * 1000;
const job = { state: "RUNNING", startTime: "2026-10-31T15:00:00Z" };

describe("transcodeProgress", () => {
  it("is unknown while queued or without a start time", () => {
    expect(transcodeProgress({ state: "PENDING" }, { size: 1 }, at(10))).toBeNull();
    expect(transcodeProgress({ state: "RUNNING" }, { size: 1 }, at(10))).toBeNull();
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
