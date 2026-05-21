"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Sparkles, Video, Wand2 } from "lucide-react";
import { Preview, type PreviewHandle } from "@/components/Preview";
import { Form } from "@/components/Form";
import { ResultModal } from "@/components/ResultModal";
import type { ConversationConfig, Message } from "@/lib/types";
import { buildTimings, totalDuration } from "@/lib/animation";
import { CANVAS_H, CANVAS_W } from "@/lib/renderer";
import { musicFileToUrl } from "@/lib/audio";

const DEFAULT_CONFIG: ConversationConfig = {
  username: "luluzinha",
  subtitle: "Ativo(a) agora",
  avatarDataUrl: null,
  messages: [
    {
      id: "m1",
      side: "sent",
      text: "Vc canta no chuveiro??",
      storyReply: { imageDataUrl: "" },
      focusZoomOnMessage: true,
      focusZoomScale: 1.3,
      focusZoomDelayMs: 500,
      focusZoomHoldMs: 1500,
      focusZoomOffsetX: 0,
      focusZoomOffsetY: 420,
      audio: {
        focusZoomSfx: "pop.mp3",
      },
      memeAfter: {
        file: "vini.mp4",
      },
    },
    {
      id: "m2",
      side: "received",
      text: "depende kkkkkkkkkkk",
      typingDurationMs: 1800,
      audio: {
        typingSfx: "none",
        appearSfx: "notification.mp3",
      },
    },
    {
      id: "m3",
      side: "received",
      text: "tô de bom humor",
      typingDurationMs: 1800,
      audio: {
        typingSfx: "none",
        appearSfx: "notification.mp3",
      },
      callToActionAfter: {
        domain: "puxeassunto.com",
        siteTagline:
          "Insira o print da conversa e nós sugerimos a resposta perfeita.",
      },
    },
    {
      id: "m4",
      side: "sent",
      text: "Manda um audio cantando então",
      typingDurationMs: 3000,
      audio: {
        typingMode: "loop",
        typingLoopSfx: "default",
        sendSfx: "none",
      },
      memeOverlay: {
        file: "pi.mp4",
        durationMs: 3000,
        opacity: 0.45,
        x: 60,
        y: 1390,
        width: 1080,
        height: 690,
      },
    },
  ],
  typingDurationMs: 1800,
  showHeader: false,
  hiddenTopChromeBorderPx: 480,
  theme: "dark",
  statusBarTime: "9:41",
  hasStory: false,
  verified: false,
  online: true,
  showProfileCard: true,
  profileDisplayName: "Luiza Marqueza",
  profileShowUsername: false,
  profileFollowers: "818",
  profilePosts: "3",
  profileFollowInfo: [
    "Vocês se seguem mutuamente no Instagram",
  ],
  profileButtonLabel: "Ver perfil",
  chatTimestamp: "Hoje, 20:52",
  editedMode: true,
  backgroundMusic: "colocada.mp3",
  backgroundMusicGain: 0.3,
};

interface GeneratedConversation {
  username: string;
  profileDisplayName: string;
  firstSent: string;
  receivedBatch: string[];
  responseAlternatives?: string[];
  sentReply: string;
  finalReceived: string;
  avatarImageUrl?: string;
  storyImageUrl?: string;
}

