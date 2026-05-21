import { CANVAS_H, CANVAS_W, drawFrame, type DrawContext } from "./renderer";
import { buildTimings, totalDuration } from "./animation";

export interface RecordOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  drawCtx: DrawContext;
  fps?: number;
  onProgress?: (progress: number) => void;
  /** Optional audio track to bake into the recording (used by "edited" mode
   *  to include the typing/send/notification SFX). */
  audioTrack?: MediaStreamTrack | null;
  /** Called the instant the video stream starts being captured (i.e. right
   *  before the rAF loop begins). Used to anchor SFX scheduling to the same
   *  clock as the video. */
  onRecordingStart?: () => void;
}

/**
 * Picks the best supported MIME type for video recording.
 * MP4 (H.264) is preferred so the output is universally compatible.
 * Falls back to WebM if MP4 is not supported by MediaRecorder.
 */
function pickMimeType(withAudio: boolean): string {
  const audioCandidates = [
    'video/mp4;codecs="avc1.42E02A,mp4a.40.2"',
    'video/mp4;codecs="avc1.4D402A,mp4a.40.2"',
    'video/mp4;codecs="avc1.64002A,mp4a.40.2"',
    'video/mp4;codecs="avc1.42E028,mp4a.40.2"',
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    'video/mp4;codecs="avc1.42E01F,mp4a.40.2"',
    'video/mp4;codecs="avc1,mp4a"',
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=opus",
    "video/webm",
  ];
  const videoOnlyCandidates = [
    'video/mp4;codecs="avc1.42E02A"',
    'video/mp4;codecs="avc1.4D402A"',
    'video/mp4;codecs="avc1.64002A"',
    'video/mp4;codecs="avc1.42E028"',
    'video/mp4;codecs="avc1.640028"',
    'video/mp4;codecs="avc1.42E01F"',
    "video/mp4;codecs=avc1",
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const candidates = withAudio ? audioCandidates : videoOnlyCandidates;
  for (const c of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported &&
      MediaRecorder.isTypeSupported(c)
    ) {
      return c;
    }
  }
  return "video/webm";
}

export function getRecorderMimeType(): string {
  return pickMimeType(false);
}

/**
 * Records the canvas to a video blob.
 * Drives the animation deterministically and captures via canvas.captureStream.
 */
export async function recordConversation(opts: RecordOptions): Promise<Blob> {
  const { canvas, ctx, drawCtx, onProgress } = opts;
  const fps = opts.fps ?? 30;

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder não é suportado neste navegador.");
  }

  // We use a manual-frame approach for deterministic timing:
  // - Use captureStream(0) (manual mode if supported) OR captureStream(fps)
  // - Drive a real-time loop at the desired fps, drawing each frame

  const stream = canvas.captureStream(fps);
  if (opts.audioTrack) {
    try {
      stream.addTrack(opts.audioTrack);
    } catch {
      /* ignore — audio track is best-effort */
    }
  }
  const mimeType = pickMimeType(!!opts.audioTrack);
  const videoBitsPerSecond = Math.round(CANVAS_W * CANVAS_H * 4);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond,
    audioBitsPerSecond: opts.audioTrack ? 128_000 : undefined,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const total = totalDuration(drawCtx.timings);
  let rafId = 0;
  let startWallClock = 0;

  // Draw initial frame BEFORE starting the recorder so the very first
  // captured frame is correct and not blank.
  drawFrame(ctx, 0, drawCtx);

  return new Promise<Blob>((resolve, reject) => {
    recorder.onerror = (e) => reject(e);
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    const loop = () => {
      const elapsed = performance.now() - startWallClock;
      const t = Math.min(elapsed, total);
      drawFrame(ctx, t, drawCtx);
      if (onProgress) onProgress(Math.min(t / total, 1));
      if (elapsed >= total) {
        // give recorder a beat to flush the last frame
        setTimeout(() => recorder.stop(), 200);
        return;
      }
      rafId = requestAnimationFrame(loop);
    };

    // Request a fresh data chunk every 250ms so we don't lose data on stop
    recorder.start(250);
    // Use rAF to ensure the initial frame has reached the GPU, then start clock
    requestAnimationFrame(() => {
      startWallClock = performance.now();
      opts.onRecordingStart?.();
      rafId = requestAnimationFrame(loop);
    });
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function suggestFilename(username: string, mimeType: string): string {
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const safe = (username || "conversa")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 32);
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  return `${safe}_${ts}.${ext}`;
}

export { buildTimings, totalDuration };
