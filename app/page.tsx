"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Video, Wand2 } from "lucide-react";
import { ConversationPhotoModal } from "@/components/ConversationPhotoModal";
import { Form } from "@/components/Form";
import { Preview, type PreviewHandle } from "@/components/Preview";
import { ResultModal } from "@/components/ResultModal";
import { buildTimings, totalDuration } from "@/lib/animation";
import { DEFAULT_CONFIG } from "@/lib/defaultConfig";
import {
  buildGeneratedConversationConfig,
  fillMissingRandomPhotos,
  randomDifferentPhotoUrl,
  type GeneratedConversation,
} from "@/lib/generatedConversation";
import { pickRandomFile } from "@/lib/publicAssets";
import type { ConversationConfig } from "@/lib/types";

export default function HomePage() {
  const [config, setConfig] = useState<ConversationConfig>(DEFAULT_CONFIG);
  const [recording, setRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<
    "browser" | "source" | "server" | null
  >(null);
  const [generatingConversation, setGeneratingConversation] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<string[]>([]);
  const [musicFiles, setMusicFiles] = useState<string[]>([]);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultSourceBlob, setResultSourceBlob] = useState<Blob | null>(null);
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

  const handleRecordBrowser = async () => {
    if (recording) return;
    setRecording(true);
    setRecordingMode("browser");
    setProgress(0);
    try {
      const result = await previewRef.current?.record({
        outputAspect: "9:16",
        outputPreset: "social",
      });
      if (result?.blob) {
        setResultBlob(result.blob);
        setResultSourceBlob(null);
      }
    } catch (err) {
      console.error("Erro ao gravar no navegador:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Falha ao gerar o vídeo no navegador."
      );
    } finally {
      setRecording(false);
      setRecordingMode(null);
      setProgress(0);
    }
  };

  const handleGenerateSource = async () => {
    if (recording) return;
    setRecording(true);
    setRecordingMode("source");
    setProgress(0);
    try {
      const result = await previewRef.current?.record({
        outputAspect: "9:16",
        outputPreset: "source",
      });
      if (result?.blob) {
        setResultSourceBlob(result.blob);
      }
    } catch (err) {
      console.error("Erro ao gerar 1180x2556:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Falha ao gerar a versão 1180×2556."
      );
    } finally {
      setRecording(false);
      setRecordingMode(null);
      setProgress(0);
    }
  };

  const handleRecordServer = async () => {
    if (recording) return;
    setRecording(true);
    setRecordingMode("server");
    setProgress(0);
    try {
      const response = await fetch("/api/render-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config, outputAspect: "9:16" }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || "Falha ao gerar o vídeo.");
      }
      setResultBlob(await response.blob());
    } catch (err) {
      console.error("Erro ao gravar no servidor:", err);
      alert(err instanceof Error ? err.message : "Falha ao gerar o vídeo.");
    } finally {
      setRecording(false);
      setRecordingMode(null);
      setProgress(0);
    }
  };

  const openConversationPhotoModal = () => {
    if (recording || generatingConversation) return;
    setGenerateError(null);
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
    setConfig((current) => {
      const avatarUrl = randomDifferentPhotoUrl(photoFiles, current.avatarDataUrl);
      return avatarUrl ? { ...current, avatarDataUrl: avatarUrl } : current;
    });
  };

  const randomizeStoryPhoto = () => {
    setConfig((current) => {
      const first = current.messages[0];
      if (!first) return current;
      const storyUrl = randomDifferentPhotoUrl(
        photoFiles,
        first.storyReply?.imageDataUrl
      );
      if (!storyUrl) return current;

      const messages = current.messages.map((message, index) =>
        index === 0
          ? {
              ...message,
              storyReply: {
                ...(message.storyReply ?? { imageDataUrl: "" }),
                imageDataUrl: storyUrl,
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
        backgroundMusic: pickRandomFile(pool) || musicFiles[0],
      };
    });
  };

  const closeModal = () => {
    setResultBlob(null);
    setResultSourceBlob(null);
  };

  const regenerate = () => {
    setResultBlob(null);
    setResultSourceBlob(null);
    setTimeout(() => {
      handleRecordBrowser();
    }, 100);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
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
        <div>
          <Form config={config} onChange={setConfig} disabled={recording} />
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:self-start">
          <Preview
            ref={previewRef}
            config={config}
            onRecordingChange={setRecording}
            onProgressChange={setProgress}
          />

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={handleRecordBrowser}
              disabled={recording}
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-ig-card px-4 py-4 font-semibold text-white transition hover:border-white/25 hover:bg-ig-border disabled:cursor-not-allowed disabled:opacity-70"
            >
              {recordingMode === "browser" ? (
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

              {recordingMode === "browser" && progress > 0 && (
                <div
                  className="absolute inset-x-0 bottom-0 h-1 bg-white/30"
                  style={{ width: `${progress * 100}%` }}
                />
              )}
            </button>

            {/*
            <button
              type="button"
              onClick={handleRecordServer}
              disabled={recording}
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#FF5C7A] via-[#9156EC] to-[#4585FF] px-4 py-4 font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {recordingMode === "server" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Gerando no servidor...</span>
                </>
              ) : (
                <>
                  <Video className="h-5 w-5" />
                  <span>Gerar MP4 no servidor</span>
                </>
              )}
            </button>
            */}
          </div>

          <div className="rounded-xl border border-ig-border bg-ig-card/50 p-4 text-xs leading-relaxed text-ig-muted">
            <p className="mb-1 font-semibold text-white">Sobre o vídeo</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>Saída padrão: 1080×1920</li>
              <li>No modal há opção sob demanda para gerar 1180×2556</li>
              <li>Formato: MP4 quando suportado; caso contrário, WebM</li>
              <li>Duração: ~{estimateDuration(config).toFixed(1)}s</li>
              <li>Você visualiza o resultado antes de baixar</li>
            </ul>
          </div>
        </div>
      </div>

      <ResultModal
        blob={resultBlob}
        sourceBlob={resultSourceBlob}
        username={config.username}
        videoMetadata={config.videoMetadata}
        outputAspect="9:16"
        outputPreset="social"
        sourceGenerating={recordingMode === "source"}
        onClose={closeModal}
        onGenerateSource={handleGenerateSource}
        onRegenerate={regenerate}
      />
      {photoModalOpen && (
        <ConversationPhotoModal
          avatarUrl={config.avatarDataUrl}
          storyUrl={config.messages[0]?.storyReply?.imageDataUrl ?? ""}
          musicFile={config.backgroundMusic ?? "none"}
          generating={generatingConversation}
          error={generateError}
          canRandomize={photoFiles.length > 0}
          canRandomizeMusic={musicFiles.length > 0}
          onRandomizeAvatar={randomizeAvatarPhoto}
          onRandomizeStory={randomizeStoryPhoto}
          onRandomizeMusic={randomizeBackgroundMusic}
          onClose={() => {
            if (!generatingConversation) {
              setGenerateError(null);
              setPhotoModalOpen(false);
            }
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