export default function HomePage() {
  const [config, setConfig] = useState<ConversationConfig>(DEFAULT_CONFIG);
  const [recording, setRecording] = useState(false);
  const [generatingConversation, setGeneratingConversation] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<string[]>([]);
  const [musicFiles, setMusicFiles] = useState<string[]>([]);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const previewRef = useRef<PreviewHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fotos")
      .then((response) => response.json())
      .then((data: { files?: string[] }) => {
        if (cancelled || !Array.isArray(data.files) || data.files.length === 0) {
          return;
        }
        setPhotoFiles(data.files);
        setConfig((current) => fillMissingRandomPhotos(current, data.files!));
      })
      .catch(() => {
        /* photos are best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/musics")
      .then((response) => response.json())
      .then((data: { files?: string[] }) => {
        if (!cancelled && Array.isArray(data.files)) {
          setMusicFiles(data.files);
        }
      })
      .catch(() => {
        if (!cancelled) setMusicFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRecord = async () => {
    if (recording) return;
    try {
      const result = await previewRef.current?.record();
      if (result) {
        setResultBlob(result.blob);
      }
    } catch (err) {
      console.error("Erro ao gravar:", err);
      alert(
        "Falha ao gravar o vídeo. Tente em outro navegador (Chrome / Edge recomendado)."
      );
    }
  };

  const openConversationPhotoModal = () => {
    if (recording || generatingConversation) return;
    if (photoFiles.length > 0) {
      setConfig((current) => fillMissingRandomPhotos(current, photoFiles));
    }
    setPhotoModalOpen(true);
  };

  const handleGenerateConversation = async () => {
    if (recording || generatingConversation) return;
    setGeneratingConversation(true);
    setGenerateError(null);
    try {
      const storyImageUrl = config.messages[0]?.storyReply?.imageDataUrl ?? "";
      const response = await fetch("/api/generate-conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          avatarImageUrl: config.avatarDataUrl,
          storyImageUrl,
        }),
      });
      const data = (await response.json()) as {
        conversation?: GeneratedConversation;
        error?: string;
      };
      if (!response.ok || !data.conversation) {
        throw new Error(data.error || "Não consegui gerar a conversa.");
      }
      setConfig((current) =>
        buildGeneratedConversationConfig(current, data.conversation!)
      );
      setPhotoModalOpen(false);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Falha ao gerar conversa."
      );
    } finally {
      setGeneratingConversation(false);
    }
  };

  const randomizeAvatarPhoto = () => {
    if (photoFiles.length === 0) return;
    setConfig((current) => {
      const currentAvatar = fileNameFromPhotoUrl(current.avatarDataUrl);
      return {
        ...current,
        avatarDataUrl: photoUrl(pickRandom(photoFiles, currentAvatar)),
      };
    });
  };

  const randomizeStoryPhoto = () => {
    if (photoFiles.length === 0) return;
    setConfig((current) => {
      const first = current.messages[0];
      if (!first) return current;
      const currentStory = fileNameFromPhotoUrl(first.storyReply?.imageDataUrl);
      const messages = current.messages.map((message, index) =>
        index === 0
          ? {
              ...message,
              storyReply: {
                ...(message.storyReply ?? { imageDataUrl: "" }),
                imageDataUrl: photoUrl(pickRandom(photoFiles, currentStory)),
              },
            }
          : message
      );
      return { ...current, messages };
    });
  };

  const randomizeBackgroundMusic = () => {
    if (musicFiles.length === 0) return;
    setConfig((current) => {
      const currentMusic =
        current.backgroundMusic && current.backgroundMusic !== "none"
          ? current.backgroundMusic
          : undefined;
      const pool =
        currentMusic && musicFiles.length > 1
          ? musicFiles.filter((file) => file !== currentMusic)
          : musicFiles;
      return {
        ...current,
        backgroundMusic:
          pool[Math.floor(Math.random() * pool.length)] ?? musicFiles[0],
      };
    });
  };

  const closeModal = () => setResultBlob(null);
  const regenerate = () => {
    setResultBlob(null);
    // Small delay so the modal closes before we start recording again
    setTimeout(() => {
      handleRecord();
    }, 100);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ig-muted">
            Editor de DM
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white lg:text-2xl">
            Gerador de Conversas Instagram
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openConversationPhotoModal}
            disabled={recording || generatingConversation}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generatingConversation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generatingConversation
              ? "Gerando conversa..."
              : "Gerar conversa aleatória"}
          </button>
          <div className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white sm:flex">
            <Video className="h-5 w-5" />
          </div>
        </div>
      </header>
      {generateError && (
        <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {generateError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 xl:gap-16">
        {/* Form */}
        <div>
          <Form config={config} onChange={setConfig} disabled={recording} />
        </div>

        {/* Preview + Actions */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:self-start">
          <Preview
            ref={previewRef}
            config={config}
            onRecordingChange={setRecording}
            onProgressChange={setProgress}
          />

          {/* Generate button */}
          <button
            type="button"
            onClick={handleRecord}
            disabled={recording}
            className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#FF5C7A] via-[#9156EC] to-[#4585FF] px-6 py-4 font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {recording ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Gravando... {Math.round(progress * 100)}%</span>
              </>
            ) : (
              <>
                <Wand2 className="h-5 w-5" />
                <span>Gerar vídeo</span>
              </>
            )}

            {recording && (
              <div
                className="absolute inset-x-0 bottom-0 h-1 bg-white/30"
                style={{ width: `${progress * 100}%` }}
              />
            )}
          </button>

          <div className="rounded-xl border border-ig-border bg-ig-card/50 p-4 text-xs leading-relaxed text-ig-muted">
            <p className="mb-1 font-semibold text-white">Sobre o vídeo</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>Resolução: {CANVAS_W}×{CANVAS_H} (vertical)</li>
              <li>
                Formato: <strong className="text-white">MP4</strong> (H.264) se
                suportado pelo navegador
              </li>
              <li>Duração: ~{estimateDuration(config).toFixed(1)}s</li>
              <li>Você visualiza o resultado antes de baixar</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Result preview modal */}
      <ResultModal
        blob={resultBlob}
        username={config.username}
        onClose={closeModal}
        onRegenerate={regenerate}
      />
      {photoModalOpen && (
        <ConversationPhotoModal
          avatarUrl={config.avatarDataUrl}
          storyUrl={config.messages[0]?.storyReply?.imageDataUrl ?? ""}
          musicFile={config.backgroundMusic ?? "none"}
          generating={generatingConversation}
          canRandomize={photoFiles.length > 0}
          canRandomizeMusic={musicFiles.length > 0}
          onRandomizeAvatar={randomizeAvatarPhoto}
          onRandomizeStory={randomizeStoryPhoto}
          onRandomizeMusic={randomizeBackgroundMusic}
          onClose={() => {
            if (!generatingConversation) setPhotoModalOpen(false);
          }}
          onGenerate={handleGenerateConversation}
        />
      )}
    </main>
  );
}

