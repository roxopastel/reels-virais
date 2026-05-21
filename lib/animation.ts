import type {
  AnimationSchedule,
  CallToActionSchedule,
  ConversationConfig,
  FrameState,
  KeyboardFrameState,
  MessageFrameState,
  MessageScheduleEvent,
} from "./types";

// ============================================================
// Timing constants
// ============================================================

const INTRO_MS = 0;
/** Duration of each bubble's slide-in animation. */
const APPEAR_MS = 450;
/** Layout-shift duration when a new slot becomes part of the layout. */
const SHIFT_MS = 280;
/** How long the typing indicator takes to fade in. */
const TYPING_FADE_IN_MS = 250;
/** Final pause after the last message before the video loops/ends. */
const END_MS = 1500;
/** Pause before a sent message that follows a received one (reading time). */
const REPLY_THINKING_MS = 400;
/** Pause before a message of the same side as the previous one. */
const SAME_SIDE_PAUSE_MS = 220;
/** Full-screen meme segment after a message in edited mode. */
const MEME_AFTER_DELAY_MS = 180;
const MEME_AFTER_DURATION_MS = 3000;
const FOCUS_ZOOM_DEFAULT_HOLD_MS = 520;
const FOCUS_ZOOM_DEFAULT_DELAY_MS = 0;

// ----- Call to action ("Chamada de ação") sub-phase durations (ms) -----
/** Pause after the marked message is fully visible before the shutter fires. */
const CTA_PRE_DELAY_MS = 1050;
/** Bright-white shutter flash. */
const CTA_FLASH_MS = 180;
/** Chat content scales down and flies to bottom-left corner. */
const CTA_SHRINK_MS = 520;
/** Thumbnail rests in the corner before Safari opens. */
const CTA_HOLD_THUMB_MS = 360;
/** Safari chrome slides up. */
const CTA_SAFARI_OPEN_MS = 480;
/** Per-character typing time inside the URL bar. */
const CTA_URL_CHAR_MS = 95;
/** Minimum / maximum total typing duration regardless of URL length. */
const CTA_URL_TYPE_MIN_MS = 900;
const CTA_URL_TYPE_MAX_MS = 2600;
/** Safari "loading the page" transition. */
const CTA_SAFARI_NAV_MS = 1800;
/** Idle moment after the site loads before the print drops. */
const CTA_SITE_IDLE_MS = 260;
/** Thumbnail flies from the corner into the upload zone. */
const CTA_PRINT_DRAG_MS = 420;
/** "Analisar" button tap animation. */
const CTA_ANALYZE_CLICK_MS = 320;
/** Spinner + "Analisando conversa…" hold. */
const CTA_ANALYZE_LOAD_MS = 850;
/** Response card slide-in. */
const CTA_RESPONSE_REVEAL_MS = 620;
/** Time the user has to read the suggested response. */
const CTA_RESPONSE_HOLD_MS = 1600;
/** "Copiar resposta" tap. */
const CTA_COPY_TAP_MS = 340;
/** Safari slides back down, revealing the Direct again. */
const CTA_SAFARI_CLOSE_MS = 520;
/** Brief settle pause after Safari closes, before the next message starts. */
const CTA_POST_HOLD_MS = 220;

