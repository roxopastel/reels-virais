import type {
  AnimationSchedule,
  ConversationConfig,
  MessageScheduleEvent,
  MessageAudio,
  SfxChoice,
} from "./types";

// ============================================================
// Sound effects ("Edited video" mode)
// ============================================================

/** Folder under /public where the audio files live. */
export const AUDIO_DIR = "/audio";
export const MUSIC_DIR = "/musics";

/** Slot identifiers for the per-message default-sound table. Each slot
 *  has a hard-coded default filename; the user can still override per
 *  message with any other file from `/public/audio/`. */
export type SfxSlot =
  | "receivedTyping"
  | "receivedAppearWhoosh"
  | "receivedAppearPop"
  | "sentKeypress"
  | "sentTypingLoop"
  | "sentSend"
  | "focusZoom";

/** Built-in default file for each slot. Treat these as suggestions: if the
 *  file isn't in `/public/audio/`, the slot is silently skipped. */
export const DEFAULT_SFX: Record<SfxSlot, string> = {
  receivedTyping: "notification.mp3",
  receivedAppearWhoosh: "whoosh.mp3",
  receivedAppearPop: "pop.mp3",
  sentKeypress: "keypress.mp3",
  sentTypingLoop: "typing-loop.mp3",
  sentSend: "send.mp3",
  focusZoom: "whoosh.mp3",
};

/** Friendly label shown next to each slot in the Form's audio panel. */
export const SLOT_DEFAULT_LABEL: Record<SfxSlot, string> = {
  receivedTyping: DEFAULT_SFX.receivedTyping,
  receivedAppearWhoosh: `${DEFAULT_SFX.receivedAppearWhoosh} + ${DEFAULT_SFX.receivedAppearPop}`,
  receivedAppearPop: DEFAULT_SFX.receivedAppearPop,
  sentKeypress: DEFAULT_SFX.sentKeypress,
  sentTypingLoop: DEFAULT_SFX.sentTypingLoop,
  sentSend: DEFAULT_SFX.sentSend,
  focusZoom: DEFAULT_SFX.focusZoom,
};

/** Returns the public URL for a given filename inside `/public/audio/`. */
export function fileToUrl(file: string): string {
  return `${AUDIO_DIR}/${file}`;
}

/** Returns the public URL for a given filename inside `/public/musics/`. */
export function musicFileToUrl(file: string): string {
  return `${MUSIC_DIR}/${file}`;
}

export interface SfxEvent {
  timeMs: number;
  /** Public URL of the audio file to play (e.g. "/audio/notification.mp3"). */
  url: string;
  /** Per-event linear gain (default 1). */
  gain?: number;
  /** Offset inside the source buffer. Used to resume background music. */
  offsetMs?: number;
  /** If set, the source loops and stops after this many ms. */
  durationMs?: number;
}

// ============================================================
// Choice resolution
// ============================================================

/** Resolves a `SfxChoice` to a concrete public URL or null (silent).
 *   - "default" / undefined → DEFAULT_SFX[slot]
 *   - "none"                → null
 *   - any other string      → that filename inside /audio/
 */
function resolveChoiceUrl(
  choice: SfxChoice | undefined,
  slot: SfxSlot | null
): string | null {
  if (choice === "none") return null;
  if (!choice || choice === "default") {
    if (!slot) return null;
    return fileToUrl(DEFAULT_SFX[slot]);
  }
  return fileToUrl(choice);
}

/**
 * Builds the list of timed SFX events for the "edited video" mode based on
 * the animation schedule and the per-message audio overrides.
 *
 *   - Each received message gets:
 *       • a "typing" cue at the moment the "..." indicator appears,
 *       • either a built-in whoosh+pop combo (when appearSfx is "default")
 *         or a single configurable file at the bubble's entrance.
 *   - Each sent message that uses the keyboard simulation gets:
 *       • either one keypress per typed character ("perKey" / "default")
 *         or one looping source for the whole typing phase ("loop"),
 *       • a "send" cue when the send button is tapped.
 */
