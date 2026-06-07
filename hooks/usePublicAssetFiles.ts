"use client";

import { useEffect, useState } from "react";

export type PublicAssetEndpoint = "audio" | "fotos" | "memes" | "musics";

export function usePublicAssetFiles(endpoint: PublicAssetEndpoint): {
  files: string[];
  reload: () => void;
} {
  const [files, setFiles] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/${endpoint}`)
      .then((response) => response.json())
      .then((data: { files?: string[] }) => {
        if (!cancelled && Array.isArray(data.files)) {
          setFiles(data.files);
        }
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint, reloadKey]);

  return { files, reload: () => setReloadKey((key) => key + 1) };
}
