"use client";

import { useEffect, useMemo, useRef } from "react";
import { Download, X, RotateCcw } from "lucide-react";
import { downloadBlob, suggestFilename } from "@/lib/recorder";
import { CANVAS_H, CANVAS_W } from "@/lib/renderer";

interface ResultModalProps {
  blob: Blob | null;
  username: string;
  onClose: () => void;
  onRegenerate: () => void;
}

export function ResultModal({
  blob,
  username,
  onClose,
  onRegenerate,
}: ResultModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Create object URL for the blob
  const videoUrl = useMemo(() => {
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }, [blob]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Close on Escape
  useEffect(() => {
    if (!blob) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blob, onClose]);

  if (!blob || !videoUrl) return null;

  const handleDownload = () => {
    downloadBlob(blob, suggestFilename(username, blob.type));
  };

  const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
  const isMp4 = blob.type.includes("mp4");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-2xl border border-ig-border bg-[#0A0A0A] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Vídeo gerado</h2>
            <p className="text-xs text-ig-muted">
              {isMp4 ? "MP4 (H.264)" : "WebM (VP9)"} · {sizeMB} MB ·{" "}
              {CANVAS_W}×{CANVAS_H}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ig-muted transition hover:bg-ig-card hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Video preview */}
        <div className="mx-auto flex w-full max-w-[300px] items-center justify-center">
          <div
            className="relative w-full overflow-hidden rounded-3xl border border-ig-border bg-black shadow-xl"
            style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
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

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF5C7A] via-[#9156EC] to-[#4585FF] px-5 py-3 font-semibold text-white shadow-lg shadow-purple-900/30 transition hover:brightness-110"
          >
            <Download className="h-5 w-5" />
            <span>Baixar {isMp4 ? "MP4" : "WebM"}</span>
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-ig-border bg-ig-card px-5 py-3 font-semibold text-white transition hover:bg-ig-border"
          >
            <RotateCcw className="h-5 w-5" />
            <span>Gerar de novo</span>
          </button>
        </div>

        {!isMp4 && (
          <p className="rounded-lg border border-ig-border bg-ig-card/50 p-3 text-xs leading-relaxed text-ig-muted">
            Seu navegador não suporta gravação direta em MP4. O arquivo foi
            salvo como <strong className="text-white">WebM</strong>. Use Chrome
            ou Edge mais recentes para gerar MP4 nativamente. Você pode
            converter WebM → MP4 em ferramentas como{" "}
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
    </div>
  );
}