export function buildSfxEvents(
  config: ConversationConfig,
  schedule: AnimationSchedule
): SfxEvent[] {
  const events: SfxEvent[] = [];

  for (const ev of schedule.events) {
    const msg = config.messages[ev.index];
    if (!msg) continue;
    const audio: MessageAudio = msg.audio ?? {};

    if (msg.side === "received") {
      // ----- Typing-indicator cue -----
      const typingUrl = resolveChoiceUrl(
        audio.typingSfx ?? "none",
        "receivedTyping"
      );
      if (typingUrl) {
        const cueTime =
          ev.typingStartMs >= 0 ? ev.typingStartMs : ev.appearStartMs;
        events.push({ timeMs: cueTime, url: typingUrl, gain: 0.9 });
      }

      // ----- Bubble appear / zoom cue -----
      const appearChoice = audio.appearSfx ?? "notification.mp3";
      if (appearChoice === "default") {
        // Cinematic combo: whoosh slightly before, pop on impact.
        const whooshUrl = resolveChoiceUrl(
          undefined,
          "receivedAppearWhoosh"
        );
        const popUrl = resolveChoiceUrl(undefined, "receivedAppearPop");
        if (whooshUrl) {
          events.push({
            timeMs: Math.max(0, ev.appearStartMs - 80),
            url: whooshUrl,
            gain: 0.55,
          });
        }
        if (popUrl) {
          events.push({
            timeMs: ev.appearStartMs + 60,
            url: popUrl,
            gain: 0.75,
          });
        }
      } else if (appearChoice !== "none") {
        events.push({
          timeMs: ev.appearStartMs,
          url: fileToUrl(appearChoice),
          gain: 0.8,
        });
      }
    } else if (ev.keyboard) {
      const kb = ev.keyboard;
      const text = msg.text;
      const typeSpan = Math.max(1, kb.typeEndMs - kb.typeStartMs);
      const typingMode = audio.typingMode ?? "default";

      if (kb.mode === "paste") {
        // Pasted CTA responses appear all at once, so there are no keypresses.
      } else if (typingMode === "loop") {
        const loopUrl = resolveChoiceUrl(
          audio.typingLoopSfx,
          "sentTypingLoop"
        );
        if (loopUrl) {
          events.push({
            timeMs: kb.typeStartMs,
            url: loopUrl,
            gain: 0.55,
            durationMs: typeSpan,
          });
        }
      } else if (typingMode === "perKey" || typingMode === "default") {
        const keypressUrl = resolveChoiceUrl(undefined, "sentKeypress");
        if (keypressUrl) {
          const perChar =
            text.length > 0 ? typeSpan / text.length : typeSpan;
          for (let i = 0; i < text.length; i++) {
            events.push({
              timeMs: kb.typeStartMs + i * perChar,
              url: keypressUrl,
              gain: 0.45,
            });
          }
        }
      }
      // (typingMode === "none" → silent typing)

      // ----- Send tap -----
      const sendUrl = resolveChoiceUrl(audio.sendSfx, "sentSend");
      if (sendUrl) {
        events.push({ timeMs: kb.sendTapMs, url: sendUrl, gain: 0.9 });
      }
    }

    if (
      config.editedMode &&
      msg.focusZoomOnMessage &&
      audio.focusZoomSfx &&
      audio.focusZoomSfx !== "none"
    ) {
      const zoomUrl = resolveChoiceUrl(audio.focusZoomSfx, "focusZoom");
      if (zoomUrl) {
        const delayMs = clampMs(msg.focusZoomDelayMs, 0, 10000);
        events.push({
          timeMs: ev.appearStartMs + delayMs,
          url: zoomUrl,
          gain: 0.9,
        });
      }
    }

    const cta = ev.callToAction;
    if (cta) {
      events.push({
        timeMs: cta.flashStartMs,
        url: fileToUrl("screenshot.mp3"),
        gain: 0.9,
      });

      const loopUrl = resolveChoiceUrl(undefined, "sentTypingLoop");
      const durationMs = Math.max(1, cta.urlTypeEndMs - cta.urlTypeStartMs);
      if (loopUrl) {
        events.push({
          timeMs: cta.urlTypeStartMs,
          url: loopUrl,
          gain: 0.5,
          durationMs,
        });
      }
    }
  }

  events.sort((a, b) => a.timeMs - b.timeMs);
  return events;
}

