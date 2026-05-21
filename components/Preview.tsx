"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { drawFrame, CANVAS_W, CANVAS_H, loadImage } from "@/lib/renderer";
import { buildTimings, totalDuration } from "@/lib/animation";
import { recordConversation } from "@/lib/recorder";
import {
  AudioEngine,
  buildBackgroundMusicEvents,
  buildSfxEvents,
  uniqueUrls,
} from "@/lib/audio";
import type { ConversationConfig } from "@/lib/types";

export interface RecordResult {
  blob: Blob;
  mimeType: string;
}

export interface PreviewHandle {
  record: () => Promise<RecordResult | null>;
}

interface PreviewProps {
  config: ConversationConfig;
  onRecordingChange?: (recording: boolean) => void;
  onProgressChange?: (progress: number) => void;
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise(async (resolve, reject) => {
    const video = document.createElement("video");
    let objectUrl: string | null = null;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("seeked", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve(video);
    };
    const onMetadata = () => {
      if (video.readyState >= 2) {
        onReady();
        return;
      }
      if (Number.isFinite(video.duration) && video.duration > 0) {
        try {
          video.currentTime = Math.min(0.05, video.duration / 2);
        } catch {
          /* Some mobile browsers only allow seeking after more data arrives. */
        }
      }
    };
    const onError = () => {
      cleanup();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load video: ${src}`));
    };
    const timeoutId = window.setTimeout(() => {
      if (video.readyState > 0) {
        onReady();
        return;
      }
      onError();
    }, 12000);

    video.addEventListener("loadedmetadata", onMetadata, { once: true });
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("seeked", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });

    try {
      const response = await fetch(src, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      objectUrl = URL.createObjectURL(await response.blob());
      video.dataset.objectUrl = objectUrl;
      video.src = objectUrl;
      video.load();
      void video
        .play()
        .then(() => {
          video.pause();
          if (video.readyState >= 2) onReady();
        })
        .catch(() => {
          /* Muted autoplay is best-effort; load events still handle readiness. */
        });
    } catch {
      cleanup();
      reject(new Error(`Failed to load video: ${src}`));
    }
  });
}

function memeDurationOptions(
  videos: Map<string, HTMLVideoElement>
): { memeDurationsMs: Map<string, number> } {
  const memeDurationsMs = new Map<string, number>();
  for (const [file, video] of videos) {
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

export const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(
  { config, onRecordingChange, onProgressChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarImageRef = useRef<HTMLImageElement | null>(null);
  const headerIconsRef = useRef<HTMLImageElement | null>(null);
  const inputIconsRef = useRef<HTMLImageElement | null>(null);
  const cameraIconRef = useRef<HTMLImageElement | null>(null);
  const searchIconRef = useRef<HTMLImageElement | null>(null);
  const sendIconRef = useRef<HTMLImageElement | null>(null);
  const keyboardImageRef = useRef<HTMLImageElement | null>(null);
  const wifiImageRef = useRef<HTMLImageElement | null>(null);
  const ctaGoogleImageRef = useRef<HTMLImageElement | null>(null);
  const ctaBuscaImageRef = useRef<HTMLImageElement | null>(null);
  const ctaAreaLogadaImageRef = useRef<HTMLImageElement | null>(null);
  const ctaFotoEnviadaImageRef = useRef<HTMLImageElement | null>(null);
  const storyImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const memeVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (
    snapshotCanvasRef.current === null &&
    typeof document !== "undefined"
  ) {
    snapshotCanvasRef.current = document.createElement("canvas");
    snapshotCanvasRef.current.width = CANVAS_W;
    snapshotCanvasRef.current.height = CANVAS_H;
  }
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const recordingRef = useRef(false);
  const configRef = useRef(config);
  const audioRef = useRef<AudioEngine | null>(null);
  if (audioRef.current === null && typeof window !== "undefined") {
    audioRef.current = new AudioEngine();
  }

  configRef.current = config;

  // Whenever the conversation config changes the CTA snapshot (which is
  // a render of the Direct at a specific moment) is no longer valid.
  // Clear the stamped key so the renderer rebuilds it on the next draw.
  useEffect(() => {
    const snap = snapshotCanvasRef.current;
    if (snap) snap.dataset.ctaSnapshotTriggerMs = "";
  }, [config]);

  const [isReady, setIsReady] = useState(false);

  // Preload the static icon images served from /public.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadImage("/icons-superior-direito-ligar.jpeg"),
      loadImage("/Icons-direita-teclado.jpeg"),
      loadImage("/icone_camera_transparente.png"),
      loadImage("/icon_lupa_fundo_transparente.png"),
      loadImage("/icon_send_transparente_real.png"),
      loadImage("/teclado.png"),
      loadImage("/wifi.jpeg"),
      loadImage("/google.jpeg"),
      loadImage("/busca.jpeg"),
      loadImage("/area-logada.jpeg"),
      loadImage("/foto-enviada.jpeg"),
    ])
      .then(([
        header,
        input,
        camera,
        search,
        send,
        keyboard,
        wifi,
        ctaGoogle,
        ctaBusca,
        ctaAreaLogada,
        ctaFotoEnviada,
      ]) => {
        if (cancelled) return;
        headerIconsRef.current = header;
        inputIconsRef.current = input;
        cameraIconRef.current = camera;
        searchIconRef.current = search;
        sendIconRef.current = send;
        keyboardImageRef.current = keyboard;
        wifiImageRef.current = wifi;
        ctaGoogleImageRef.current = ctaGoogle;
        ctaBuscaImageRef.current = ctaBusca;
        ctaAreaLogadaImageRef.current = ctaAreaLogada;
        ctaFotoEnviadaImageRef.current = ctaFotoEnviada;
        setIsReady((r) => !r);
      })
      .catch(() => {
        /* fall back to nothing — icons just won't render */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Wait for the Inter web font to load before drawing the first frame so the
  // canvas uses Inter instead of a system fallback.
  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    const fonts = document.fonts;
    // Preload all weights we use across the canvas.
    Promise.all([
      fonts.load("400 38px Inter"),
      fonts.load("500 38px Inter"),
      fonts.load("600 46px Inter"),
      fonts.load("700 42px Inter"),
    ]).then(() => setIsReady((r) => !r));
  }, []);

  // Load story-reply images per message. Whenever the set of attachments
  // changes, we (re-)load only what's missing or stale and prune entries
  // for messages that no longer carry a story reply.
  useEffect(() => {
    let cancelled = false;
    const map = storyImagesRef.current;
    const wantedIds = new Set<string>();
    const tasks: Promise<void>[] = [];
    for (const m of config.messages) {
      if (!m.storyReply?.imageDataUrl) continue;
      wantedIds.add(m.id);
      const cached = map.get(m.id);
      // The data URL itself is our cache key (re-load when it changes).
      if (cached && (cached.dataset.src ?? cached.src) === m.storyReply.imageDataUrl) {
        continue;
      }
      tasks.push(
        loadImage(m.storyReply.imageDataUrl)
          .then((img) => {
            if (cancelled) return;
            // Stash the original src so we can compare later (some browsers
            // rewrite `img.src` for data URLs).
            img.dataset.src = m.storyReply!.imageDataUrl;
            map.set(m.id, img);
          })
          .catch(() => {
            // ignore broken image; placeholder will render
          })
      );
    }
    // Drop entries for messages that no longer have a story reply.
    for (const id of Array.from(map.keys())) {
      if (!wantedIds.has(id)) map.delete(id);
    }
    if (tasks.length > 0) {
      Promise.all(tasks).then(() => {
        if (!cancelled) setIsReady((r) => !r);
      });
    } else {
      // Force a redraw so removed entries disappear immediately.
      setIsReady((r) => !r);
    }
    return () => {
      cancelled = true;
    };
  }, [config.messages]);

  // Load avatar image
  useEffect(() => {
    let cancelled = false;
    if (config.avatarDataUrl) {
      loadImage(config.avatarDataUrl)
        .then((img) => {
          if (!cancelled) {
            avatarImageRef.current = img;
            setIsReady((r) => !r); // force a re-render after image loads
          }
        })
        .catch(() => {
          avatarImageRef.current = null;
        });
    } else {
      avatarImageRef.current = null;
      setIsReady((r) => !r);
    }
    return () => {
      cancelled = true;
    };
  }, [config.avatarDataUrl]);

  // Load meme videos selected for messages in edited mode.
  useEffect(() => {
    let cancelled = false;
    const map = memeVideosRef.current;
    const wanted = new Set<string>();
    const tasks: Promise<void>[] = [];

    if (config.editedMode) {
      for (const m of config.messages) {
        const files = [m.memeAfter?.file, m.memeOverlay?.file].filter(
          (file): file is string => !!file
        );
        for (const file of files) {
          wanted.add(file);
          const cached = map.get(file);
          const src = memeRenderUrl(file);
          if (cached && cached.dataset.src === src) continue;
          tasks.push(
            loadVideo(src)
              .then((video) => {
                if (cancelled) return;
                video.dataset.src = src;
                map.set(file, video);
              })
              .catch(() => {
                // ignore broken meme file; the renderer will skip it
              })
          );
        }
      }
    }

    for (const [file, video] of Array.from(map.entries())) {
      if (wanted.has(file)) continue;
      video.pause();
      if (video.dataset.objectUrl) {
        URL.revokeObjectURL(video.dataset.objectUrl);
      }
      map.delete(file);
    }

    if (tasks.length > 0) {
      Promise.all(tasks).then(() => {
        if (!cancelled) setIsReady((r) => !r);
      });
    } else {
      setIsReady((r) => !r);
    }

    return () => {
      cancelled = true;
    };
  }, [config.editedMode, config.messages]);

  // Preview animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    startTimeRef.current = performance.now();

    const loop = () => {
      if (recordingRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const cfg = configRef.current;
      const timings = buildTimings(
        cfg,
        memeDurationOptions(memeVideosRef.current)
      );
      const total = totalDuration(timings);
      const loopPause = 1200;
      const cycleLength = total + loopPause;

      const elapsed = (performance.now() - startTimeRef.current) % cycleLength;
      const t = Math.min(elapsed, total);
      const frameCtx = {
        config: cfg,
        timings,
        avatarImage: avatarImageRef.current,
        headerIconsImage: headerIconsRef.current,
        inputIconsImage: inputIconsRef.current,
        cameraIconImage: cameraIconRef.current,
        searchIconImage: searchIconRef.current,
        sendIconImage: sendIconRef.current,
        keyboardImage: keyboardImageRef.current,
        wifiImage: wifiImageRef.current,
        ctaImages: {
          google: ctaGoogleImageRef.current,
          busca: ctaBuscaImageRef.current,
          areaLogada: ctaAreaLogadaImageRef.current,
          fotoEnviada: ctaFotoEnviadaImageRef.current,
        },
        storyImages: storyImagesRef.current,
        memeVideos: memeVideosRef.current,
        snapshotCanvas: snapshotCanvasRef.current,
      };
      drawFrame(ctx, t, frameCtx);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isReady]);

  useImperativeHandle(
    ref,
    () => ({
      record: async () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        recordingRef.current = true;
        onRecordingChange?.(true);
        onProgressChange?.(0);
        try {
          const cfg = configRef.current;
          const timings = buildTimings(
            cfg,
            memeDurationOptions(memeVideosRef.current)
          );

          // ---- Audio (edited mode only) ----
          let audioTrack: MediaStreamTrack | null = null;
          let sfxEvents: ReturnType<typeof buildSfxEvents> = [];
          let musicEvents: ReturnType<typeof buildBackgroundMusicEvents> = [];
          const audio = audioRef.current;
          const totalMs = totalDuration(timings);
          musicEvents = buildBackgroundMusicEvents(cfg, totalMs, timings);
          if ((cfg.editedMode || musicEvents.length > 0) && audio) {
            // The user clicked "Gerar vídeo" — this counts as a user gesture
            // so the AudioContext is allowed to start producing sound.
            await audio.ensureReady();
            audio.cancelAll();
            if (cfg.editedMode) {
              audio.connectMediaElements(
                Array.from(memeVideosRef.current.values()),
                { toLive: true, toRecord: true }
              );
              setMemeVideosMuted(memeVideosRef.current, false);
            }
            audioTrack = audio.getRecordingTrack();
            sfxEvents = cfg.editedMode ? buildSfxEvents(cfg, timings) : [];
            // Preload only the URLs actually referenced by this run so the
            // first event isn't delayed by a cold fetch.
            await audio.preloadUrls(uniqueUrls([...sfxEvents, ...musicEvents]));
          }

          const blob = await recordConversation({
            canvas,
            ctx,
            drawCtx: {
              config: cfg,
              timings,
              avatarImage: avatarImageRef.current,
              headerIconsImage: headerIconsRef.current,
              inputIconsImage: inputIconsRef.current,
              cameraIconImage: cameraIconRef.current,
              searchIconImage: searchIconRef.current,
              sendIconImage: sendIconRef.current,
              keyboardImage: keyboardImageRef.current,
              wifiImage: wifiImageRef.current,
              ctaImages: {
                google: ctaGoogleImageRef.current,
                busca: ctaBuscaImageRef.current,
                areaLogada: ctaAreaLogadaImageRef.current,
                fotoEnviada: ctaFotoEnviadaImageRef.current,
              },
              storyImages: storyImagesRef.current,
              memeVideos: memeVideosRef.current,
              snapshotCanvas: snapshotCanvasRef.current,
            },
            audioTrack,
            fps: isLikelyMobileDevice() ? 24 : 30,
            onRecordingStart: () => {
              if (audio && (sfxEvents.length > 0 || musicEvents.length > 0)) {
                audio.scheduleEvents([...musicEvents, ...sfxEvents], audio.now(), {
                  toLive: true,
                  toRecord: true,
                });
              }
            },
            onProgress: (p) => onProgressChange?.(p),
          });
          return { blob, mimeType: blob.type };
        } finally {
          audioRef.current?.connectMediaElements(
            Array.from(memeVideosRef.current.values()),
            { toLive: false, toRecord: false }
          );
          audioRef.current?.cancelAll();
          setMemeVideosMuted(memeVideosRef.current, true);
          recordingRef.current = false;
          onRecordingChange?.(false);
          onProgressChange?.(0);
          startTimeRef.current = performance.now();
        }
      },
    }),
    [onRecordingChange, onProgressChange]
  );

  return (
    <div className="relative mx-auto flex w-full max-w-[360px] flex-col gap-4">
      <div
        className="relative w-full overflow-hidden rounded-[44px] border border-ig-border bg-black shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)]"
        style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block h-full w-full"
        />
      </div>
    </div>
  );
});

function memeRenderUrl(file: string): string {
  return `/memes/optimized/${encodeURIComponent(file)}`;
}

function isLikelyMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 768px)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
}
