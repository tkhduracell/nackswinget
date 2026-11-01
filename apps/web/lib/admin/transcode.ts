/** Source videos at least this tall also get a 4K rendition; a smaller one would only be upscaled. */
const UHD_HEIGHT = 2160;

export const hasUhdSource = (clip: { height?: number }) => (clip.height ?? 0) >= UHD_HEIGHT;

/** H.264 MP4 at 720p and 1080p (and 4K when asked for), plus a poster. */
export function transcodeConfig(withAudio: boolean, uhd: boolean) {
  const video = (key: string, height: number, bitrate: number) => ({
    key,
    videoStream: { h264: { heightPixels: height, bitrateBps: bitrate, frameRate: 30, profile: "high", preset: "veryfast", pixelFormat: "yuv420p" } },
  });
  const audio = withAudio ? ["a"] : [];
  return {
    elementaryStreams: [
      video("v720", 720, 2_500_000),
      video("v1080", 1080, 5_000_000),
      ...(uhd ? [video("v2160", UHD_HEIGHT, 20_000_000)] : []),
      ...(withAudio ? [{ key: "a", audioStream: { codec: "aac", bitrateBps: 128_000, channelCount: 2, sampleRateHertz: 48_000 } }] : []),
    ],
    muxStreams: [
      { key: "720", container: "mp4", elementaryStreams: ["v720", ...audio] },
      { key: "1080", container: "mp4", elementaryStreams: ["v1080", ...audio] },
      ...(uhd ? [{ key: "2160", container: "mp4", elementaryStreams: ["v2160", ...audio] }] : []),
    ],
    spriteSheets: [{ filePrefix: "poster", spriteWidthPixels: 1280, columnCount: 1, rowCount: 1, totalCount: 1, startTimeOffset: "1s" }],
  };
}

// The Transcoder API reports no percentage, only the job's state and when it
// started. This estimates one for the editors from the time since the start
// and the clip length (or the file size when the length isn't known yet).

/** Seconds of overhead per job, then roughly the clip's own length (720p + 1080p). */
const START_SEC = 30;
const SEC_PER_CLIP_SEC = 1;
/** Phone video is about 2 MB per second. */
const BYTES_PER_CLIP_SEC = 2 * 1024 * 1024;

export interface TranscodeJob {
  state?: string;
  startTime?: string;
}

/**
 * 0–95 while running (never 100 until the job says so), null while queued or
 * unknown. A slow job stays at 95 rather than going backwards.
 */
export function transcodeProgress(job: TranscodeJob, clip: { durationSec?: number; size: number }, now = Date.now()): number | null {
  if (job.state !== "RUNNING" || !job.startTime) return null;
  const clipSec = clip.durationSec ?? clip.size / BYTES_PER_CLIP_SEC;
  const expected = START_SEC + clipSec * SEC_PER_CLIP_SEC;
  const elapsed = (now - Date.parse(job.startTime)) / 1000;
  if (!Number.isFinite(elapsed)) return null;
  return Math.max(0, Math.min(95, Math.round((elapsed / expected) * 100)));
}
