"use client";

import { useEffect } from "react";
import { buildTimings, totalDuration } from "@/lib/animation";
import {
  CANVAS_H,
  CANVAS_W,
  loadImage,
  type DrawContext,
} from "@/lib/renderer";
import {
  getRecordingDimensions,
  recordConversation,
  type OutputAspect,
} from "@/lib/recorder";
import {
  AudioEngine,
  buildBackgroundMusicEvents,
  buildSfxEvents,
  uniqueUrls,
} from "@/lib/audio";
import type { ConversationConfig } from "@/lib/types";

declare global {
  interface Window {
    renderConversationOnServer?: (
      config: ConversationConfig,
      outputAspect?: OutputAspect
    ) => Promise<{ base64: string; mimeType: string }>;
  }
}

type Assets = Omit<DrawContext, "config" | "timings">;
const SERVER_RENDER_FPS = 60;

export default function RenderWorkerPage() {
  useEffect(() => {
    window.renderConversationOnServer = renderConversationOnServer;
    return () => {
      delete window.renderConversationOnServer;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      Render worker ready
    </main>
  );
}

async function renderConversationOnServer(
  config: ConversationConfig,
  outputAspect: OutputAspect = "9:16"
) {
  const dimensions = getRecordingDimensions(outputAspect);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível.");

  try {
    await waitForFonts();
    const assets = await loadAssets(config);
    const timings = buildTimings(config, memeDurationOptions(assets.memeVideos));
    const audio = new AudioEngine();
    const totalMs = totalDuration(timings);
    const musicEvents = buildBackgroundMusicEvents(config, totalMs, timings);
    const sfxEvents = config.editedMode ? buildSfxEvents(config, timings) : [];

    let audioTrack: MediaStreamTrack | null = null;
    if (config.editedMode || musicEvents.length > 0) {
      await audio.ensureReady();
      if (config.editedMode && assets.memeVideos) {
        audio.connectMediaElements(Array.from(assets.memeVideos.values()), {
          toLive: false,
          toRecord: true,
        });
        setMemeVideosMuted(assets.memeVideos, false);
      }
      audioTrack = audio.getRecordingTrack();
      await audio.preloadUrls(uniqueUrls([...musicEvents, ...sfxEvents]));
    }

    const blob = await recordConversation({
      canvas,
      ctx,
      drawCtx: {
        config,
        timings,
        ...assets,
      },
      audioTrack,
      outputAspect,
      fps: SERVER_RENDER_FPS,
      onRecordingStart: () => {
        if (musicEvents.length > 0 || sfxEvents.length > 0) {
          audio.scheduleEvents([...musicEvents, ...sfxEvents], audio.now(), {
            toLive: false,
            toRecord: true,
          });
        }
      },
    });

    audio.cancelAll();
    audio.connectMediaElements(Array.from(assets.memeVideos?.values() ?? []), {
      toLive: false,
      toRecord: false,
    });

    return {
      base64: await blobToBase64(blob),
      mimeType: blob.type || "video/webm",
    };
  } finally {
    canvas.remove();
  }
}

async function loadAssets(config: ConversationConfig): Promise<Assets> {
  const [
    headerIconsImage,
    inputIconsImage,
    cameraIconImage,
    searchIconImage,
    sendIconImage,
    keyboardImage,
    wifiImage,
    ctaGoogle,
    ctaBusca,
    ctaAreaLogada,
    ctaFotoEnviada,
    avatarImage,
    storyImages,
    memeVideos,
  ] = await Promise.all([
    loadImageOrNull("/icons-superior-direito-ligar.jpeg"),
    loadImageOrNull("/Icons-direita-teclado.jpeg"),
    loadImageOrNull("/icone_camera_transparente.png"),
    loadImageOrNull("/icon_lupa_fundo_transparente.png"),
    loadImageOrNull("/icon_send_transparente_real.png"),
    loadImageOrNull("/teclado.png"),
    loadImageOrNull("/wifi.jpeg"),
    loadImageOrNull("/google.jpeg"),
    loadImageOrNull("/busca.jpeg"),
    loadImageOrNull("/area-logada.jpeg"),
    loadImageOrNull("/foto-enviada.jpeg"),
    config.avatarDataUrl ? loadImageOrNull(config.avatarDataUrl) : null,
    loadStoryImages(config),
    loadMemeVideos(config),
  ]);

  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = CANVAS_W;
  snapshotCanvas.height = CANVAS_H;

  return {
    avatarImage,
    headerIconsImage,
    inputIconsImage,
    cameraIconImage,
    searchIconImage,
    sendIconImage,
    keyboardImage,
    wifiImage,
    ctaImages: {
      google: ctaGoogle,
      busca: ctaBusca,
      areaLogada: ctaAreaLogada,
      fotoEnviada: ctaFotoEnviada,
    },
    storyImages,
    memeVideos,
    snapshotCanvas,
  };
}

async function loadImageOrNull(src: string) {
  try {
    const img = await loadImage(src);
    img.dataset.src = src;
    return img;
  } catch {
    return null;
  }
}

async function loadStoryImages(config: ConversationConfig) {
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    config.messages.map(async (message) => {
      const src = message.storyReply?.imageDataUrl;
      if (!src) return;
      const img = await loadImageOrNull(src);
      if (img) map.set(message.id, img);
    })
  );
  return map;
}

async function loadMemeVideos(config: ConversationConfig) {
  const map = new Map<string, HTMLVideoElement>();
  if (!config.editedMode) return map;

  const files = new Set<string>();
  for (const message of config.messages) {
    if (message.memeAfter?.file) files.add(message.memeAfter.file);
    if (message.memeOverlay?.file) files.add(message.memeOverlay.file);
  }

  await Promise.all(
    Array.from(files).map(async (file) => {
      try {
        map.set(file, await loadVideo(`/memes/${encodeURIComponent(file)}`));
      } catch {
        try {
          map.set(file, await loadVideo(`/memes/optimized/${encodeURIComponent(file)}`));
        } catch {
          /* skip broken meme assets */
        }
      }
    })
  );
  return map;
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timeoutId = window.setTimeout(() => reject(new Error(src)), 15000);
    const done = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      video.pause();
      resolve(video);
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", done);
      video.removeEventListener("canplay", done);
      video.removeEventListener("error", onError);
    };
    const onError = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error(src));
    };

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("loadeddata", done, { once: true });
    video.addEventListener("canplay", done, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.src = src;
    video.load();
    void video.play().then(done).catch(() => {
      /* readiness events still settle the promise */
    });
  });
}

function memeDurationOptions(videos?: Map<string, HTMLVideoElement> | null) {
  const memeDurationsMs = new Map<string, number>();
  for (const [file, video] of videos ?? []) {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      memeDurationsMs.set(file, video.duration * 1000);
    }
  }
  return { memeDurationsMs };
}

function setMemeVideosMuted(
  videos: Map<string, HTMLVideoElement>,
  muted: boolean
) {
  for (const video of videos.values()) {
    video.muted = muted;
    video.volume = muted ? 0 : 1;
  }
}

async function waitForFonts() {
  if (!("fonts" in document)) return;
  await Promise.all([
    document.fonts.load("400 38px Inter"),
    document.fonts.load("500 38px Inter"),
    document.fonts.load("600 46px Inter"),
    document.fonts.load("700 42px Inter"),
  ]);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
