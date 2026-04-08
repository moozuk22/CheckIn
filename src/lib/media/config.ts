import path from "path";

export const MEDIA_STORAGE_PATH =
  process.env.MEDIA_STORAGE_PATH || "/var/www/checkin/media";

export const MEDIA_FILES_DIR = path.join(MEDIA_STORAGE_PATH, "files");
export const MEDIA_CHUNKS_DIR = path.join(MEDIA_STORAGE_PATH, "chunks");

export const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_PATH = process.env.FFPROBE_PATH || "ffprobe";

export const SHARE_LINK_BASE_URL =
  process.env.SHARE_LINK_BASE_URL || "http://localhost:3000/watch";

export { CHUNK_SIZE } from "./chunk-size";

export const MIN_FREE_SPACE_BYTES = (() => {
  const gb = parseFloat(process.env.MEDIA_MIN_FREE_SPACE_GB || "5");
  return gb * 1024 * 1024 * 1024;
})();

// Browser-compatible video codecs (for direct serve or remux)
export const BROWSER_VIDEO_CODECS = new Set([
  "h264",
  "h265",
  "hevc",
  "vp8",
  "vp9",
  "av1",
]);

export const BROWSER_AUDIO_CODECS = new Set([
  "aac",
  "opus",
  "mp3",
  "vorbis",
]);

export const DIRECT_SERVE_CONTAINERS = new Set([
  "mp4",
  "webm",
  "mov", // mov with H.264+AAC plays in most browsers
]);

// Stale upload cleanup interval (6 hours)
export const STALE_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const STALE_UPLOAD_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;