function buildCallToActionSchedule(
  triggerMs: number,
  startMs: number,
  domain: string
): CallToActionSchedule {
  // Total URL typing duration, scaled to length + clamped to a comfortable range.
  const urlTypeDur = clampDuration(
    Math.max(1, domain.length) * CTA_URL_CHAR_MS,
    CTA_URL_TYPE_MIN_MS,
    CTA_URL_TYPE_MAX_MS
  );

  const flashStartMs = startMs;
  const flashEndMs = flashStartMs + CTA_FLASH_MS;
  const shrinkStartMs = flashStartMs + CTA_FLASH_MS * 0.45;
  const shrinkEndMs = shrinkStartMs + CTA_SHRINK_MS;
  const holdThumbStartMs = shrinkEndMs;
  const holdThumbEndMs = holdThumbStartMs + CTA_HOLD_THUMB_MS;
  const safariOpenStartMs = holdThumbEndMs;
  const safariOpenEndMs = safariOpenStartMs + CTA_SAFARI_OPEN_MS;
  const urlTypeStartMs = safariOpenEndMs + 120;
  const urlTypeEndMs = urlTypeStartMs + urlTypeDur;
  const safariNavStartMs = urlTypeEndMs + 520;
  const safariNavEndMs = safariNavStartMs + CTA_SAFARI_NAV_MS;
  const siteIdleStartMs = safariNavEndMs;
  const siteIdleEndMs = siteIdleStartMs + CTA_SITE_IDLE_MS;
  const printDragStartMs = siteIdleEndMs;
  const printDragEndMs = printDragStartMs + CTA_PRINT_DRAG_MS;
  const analyzeClickStartMs = printDragEndMs + 450;
  const analyzeClickEndMs = analyzeClickStartMs + CTA_ANALYZE_CLICK_MS;
  const analyzeLoadStartMs = analyzeClickEndMs;
  const analyzeLoadEndMs = analyzeLoadStartMs + CTA_ANALYZE_LOAD_MS;
  const responseRevealStartMs = analyzeLoadEndMs;
  const responseRevealEndMs = responseRevealStartMs + CTA_RESPONSE_REVEAL_MS;
  const responseHoldStartMs = responseRevealEndMs;
  const responseHoldEndMs = responseHoldStartMs + CTA_RESPONSE_HOLD_MS;
  const copyTapStartMs = responseHoldEndMs;
  const copyTapEndMs = copyTapStartMs + CTA_COPY_TAP_MS;
  const safariCloseStartMs = copyTapEndMs + 450;
  const safariCloseEndMs = safariCloseStartMs + CTA_SAFARI_CLOSE_MS;

  return {
    triggerMs,
    flashStartMs,
    flashEndMs,
    shrinkStartMs,
    shrinkEndMs,
    holdThumbStartMs,
    holdThumbEndMs,
    safariOpenStartMs,
    safariOpenEndMs,
    urlTypeStartMs,
    urlTypeEndMs,
    safariNavStartMs,
    safariNavEndMs,
    siteIdleStartMs,
    siteIdleEndMs,
    printDragStartMs,
    printDragEndMs,
    analyzeClickStartMs,
    analyzeClickEndMs,
    analyzeLoadStartMs,
    analyzeLoadEndMs,
    responseRevealStartMs,
    responseRevealEndMs,
    responseHoldStartMs,
    responseHoldEndMs,
    copyTapStartMs,
    copyTapEndMs,
    safariCloseStartMs,
    safariCloseEndMs,
  };
}

export const CTA_DOMAIN_DEFAULT = "puxeassunto.com";

// ----- Keyboard simulation timings (sent messages, not the first) -----
/** Keyboard slide-up duration. */
const KEYBOARD_OPEN_MS = 320;
/** Keyboard slide-down duration. */
const KEYBOARD_CLOSE_MS = 280;
/** Per-character typing speed. */
export const CHAR_TYPE_MS = 70;
const DEFAULT_SENT_TYPING_MS = 3000;
/** Minimum and maximum total typing duration regardless of text length. */
const TYPE_MIN_MS = 600;
const TYPE_MAX_MS = 4500;
/** Brief pause between consecutive sent messages within a keyboard chain. */
const CHAIN_GAP_MS = 360;
/** Send button pulse duration after typing finishes. */
const SEND_PULSE_MS = 220;
/** Highlight duration of the just-pressed key on the keyboard. */
export const KEY_HIGHLIGHT_MS = 90;
/** Paste-menu timing for messages copied from the CTA response. */
const PASTE_MENU_MS = 620;
const PASTE_SEND_DELAY_MS = 480;
const PASTE_COMMIT_PULSE_MS = 360;

// ============================================================
// Schedule builder
// ============================================================

