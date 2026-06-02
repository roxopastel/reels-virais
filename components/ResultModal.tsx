"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Loader2, RotateCcw, X } from "lucide-react";
import {
  downloadBlob,
  getRecordingDimensions,
  suggestFilename,
  type OutputAspect,
  type OutputPreset,
} from "@/lib/recorder";
import type { VideoPublishMetadata } from "@/lib/types";
import { formatPublishDescription } from "@/lib/videoMetadata";

interface ResultModalProps {
  blob: Blob | null;
  sourceBlob: Blob | null;
  username: string;
  videoMetadata?: VideoPublishMetadata;
  outputAspect: OutputAspect;
  outputPreset: OutputPreset;
  sourceGenerating: boolean;
  onClose: () => void;
  onGenerateSource: () => void;
  onRegenerate: () => void;
}

export function ResultModal({
  blob,
  sourceBlob,
  username,
  videoMetadata,
  outputAspect,
  outputPreset,
  sourceGenerating,
  onClose,
  onGenerateSource,
  onRegenerate,
}: ResultModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [copiedField, setCopiedField] = useState<
    "title" | "description" | null
  >(null);

  const videoUrl = useMemo(() => {
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }, [blob]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!blob) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blob, onClose]);

  const publishDescription = useMemo(
    () => formatPublishDescription(videoMetadata),
    [videoMetadata]
  );

  const copyToClipboard = async (
    field: "title" | "description",
    text: string
  ) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 1200);
  };

  if (!blob || !videoUrl) return null;

  const handleDownload = () => {
    downloadBlob(
      blob,
      suggestFilename(
        username,
        blob.type,
        outputAspect,
        outputPreset,
        videoMetadata
      )
    );
  };

  const handleSourceDownload = () => {
    if (!sourceBlob) return;
    downloadBlob(
      sourceBlob,
      suggestFilename(username, sourceBlob.type, "9:16", "source", videoMetadata)
    );
  };

  const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
  const isMp4 = blob.type.includes("mp4");
  const dimensions = getRecordingDimensions(outputAspect, undefined, outputPreset);
  const sourceDimensions = getRecordingDimensions("9:16", undefined, "source");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-sm sm:px-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ig-border bg-[#0A0A0A] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ig-border p-4 pb-3 sm:p-6 sm:pb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white sm:text-xl">
              Vídeo gerado
            </h2>
            <p className="truncate text-xs text-ig-muted">
              {isMp4 ? "MP4 (H.264)" : "WebM (VP9)"} · {sizeMB} MB ·{" "}
              {dimensions.width}×{dimensions.height} · {outputAspect}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-ig-muted transition hover:bg-ig-card hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div
            className="mx-auto flex w-full min-w-[180px] max-w-[min(340px,calc((100dvh-15rem)*0.5625))] items-center justify-center sm:max-w-[340px]"
          >
            <div
              className="relative w-full overflow-hidden rounded-3xl border border-ig-border bg-black shadow-xl"
              style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                autoPlay
                loop
                playsInline
                className="block h-full w-full bg-black"
              />
            </div>
          </div>

          {videoMetadata && (
            <div className="mt-4 space-y-3 border-t border-ig-border pt-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ig-muted">
                    Titulo do arquivo
                  </p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("title", videoMetadata.title)}
                    className="rounded-lg p-2 text-ig-muted transition hover:bg-ig-card hover:text-white"
                    aria-label="Copiar titulo"
                    title="Copiar titulo"
                  >
                    {copiedField === "title" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-sm font-semibold leading-snug text-white">
                  {videoMetadata.title}
                </p>
              </div>

              {publishDescription && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ig-muted">
                      Descricao pronta
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard("description", publishDescription)
                      }
                      className="rounded-lg p-2 text-ig-muted transition hover:bg-ig-card hover:text-white"
                      aria-label="Copiar descricao"
                      title="Copiar descricao"
                    >
                      {copiedField === "description" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-ig-muted">
                    {publishDescription}
                  </p>
                </div>
              )}
            </div>
          )}

          {!isMp4 && (
            <p className="mt-4 rounded-lg border border-ig-border bg-ig-card/50 p-3 text-xs leading-relaxed text-ig-muted">
              Seu navegador não suporta gravação direta em MP4. O arquivo foi
              salvo como <strong className="text-white">WebM</strong>. Use
              Chrome ou Edge mais recentes para gerar MP4 nativamente. Você
              pode converter WebM → MP4 em ferramentas como{" "}
              <a
                href="https://cloudconvert.com/webm-to-mp4"
                target="_blank"
                rel="noopener"
                className="text-white underline"
              >
                CloudConvert
              </a>
              .
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-ig-border p-4 pt-3 sm:flex-row sm:gap-3 sm:p-6 sm:pt-4">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF5C7A] via-[#9156EC] to-[#4585FF] px-5 py-3 font-semibold text-white shadow-lg shadow-purple-900/30 transition hover:brightness-110"
          >
            <Download className="h-5 w-5" />
            <span>
              Baixar {dimensions.width}×{dimensions.height}
            </span>
          </button>
          <button
            type="button"
            onClick={sourceBlob ? handleSourceDownload : onGenerateSource}
            disabled={sourceGenerating}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-ig-border bg-ig-card px-5 py-3 font-semibold text-white transition hover:bg-ig-border disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sourceGenerating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}
            <span>
              {sourceGenerating
                ? `Gerando ${sourceDimensions.width}×${sourceDimensions.height}...`
                : sourceBlob
                  ? `Baixar ${sourceDimensions.width}×${sourceDimensions.height}`
                  : `Gerar ${sourceDimensions.width}×${sourceDimensions.height}`}
            </span>
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-ig-border bg-ig-card px-5 py-3 font-semibold text-white transition hover:bg-ig-border sm:flex-none"
          >
            <RotateCcw className="h-5 w-5" />
            <span>Gerar de novo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
