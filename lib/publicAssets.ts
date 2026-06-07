export const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"] as const;
export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".webm"] as const;
export const MUSIC_EXTENSIONS = AUDIO_EXTENSIONS;
export const MEME_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"] as const;

const FOTOS_PREFIX = "/fotos/";
const FOTO_THUMBS_PREFIX = "/fotos/thumbs/";

export function pickRandomFile(files: string[], avoid?: string): string {
  const pool =
    avoid && files.length > 1 ? files.filter((file) => file !== avoid) : files;
  return pool[Math.floor(Math.random() * pool.length)] ?? files[0] ?? "";
}

export function photoUrl(file: string): string {
  return `${FOTOS_PREFIX}${encodeURIComponent(file)}`;
}

export function publicPhotoUrl(
  value: string | null | undefined
): string | undefined {
  const file = photoFileNameFromUrl(value);
  return file ? photoUrl(file) : undefined;
}

export function photoFileNameFromUrl(
  value: string | null | undefined
): string | undefined {
  if (!value?.startsWith(FOTOS_PREFIX)) return undefined;
  try {
    const file = decodeURIComponent(value.slice(FOTOS_PREFIX.length));
    if (file.includes("/") || file.includes("\\") || file.includes("..")) {
      return undefined;
    }
    return file;
  } catch {
    return undefined;
  }
}

export function photoPreviewUrl(value: string | null | undefined): string {
  const file = photoFileNameFromUrl(value);
  if (!file) return value ?? "";
  const base = file.replace(/\.[^.]+$/, "");
  return `${FOTO_THUMBS_PREFIX}${encodeURIComponent(base)}.webp`;
}