function clampDuration(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export interface ScheduleOptions {
  memeDurationsMs?: ReadonlyMap<string, number> | Record<string, number>;
}

function isDurationMap(
  value: ScheduleOptions["memeDurationsMs"]
): value is ReadonlyMap<string, number> {
  return typeof (value as ReadonlyMap<string, number> | undefined)?.get === "function";
}

function getMemeDurationMs(
  file: string | undefined,
  options?: ScheduleOptions
): number {
  if (!file) return MEME_AFTER_DURATION_MS;
  const durations = options?.memeDurationsMs;
  const duration = isDurationMap(durations)
    ? durations.get(file)
    : durations?.[file];
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0
    ? Math.max(1, duration)
    : MEME_AFTER_DURATION_MS;
}

function getConfiguredMemeDurationMs(
  file: string | undefined,
  durationMs: number | undefined,
  options?: ScheduleOptions
): number {
  if (
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
  ) {
    return clampDuration(durationMs, 100, 30000);
  }
  return getMemeDurationMs(file, options);
}

function messageWantsFocusZoom(
  message: ConversationConfig["messages"][number]
): boolean {
  return message.focusZoomOnMessage === true;
}

function messageFocusZoomDelayMs(
  message: ConversationConfig["messages"][number]
): number {
  return clampDuration(
    message.focusZoomDelayMs ?? FOCUS_ZOOM_DEFAULT_DELAY_MS,
    0,
    10000
  );
}

function messageFocusZoomHoldMs(
  message: ConversationConfig["messages"][number]
): number {
  return clampDuration(
    message.focusZoomHoldMs ?? FOCUS_ZOOM_DEFAULT_HOLD_MS,
    80,
    10000
  );
}

function focusZoomHoldEndMs(
  message: ConversationConfig["messages"][number],
  appearStartMs: number
): number | null {
  if (!messageWantsFocusZoom(message)) return null;
  return (
    appearStartMs +
    messageFocusZoomDelayMs(message) +
    messageFocusZoomHoldMs(message)
  );
}

/**
 * Builds a per-message animation schedule from the conversation config.
 *
 * - The first message is visible from frame zero. No keyboard simulation
 *   regardless of its side.
 * - Received messages get a typing indicator phase before their bubble.
 * - SENT messages from index 1 onwards get a keyboard simulation:
 *     keyboard slides up → letters typed live → send button pulse → bubble
 *     appears in the chat.
 *   Consecutive sent-not-first messages share a single open keyboard
 *   (the keyboard only closes when the next message isn't a sent-not-first
 *   message, or when the conversation ends).
 */
export function buildSchedule(
  config: ConversationConfig,
  options?: ScheduleOptions
): AnimationSchedule {
  const messages = config.messages;
  const events: MessageScheduleEvent[] = [];

  if (messages.length === 0) {
    return { events, totalDuration: INTRO_MS + END_MS };
  }

  // The user-configurable typing duration drives every received message.
  // Each received message can also override this value individually via
  // `Message.typingDurationMs`.
  const globalTyping = Math.max(700, config.typingDurationMs);

  let t = INTRO_MS;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prevSame = i > 0 && messages[i - 1].side === m.side;
    const isReceived = m.side === "received";
    const usesKeyboard = !isReceived && i > 0;

    if (i > 0) {
      // Inside a keyboard chain we already provide CHAIN_GAP_MS during the
      // chain processing; otherwise add the standard inter-message pause.
      const prevHadKeyboard = events[i - 1]?.keyboard;
      const insideChain = prevHadKeyboard && usesKeyboard;
      if (!insideChain) {
        t += prevSame ? SAME_SIDE_PAUSE_MS : REPLY_THINKING_MS;
      }
    }

    let slotActiveAtMs: number;
    let typingStartMs: number;
    let typingFullMs: number;
    let appearStartMs: number;
    let appearEndMs: number;
    let memeStartMs: number | undefined;
    let memeEndMs: number | undefined;
    let memeOverlayStartMs: number | undefined;
    let memeOverlayEndMs: number | undefined;
    let keyboard: MessageScheduleEvent["keyboard"] | undefined;

    if (i === 0) {
      slotActiveAtMs = 0;
      typingStartMs = -1;
      typingFullMs = -1;
      appearStartMs = 0;
      appearEndMs = 0;
      t = APPEAR_MS;
    } else if (isReceived) {
      // Per-message override takes precedence over the conversation-wide value.
      const baseTyping =
        m.typingDurationMs && m.typingDurationMs > 0
          ? Math.max(300, m.typingDurationMs)
          : globalTyping;
      const typingDur = prevSame
        ? Math.max(450, baseTyping * 0.55)
        : baseTyping;
      slotActiveAtMs = t;
      typingStartMs = t;
      typingFullMs = t + TYPING_FADE_IN_MS;
      t += typingDur;
      appearStartMs = t;
      t += APPEAR_MS;
      appearEndMs = t;
    } else if (usesKeyboard) {
      const isFirstInChain =
        !events[i - 1]?.keyboard || messages[i - 1].side !== "sent";
      const isLastInChain =
        i === messages.length - 1 || messages[i + 1].side !== "sent";
      const keyboardMode =
        config.editedMode && !!messages[i - 1]?.callToActionAfter
          ? "paste"
          : "type";

      // Keyboard open phase (only if first in chain).
      let openStartMs = -1;
      let openEndMs = -1;
      if (isFirstInChain) {
        openStartMs = t;
        openEndMs = t + KEYBOARD_OPEN_MS;
        t = openEndMs;
      } else {
        // Brief pause between consecutive typed messages while keyboard stays open.
        t += CHAIN_GAP_MS;
      }

      const typeStartMs = t;
      let typeEndMs: number;
      let sendTapMs: number;
      let pasteMenuStartMs: number | undefined;
      let pasteMenuEndMs: number | undefined;
      let pasteCommitMs: number | undefined;
      if (keyboardMode === "paste") {
        pasteMenuStartMs = typeStartMs + 140;
        pasteMenuEndMs = pasteMenuStartMs + PASTE_MENU_MS;
        pasteCommitMs = pasteMenuEndMs;
        typeEndMs = pasteCommitMs;
        sendTapMs = pasteCommitMs + PASTE_SEND_DELAY_MS;
      } else {
        const typeDur =
          m.typingDurationMs && m.typingDurationMs > 0
            ? clampDuration(m.typingDurationMs, 300, 10000)
            : DEFAULT_SENT_TYPING_MS;
        typeEndMs = typeStartMs + typeDur;
        sendTapMs = typeEndMs;
      }
      t = sendTapMs;

      // Bubble appears as the send button pulses.
      slotActiveAtMs = sendTapMs;
      typingStartMs = -1;
      typingFullMs = -1;
      appearStartMs = sendTapMs;
      appearEndMs = appearStartMs + APPEAR_MS;

      // Keyboard close phase (only if last in chain).
      let closeStartMs = -1;
      let closeEndMs = -1;
      if (isLastInChain) {
        // Start closing slightly after the bubble starts appearing so the
        // user gets a moment of visual feedback (send tap → bubble appears).
        closeStartMs = sendTapMs + 80;
        closeEndMs = closeStartMs + KEYBOARD_CLOSE_MS;
      }

      keyboard = {
        mode: keyboardMode,
        openStartMs,
        openEndMs,
        typeStartMs,
        typeEndMs,
        pasteMenuStartMs,
        pasteMenuEndMs,
        pasteCommitMs,
        sendTapMs,
        closeStartMs,
        closeEndMs,
      };

      t = Math.max(t, appearEndMs);
      if (closeEndMs > 0) t = Math.max(t, closeEndMs);
    } else {
      // First message and it's sent: simple slide-in, no keyboard.
      slotActiveAtMs = t;
      typingStartMs = -1;
      typingFullMs = -1;
      appearStartMs = t;
      t += APPEAR_MS;
      appearEndMs = t;
    }

    const zoomHoldEndMs = config.editedMode
      ? focusZoomHoldEndMs(m, appearStartMs)
      : null;
    const zoomBlockEndMs = zoomHoldEndMs === null ? null : zoomHoldEndMs;

    const postMessageVisualEndMs = Math.max(
      i === 0 && appearEndMs === 0 ? t : appearEndMs,
      zoomHoldEndMs === null ? 0 : zoomHoldEndMs,
      t
    );

    if (config.editedMode && m.memeOverlay?.file) {
      memeOverlayStartMs = postMessageVisualEndMs + MEME_AFTER_DELAY_MS;
      memeOverlayEndMs =
        memeOverlayStartMs +
        getConfiguredMemeDurationMs(
          m.memeOverlay.file,
          m.memeOverlay.durationMs,
          options
        );
      t = Math.max(t, memeOverlayEndMs);
    }

    if (config.editedMode && m.memeAfter?.file) {
      const memeAnchorMs = Math.max(
        postMessageVisualEndMs,
        memeOverlayEndMs ?? 0
      );
      memeStartMs = memeAnchorMs + MEME_AFTER_DELAY_MS;
      memeEndMs = memeStartMs + getMemeDurationMs(m.memeAfter.file, options);
      t = Math.max(t, memeEndMs);
    } else if (zoomBlockEndMs !== null || memeOverlayEndMs !== undefined) {
      t = Math.max(t, zoomBlockEndMs ?? 0, memeOverlayEndMs ?? 0);
    }

    // ---- Call to action ("Chamada de ação") ----
    // Runs after the marked message is fully visible (and after any meme /
    // focus-zoom that also runs on this message) but BEFORE the next
    // message in the conversation. The Direct freezes at the moment the
    // shutter fires.
    let callToAction: CallToActionSchedule | undefined;
    if (config.editedMode && m.callToActionAfter) {
      const ctaAnchorMs = Math.max(
        appearEndMs,
        zoomHoldEndMs === null ? 0 : zoomHoldEndMs,
        memeOverlayEndMs ?? 0,
        memeEndMs ?? 0,
        t
      );
      const triggerMs = ctaAnchorMs + CTA_PRE_DELAY_MS;
      const domain = (m.callToActionAfter.domain || CTA_DOMAIN_DEFAULT).trim();
      callToAction = buildCallToActionSchedule(triggerMs, triggerMs, domain);
      // Advance the global cursor PAST the CTA so the next message starts
      // after Safari has closed and the Direct is visible again.
      t = callToAction.safariCloseEndMs + CTA_POST_HOLD_MS;
    }

    events.push({
      index: i,
      slotActiveAtMs,
      typingStartMs,
      typingFullMs,
      appearStartMs,
      appearEndMs,
      memeStartMs,
      memeEndMs,
      memeOverlayStartMs,
      memeOverlayEndMs,
      callToAction,
      keyboard,
    });
  }

  const lastEvent = events[events.length - 1];
  const lastEndsWithMeme =
    !!lastEvent &&
    !lastEvent.callToAction &&
    Math.max(lastEvent.memeEndMs ?? 0, lastEvent.memeOverlayEndMs ?? 0) >= t;

  return { events, totalDuration: t + (lastEndsWithMeme ? 0 : END_MS) };
}

