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
  return Math.max(0, Math.min(95, Math.round((elapsed / expected) * 100)));
}