/** Builds the background-music event for the whole exported video. */
export function buildBackgroundMusicEvents(
  config: ConversationConfig,
  totalMs: number,
  schedule?: AnimationSchedule
): SfxEvent[] {
  const file = config.backgroundMusic;
  if (!file || file === "none" || totalMs <= 0) return [];
  const url = musicFileToUrl(file);
  const gain = clampGain(config.backgroundMusicGain, 0.3);
  const pauses = schedule
    ? collectMemeOverlayPauses(schedule.events, totalMs)
    : [];
  if (pauses.length === 0) {
    return [{ timeMs: 0, url, gain, durationMs: totalMs, offsetMs: 0 }];
  }

  const events: SfxEvent[] = [];
  let cursorMs = 0;
  let musicOffsetMs = 0;
  for (const pause of pauses) {
    if (pause.startMs > cursorMs) {
      const durationMs = pause.startMs - cursorMs;
      events.push({
        timeMs: cursorMs,
        url,
        gain,
        durationMs,
        offsetMs: musicOffsetMs,
      });
      musicOffsetMs += durationMs;
    }
    cursorMs = Math.max(cursorMs, pause.endMs);
  }
  if (cursorMs < totalMs) {
    events.push({
      timeMs: cursorMs,
      url,
      gain,
      durationMs: totalMs - cursorMs,
      offsetMs: musicOffsetMs,
    });
  }
  return events;
}

function collectMemeOverlayPauses(
  events: MessageScheduleEvent[],
  totalMs: number
): { startMs: number; endMs: number }[] {
  const pauses = events
    .filter(
      (ev) =>
        ev.memeOverlayStartMs !== undefined &&
        ev.memeOverlayEndMs !== undefined &&
        ev.memeOverlayEndMs > ev.memeOverlayStartMs
    )
    .map((ev) => ({
      startMs: clampMs(ev.memeOverlayStartMs!, 0, totalMs),
      endMs: clampMs(ev.memeOverlayEndMs!, 0, totalMs),
    }))
    .filter((pause) => pause.endMs > pause.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: { startMs: number; endMs: number }[] = [];
  for (const pause of pauses) {
    const last = merged[merged.length - 1];
    if (last && pause.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, pause.endMs);
    } else {
      merged.push({ ...pause });
    }
  }
  return merged;
}