function estimateDuration(config: ConversationConfig): number {
  return totalDuration(buildTimings(config)) / 1000;
}

function ConversationPhotoModal({
  avatarUrl,
  storyUrl,
  musicFile,
  generating,
  canRandomize,
  canRandomizeMusic,
  onRandomizeAvatar,
  onRandomizeStory,
  onRandomizeMusic,
  onClose,
  onGenerate,
}: {
  avatarUrl: string | null;
  storyUrl: string;
  musicFile: string;
  generating: boolean;
  canRandomize: boolean;
  canRandomizeMusic: boolean;
  onRandomizeAvatar: () => void;
  onRandomizeStory: () => void;
  onRandomizeMusic: () => void;
  onClose: () => void;
  onGenerate: () => void;
}) {
  const [playingMusicUrl, setPlayingMusicUrl] = useState<string | null>(null);
  const musicUrl =
    musicFile && musicFile !== "none" ? musicFileToUrl(musicFile) : null;
  const isMusicPlaying = !!musicUrl && playingMusicUrl === musicUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 backdrop-blur-sm sm:px-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111113] shadow-2xl shadow-black/50">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 p-4 pb-3 sm:p-5 sm:pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Fotos da conversa
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ig-muted">
              A foto do story vai para o Gemini como contexto da cantada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="rounded-full px-2 py-1 text-sm text-ig-muted transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Fechar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PhotoPreviewCard
              title="Foto de perfil"
              imageUrl={avatarUrl ?? ""}
              imageClassName="h-24 w-24 rounded-full sm:h-28 sm:w-28"
              disabled={generating || !canRandomize}
              onRandomize={onRandomizeAvatar}
            />
            <PhotoPreviewCard
              title="Story respondido"
              imageUrl={storyUrl}
              imageClassName="h-32 w-20 rounded-xl sm:h-40 sm:w-24"
              disabled={generating || !canRandomize}
              onRandomize={onRandomizeStory}
            />
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Música</p>
                <p className="mt-0.5 max-w-[220px] truncate text-xs text-ig-muted sm:max-w-[260px]">
                  {musicFile && musicFile !== "none" ? musicFile : "Nenhuma música"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!musicUrl) return;
                    toggleModalPreviewAudio(musicUrl, setPlayingMusicUrl);
                  }}
                  disabled={generating || !musicUrl}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ig-muted transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  title={isMusicPlaying ? "Pausar música" : "Ouvir música"}
                >
                  {isMusicPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onRandomizeMusic}
                  disabled={generating || !canRandomizeMusic}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white transition hover:border-white/25 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Trocar
                </button>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-ig-muted">
              A música só altera o vídeo final. Ela não é enviada para o Gemini.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 p-4 pt-3 sm:flex-row sm:justify-end sm:p-5 sm:pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-ig-muted transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating ? "Gerando..." : "Gerar com essas fotos"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toggleModalPreviewAudio(
  url: string,
  setPlaying: (url: string | null) => void
) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __musicPreview?: HTMLAudioElement };
  let el = w.__musicPreview;
  if (!el) {
    el = new Audio();
    w.__musicPreview = el;
    el.addEventListener("ended", () => setPlaying(null));
  }
  if (el.src === new URL(url, window.location.href).href && !el.paused) {
    el.pause();
    setPlaying(null);
    return;
  }
  el.pause();
  el.src = url;
  el.currentTime = 0;
  void el
    .play()
    .then(() => setPlaying(url))
    .catch(() => setPlaying(null));
}

