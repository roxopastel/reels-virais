import { CANVAS_H, CANVAS_W, drawFrame, type DrawContext } from "./renderer";
import { buildTimings, totalDuration } from "./animation";
import type { VideoPublishMetadata } from "./types";
import { filenameBaseFromTitle } from "./videoMetadata";

export type OutputAspect = "9:16" | "16:9";
export type OutputPreset = "source" | "social";

export interface RecordingDimensions {
  width: number;
  height: number;
}

export interface RecordOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  drawCtx: DrawContext;
  fps?: number;
  outputAspect?: OutputAspect;
  outputPreset?: OutputPreset;
  onProgress?: (progress: number) => void;
  /** Optional audio track to bake into the recording (used by "edited" mode
   *  to include the typing/send/notification SFX). */
  audioTrack?: MediaStreamTrack | null;
  /** Called the instant the video stream starts being captured (i.e. right
   *  before the rAF loop begins). Used to anchor SFX scheduling to the same
   *  clock as the video. */
  onRecordingStart?: () => void;
  /** Called after each captured animation frame is drawn. Used by the browser
   *  UI to mirror the exact recording timeline on the visible preview. */
  onFrame?: (timeMs: number) => void;
}

export interface ExtraRecordOutput {
  key: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  outputAspect?: OutputAspect;
  outputPreset?: OutputPreset;
}

export interface RecordAllOptions extends RecordOptions {
  extraOutputs?: ExtraRecordOutput[];
}

export interface RecordAllResult {
  blob: Blob;
  mimeType: string;
  extraBlobs: Record<string, Blob>;
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

export function getRecordingDimensions(
  outputAspect: OutputAspect,
  targetWidth?: number,
  outputPreset: OutputPreset = "source"
): RecordingDimensions {
  if (outputAspect === "16:9") {
    const width = targetWidth ?? 1920;
    return { width, height: Math.round((width * 9) / 16) };
  }

  if (outputPreset === "social") {
    return { width: 1080, height: 1920 };
  }

  if (!targetWidth) {
    return { width: CANVAS_W, height: CANVAS_H };
  }
  return { width: targetWidth, height: Math.round((targetWidth * CANVAS_H) / CANVAS_W) };
}

/**
 * Records the canvas to a video blob.
 * Drives the animation deterministically and captures via canvas.captureStream.
 */
export async function recordConversation(opts: RecordOptions): Promise<Blob> {
  const result = await recordConversationAll(opts);
  return result.blob;
}

export async function recordConversationAll(
  opts: RecordAllOptions
): Promise<RecordAllResult> {
  const { canvas, ctx, drawCtx, onProgress } = opts;
  const fps = opts.fps ?? 30;
  const outputAspect = opts.outputAspect ?? "9:16";
  const outputPreset = opts.outputPreset ?? "source";

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder não é suportado neste navegador.");
  }

  const outputs = [
    { key: "__primary", canvas, ctx, outputAspect, outputPreset },
    ...(opts.extraOutputs ?? []).map((output) => ({
      key: output.key,
      canvas: output.canvas,
      ctx: output.ctx,
      outputAspect: output.outputAspect ?? outputAspect,
      outputPreset: output.outputPreset ?? outputPreset,
    })),
  ];

  const recorders = outputs.map((output) => {
    const stream = output.canvas.captureStream(fps);
    if (opts.audioTrack) {
      try {
        stream.addTrack(opts.audioTrack);
      } catch {
        /* audio track is best-effort for secondary outputs */
      }
    }
    const mimeType = pickMimeType(!!opts.audioTrack);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: Math.round(
        output.canvas.width * output.canvas.height * (fps >= 60 ? 6 : 4)
      ),
      audioBitsPerSecond: opts.audioTrack ? 128_000 : undefined,
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    return { ...output, recorder, chunks, mimeType };
  });

  const total = totalDuration(drawCtx.timings);
  let rafId = 0;
  let startWallClock = 0;

  // Draw initial frame BEFORE starting the recorder so the very first
  // captured frame is correct and not blank.
  for (const output of recorders) {
    drawOutputFrame(
      output.ctx,
      0,
      drawCtx,
      output.outputAspect,
      output.outputPreset,
      output.canvas.width,
      output.canvas.height
    );
  }
  opts.onFrame?.(0);

  return new Promise<RecordAllResult>((resolve, reject) => {
    let stopped = 0;
    let rejected = false;
    const blobs: Record<string, Blob> = {};

    for (const output of recorders) {
      output.recorder.onerror = (e) => {
        if (rejected) return;
        rejected = true;
        reject(e);
      };
      output.recorder.onstop = () => {
        stopped += 1;
        blobs[output.key] = new Blob(output.chunks, { type: output.mimeType });
        if (stopped !== recorders.length) return;

        cancelAnimationFrame(rafId);
        const primary = blobs.__primary;
        delete blobs.__primary;
        resolve({
          blob: primary,
          mimeType: primary.type,
          extraBlobs: blobs,
        });
      };
    }

    const loop = () => {
      const elapsed = performance.now() - startWallClock;
      const t = Math.min(elapsed, total);
      for (const output of recorders) {
        drawOutputFrame(
          output.ctx,
          t,
          drawCtx,
          output.outputAspect,
          output.outputPreset,
          output.canvas.width,
          output.canvas.height
        );
      }
      opts.onFrame?.(t);
      if (onProgress) onProgress(Math.min(t / total, 1));
      if (elapsed >= total) {
        // give recorder a beat to flush the last frame
        setTimeout(() => {
          for (const output of recorders) {
            if (output.recorder.state !== "inactive") {
              output.recorder.stop();
            }
          }
        }, 200);
        return;
      }
      rafId = requestAnimationFrame(loop);
    };

    // Request a fresh data chunk every 250ms so we don't lose data on stop
    for (const output of recorders) output.recorder.start(250);
    // Use rAF to ensure the initial frame has reached the GPU, then start clock
    requestAnimationFrame(() => {
      startWallClock = performance.now();
      opts.onRecordingStart?.();
      rafId = requestAnimationFrame(loop);
    });
  });
}

function drawOutputFrame(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  drawCtx: DrawContext,
  outputAspect: OutputAspect,
  outputPreset: OutputPreset,
  width: number,
  height: number
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (outputAspect === "16:9") {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / CANVAS_W, height / CANVAS_H);
    const dx = (width - CANVAS_W * scale) / 2;
    const dy = (height - CANVAS_H * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, dx, dy);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const scale =
      outputPreset === "social"
        ? Math.max(width / CANVAS_W, height / CANVAS_H)
        : Math.min(width / CANVAS_W, height / CANVAS_H);
    const dx = (width - CANVAS_W * scale) / 2;
    const dy = (height - CANVAS_H * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, dx, dy);
  }

  drawFrame(ctx, timeMs, drawCtx);
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

export function suggestFilename(
  username: string,
  mimeType: string,
  outputAspect: OutputAspect = "9:16",
  outputPreset: OutputPreset = "source",
  metadata?: VideoPublishMetadata | null
): string {
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const titleBase = filenameBaseFromTitle(metadata?.title);
  if (titleBase) {
    const titleSuffix =
      outputPreset === "social"
        ? ""
        : outputAspect === "16:9"
          ? " - 16x9"
          : " - 1180x2556";
    return `${titleBase}${titleSuffix}.${ext}`;
  }

  const safe = (username || "conversa")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 32);
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const suffix =
    outputPreset === "social"
      ? "_1080x1920"
      : outputAspect === "16:9"
        ? "_16x9"
        : "";
  return `${safe}_${ts}${suffix}.${ext}`;
}

export { buildTimings, totalDuration };