function clampGain(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function clampMs(
  value: number | undefined,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Returns the unique set of audio URLs referenced by the events. */
export function uniqueUrls(events: SfxEvent[]): string[] {
  const set = new Set<string>();
  for (const ev of events) set.add(ev.url);
  return Array.from(set);
}

// ============================================================
// AudioEngine — plays SFX live and / or into a MediaStream for recording.
// ============================================================

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private liveGain: GainNode | null = null;
  private recordGain: GainNode | null = null;
  private mediaSources = new Map<HTMLMediaElement, MediaElementAudioSourceNode>();
  /** url → decoded buffer (or null when load failed / file missing). */
  private buffers = new Map<string, AudioBuffer | null>();
  private inflight = new Map<string, Promise<AudioBuffer | null>>();
  private active: AudioBufferSourceNode[] = [];

  /** Lazily creates the AudioContext (must run after a user gesture for
   *  the context to actually start producing sound). */
  async ensureReady(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      this.liveGain = this.ctx.createGain();
      this.liveGain.gain.value = 1;
      this.liveGain.connect(this.ctx.destination);

      this.recordGain = this.ctx.createGain();
      this.recordGain.gain.value = 1;
      this.dest = this.ctx.createMediaStreamDestination();
      this.recordGain.connect(this.dest);
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  /** Loads + decodes a single URL into the buffer cache. Subsequent calls
   *  for the same URL return the cached promise. Returns null if the file
   *  is missing or undecodable. */
  loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(url))
      return Promise.resolve(this.buffers.get(url) ?? null);
    if (this.inflight.has(url)) return this.inflight.get(url)!;
    if (!this.ctx) return Promise.resolve(null);
    const ctx = this.ctx;
    const p = (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) {
          this.buffers.set(url, null);
          return null;
        }
        const arr = await r.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr.slice(0));
        this.buffers.set(url, buf);
        return buf;
      } catch {
        this.buffers.set(url, null);
        return null;
      } finally {
        this.inflight.delete(url);
      }
    })();
    this.inflight.set(url, p);
    return p;
  }

  /** Preloads every URL in parallel. Resolves once all are settled. */
  async preloadUrls(urls: string[]): Promise<void> {
    await Promise.all(urls.map((u) => this.loadBuffer(u)));
  }

  /** Returns the live AudioContext.currentTime, or 0 if not initialized. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Returns the audio track that should be merged into a video MediaStream
   *  to bake the sounds into the recording. */
  getRecordingTrack(): MediaStreamTrack | null {
    return this.dest?.stream.getAudioTracks()[0] ?? null;
  }

  /** Routes HTML media element audio into the same live/recording mix used by
   *  SFX. Used for meme videos, whose image is drawn to canvas while their
   *  original audio needs to be baked into the generated file. */
  connectMediaElements(
    elements: HTMLMediaElement[],
    opts: { toLive: boolean; toRecord: boolean }
  ): void {
    if (!this.ctx) return;
    for (const el of elements) {
      let src = this.mediaSources.get(el);
      if (!src) {
        try {
          src = this.ctx.createMediaElementSource(el);
        } catch {
          continue;
        }
        this.mediaSources.set(el, src);
      }
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
      if (opts.toLive && this.liveGain) src.connect(this.liveGain);
      if (opts.toRecord && this.recordGain) src.connect(this.recordGain);
    }
  }

  /** Stops every scheduled / playing source. */
  cancelAll(): void {
    for (const s of this.active) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.active = [];
  }

  /**
   * Plays a single sound right now (used by the "▶ ouvir" preview button
   * in the Form). Returns a promise that resolves once the sound starts
   * — not when it ends.
   */
  async playOnce(url: string, gain = 1): Promise<void> {
    await this.ensureReady();
    if (!this.ctx) return;
    const buf = await this.loadBuffer(url);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    if (this.liveGain) g.connect(this.liveGain);
    try {
      src.start();
    } catch {
      return;
    }
    this.active.push(src);
    src.onended = () => {
      const idx = this.active.indexOf(src);
      if (idx >= 0) this.active.splice(idx, 1);
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  /**
   * Schedules a list of SFX events to play starting at `startCtxTime` (an
   * AudioContext.currentTime anchor). Events whose times fall in the past
   * are skipped. URLs whose buffers haven't been preloaded are skipped too,
   * so call `preloadUrls(uniqueUrls(events))` before this.
   */
  scheduleEvents(
    events: SfxEvent[],
    startCtxTime: number,
    opts: { toLive: boolean; toRecord: boolean }
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const ev of events) {
      const buf = this.buffers.get(ev.url);
      if (!buf) continue;
      const when = startCtxTime + ev.timeMs / 1000;
      if (when < ctx.currentTime - 0.02) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = ev.gain ?? 1;
      src.connect(g);
      if (opts.toLive && this.liveGain) g.connect(this.liveGain);
      if (opts.toRecord && this.recordGain) g.connect(this.recordGain);
      const startAt = Math.max(when, ctx.currentTime);
      const offsetSec =
        ev.offsetMs && ev.offsetMs > 0
          ? (ev.offsetMs / 1000) % Math.max(buf.duration, 0.001)
          : 0;
      if (ev.durationMs && ev.durationMs > 0) {
        src.loop = true;
        const stopAt = startAt + ev.durationMs / 1000;
        // Fade out the last 40ms of the loop so it doesn't cut harshly.
        const fadeStart = Math.max(startAt, stopAt - 0.04);
        try {
          g.gain.setValueAtTime(ev.gain ?? 1, fadeStart);
          g.gain.linearRampToValueAtTime(0, stopAt);
        } catch {
          /* older engines ignore — no-op */
        }
        try {
          src.start(startAt, offsetSec);
          src.stop(stopAt);
        } catch {
          continue;
        }
      } else {
        try {
          src.start(startAt, offsetSec);
        } catch {
          continue;
        }
      }
      this.active.push(src);
      src.onended = () => {
        const idx = this.active.indexOf(src);
        if (idx >= 0) this.active.splice(idx, 1);
        try {
          g.disconnect();
        } catch {
          /* ignore */
        }
      };
    }
  }
}
