import type { VideoPublishMetadata } from "./types";

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export function filenameBaseFromTitle(title: string | undefined): string {
  if (!title) return "";
  return title
    .replace(INVALID_FILENAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 90);
}

export function cleanHashtag(tag: string): string {
  return tag
    .replace(/^#+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

export function formatPublishDescription(
  metadata: VideoPublishMetadata | null | undefined
): string {
  if (!metadata) return "";

  const description = metadata.description?.trim() ?? "";
  const hashtags = (metadata.hashtags ?? [])
    .map(cleanHashtag)
    .filter(Boolean)
    .slice(0, 8);
  const hashtagLine = hashtags.map((tag) => `#${tag}`).join(" ");

  if (!description) return hashtagLine;
  if (!hashtagLine) return description;

  const lowerDescription = description.toLowerCase();
  const alreadyHasTags = hashtags.some((tag) =>
    lowerDescription.includes(`#${tag.toLowerCase()}`)
  );
  return alreadyHasTags ? description : `${description}\n\n${hashtagLine}`;
}

export function formatVideoKeywords(
  metadata: VideoPublishMetadata | null | undefined
): string {
  if (!metadata) return "";

  const keywords = (metadata.keywords ?? [])
    .map((keyword) => keyword.trim().replace(/\s+/g, " ").slice(0, 48))
    .filter(Boolean);
  const hashtags = (metadata.hashtags ?? []).map(cleanHashtag).filter(Boolean);

  return Array.from(new Set([...keywords, ...hashtags])).slice(0, 14).join(", ");
}
