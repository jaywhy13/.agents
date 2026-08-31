/**
 * What the browser will and will not record.
 *
 * These are deliberately tighter than the lesson server's own upload limit. The
 * server refuses anything over 8 MiB; the browser stops well before that, so a
 * learner who forgets to press Space again gets a stopped recording rather than a
 * rejected upload.
 */

/** Containers to try, best first. Chrome and Firefox take the first, Safari the third. */
export const PREFERRED_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/** One answer, not a monologue. The recorder stops itself here. */
export const LONGEST_RECORDING_MILLISECONDS = 60_000;

/** Comfortably under the lesson server's 8 MiB upload limit. */
export const LARGEST_RECORDING_BYTES = 4 * 1024 * 1024;

/** How often MediaRecorder hands over data, so the size can be watched as it grows. */
export const RECORDING_CHUNK_MILLISECONDS = 250;

/** Anything shorter than this is a mis-press, not an answer. */
export const SHORTEST_USEFUL_RECORDING_BYTES = 1024;
