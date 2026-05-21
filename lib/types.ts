export type Theme = "dark" | "light";

export type MessageSide = "sent" | "received";

/** Optional "story reply" attachment shown above the message bubble:
 *  a small grey label and a vertical thumbnail of the story being replied to. */
export interface StoryReply {
  /** Data URL of the story image being replied to. */
  imageDataUrl: string;
  /** Custom label above the thumbnail. When omitted, falls back to
   *  "Você respondeu ao story" (sent) / "{username} respondeu ao seu story"
   *  (received). */
  label?: string;
}

/** Selection for a SFX slot. Three forms:
 *   - "default"     → use the slot's built-in default file (see DEFAULT_SFX
 *                     in `lib/audio.ts`),
 *   - "none"        → play nothing for that slot (silent),
 *   - any other     → an exact filename inside `/public/audio/`
 *                     (e.g. "meu-som.mp3"). Files are listed dynamically by
 *                     the `/api/audio` route. */
export type SfxChoice = string;

/** How the keyboard typing phase of a sent message should sound. */
export type TypingSoundMode = "default" | "perKey" | "loop" | "none";

/** Per-message overrides for the "edited video" mode sound effects. Every
 *  field is optional — when absent the renderer falls back to the built-in
 *  default (notification + whoosh+pop for received; keypress-per-char + send
 *  for sent-with-keyboard). */
export interface MessageAudio {
  // ----- received side -----
  /** Sound played at the moment the "..." typing indicator appears.
   *  Default: "notification". */
  typingSfx?: SfxChoice;
  /** Sound played at the moment the bubble pops in.
   *  Default ("default"): whoosh just before + pop at impact. */
  appearSfx?: SfxChoice;
  // ----- sent side (only when the message uses the keyboard, i.e. not the
  //       first message of the conversation) -----
  /** How the typing phase sounds. */
  typingMode?: TypingSoundMode;
  /** Looping sound used while `typingMode === "loop"`. Default: "typing-loop". */
  typingLoopSfx?: SfxChoice;
  /** Sound at the moment the send button is tapped. Default: "send". */
  sendSfx?: SfxChoice;
  /** Optional sound fired at the exact moment this message's focus zoom starts. */
  focusZoomSfx?: SfxChoice;
}

