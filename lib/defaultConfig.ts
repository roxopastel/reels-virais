import type { ConversationConfig } from "@/lib/types";

export const DEFAULT_CONFIG: ConversationConfig = {
  username: "luluzinha",
  subtitle: "Ativo(a) agora",
  avatarDataUrl: null,
  videoMetadata: {
    title: "A resposta ao story que virou conversa no direct",
    description:
      "Ele respondeu o story dela com uma cantada leve e a conversa tomou outro rumo. Um video curto com cara de print que da vontade de mandar para os amigos.",
    hashtags: ["conversa", "direct", "instagram", "cantada", "flertando", "viral"],
    keywords: [
      "conversa no direct",
      "instagram dm",
      "cantada leve",
      "puxe assunto",
      "video viral",
    ],
  },
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
      memeAfter: {
        file: "anota.mp4",
        delayMs: 1200,
        offsetY: 320,
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
        durationMs: 5000,
        opacity: 0.45,
        x: 60,
        y: 1450,
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
  profileFollowInfo: ["Vocês se seguem mutuamente no Instagram"],
  profileButtonLabel: "Ver perfil",
  chatTimestamp: "Hoje, 20:52",
  editedMode: true,
  backgroundMusic: "colocada.mp3",
  backgroundMusicGain: 0.3,
};