function PhotoPreviewCard({
  title,
  imageUrl,
  imageClassName,
  disabled,
  onRandomize,
}: {
  title: string;
  imageUrl: string;
  imageClassName: string;
  disabled: boolean;
  onRandomize: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">{title}</span>
        <button
          type="button"
          onClick={onRandomize}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-ig-muted transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          Trocar
        </button>
      </div>
      <div className="flex h-36 items-center justify-center rounded-lg bg-black/20 sm:h-44">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoPreviewUrl(imageUrl)}
            alt={title}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src = imageUrl;
            }}
            className={`${imageClassName} object-cover`}
          />
        ) : (
          <span className="text-xs text-ig-muted">Sem foto</span>
        )}
      </div>
    </div>
  );
}

function fillMissingRandomPhotos(
  config: ConversationConfig,
  files: string[]
): ConversationConfig {
  const firstMessage = config.messages[0];
  const firstStory = firstMessage?.storyReply;
  const needsAvatar = !config.avatarDataUrl;
  const needsStory = !!firstStory && !firstStory.imageDataUrl;
  if (!needsAvatar && !needsStory) return config;

  const avatarFile = needsAvatar ? pickRandom(files) : null;
  const storyFile = needsStory ? pickRandom(files, avatarFile ?? undefined) : null;
  const messages = needsStory
    ? config.messages.map((message, index) =>
        index === 0
          ? {
              ...message,
              storyReply: {
                ...(message.storyReply ?? { imageDataUrl: "" }),
                imageDataUrl: photoUrl(storyFile!),
              },
            }
          : message
      )
    : config.messages;

  return {
    ...config,
    avatarDataUrl: needsAvatar && avatarFile ? photoUrl(avatarFile) : config.avatarDataUrl,
    messages,
  };
}

