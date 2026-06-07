import type {
  ConversationConfig,
  Message,
  VideoPublishMetadata,
} from "@/lib/types";
import {
  photoFileNameFromUrl,
  photoUrl,
  pickRandomFile,
} from "@/lib/publicAssets";

export interface GeneratedConversation {
  username: string;
  profileDisplayName: string;
  firstSent: string;
  receivedBatch: string[];
  responseAlternatives?: string[];
  sentReply: string;
  finalReceived: string;
  videoMetadata?: VideoPublishMetadata;
  avatarImageUrl?: string;
  storyImageUrl?: string;
}

export function fillMissingRandomPhotos(
  config: ConversationConfig,
  files: string[]
): ConversationConfig {
  const firstMessage = config.messages[0];
  const firstStory = firstMessage?.storyReply;
  const needsAvatar = !config.avatarDataUrl;
  const needsStory = !!firstStory && !firstStory.imageDataUrl;
  if (!needsAvatar && !needsStory) return config;

  const avatarFile = needsAvatar ? pickRandomFile(files) : null;
  const storyFile = needsStory ? pickRandomFile(files, avatarFile ?? undefined) : null;
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
    avatarDataUrl:
      needsAvatar && avatarFile ? photoUrl(avatarFile) : config.avatarDataUrl,
    messages,
  };
}

export function buildGeneratedConversationConfig(
  current: ConversationConfig,
  generated: GeneratedConversation
): ConversationConfig {
  const prefix = `g${Date.now()}`;
  const receivedBatch =
    generated.receivedBatch.length > 0
      ? generated.receivedBatch.slice(0, 3)
      : ["pera kkkkk", "isso foi muito especifico"];
  const lastReceivedIndex = receivedBatch.length - 1;
  const finalReceivedText = generated.finalReceived?.trim();

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
            ...(!finalReceivedText
              ? {
                  memeAfter: {
                    file: "anota.mp4",
                    delayMs: 1200,
                    offsetY: 320,
                  },
                }
              : {}),
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
        durationMs: 5000,
        opacity: 0.45,
        x: 60,
        y: 1450,
        width: 1080,
        height: 690,
      },
    },
  ];

  if (finalReceivedText) {
    messages.push({
      id: `${prefix}-last`,
      side: "received",
      text: finalReceivedText,
      typingDurationMs: receivedTypingDurationMs(finalReceivedText),
      audio: {
        typingSfx: "none",
        appearSfx: "notification.mp3",
      },
      memeAfter: {
        file: "anota.mp4",
        delayMs: 1200,
        offsetY: 320,
      },
    });
  }

  return {
    ...current,
    username: generated.username || current.username,
    avatarDataUrl: generated.avatarImageUrl ?? current.avatarDataUrl,
    videoMetadata: generated.videoMetadata ?? current.videoMetadata,
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

export function randomDifferentPhotoUrl(
  files: string[],
  currentUrl: string | null | undefined
): string | null {
  if (files.length === 0) return null;
  const currentFile = photoFileNameFromUrl(currentUrl);
  const file = pickRandomFile(files, currentFile);
  return file ? photoUrl(file) : null;
}
