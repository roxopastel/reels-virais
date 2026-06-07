import { promises as fs } from "fs";
import path from "path";
import { photoFileNameFromUrl } from "@/lib/publicAssets";

export interface InlineImagePart {
  inline_data: {
    mime_type: string;
    data: string;
  };
}

export async function listPublicAssetFiles(
  publicDir: string,
  allowedExtensions: readonly string[]
): Promise<string[]> {
  const dir = path.join("public", publicDir);
  const allowed = new Set(allowedExtensions);
  const entries = await fs.readdir(dir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => allowed.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

export function isMissingDirectoryError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function loadInlineImagePart(
  imageUrl: string | undefined
): Promise<InlineImagePart | null> {
  if (!imageUrl) return null;

  const dataUrl = parseDataUrl(imageUrl);
  if (dataUrl) {
    return {
      inline_data: {
        mime_type: dataUrl.mimeType,
        data: dataUrl.base64,
      },
    };
  }

  const publicFile = publicPhotoFileFromUrl(imageUrl);
  if (!publicFile) return null;

  try {
    const data = await fs.readFile(publicFile.path);
    return {
      inline_data: {
        mime_type: publicFile.mimeType,
        data: data.toString("base64"),
      },
    };
  } catch {
    return null;
  }
}

function parseDataUrl(
  value: string
): { mimeType: string; base64: string } | null {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), base64: match[2] };
}

function publicPhotoFileFromUrl(
  imageUrl: string
): { path: string; mimeType: string } | null {
  const file = photoFileNameFromUrl(imageUrl);
  if (!file) return null;

  const ext = path.extname(file).toLowerCase();
  const mimeType = imageMimeType(ext);
  if (!mimeType) return null;

  return {
    path: path.join("public", "fotos", file),
    mimeType,
  };
}

function imageMimeType(ext: string): string | null {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return null;
  }
}