function buildGeneratedConversationConfig(
  current: ConversationConfig,
  generated: GeneratedConversation
): ConversationConfig {
  const prefix = `g${Date.now()}`;
  const receivedBatch =
    generated.receivedBatch.length > 0
      ? generated.receivedBatch.slice(0, 3)
      : ["pera kkkkk", "isso foi muito especifico"];
  const lastReceivedIndex = receivedBatch.length - 1;

  const messages: Message[] = [
    {
      id: `${prefix}-m1`,
      side: "sent",
      text: generated.firstSent,
      storyReply: { imageDataUrl: generated.storyImageUrl ?? "" },
      focusZoomOnMessage: true,
      focusZoomScale: 1.3,
      focusZoomDelayMs: 500,
      focusZoomHoldMs: 1500,
      focusZoomOffsetX: 0,
      focusZoomOffsetY: 420,
      audio: {
        focusZoomSfx: "pop.mp3",
      },
      memeAfter: {
        file: "vini.mp4",
      },
    },
    ...receivedBatch.map<Message>((text, index) => ({
      id: `${prefix}-r${index + 1}`,
      side: "received",
      text,
      typingDurationMs: receivedTypingDurationMs(text),
      audio: {
        typingSfx: "none",
        appearSfx: "notification.mp3",
      },
      ...(index === lastReceivedIndex
        ? {
            callToActionAfter: {
              domain: "puxeassunto.com",
              suggestedResponse: generated.sentReply,
              responseAlternatives:
                normalizeResponseAlternativesForConfig(generated),
              siteTagline:
                "Insira o print da conversa e nós sugerimos a resposta perfeita.",
            },
          }
        : {}),
    })),
    {
      id: `${prefix}-me`,
      side: "sent",
      text: generated.sentReply,
      typingDurationMs: 3000,
      audio: {
        typingMode: "loop",
        typingLoopSfx: "default",
        sendSfx: "none",
      },
      memeOverlay: {
        file: "pi.mp4",
        durationMs: 3000,
        opacity: 0.45,
        x: 60,
        y: 1390,
        width: 1080,
        height: 690,
      },
    },
  ];

  if (generated.finalReceived?.trim()) {
    messages.push({
      id: `${prefix}-last`,
      side: "received",
      text: generated.finalReceived.trim(),
      typingDurationMs: receivedTypingDurationMs(generated.finalReceived),
      audio: {
        typingSfx: "none",
        appearSfx: "notification.mp3",
      },
    });
  }

  return {
    ...current,
    username: generated.username || current.username,
    avatarDataUrl: generated.avatarImageUrl ?? current.avatarDataUrl,
    profileDisplayName:
      generated.profileDisplayName || current.profileDisplayName,
    messages,
    editedMode: true,
  };
}

function receivedTypingDurationMs(text: string): number {
  return Math.max(1200, Math.min(2600, 950 + text.length * 32));
}

function normalizeResponseAlternativesForConfig(
  generated: GeneratedConversation
): string[] {
  const source = generated.responseAlternatives ?? [];
  return [
    source[0] || `Bora nessa: ${generated.sentReply}`,
    source[1] || `${generated.sentReply} kkk agora quero ver`,
    generated.sentReply,
    source[3] || `${generated.sentReply} mas sem fugir depois`,
  ];
}

function pickRandom(files: string[], avoid?: string): string {
  const pool =
    avoid && files.length > 1 ? files.filter((file) => file !== avoid) : files;
  return pool[Math.floor(Math.random() * pool.length)] ?? files[0];
}

function photoUrl(file: string): string {
  return `/fotos/${encodeURIComponent(file)}`;
}

function fileNameFromPhotoUrl(value: string | null | undefined): string | undefined {
  if (!value?.startsWith("/fotos/")) return undefined;
  try {
    const file = decodeURIComponent(value.slice("/fotos/".length));
    if (file.includes("/") || file.includes("\\") || file.includes("..")) {
      return undefined;
    }
    return file;
  } catch {
    return undefined;
  }
}

function photoPreviewUrl(value: string | null | undefined): string {
  const file = fileNameFromPhotoUrl(value);
  if (!file) return value ?? "";
  const base = file.replace(/\.[^.]+$/, "");
  return `/fotos/thumbs/${encodeURIComponent(base)}.webp`;
}
