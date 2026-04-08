import { spawn, execFile, ChildProcess } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { FFMPEG_PATH, FFPROBE_PATH, BROWSER_VIDEO_CODECS, BROWSER_AUDIO_CODECS, DIRECT_SERVE_CONTAINERS } from "./config";
import { getFilePath, deleteFile } from "./storage";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  durationSecs: number | null;
}

/**
 * Probe a video file for codec and container info.
 */
export async function probeFile(diskFileName: string): Promise<ProbeResult> {
  const filePath = getFilePath(diskFileName);

  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ], { timeout: 30000 });

  const info = JSON.parse(stdout);
  const streams: Array<{ codec_type: string; codec_name: string }> = info.streams || [];
  const format = info.format || {};

  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");

  const formatName: string = format.format_name || "";
  let container = "unknown";
  if (formatName.includes("mp4") || formatName.includes("mov")) {
    container = "mp4";
  } else if (formatName.includes("webm") || formatName.includes("matroska")) {
    container = formatName.includes("webm") ? "webm" : "mkv";
  } else if (formatName.includes("avi")) {
    container = "avi";
  } else {
    container = formatName.split(",")[0] || "unknown";
  }

  return {
    container,
    videoCodec: videoStream?.codec_name || null,
    audioCodec: audioStream?.codec_name || null,
    durationSecs: format.duration ? Math.round(parseFloat(format.duration)) : null,
  };
}

export type ProcessingDecision = "ready" | "remux" | "transcode" | "unsupported";

/**
 * Decide how to process a file based on probe results.
 */
export function decideProcessing(probe: ProbeResult): ProcessingDecision {
  if (!probe.videoCodec) {
    if (!probe.audioCodec) return "unsupported";
    const audioOk = BROWSER_AUDIO_CODECS.has(probe.audioCodec.toLowerCase());
    return audioOk ? "ready" : "transcode";
  }

  const videoOk = BROWSER_VIDEO_CODECS.has(probe.videoCodec.toLowerCase());
  const audioOk =
    !probe.audioCodec || BROWSER_AUDIO_CODECS.has(probe.audioCodec.toLowerCase());
  const containerOk = DIRECT_SERVE_CONTAINERS.has(probe.container.toLowerCase());

  if (videoOk && audioOk && containerOk) {
    return "ready";
  }

  if (videoOk && audioOk && !containerOk) {
    return "remux";
  }

  if (!videoOk || !audioOk) {
    return "transcode";
  }

  return "remux";
}

// --- Processing Queue (single-server, in-memory) ---

interface QueueItem {
  mediaFileId: string;
  diskFileName: string;
  decision: "remux" | "transcode";
  isAudioOnly: boolean;
}

const queue: QueueItem[] = [];
let activeProcess: ChildProcess | null = null;
let activeMediaFileId: string | null = null;
let processing = false;

/**
 * Enqueue a file for FFmpeg processing (remux or transcode).
 */
export function enqueueProcessing(item: QueueItem): void {
  queue.push(item);
  processNext();
}

/**
 * Kill the active FFmpeg process for a specific media file (used during delete).
 * Returns true if a process was killed.
 */
export function killProcessingFor(mediaFileId: string): boolean {
  if (activeMediaFileId === mediaFileId && activeProcess) {
    activeProcess.kill("SIGKILL");
    activeProcess = null;
    activeMediaFileId = null;
    return true;
  }
  // Also remove from queue if pending
  const idx = queue.findIndex((q) => q.mediaFileId === mediaFileId);
  if (idx !== -1) {
    queue.splice(idx, 1);
    return true;
  }
  return false;
}

async function processNext(): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;

  const item = queue.shift()!;
  activeMediaFileId = item.mediaFileId;

  try {
    const inputPath = getFilePath(item.diskFileName);
    const outputFileName = item.isAudioOnly
      ? `${item.mediaFileId}.m4a`
      : `${item.mediaFileId}.mp4`;
    const outputPath = getFilePath(outputFileName);

    // Build FFmpeg args
    const args: string[] = ["-i", inputPath, "-y"];

    if (item.isAudioOnly) {
      // Audio-only transcode: AAC output, no video args
      args.push("-c:a", "aac", "-b:a", "192k");
    } else if (item.decision === "remux") {
      args.push("-c", "copy", "-movflags", "+faststart");
    } else {
      // Transcode: H.264 + AAC
      args.push(
        "-c:v", "libx264", "-crf", "23", "-preset", "medium",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart"
      );
    }

    args.push(outputPath);

    await runFfmpeg(args);

    // If output differs from input, delete original and update DB
    if (item.diskFileName !== outputFileName) {
      await deleteFile(item.diskFileName);
    }

    const stat = await fs.stat(outputPath);

    await prisma.mediaFile.update({
      where: { id: item.mediaFileId },
      data: {
        status: "READY",
        diskFileName: outputFileName,
        sizeBytes: BigInt(stat.size),
        errorMessage: null,
        ...(item.isAudioOnly ? { mimeType: "audio/mp4" } : {}),
      },
    });

  } catch (error) {
    console.error(`FFmpeg processing failed for ${item.mediaFileId}:`, error);

    // Clean up partial output
    const outputFileName = item.isAudioOnly
      ? `${item.mediaFileId}.m4a`
      : `${item.mediaFileId}.mp4`;
    if (item.diskFileName !== outputFileName) {
      await deleteFile(outputFileName);
    }

    await prisma.mediaFile.update({
      where: { id: item.mediaFileId },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Грешка при обработка на файла",
      },
    });

  } finally {
    activeProcess = null;
    activeMediaFileId = null;
    processing = false;
    processNext();
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args, { stdio: "pipe" });
    activeProcess = proc;

    let stderr = "";
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString().slice(-2000);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}