"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Pause, Play, Sparkles } from "lucide-react";
import { musicFileToUrl } from "@/lib/audio";
import { photoPreviewUrl } from "@/lib/publicAssets";

interface ConversationPhotoModalProps {
  avatarUrl: string | null;
  storyUrl: string;
  musicFile: string;
  generating: boolean;
  error: string | null;
  canRandomize: boolean;
  canRandomizeMusic: boolean;
  onRandomizeAvatar: () => void;
  onRandomizeStory: () => void;
  onRandomizeMusic: () => void;
  onClose: () => void;
  onGenerate: () => void;
}

export function ConversationPhotoModal({
  avatarUrl,
  storyUrl,
  musicFile,
  generating,
  error,
  canRandomize,
  canRandomizeMusic,
  onRandomizeAvatar,
  onRandomizeStory,
  onRandomizeMusic,
  onClose,
  onGenerate,
}: ConversationPhotoModalProps) {
  const [playingMusicUrl, setPlayingMusicUrl] = useState<string | null>(null);
  const musicUrl =
    musicFile && musicFile !== "none" ? musicFileToUrl(musicFile) : null;
  const isMusicPlaying = !!musicUrl && playingMusicUrl === musicUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 backdrop-blur-sm sm:px-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111113] shadow-2xl shadow-black/50">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 p-4 pb-3 sm:p-5 sm:pb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">
              Fotos da conversa
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ig-muted">
              A foto do story vai para o Gemini como contexto da cantada.
            </p>
            {error && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm leading-relaxed text-red-100"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-200" />
                <span className="min-w-0 break-words">{error}</span>
              </div>
            )}
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
                  {musicFile && musicFile !== "none"
                    ? musicFile
                    : "Nenhuma música"}
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