export interface Message {
  id: string;
  side: MessageSide;
  text: string;
  storyReply?: StoryReply;
  /** Camera-style zoom centered on this message as it appears in edited mode. */
  focusZoomOnMessage?: boolean;
  /** Scale used by `focusZoomOnMessage`. Values around 1.35-1.9 work well. */
  focusZoomScale?: number;
  /** Delay after this message appears before the camera zoom starts. */
  focusZoomDelayMs?: number;
  /** Time held at full zoom before zooming back out. */
  focusZoomHoldMs?: number;
  /** Screen-space offset for the focused message while zoomed. */
  focusZoomOffsetX?: number;
  /** Screen-space offset for the focused message while zoomed. */
  focusZoomOffsetY?: number;
  /** Optional meme video shown full-screen after this message in
   *  edited mode. `file` is the filename inside `/public/memes/`. */
  memeAfter?: {
    file: string;
  };
  /** Optional meme video drawn over the frozen conversation after this
   *  message. Coordinates are canvas pixels (1080x1920). */
  memeOverlay?: {
    file: string;
    /** 0 or absent = use the video duration. */
    durationMs?: number;
    /** 0..1 opacity. Default: 0.45. */
    opacity?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  /** Optional "Call to action" scene that plays after this message:
   *  print of the screen → Safari → search "puxeassunto.com" → site
   *  receives the print → suggests a response → back to the Direct.
   *  The text shown as the "suggested response" inside the fake site
   *  defaults to the next message's text. */
  callToActionAfter?: {
    /** Domain typed inside Safari's URL bar. Default: "puxeassunto.com". */
    domain?: string;
    /** Text shown as the "suggested response" on the fake site. When
     *  empty, the next message's text is used. */
    suggestedResponse?: string;
    /** Optional custom texts for the four response alternatives shown at
     *  the end of the CTA. Empty entries fall back to generated defaults. */
    responseAlternatives?: string[];
    /** Tagline / subtitle shown under the brand on the fake site. */
    siteTagline?: string;
  };
  /** Optional per-message overrides for the "edited video" mode SFX. */
  audio?: MessageAudio;
  /** Optional per-message override for typing duration (in ms). For received
   *  messages, controls the typing indicator. For sent messages with keyboard
   *  simulation, controls the total time spent typing the text. */
  typingDurationMs?: number;
}

export interface ConversationConfig {
  username: string;
  subtitle: string;
  avatarDataUrl: string | null;
  /** Full conversation. The LAST message animates with typing indicator (if received) or slide-in (if sent). */
  messages: Message[];
  typingDurationMs: number;
  showHeader: boolean;
  /** Black border height (top and bottom) when the phone/status + Instagram
   *  header is hidden. Keeps the chat centered instead of expanding. */
  hiddenTopChromeBorderPx?: number;
  theme: Theme;
  statusBarTime: string;
  /** Optional badges */
  hasStory?: boolean;
  verified?: boolean;
  online?: boolean;
  /** Profile-card section that sits between the header and the first message
   *  (avatar, display name, follower stats, follow info, "Ver perfil" button). */
  showProfileCard?: boolean;
  /** Real display name shown in big bold text inside the profile card.
   *  Falls back to `username` when empty. */
  profileDisplayName?: string;
  /** Whether to show the small @username line in the profile card. */
  profileShowUsername?: boolean;
  profileFollowers?: string; // e.g. "818"
  profilePosts?: string; // e.g. "3"
  /** Multi-line follow info (one entry per line). */
  profileFollowInfo?: string[];
  profileButtonLabel?: string; // defaults to "Ver perfil"
  /** Optional timestamp shown centered above the first message — only renders
   *  when the first message carries a `storyReply`. Example: "4:56 PM". */
  chatTimestamp?: string;
  /** "Edited video" mode — adds sound effects (keypress, send, notification,
   *  whoosh, pop) baked into the recorded video, plus optional per-message
   *  camera zooms. */
  editedMode?: boolean;
  /** Optional background music filename inside `/public/musics/`. When set,
   *  the track loops/cuts to cover the whole exported video. */
  backgroundMusic?: SfxChoice;
  /** Background music volume, 0..1. Defaults to 0.22. */
  backgroundMusicGain?: number;
  /** Fine-tuning controls used for visual alignment against reference prints. */
  inputCameraSize?: number;
  inputIconsHeight?: number;
  inputBarHeight?: number;
  inputBarLiftPx?: number;
  inputSidePaddingPx?: number;
  inputBorderRadiusPx?: number;
  inputTextFontSize?: number;
  inputSendIconHeight?: number;
  inputIconsRightInset?: number;
  messageBubblePaddingX?: number;
  messageBubblePaddingY?: number;
  messageFontSize?: number;
  messageLineHeightMultiplier?: number;
  messageBubbleRadius?: number;
  messageBubbleGroupedRadius?: number;
  messageMaxWidthPercent?: number;
  chatSidePaddingPx?: number;
  receivedAvatarRadius?: number;
  receivedBubbleGapPx?: number;
  messagesBottomGapPx?: number;
  storyImageWidth?: number;
  storyImageHeight?: number;
  storyImageRadius?: number;
  storyImageSideInset?: number;
  storyLabelFontSize?: number;
  storyLabelImageGap?: number;
  storyImageBubbleGap?: number;
  chatTimestampFontSize?: number;
  chatTimestampGapPx?: number;
  statusTimeX?: number;
  statusTimeY?: number;
  statusTimeFontSize?: number;
  statusIconsHeight?: number;
  statusIconsRightMargin?: number;
  headerHeightPx?: number;
  headerContentOffsetY?: number;
  headerAvatarX?: number;
  headerAvatarRadius?: number;
  headerUsernameFontSize?: number;
  headerSubtitleFontSize?: number;
  headerIconsHeight?: number;
  headerIconsRightMargin?: number;
  profileCardOffsetY?: number;
  profileCardTopPaddingPx?: number;
  profileCardAvatarRadius?: number;
  profileCardDisplayNameGapPx?: number;
  profileCardDisplayNameFontSize?: number;
  profileCardUsernameGapPx?: number;
  profileCardUsernameFontSize?: number;
  profileCardStatsGapPx?: number;
  profileCardStatsFontSize?: number;
  profileCardInfoLineHeightPx?: number;
  profileCardInfoFontSize?: number;
  profileCardButtonGapPx?: number;
  profileCardButtonHeightPx?: number;
  profileCardButtonRadiusPx?: number;
  profileCardButtonPaddingX?: number;
  profileCardButtonFontSize?: number;
  profileCardMessageGapPx?: number;
}

/**
 * Per-message animation event. Each message i goes through up to three stages:
 * 1. The layout slot for message i becomes active at `slotActiveAtMs`. This is
 *    when older messages start shifting upward to make room.
 *    - For received messages this coincides with `typingStartMs`.
 *    - For sent messages this coincides with `appearStartMs`.
 * 2. (received only) Typing indicator fades in at `typingStartMs` and remains
 *    visible until `appearStartMs`, where it crossfades into the bubble.
 * 3. The bubble slides in from below between `appearStartMs` and `appearEndMs`.
 */
/**
 * Per-message keyboard simulation. Present only on sent messages that are
 * NOT the first message of the conversation.
 *
 * - `openStartMs` / `openEndMs` are >= 0 only when this message is the first
 *   in a contiguous chain of "keyboard messages" — within a chain, the
 *   keyboard stays open between messages and these fields are -1 for all but
 *   the first message of the chain.
 * - `closeStartMs` / `closeEndMs` are >= 0 only when this message is the
 *   LAST in its chain, where the keyboard finally slides back down.
 */
export interface KeyboardSchedule {
  mode?: "type" | "paste";
  openStartMs: number;
  openEndMs: number;
  typeStartMs: number;
  typeEndMs: number;
  pasteMenuStartMs?: number;
  pasteMenuEndMs?: number;
  pasteCommitMs?: number;
  sendTapMs: number;
  closeStartMs: number;
  closeEndMs: number;
}

/**
 * Sub-phase timings for the "Chamada de ação" scene that plays between
 * the marked message and the next. All times are absolute (ms from t=0).
 *
 * Phases run in order:
 *  1. flash          — full-white shutter overlay
 *  2. shrinkToThumb  — chat content scales down + flies to bottom-left
 *  3. holdThumb      — thumbnail rests in the corner
 *  4. safariOpen     — Safari chrome slides in from below
 *  5. urlBarType     — types the domain in the URL bar
 *  6. safariNav      — page navigates to the fake puxeassunto.com
 *  7. siteIdle       — site shows empty drop area
 *  8. printDrag      — thumbnail moves from corner into the drop area
 *  9. analyzeClick   — "Analisar" button is tapped (highlight + spinner)
 * 10. analyzeLoad    — loading spinner + "Analisando conversa…"
 * 11. responseReveal — suggested-response card slides in
 * 12. responseHold   — card stays visible for the user to read
 * 13. copyTap        — "Copiar resposta" button is tapped
 * 14. safariClose    — Safari chrome slides back down, returns to Direct
 */
export interface CallToActionSchedule {
  /** Trigger time inside the chat scene the print captures. The chat
   *  freezes at this moment for the duration of the CTA. */
  triggerMs: number;
  flashStartMs: number;
  flashEndMs: number;
  shrinkStartMs: number;
  shrinkEndMs: number;
  holdThumbStartMs: number;
  holdThumbEndMs: number;
  safariOpenStartMs: number;
  safariOpenEndMs: number;
  urlTypeStartMs: number;
  urlTypeEndMs: number;
  safariNavStartMs: number;
  safariNavEndMs: number;
  siteIdleStartMs: number;
  siteIdleEndMs: number;
  printDragStartMs: number;
  printDragEndMs: number;
  analyzeClickStartMs: number;
  analyzeClickEndMs: number;
  analyzeLoadStartMs: number;
  analyzeLoadEndMs: number;
  responseRevealStartMs: number;
  responseRevealEndMs: number;
  responseHoldStartMs: number;
  responseHoldEndMs: number;
  copyTapStartMs: number;
  copyTapEndMs: number;
  safariCloseStartMs: number;
  safariCloseEndMs: number;
}

export interface MessageScheduleEvent {
  index: number;
  slotActiveAtMs: number;
  /** -1 when there is no typing indicator (sent messages). */
  typingStartMs: number;
  /** -1 when there is no typing indicator. */
  typingFullMs: number;
  appearStartMs: number;
  appearEndMs: number;
  /** Full-screen meme segment shown after this message, edited mode only. */
  memeStartMs?: number;
  memeEndMs?: number;
  /** Overlay meme segment shown on top of the frozen chat, edited mode only. */
  memeOverlayStartMs?: number;
  memeOverlayEndMs?: number;
  /** "Chamada de ação" scene shown after this message, edited mode only. */
  callToAction?: CallToActionSchedule;
  /** Optional keyboard simulation for non-first sent messages. */
  keyboard?: KeyboardSchedule;
}

export interface AnimationSchedule {
  events: MessageScheduleEvent[];
  totalDuration: number;
}

/** Per-message rendering state at a given time. */
export type MessageVisualState =
  | "hidden"
  | "typing"
  | "crossfade"
  | "appearing"
  | "visible";

export interface MessageFrameState {
  index: number;
  state: MessageVisualState;
  /** 0→1 for typing indicator alpha. */
  typingAlpha: number;
  /** 0→1 slide-in progress for the bubble. */
  appearProgress: number;
}

/** Frame state for the keyboard, when one is currently being shown. */
export interface KeyboardFrameState {
  /** 0 = fully closed (off-screen), 1 = fully open (visible at bottom). */
  openProgress: number;
  /** Index of the message currently being typed, or -1 between messages. */
  activeMessageIndex: number;
  /** Number of characters of `messages[activeMessageIndex].text` typed so far. */
  typedChars: number;
  /** Lowercase character of the just-pressed key, or null. */
  highlightedKey: string | null;
  /** 0→1 pulse intensity for the send button at send time. */
  sendPulse: number;
  /** Keyboard input mode for the active message. */
  mode?: "type" | "paste";
  /** 0-1 visibility/press state for the "Colar" paste bubble. */
  pasteMenuProgress?: number;
  /** 0-1 zoom pulse right after the copied text is pasted. */
  pasteCommitPulse?: number;
}

export interface FrameState {
  /** Highest 1-indexed count of messages with an active layout slot. */
  activeCount: number;
  /** 0→1 layout-shift progress when a new slot just activated. */
  shiftProgress: number;
  perMessage: MessageFrameState[];
  /** Keyboard state if a keyboard is currently visible (or animating in/out). */
  keyboard: KeyboardFrameState | null;
}