// ---- Legacy aliases kept so existing imports keep working ----
export type PhaseTimings = AnimationSchedule;
export function buildTimings(
  config: ConversationConfig,
  options?: ScheduleOptions
): AnimationSchedule {
  return buildSchedule(config, options);
}
export function totalDuration(s: AnimationSchedule): number {
  return s.totalDuration;
}

// ============================================================
// Easing
// ============================================================

export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// ============================================================
// Per-frame state computation
// ============================================================

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Computes the rendering state for every message at time `t`, plus a
 * layout-shift progress used to animate the upward slide of existing
 * messages when a new slot becomes active. Also computes the current
 * keyboard state (if any).
 */
export function frameStateAt(
  t: number,
  schedule: AnimationSchedule,
  messageTexts?: string[]
): FrameState {
  const { events } = schedule;

  const perMessage: MessageFrameState[] = events.map((ev) => {
    const ms: MessageFrameState = {
      index: ev.index,
      state: "hidden",
      typingAlpha: 0,
      appearProgress: 0,
    };

    if (t < ev.slotActiveAtMs) return ms;

    // ----- Typing phase (received only) -----
    if (ev.typingStartMs >= 0 && t < ev.appearStartMs) {
      ms.state = "typing";
      const fadeIn = clamp01((t - ev.typingStartMs) / TYPING_FADE_IN_MS);
      ms.typingAlpha = fadeIn;
      return ms;
    }

    // ----- Bubble slide-in -----
    if (t < ev.appearEndMs) {
      const dur = ev.appearEndMs - ev.appearStartMs;
      const p = clamp01((t - ev.appearStartMs) / dur);
      ms.state = "appearing";
      ms.appearProgress = p;
      // Crossfade: if there was a typing indicator, keep it visible while the
      // bubble slides in, fading out over the first ~40% of the slide.
      if (ev.typingStartMs >= 0) {
        ms.state = "crossfade";
        ms.typingAlpha = clamp01(1 - p / 0.4);
      }
      return ms;
    }

    // ----- Fully visible -----
    ms.state = "visible";
    ms.appearProgress = 1;
    ms.typingAlpha = 0;
    return ms;
  });

  // Determine the highest-indexed message whose slot is active.
  let activeCount = 0;
  let latestActivation = -Infinity;
  for (const ev of events) {
    if (t >= ev.slotActiveAtMs) {
      activeCount = ev.index + 1;
      latestActivation = ev.slotActiveAtMs;
    } else {
      break;
    }
  }

  // shiftProgress: 0 right at activation, 1 after SHIFT_MS has elapsed.
  const shiftProgress =
    activeCount === 0 ? 0 : clamp01((t - latestActivation) / SHIFT_MS);

  const keyboard = computeKeyboardState(t, events, messageTexts);

  return { activeCount, shiftProgress, perMessage, keyboard };
}

