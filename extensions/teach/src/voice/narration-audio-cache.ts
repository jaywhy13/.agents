/**
 * Holds spoken audio so the same words are never paid for twice.
 *
 * A learner scrolls back, replays a beat, or reopens the lesson, and the same
 * narration is asked for again. The key is the lesson, the beat, and a hash of
 * exactly what was spoken — the text, the model, and the voice — so changing any
 * one of them is a miss rather than a stale hit.
 *
 * The cache is bounded twice: by entry count and by total bytes. Audio is large
 * and this cache lives in the pi process for as long as the session does, so an
 * unbounded map would be a slow memory leak. The least recently used entry goes
 * first.
 */

import { createHash } from "node:crypto";

import type { AudioBytes } from "./voice-limits.ts";
import {
  LARGEST_CACHED_NARRATION_BYTES,
  LARGEST_CACHED_NARRATION_ENTRIES,
} from "./voice-limits.ts";

const KEY_SEPARATOR = "\u0000";

export interface NarrationAudioKeyParts {
  readonly lessonId: string;
  readonly beatId: string;
  readonly text: string;
  readonly model: string;
  readonly voice: string;
}

export function narrationAudioKey(parts: NarrationAudioKeyParts): string {
  const contentHash = createHash("sha256")
    .update([parts.text, parts.model, parts.voice].join(KEY_SEPARATOR))
    .digest("hex");
  return [parts.lessonId, parts.beatId, contentHash].join(KEY_SEPARATOR);
}

export interface NarrationAudioCacheBounds {
  readonly largestEntries: number;
  readonly largestTotalBytes: number;
}

export const DEFAULT_NARRATION_CACHE_BOUNDS: NarrationAudioCacheBounds = {
  largestEntries: LARGEST_CACHED_NARRATION_ENTRIES,
  largestTotalBytes: LARGEST_CACHED_NARRATION_BYTES,
};

export class NarrationAudioCache {
  private readonly bounds: NarrationAudioCacheBounds;
  // Insertion order is the eviction order, and a hit is re-inserted to refresh it.
  private readonly audioByKey = new Map<string, AudioBytes>();
  private cachedBytes = 0;

  constructor(bounds: NarrationAudioCacheBounds = DEFAULT_NARRATION_CACHE_BOUNDS) {
    this.bounds = bounds;
  }

  get entryCount(): number {
    return this.audioByKey.size;
  }

  get totalBytes(): number {
    return this.cachedBytes;
  }

  get(key: string): AudioBytes | null {
    const audio = this.audioByKey.get(key);
    if (audio === undefined) {
      return null;
    }
    this.audioByKey.delete(key);
    this.audioByKey.set(key, audio);
    return audio;
  }

  /**
   * Stores audio, unless it is empty or on its own bigger than the whole cache.
   * Empty audio is never a real narration, so keeping it would turn one failure
   * into permanent silence for that beat.
   */
  set(key: string, audio: AudioBytes): void {
    if (audio.byteLength === 0 || audio.byteLength > this.bounds.largestTotalBytes) {
      return;
    }

    this.delete(key);
    this.audioByKey.set(key, audio);
    this.cachedBytes += audio.byteLength;
    this.evictUntilWithinBounds();
  }

  delete(key: string): void {
    const audio = this.audioByKey.get(key);
    if (audio === undefined) {
      return;
    }
    this.audioByKey.delete(key);
    this.cachedBytes -= audio.byteLength;
  }

  /** Called when a lesson closes, so a finished lesson stops holding memory. */
  forgetLesson(lessonId: string): void {
    const lessonPrefix = `${lessonId}${KEY_SEPARATOR}`;
    for (const key of [...this.audioByKey.keys()]) {
      if (key.startsWith(lessonPrefix)) {
        this.delete(key);
      }
    }
  }

  clear(): void {
    this.audioByKey.clear();
    this.cachedBytes = 0;
  }

  private evictUntilWithinBounds(): void {
    while (
      this.audioByKey.size > this.bounds.largestEntries ||
      this.cachedBytes > this.bounds.largestTotalBytes
    ) {
      const leastRecentlyUsedKey = this.audioByKey.keys().next().value;
      if (leastRecentlyUsedKey === undefined) {
        return;
      }
      this.delete(leastRecentlyUsedKey);
    }
  }
}
