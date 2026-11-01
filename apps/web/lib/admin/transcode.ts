import type { MediaDoc } from "./media";

/** 4K fits inside this box; a source reaching either side of it has enough pixels, a smaller one would only be upscaled. */
const UHD_WIDTH = 3840;
const UHD_HEIGHT = 2160;

export const hasUhdSource = (clip: { width?: number; height?: number }) => (clip.width ?? 0) >= UHD_WIDTH || (clip.height ?? 0) >= UHD_HEIGHT;

/** A video that should get (or is getting) its 4K rendition. Asked only for videos a 4K screen plays. */
export const wantsUhd = (m: MediaDoc) => m.kind === "video" && m.status === "ready" && !m.deletedAt && !!m.renditions && !m.renditions.src2160 && !m.uhdError && hasUhdSource(m);

const h264 = (size: { widthPixels: number } | { heightPixels: number }, bitrate: number) => ({
  h264: { ...size, bitrateBps: bitrate, frameRate: 30, profile: "high", preset: "veryfast", pixelFormat: "yuv420p" },
});
const AUDIO = { key: "a", audioStream: { codec: "aac", bitrateBps: 128_000, channelCount: 2, sampleRateHertz: 48_000 } };

/** H.264 MP4 at 720p and 1080p, plus a poster. */
export function transcodeConfig(withAudio: boolean) {
  const audio = withAudio ? ["a"] : [];
  return {
    elementaryStreams: [
      { key: "v720", videoStream: h264({ heightPixels: 720 }, 2_500_000) },
      { key: "v1080", videoStream: h264({ heightPixels: 1080 }, 5_000_000) },
      ...(withAudio ? [AUDIO] : []),
    ],
    muxStreams: [
      { key: "720", container: "mp4", elementaryStreams: ["v720", ...audio] },
      { key: "1080", container: "mp4", elementaryStreams: ["v1080", ...audio] },
    ],
    spriteSheets: [{ filePrefix: "poster", spriteWidthPixels: 1280, columnCount: 1, rowCount: 1, totalCount: 1, startTimeOffset: "1s" }],
  };
}

/** The 4K rendition, a job of its own so a failure can't take 720p and 1080p with it. Only one side is set, so the other follows the aspect ratio. */
export function uhdTranscodeConfig(clip: { width?: number; height?: number }, withAudio: boolean) {
  const wide = (clip.width ?? 0) * UHD_HEIGHT > (clip.height ?? 0) * UHD_WIDTH;
  return {
    elementaryStreams: [{ key: "v2160", videoStream: h264(wide ? { widthPixels: UHD_WIDTH } : { heightPixels: UHD_HEIGHT }, 20_000_000) }, ...(withAudio ? [AUDIO] : [])],
    muxStreams: [{ key: "2160", container: "mp4", elementaryStreams: ["v2160", ...(withAudio ? ["a"] : [])] }],
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