interface ActiveChain {
  first: MessageScheduleEvent;
  last: MessageScheduleEvent;
  openStart: number;
  closeEnd: number;
}

/**
 * Walks the schedule to find the keyboard chain currently containing time `t`,
 * if any. A chain is a contiguous block of sent-not-first messages that share
 * a single open keyboard.
 */
function computeKeyboardState(
  t: number,
  events: MessageScheduleEvent[],
  messageTexts?: string[]
): KeyboardFrameState | null {
  let activeChain: ActiveChain | null = null;
  let activeMessageIndex = -1;
  let activeEvent: MessageScheduleEvent | undefined;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.keyboard) continue;

    // Each chain is bracketed by an event whose openStartMs >= 0 (first) and
    // an event whose closeEndMs >= 0 (last). Identify the chain only when we
    // hit its first event so we don't double-process.
    if (ev.keyboard.openStartMs >= 0) {
      let last: MessageScheduleEvent = ev;
      for (let j = i; j < events.length; j++) {
        const k2 = events[j].keyboard;
        if (k2 && k2.closeEndMs >= 0) {
          last = events[j];
          break;
        }
      }
      const openStart = ev.keyboard.openStartMs;
      const closeEnd = last.keyboard!.closeEndMs;
      if (t >= openStart && t <= closeEnd) {
        activeChain = { first: ev, last, openStart, closeEnd };
      }
    }

    // Identify the individual message currently being typed.
    if (
      t >= ev.keyboard.typeStartMs - 1 &&
      t < ev.keyboard.sendTapMs + SEND_PULSE_MS
    ) {
      activeMessageIndex = ev.index;
      activeEvent = ev;
    }
  }

  if (!activeChain) return null;

  // ----- openProgress -----
  let openProgress = 1;
  const firstKb = activeChain.first.keyboard!;
  if (t < firstKb.openEndMs) {
    openProgress = clamp01((t - firstKb.openStartMs) / KEYBOARD_OPEN_MS);
  }
  const lastKb = activeChain.last.keyboard!;
  if (lastKb.closeStartMs >= 0 && t >= lastKb.closeStartMs) {
    openProgress = 1 - clamp01((t - lastKb.closeStartMs) / KEYBOARD_CLOSE_MS);
  }

  // ----- typed chars / highlighted key / send pulse (per-message) -----
  let typedChars = 0;
  let highlightedKey: string | null = null;
  let sendPulse = 0;
  let mode: KeyboardFrameState["mode"] = "type";
  let pasteMenuProgress = 0;
  let pasteCommitPulse = 0;
  if (activeEvent && activeEvent.keyboard) {
    const kb = activeEvent.keyboard;
    mode = kb.mode ?? "type";
    const text =
      messageTexts && messageTexts[activeEvent.index] !== undefined
        ? messageTexts[activeEvent.index]
        : "";
    if (mode === "paste") {
      const commitMs = kb.pasteCommitMs ?? kb.typeEndMs;
      typedChars = t >= commitMs ? text.length : 0;
      const menuStart = kb.pasteMenuStartMs ?? kb.typeStartMs;
      const menuEnd = kb.pasteMenuEndMs ?? commitMs;
      if (t >= menuStart && t < menuEnd) {
        const p = clamp01((t - menuStart) / Math.max(1, menuEnd - menuStart));
        pasteMenuProgress = p < 0.25 ? p / 0.25 : 1;
      }
      if (t >= commitMs && t < commitMs + PASTE_COMMIT_PULSE_MS) {
        const p = clamp01((t - commitMs) / PASTE_COMMIT_PULSE_MS);
        pasteCommitPulse = p < 0.28 ? p / 0.28 : 1 - (p - 0.28) / 0.72;
      }
    } else {
      const dur = Math.max(1, kb.typeEndMs - kb.typeStartMs);
      const charDur = text.length > 0 ? dur / text.length : dur;
      if (t < kb.typeStartMs) {
        typedChars = 0;
      } else if (t >= kb.typeEndMs) {
        typedChars = text.length;
      } else {
        const elapsed = t - kb.typeStartMs;
        typedChars = Math.min(
          text.length,
          Math.floor(elapsed / charDur) + 1
        );
      }
      if (typedChars > 0 && typedChars <= text.length) {
        const lastCharStart = kb.typeStartMs + (typedChars - 1) * charDur;
        if (t - lastCharStart < KEY_HIGHLIGHT_MS) {
          highlightedKey = text[typedChars - 1].toLowerCase();
        }
      }
    }
    if (t >= kb.sendTapMs && t < kb.sendTapMs + SEND_PULSE_MS) {
      sendPulse = 1 - clamp01((t - kb.sendTapMs) / SEND_PULSE_MS);
    }
  }

  return {
    openProgress,
    activeMessageIndex,
    typedChars,
    highlightedKey,
    sendPulse,
    mode,
    pasteMenuProgress,
    pasteCommitPulse,
  };
}
