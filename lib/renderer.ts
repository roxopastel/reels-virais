import {
  easeOutBack,
  easeOutCubic,
  frameStateAt,
  KEY_HIGHLIGHT_MS,
} from "./animation";
import type { PhaseTimings } from "./animation";
import type {
  CallToActionSchedule,
  ConversationConfig,
  Message,
  MessageFrameState,
  MessageSide,
} from "./types";

// ===== Canvas dimensions (vertical phone export) =====
export const CANVAS_W = 1180;
export const CANVAS_H = 2556;

// ===== Layout constants (in pixels, tuned for phone-style vertical video) =====
const STATUS_BAR_HEIGHT = 130;
const HEADER_HEIGHT = 210;
const TOP_CHROME_HEIGHT = STATUS_BAR_HEIGHT + HEADER_HEIGHT;
const INPUT_BAR_AREA_HEIGHT = 220; // includes bottom padding
const SIDE_PADDING = 45;

// ===== Colors (Instagram dark mode) =====
const COLORS = {
  bg: "#0B0F13",
  white: "#FFFFFF",
  muted: "#A8A8A8",
  faint: "#737373",
  bubbleRecv: "#262626",
  inputPill: "#1A1E1F",
  inputPillBorder: "#262626",
  divider: "#1A1A1A",
};

// Instagram DM gradient — used by sent bubbles & camera button.
// The gradient is computed across the ENTIRE canvas height so each bubble
// inherits its color from where it sits on screen (pink → purple → blue).
const IG_GRADIENT_STOPS: Array<[number, string]> = [
  [0.0, "#FF5C7A"], // coral / pink at top
  [0.22, "#E15BB5"], // magenta
  [0.45, "#9156EC"], // purple
  [0.7, "#6166F0"], // blue-violet
  [1.0, "#4585FF"], // blue at bottom
];

function applyIGGradient(
  ctx: CanvasRenderingContext2D,
  height: number = CANVAS_H
): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  for (const [stop, color] of IG_GRADIENT_STOPS) g.addColorStop(stop, color);
  return g;
}

// ============================================================
// Font helpers
// ============================================================

/**
 * Font stack matching Instagram's native UI. Server-side renders run on Linux,
 * so Inter + Noto Color Emoji are installed in the Docker image to keep text
 * and emojis close to the browser preview instead of falling back to Liberation.
 */
const FONT_STACK =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const IG_DM_TEXT_SIZE = 51;
const IG_DM_TEXT_WEIGHT = 400;

function font(weight: number, size: number, opts?: { letterSpacing?: number }): string {
  // Note: letterSpacing isn't natively supported on canvas font, but we keep
  // the helper signature consistent for future use.
  void opts;
  return `${weight} ${size}px ${FONT_STACK}`;
}

// ============================================================
// Path helpers
// ============================================================

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function circle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
}

// ============================================================
// Text wrap
// ============================================================

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(" ");
    let currentLine = "";
    for (const word of words) {
      const test = currentLine ? currentLine + " " + word : word;
      const w = ctx.measureText(test).width;
      if (w > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

// ============================================================
// Bubble grouping (Instagram-style consecutive same-sender corners)
// ============================================================

type GroupPosition = "single" | "first" | "middle" | "last";

/**
 * Returns the position of message `i` within its same-sender run.
 * - single: alone (different/no sender both before AND after)
 * - first: starts a run (different/no before, same after)
 * - middle: inside a run (same before AND after)
 * - last: ends a run (same before, different/no after)
 */
function getGroupPosition(messages: Message[], i: number): GroupPosition {
  const cur = messages[i].side;
  const prevSame = i > 0 && messages[i - 1].side === cur;
  const nextSame = i < messages.length - 1 && messages[i + 1].side === cur;
  if (!prevSame && !nextSame) return "single";
  if (!prevSame && nextSame) return "first";
  if (prevSame && nextSame) return "middle";
  return "last";
}

const DEFAULT_BUBBLE_R_FULL = 50;
const DEFAULT_BUBBLE_R_SMALL = 16;

/**
 * Returns [TL, TR, BR, BL] corner radii for a bubble based on its side and
 * group position. Consecutive messages flatten the touching side:
 * sent bubbles flatten the right edge, received bubbles flatten the left edge.
 */
function getBubbleRadii(
  side: MessageSide,
  pos: GroupPosition,
  fullRadius: number = DEFAULT_BUBBLE_R_FULL,
  groupedRadius: number = DEFAULT_BUBBLE_R_SMALL
): [number, number, number, number] {
  const F = fullRadius;
  const S = groupedRadius;
  if (side === "received") {
    switch (pos) {
      case "single":
        return [F, F, F, F];
      case "first":
        return [F, F, F, S];
      case "middle":
        return [S, F, F, S];
      case "last":
        return [S, F, F, F];
    }
  } else {
    switch (pos) {
      case "single":
        return [F, F, F, F];
      case "first":
        return [F, F, S, F];
      case "middle":
        return [F, S, S, F];
      case "last":
        return [F, S, F, F];
    }
  }
}

/**
 * Builds a rounded-rect path with per-corner radii.
 * Falls back to manual path if the browser doesn't support roundRect.
 */
function roundedRectAdv(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: [number, number, number, number]
) {
  ctx.beginPath();
  type RR = (
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number[]
  ) => void;
  const native = (ctx as unknown as { roundRect?: RR }).roundRect;
  if (typeof native === "function") {
    native.call(ctx, x, y, w, h, [radii[0], radii[1], radii[2], radii[3]]);
    return;
  }
  // Manual fallback
  const [tl, tr, br, bl] = radii;
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

// ============================================================
// Bubble measure & draw (decoupled)
// ============================================================

const DEFAULT_BUBBLE_FONT_SIZE = 49;
const DEFAULT_BUBBLE_LINE_HEIGHT_MULTIPLIER = 1.36;
const DEFAULT_BUBBLE_PADDING_X = 41;
const DEFAULT_BUBBLE_PADDING_Y = 32;

interface BubbleStyle {
  paddingX: number;
  paddingY: number;
  fontSize: number;
  lineHeight: number;
  radiusFull: number;
  radiusGrouped: number;
}

interface BubbleMeasure {
  width: number;
  height: number;
  lines: string[];
}

const TYPING_BUBBLE_BASE_W = 174;
const TYPING_BUBBLE_BASE_H = 96;

function measureBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  style: BubbleStyle
): BubbleMeasure {
  ctx.font = font(IG_DM_TEXT_WEIGHT, style.fontSize);
  const lines = wrapText(ctx, text || " ", maxWidth - style.paddingX * 2);
  let widest = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > widest) widest = w;
  }
  const width = Math.min(widest + style.paddingX * 2, maxWidth);
  // Visual text block: first line takes a full font-size of vertical space and
  // each additional line adds one line-height. Without this we'd over-count
  // the trailing leading after the last line and the text would appear
  // pushed up inside the bubble.
  const textHeight =
    style.fontSize + (lines.length - 1) * style.lineHeight;
  const height = textHeight + style.paddingY * 2;
  return { width, height, lines };
}

function measureTypingBubble(): BubbleMeasure {
  return {
    width: TYPING_BUBBLE_BASE_W,
    height: TYPING_BUBBLE_BASE_H,
    lines: [],
  };
}

interface DrawBubbleArgs {
  text: string;
  lines: string[];
  left: number;
  top: number;
  width: number;
  height: number;
  radii: [number, number, number, number];
  side: MessageSide;
  paddingX: number;
  paddingY: number;
  fontSize: number;
  lineHeight: number;
}

function drawBubble(ctx: CanvasRenderingContext2D, args: DrawBubbleArgs) {
  // Background
  if (args.side === "sent") {
    ctx.save();
    roundedRectAdv(ctx, args.left, args.top, args.width, args.height, args.radii);
    ctx.fillStyle = "#7e37f4";
    ctx.fill();
    ctx.restore();
  } else {
    roundedRectAdv(ctx, args.left, args.top, args.width, args.height, args.radii);
    ctx.fillStyle = COLORS.bubbleRecv;
    ctx.fill();
  }

  // Text — positioned by line-CENTER so vertical padding stays symmetric
  // regardless of font-metric quirks.
  ctx.fillStyle = COLORS.white;
  ctx.font = font(IG_DM_TEXT_WEIGHT, args.fontSize);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (let i = 0; i < args.lines.length; i++) {
    const lineCenterY =
      args.top +
      args.paddingY +
      args.fontSize / 2 +
      i * args.lineHeight;
    ctx.fillText(
      args.lines[i],
      args.left + args.paddingX,
      lineCenterY
    );
  }
}

// ============================================================
// Status bar (top)
// ============================================================

/**
 * Draws an iOS-style status bar (iOS 16+ notch layout).
 * - Left: time in SF Pro Display Semibold
 * - Right: a single pre-rendered image strip with cellular signal, WiFi, and
 *   battery glyphs (`wifi.jpeg`).
 */
function drawStatusBar(
  ctx: CanvasRenderingContext2D,
  config: ConversationConfig,
  wifiImage: HTMLImageElement | null
) {
  const centerY = paramPx(
    config.statusTimeY,
    88,
    0,
    220
  );

  // ===== Time (left side) =====
  ctx.fillStyle = COLORS.white;
  ctx.font = font(600, paramPx(config.statusTimeFontSize, 52, 18, 80));
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(config.statusBarTime, paramPx(config.statusTimeX, 139, 0, 300), centerY);

  // ===== Right side: pre-rendered icon strip =====
  if (wifiImage && wifiImage.complete) {
    const rightMargin = paramPx(config.statusIconsRightMargin, 78, 0, 240);
    const targetH = paramPx(config.statusIconsHeight, 101, 20, 150);
    const aspect =
      (wifiImage.naturalWidth || wifiImage.width) /
      (wifiImage.naturalHeight || wifiImage.height || 1);
    const targetW = targetH * aspect;
    const xLeft = CANVAS_W - rightMargin - targetW;
    const yTop = centerY - targetH / 2;
    ctx.drawImage(wifiImage, xLeft, yTop, targetW, targetH);
  }
}

// ============================================================
// Header
// ============================================================

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  image: HTMLImageElement | null,
  fallbackLabel: string,
  opts?: { storyRing?: boolean }
) {
  // Optional Instagram-style story ring (orange→pink→purple gradient).
  if (opts?.storyRing) {
    const ringR = radius + 8;
    const ringW = 6;
    const grad = ctx.createLinearGradient(
      cx - ringR,
      cy - ringR,
      cx + ringR,
      cy + ringR
    );
    grad.addColorStop(0.0, "#F09433");
    grad.addColorStop(0.25, "#E6683C");
    grad.addColorStop(0.5, "#DC2743");
    grad.addColorStop(0.75, "#CC2366");
    grad.addColorStop(1.0, "#BC1888");
    ctx.save();
    circle(ctx, cx, cy, ringR);
    ctx.strokeStyle = grad;
    ctx.lineWidth = ringW;
    ctx.stroke();
    // Black gap between ring and avatar (IG style)
    circle(ctx, cx, cy, radius + 2);
    ctx.strokeStyle = COLORS.bg;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  circle(ctx, cx, cy, radius);
  ctx.clip();
  if (image && image.complete && image.naturalWidth > 0) {
    // Cover fit
    const ratio = image.naturalWidth / image.naturalHeight;
    let dw = radius * 2;
    let dh = radius * 2;
    if (ratio > 1) {
      dw = radius * 2 * ratio;
    } else {
      dh = (radius * 2) / ratio;
    }
    ctx.drawImage(image, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    // Gradient placeholder
    const grad = ctx.createLinearGradient(
      cx - radius,
      cy - radius,
      cx + radius,
      cy + radius
    );
    grad.addColorStop(0, "#FFB199");
    grad.addColorStop(0.5, "#FF6E7F");
    grad.addColorStop(1, "#7E3FF2");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    // Initials
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = font(700, radius * 0.9);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallbackLabel.toUpperCase(), cx, cy + radius * 0.05);
  }
  ctx.restore();
}

/**
 * Instagram-style verified badge: blue scalloped circle with white checkmark.
 */
function drawVerifiedBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  ctx.save();
  const scale = size / 24;
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  // Scalloped background (Lucide badge-check shape)
  const scalloped = new Path2D(
    "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
  );
  ctx.fillStyle = "#0095F6"; // Instagram blue
  ctx.fill(scalloped);
  // White checkmark
  const check = new Path2D("m9 12 2 2 4-4");
  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = 3 / scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(check);
  ctx.restore();
}

/**
 * Green online indicator dot, drawn at avatar's bottom-right corner.
 */
function drawOnlineDot(
  ctx: CanvasRenderingContext2D,
  avatarCx: number,
  avatarCy: number,
  avatarR: number
) {
  // Position: bottom-right of avatar circle, slightly outside.
  const offset = avatarR * 0.71; // ~cos/sin of 45deg
  const cx = avatarCx + offset;
  const cy = avatarCy + offset;
  const r = avatarR * 0.32;
  // White border ring (cuts into avatar background)
  circle(ctx, cx, cy, r + 4);
  ctx.fillStyle = COLORS.bg;
  ctx.fill();
  // Green dot
  circle(ctx, cx, cy, r);
  ctx.fillStyle = "#3BD46E";
  ctx.fill();
}

/**
 * Draws a Lucide-style icon (SVG path data scaled to size).
 * Lucide icons are designed at 24×24 viewBox with stroke-width 2.
 */
function drawLucideIcon(
  ctx: CanvasRenderingContext2D,
  paths: string[],
  cx: number,
  cy: number,
  size: number,
  strokePx: number = 4
) {
  ctx.save();
  const scale = size / 24;
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = COLORS.white;
  ctx.fillStyle = COLORS.white;
  ctx.lineWidth = strokePx / scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of paths) {
    const path = new Path2D(p);
    ctx.stroke(path);
  }
  ctx.restore();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  config: ConversationConfig,
  avatarImage: HTMLImageElement | null,
  headerIconsImage: HTMLImageElement | null
) {
  const y0 = statusBarHeight(config);
  const headerH = headerHeight(config);
  const yMid =
    y0 + headerH / 2 + paramPx(config.headerContentOffsetY, 21, -100, 140);

  // Back chevron (Lucide chevron-left)
  drawLucideIcon(
    ctx,
    ["M15 18 9 12 15 6"],
    72,
    yMid,
    52,
    5
  );

  // Avatar (with optional story ring and online dot)
  const avatarX = paramPx(config.headerAvatarX, 191, 60, 360);
  const avatarR = paramPx(config.headerAvatarRadius, 54, 24, 90);
  drawAvatar(
    ctx,
    avatarX,
    yMid,
    avatarR,
    avatarImage,
    config.username.charAt(0) || "?",
    { storyRing: config.hasStory }
  );
  if (config.online) {
    drawOnlineDot(ctx, avatarX, yMid, avatarR);
  }

  // Username + optional verified badge
  const nameX = avatarX + avatarR + (config.hasStory ? 30 : 24);
  const nameY = yMid - 4;
  ctx.fillStyle = COLORS.white;
  ctx.font = font(700, paramPx(config.headerUsernameFontSize, 48, 20, 74));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const username = config.username || "username";
  ctx.fillText(username, nameX, nameY);
  if (config.verified) {
    const nameWidth = ctx.measureText(username).width;
    drawVerifiedBadge(ctx, nameX + nameWidth + 22, nameY - 14, 36);
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(400, paramPx(config.headerSubtitleFontSize, 32, 14, 56));
  ctx.fillText(
    config.subtitle || "Ativo(a) agora",
    nameX,
    yMid + 36
  );

  // Right icons strip (smile+, phone, video) — drawn from the supplied JPEG.
  if (headerIconsImage && headerIconsImage.complete) {
    const targetH = paramPx(config.headerIconsHeight, 147, 40, 220);
    const aspect =
      (headerIconsImage.naturalWidth || headerIconsImage.width) /
      (headerIconsImage.naturalHeight || headerIconsImage.height || 1);
    const targetW = targetH * aspect;
    const rightEdge =
      CANVAS_W - paramPx(config.headerIconsRightMargin, 58, 0, 240);
    const xLeft = rightEdge - targetW;
    const yTop = yMid - targetH / 2;
    ctx.drawImage(headerIconsImage, xLeft, yTop, targetW, targetH);
  }

  // Subtle 1px divider between the header and the chat area.
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, y0 + headerH - 1, CANVAS_W, 1);
}

// ============================================================
// Profile card (between header and first message)
// ============================================================

interface ProfileCardStyle {
  offsetY: number;
  topPadding: number;
  avatarRadius: number;
  displayNameGap: number;
  displayNameFontSize: number;
  usernameGap: number;
  usernameFontSize: number;
  statsGap: number;
  statsFontSize: number;
  infoLineHeight: number;
  infoFontSize: number;
  buttonGap: number;
  buttonHeight: number;
  buttonRadius: number;
  buttonPaddingX: number;
  buttonFontSize: number;
  messageGap: number;
}

function profileCardStyle(config: ConversationConfig): ProfileCardStyle {
  return {
    offsetY: paramPx(config.profileCardOffsetY, 90, -240, 240),
    topPadding: paramPx(config.profileCardTopPaddingPx, 34, 0, 220),
    avatarRadius: paramPx(config.profileCardAvatarRadius, 120, 40, 220),
    displayNameGap: paramPx(config.profileCardDisplayNameGapPx, 86, 0, 180),
    displayNameFontSize: paramPx(
      config.profileCardDisplayNameFontSize,
      68,
      24,
      110
    ),
    usernameGap: paramPx(config.profileCardUsernameGapPx, 72, 0, 160),
    usernameFontSize: paramPx(config.profileCardUsernameFontSize, 42, 18, 80),
    statsGap: paramPx(config.profileCardStatsGapPx, 72, 0, 160),
    statsFontSize: paramPx(config.profileCardStatsFontSize, 40, 16, 78),
    infoLineHeight: paramPx(config.profileCardInfoLineHeightPx, 64, 20, 130),
    infoFontSize: paramPx(config.profileCardInfoFontSize, 38, 14, 74),
    buttonGap: paramPx(config.profileCardButtonGapPx, 64, 0, 180),
    buttonHeight: paramPx(config.profileCardButtonHeightPx, 96, 40, 180),
    buttonRadius: paramPx(config.profileCardButtonRadiusPx, 22, 0, 90),
    buttonPaddingX: paramPx(config.profileCardButtonPaddingX, 60, 10, 180),
    buttonFontSize: paramPx(config.profileCardButtonFontSize, 40, 16, 78),
    messageGap: paramPx(config.profileCardMessageGapPx, 50, 0, 220),
  };
}

/**
 * Returns the total pixel height of the profile card given the current config.
 * This MUST match the layout in `drawProfileCard` so callers can pre-compute
 * the card's vertical position.
 */
function measureProfileCard(config: ConversationConfig): number {
  const hasStats = !!(config.profileFollowers || config.profilePosts);
  const showUsername = config.profileShowUsername ?? true;
  const followInfo = config.profileFollowInfo ?? [];
  const style = profileCardStyle(config);
  return (
    style.topPadding +
    style.avatarRadius * 2 +
    style.displayNameGap +
    (showUsername ? style.usernameGap : 0) +
    (hasStats ? style.statsGap : 0) +
    followInfo.length * style.infoLineHeight +
    style.buttonGap +
    style.buttonHeight
  );
}

/**
 * Renders the Instagram profile card that sits between the header and the
 * first message: large centered avatar, display name, username, follower /
 * post counts, mutual-follow info lines, and a "Ver perfil" pill button.
 *
 * Returns the bottom Y of the card (so callers can position content below).
 */
function drawProfileCard(
  ctx: CanvasRenderingContext2D,
  config: ConversationConfig,
  avatarImage: HTMLImageElement | null,
  topY: number
): number {
  const cx = CANVAS_W / 2;
  const style = profileCardStyle(config);
  const avatarR = style.avatarRadius;
  const fallbackInitial = (
    config.profileDisplayName ||
    config.username ||
    "?"
  ).charAt(0);

  // ---- Avatar ----
  const avatarCy = topY + style.topPadding + avatarR;
  drawAvatar(ctx, cx, avatarCy, avatarR, avatarImage, fallbackInitial, {
    storyRing: config.hasStory,
  });
  let y = avatarCy + avatarR;

  // ---- Display name ----
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(700, style.displayNameFontSize);
  y += style.displayNameGap;
  ctx.fillText(
    config.profileDisplayName || config.username,
    cx,
    y
  );

  // ---- Username ----
  if (config.profileShowUsername ?? true) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(400, style.usernameFontSize);
    y += style.usernameGap;
    ctx.fillText(config.username, cx, y);
  }

  // ---- Stats ("818 seguidores · 3 posts") ----
  // NB: each text block sets BOTH `fillStyle` and `font` explicitly so the
  // stats/info rendering doesn't depend on whether the username block above
  // ran (otherwise hiding the username would leak the white bold display-name
  // style into the lines below).
  const followers = config.profileFollowers ?? "";
  const posts = config.profilePosts ?? "";
  if (followers || posts) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(400, style.statsFontSize);
    y += style.statsGap;
    let stats = "";
    if (followers) stats = `${followers} seguidores`;
    if (posts) stats += (stats ? " · " : "") + `${posts} posts`;
    ctx.fillText(stats, cx, y);
  }

  // ---- Follow info (multi-line) ----
  const followInfo = config.profileFollowInfo ?? [];
  if (followInfo.length > 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(400, style.infoFontSize);
    for (const line of followInfo) {
      y += style.infoLineHeight;
      ctx.fillText(line, cx, y);
    }
  }

  // ---- "Ver perfil" pill button ----
  const btnLabel = config.profileButtonLabel || "Ver perfil";
  const btnH = style.buttonHeight;
  ctx.font = font(600, style.buttonFontSize);
  const labelW = ctx.measureText(btnLabel).width;
  const btnW = labelW + style.buttonPaddingX * 2;
  const btnX = cx - btnW / 2;
  y += style.buttonGap;
  const btnY = y;

  ctx.beginPath();
  roundedRect(ctx, btnX, btnY, btnW, btnH, style.buttonRadius);
  ctx.fillStyle = "#262626";
  ctx.fill();

  ctx.fillStyle = COLORS.white;
  ctx.font = font(600, style.buttonFontSize);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(btnLabel, cx, btnY + btnH / 2 + 2);

  return btnY + btnH;
}

// ============================================================
// Input bar (bottom)
// ============================================================

interface InputBarOpts {
  /** Y of the top edge of the bar. If omitted, the bar sits at its default
   *  resting position above the home indicator. */
  topY?: number;
  /** Characters the user has typed so far. When non-empty, this replaces the
   *  placeholder, the icons are hidden, and a send button appears. */
  typedText?: string;
  /** 0→1 send button pulse (intensity decays from 1 to 0 right after send). */
  sendPulse?: number;
  /** 0-1 zoom pulse when pasted text lands in the input. */
  pasteCommitPulse?: number;
  /** Whether to render the dark "Aa" / blinking caret look (when typing). */
  typingActive?: boolean;
  /** Pre-rendered strip of right-side icons (mic/photo/sticker/+). */
  iconsImage?: HTMLImageElement | null;
  /** Transparent camera glyph drawn inside the pill on the left. */
  cameraIconImage?: HTMLImageElement | null;
  /** Transparent search (magnifying glass) glyph that REPLACES the camera
   *  glyph on the left while the keyboard is open / typing is active. */
  searchIconImage?: HTMLImageElement | null;
  /** Transparent send arrow drawn inside the pill on the right while typing. */
  sendIconImage?: HTMLImageElement | null;
  cameraSize?: number;
  iconsHeight?: number;
  height?: number;
  sidePadding?: number;
  borderRadius?: number;
  textFontSize?: number;
  sendIconHeight?: number;
  iconsRightInset?: number;
}

const INPUT_BAR_HEIGHT = 128;
const INPUT_TEXT_FONT_SIZE = IG_DM_TEXT_SIZE;
const INPUT_CARET_HEIGHT = INPUT_TEXT_FONT_SIZE + 10;
const DEFAULT_INPUT_CAMERA_SIZE = 98;
const DEFAULT_INPUT_ICONS_HEIGHT = 102;
/** Horizontal padding for the input-bar pill — slightly tighter than the
 *  global `SIDE_PADDING` so the pill reads as a bit wider. */
const INPUT_BAR_SIDE_PADDING = 32;
/** Small breathing gap left between the input-bar pill and the keyboard's
 *  top edge when the keyboard is fully open (so they aren't flush). */
const INPUT_BAR_KEYBOARD_GAP = 22;

/** Returns the default top Y of the input bar (no keyboard open). */
function defaultInputBarTopY(barHeight: number = INPUT_BAR_HEIGHT, liftPx: number = 0): number {
  return (
    CANVAS_H -
    INPUT_BAR_AREA_HEIGHT +
    (INPUT_BAR_AREA_HEIGHT - barHeight) / 2 -
    30 -
    liftPx
  );
}

function drawInputBar(
  ctx: CanvasRenderingContext2D,
  opts: InputBarOpts = {}
) {
  const barHeight = opts.height ?? INPUT_BAR_HEIGHT;
  const y = opts.topY ?? defaultInputBarTopY(barHeight);
  const text = opts.typedText ?? "";
  const hasText = text.length > 0 || !!opts.typingActive;
  const textFontSize = opts.textFontSize ?? INPUT_TEXT_FONT_SIZE;
  const caretHeight = textFontSize + 10;
  const pillH = barHeight;
  const yMid = y + pillH / 2;

  // The pill spans the full row, with the camera glyph living INSIDE it on
  // the left and the icon strip / send glyph on the right.
  const pillX = opts.sidePadding ?? INPUT_BAR_SIDE_PADDING;
  const pillW = CANVAS_W - pillX * 2;
  ctx.beginPath();
  roundedRect(ctx, pillX, y, pillW, pillH, opts.borderRadius ?? pillH / 2);
  ctx.fillStyle = COLORS.inputPill;
  ctx.fill();
  ctx.strokeStyle = COLORS.inputPillBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // ---- Left glyph (camera by default; magnifying glass while typing) ----
  const camSize = opts.cameraSize ?? DEFAULT_INPUT_CAMERA_SIZE;
  const camCx = pillX + 11 + camSize / 2;
  const leftGlyph =
    hasText && opts.searchIconImage && opts.searchIconImage.complete
      ? opts.searchIconImage
      : opts.cameraIconImage && opts.cameraIconImage.complete
      ? opts.cameraIconImage
      : null;
  if (leftGlyph) {
    const aspect =
      (leftGlyph.naturalWidth || leftGlyph.width) /
      (leftGlyph.naturalHeight || leftGlyph.height || 1);
    const w = camSize * aspect;
    const h = camSize;
    ctx.drawImage(leftGlyph, camCx - w / 2, yMid - h / 2, w, h);
  }
  const textStartX = camCx + camSize / 2 + 18;

  // ---- Right side: icon strip OR send glyph ----
  let textEndX = pillX + pillW - 26;
  if (hasText && opts.sendIconImage && opts.sendIconImage.complete) {
    const img = opts.sendIconImage;
    const targetH = opts.sendIconHeight ?? 130;
    const aspect =
      (img.naturalWidth || img.width) /
      (img.naturalHeight || img.height || 1);
    const targetW = targetH * aspect;
    const pulse = opts.sendPulse ?? 0;
    const scale = 1 + 0.18 * pulse;
    const cx = pillX + pillW - 12 - targetW / 2;
    ctx.save();
    ctx.translate(cx, yMid);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
    textEndX = cx - targetW / 2 - 16;
  } else if (!hasText && opts.iconsImage && opts.iconsImage.complete) {
    const img = opts.iconsImage;
    const targetH = opts.iconsHeight ?? DEFAULT_INPUT_ICONS_HEIGHT;
    const aspect =
      (img.naturalWidth || img.width) /
      (img.naturalHeight || img.height || 1);
    const targetW = targetH * aspect;
    const rightEdge = pillX + pillW - (opts.iconsRightInset ?? 28);
    const xLeft = rightEdge - targetW;
    const yTop = yMid - targetH / 2;
    ctx.drawImage(img, xLeft, yTop, targetW, targetH);
    textEndX = xLeft - 16;
  }

  // ---- Text / placeholder / caret ----
  ctx.font = font(IG_DM_TEXT_WEIGHT, textFontSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const maxTextW = textEndX - textStartX;
  if (hasText) {
    ctx.fillStyle = COLORS.white;
    const visibleText = truncateLeftToFit(ctx, text, maxTextW);
    const textPulse = opts.pasteCommitPulse ?? 0;
    const textScale = 1 + textPulse * 0.055;
    ctx.save();
    ctx.translate(textStartX, yMid + 2);
    ctx.scale(textScale, textScale);
    ctx.fillText(visibleText, 0, 0);
    ctx.restore();
    const caretX =
      textStartX + ctx.measureText(visibleText).width * textScale + 4;
    const caretBlink = Math.floor(performance.now() / 500) % 2 === 0;
    if (caretBlink || opts.sendPulse) {
      ctx.fillStyle = "#4585FF";
      ctx.fillRect(
        caretX,
        yMid - caretHeight / 2,
        3,
        caretHeight
      );
    }
  } else {
    ctx.fillStyle = "#7E7E7E";
    ctx.fillText("Mensagem...", textStartX, yMid + 2);
  }
}

function drawPasteMenu(
  ctx: CanvasRenderingContext2D,
  opts: {
    inputTopY: number;
    sidePadding: number;
    progress: number;
  }
) {
  const p = clamp(opts.progress, 0, 1);
  if (p <= 0) return;
  const eased = easeOutCubic(p);
  const w = 206;
  const h = 78;
  const pointerW = 34;
  const pointerH = 18;
  const inputTextX = opts.sidePadding + 160;
  const x = clamp(inputTextX - w / 2, 28, CANVAS_W - w - 28);
  const y = opts.inputTopY - h - pointerH - 26;
  const radius = 24;
  const cx = x + w / 2;
  const pointerY = y + h - 1;
  ctx.save();
  ctx.globalAlpha = clamp(p * 1.15, 0, 1);
  ctx.translate(cx, y + h / 2);
  ctx.scale(0.94 + eased * 0.06, 0.94 + eased * 0.06);
  ctx.translate(-cx, -(y + h / 2));

  ctx.shadowColor = "rgba(0,0,0,0.34)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = "#242426";
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.beginPath();
  ctx.moveTo(cx - pointerW / 2, pointerY);
  ctx.quadraticCurveTo(cx - 8, pointerY + 2, cx - 2, pointerY + pointerH - 3);
  ctx.quadraticCurveTo(cx, pointerY + pointerH, cx + 2, pointerY + pointerH - 3);
  ctx.quadraticCurveTo(cx + 8, pointerY + 2, cx + pointerW / 2, pointerY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  roundedRect(ctx, x, y, w, h, radius);
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = font(650, 35);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Colar", cx, y + h / 2 + 1);
  ctx.restore();
}

/**
 * Truncates `text` from the LEFT until it fits within `maxWidth`. This mimics
 * the auto-scroll behavior of iOS single-line text inputs where the latest
 * typed characters are always visible while older ones scroll off-screen.
 */
function truncateLeftToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let start = 0;
  while (start < text.length) {
    const sliced = text.slice(start);
    if (ctx.measureText(sliced).width <= maxWidth) return sliced;
    start++;
  }
  return "";
}

/**
 * iOS-style home indicator (white pill at bottom of screen).
 */
function drawHomeIndicator(ctx: CanvasRenderingContext2D) {
  const w = 280;
  const h = 8;
  const x = (CANVAS_W - w) / 2;
  const y = CANVAS_H - 28;
  ctx.fillStyle = COLORS.white;
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
}

// ============================================================
// Typing indicator
// ============================================================

function drawTypingBubble(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  t: number,
  scale: number
) {
  const bubbleW = TYPING_BUBBLE_BASE_W * scale;
  const bubbleH = TYPING_BUBBLE_BASE_H * scale;
  const radius = bubbleH / 2;
  const left = anchorX;
  const top = anchorY - bubbleH;

  ctx.save();
  // Bubble background
  ctx.fillStyle = COLORS.bubbleRecv;
  roundedRect(ctx, left, top, bubbleW, bubbleH, radius);
  ctx.fill();

  // Three dots
  const cycle = 1200;
  const dotR = 9 * scale;
  const dotSpacing = 32 * scale;
  const groupW = dotSpacing * 2;
  const cx0 = left + bubbleW / 2 - groupW / 2;
  const cy = top + bubbleH / 2;

  for (let i = 0; i < 3; i++) {
    const phase = (((t + i * 200) % cycle) / cycle) * Math.PI * 2;
    const bounce = Math.max(0, Math.sin(phase));
    const dr = dotR * (0.85 + 0.35 * bounce);
    ctx.globalAlpha = 0.55 + 0.45 * bounce;
    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.arc(cx0 + i * dotSpacing, cy, dr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ============================================================
// iOS keyboard (dark mode)
// ============================================================

/** Total height (in canvas pixels) of the keyboard when fully open. Picked
 *  to preserve the aspect ratio of `teclado.png` (1179 × 991 ≈ 1.190). */
export const KEYBOARD_HEIGHT = 908;

// ---------- Key layout (fractions of the keyboard image) ----------
// Measured from teclado.png (1179 × 991).
const KB_ROW_Y_FRAC = [0.2341, 0.3956, 0.5570, 0.7185]; // rows 1–4 y centers
const KB_KEY_W_FRAC = 0.078; // letter key width
const KB_KEY_H_FRAC = 0.123; // letter key height
const KB_KEY_SPACING_FRAC = 0.0969; // distance between adjacent letter centers

// X of the FIRST letter center per row (q, a, z).
const KB_ROW1_FIRST_X_FRAC = 0.0636; // q
const KB_ROW2_FIRST_X_FRAC = 0.112; // a
const KB_ROW3_FIRST_X_FRAC = 0.2086; // z

// Spacebar geometry (row 4).
const KB_SPACE_CX_FRAC = 0.4877;
const KB_SPACE_W_FRAC = 0.5174;
const KB_SPACE_H_FRAC = 0.116;

const KB_ROW1 = "qwertyuiop";
const KB_ROW2 = "asdfghjkl";
const KB_ROW3 = "zxcvbnm";

interface KeyRectFrac {
  cxFrac: number;
  cyFrac: number;
  wFrac: number;
  hFrac: number;
}

/**
 * Returns the position (in fractions of the keyboard image's width/height)
 * of the given character's key, or null if the character isn't on the
 * lowercase QWERTY layout.
 */
function getKeyRectFrac(char: string): KeyRectFrac | null {
  const lc = normalizeKeyboardChar(char);
  if (lc === " ") {
    return {
      cxFrac: KB_SPACE_CX_FRAC,
      cyFrac: KB_ROW_Y_FRAC[3],
      wFrac: KB_SPACE_W_FRAC,
      hFrac: KB_SPACE_H_FRAC,
    };
  }
  let row = -1;
  let col = -1;
  if (KB_ROW1.includes(lc)) {
    row = 0;
    col = KB_ROW1.indexOf(lc);
  } else if (KB_ROW2.includes(lc)) {
    row = 1;
    col = KB_ROW2.indexOf(lc);
  } else if (KB_ROW3.includes(lc)) {
    row = 2;
    col = KB_ROW3.indexOf(lc);
  }
  if (row < 0) return null;
  const firstX =
    row === 0
      ? KB_ROW1_FIRST_X_FRAC
      : row === 1
      ? KB_ROW2_FIRST_X_FRAC
      : KB_ROW3_FIRST_X_FRAC;
  return {
    cxFrac: firstX + col * KB_KEY_SPACING_FRAC,
    cyFrac: KB_ROW_Y_FRAC[row],
    wFrac: KB_KEY_W_FRAC,
    hFrac: KB_KEY_H_FRAC,
  };
}

function normalizeKeyboardChar(char: string): string {
  if (char === "\n" || char === "\t") return " ";
  return char
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface KeyboardOpts {
  /** Y of the top edge of the keyboard. */
  topY: number;
  /** Lowercase character of the just-pressed key, or null. */
  highlightedKey: string | null;
  /** The pre-rendered keyboard image. If null, falls back to a flat dark fill. */
  image: HTMLImageElement | null;
}

/**
 * Draws the iOS portrait keyboard. The base layer is the supplied screenshot
 * (`teclado.png`), and a balloon-shaped popover is overlaid on whichever key
 * was most recently "pressed" — matching the look of `g.jpeg`.
 */
function drawKeyboard(ctx: CanvasRenderingContext2D, opts: KeyboardOpts) {
  const { topY, highlightedKey, image } = opts;

  if (image && image.complete) {
    ctx.drawImage(image, 0, topY, CANVAS_W, KEYBOARD_HEIGHT);
  } else {
    // Fallback while the image is still loading: solid dark fill so the
    // keyboard area doesn't show through to the chat below.
    ctx.fillStyle = "#1A1A1A";
    ctx.fillRect(0, topY, CANVAS_W, KEYBOARD_HEIGHT);
  }

  // Overlay the iOS-style key-press popover on the active key.
  if (highlightedKey) {
    const normalizedKey = normalizeKeyboardChar(highlightedKey);
    const rect = getKeyRectFrac(normalizedKey);
    if (rect) {
      const kcx = rect.cxFrac * CANVAS_W;
      const kcy = topY + rect.cyFrac * KEYBOARD_HEIGHT;
      const kw = rect.wFrac * CANVAS_W;
      const kh = rect.hFrac * KEYBOARD_HEIGHT;
      if (normalizedKey === " ") {
        drawSpacebarPress(ctx, kcx, kcy, kw, kh);
      } else {
        drawKeyPopover(ctx, kcx, kcy, kw, kh, normalizedKey);
      }
    }
  }
}

function drawSpacebarPress(
  ctx: CanvasRenderingContext2D,
  kcx: number,
  kcy: number,
  kw: number,
  kh: number
) {
  ctx.save();
  roundedRect(ctx, kcx - kw / 2, kcy - kh / 2, kw, kh, kh * 0.24);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fill();
  ctx.restore();
}

/**
 * Draws the iOS "balloon" popover anchored to a key. The popover is a single
 * filled path that flares from the key's stem up into a wider rounded
 * rectangle on top, with the enlarged character drawn inside.
 */
function drawKeyPopover(
  ctx: CanvasRenderingContext2D,
  kcx: number,
  kcy: number,
  kw: number,
  kh: number,
  char: string
) {
  // Popover (top wide portion) dimensions relative to the key.
  const popW = kw * 1.7;
  const popH = kh * 1.05;
  const transitionGap = kh * 0.3;
  const popTop = kcy - kh / 2 - transitionGap - popH;
  const popBot = popTop + popH;
  const keyTop = kcy - kh / 2;
  const keyBot = kcy + kh / 2;
  const popR = popH * 0.28;
  const keyR = kh * 0.18;
  const flare = transitionGap * 0.5;

  ctx.save();
  ctx.fillStyle = "rgba(220, 220, 220, 0.32)";

  const path = new Path2D();
  path.moveTo(kcx - popW / 2, popTop + popR);
  // top-left rounded corner
  path.quadraticCurveTo(
    kcx - popW / 2,
    popTop,
    kcx - popW / 2 + popR,
    popTop
  );
  // top edge
  path.lineTo(kcx + popW / 2 - popR, popTop);
  // top-right rounded corner
  path.quadraticCurveTo(
    kcx + popW / 2,
    popTop,
    kcx + popW / 2,
    popTop + popR
  );
  // right side of top
  path.lineTo(kcx + popW / 2, popBot - 6);
  // smooth taper (popover-right → key-right)
  path.bezierCurveTo(
    kcx + popW / 2,
    popBot + flare,
    kcx + kw / 2 + 8,
    keyTop - flare,
    kcx + kw / 2,
    keyTop
  );
  // right side of key
  path.lineTo(kcx + kw / 2, keyBot - keyR);
  // bottom-right rounded corner
  path.quadraticCurveTo(
    kcx + kw / 2,
    keyBot,
    kcx + kw / 2 - keyR,
    keyBot
  );
  // bottom edge
  path.lineTo(kcx - kw / 2 + keyR, keyBot);
  // bottom-left rounded corner
  path.quadraticCurveTo(
    kcx - kw / 2,
    keyBot,
    kcx - kw / 2,
    keyBot - keyR
  );
  // left side of key
  path.lineTo(kcx - kw / 2, keyTop);
  // smooth taper (key-left → popover-left)
  path.bezierCurveTo(
    kcx - kw / 2 - 8,
    keyTop - flare,
    kcx - popW / 2,
    popBot + flare,
    kcx - popW / 2,
    popBot - 6
  );
  // left side of top
  path.lineTo(kcx - popW / 2, popTop + popR);
  path.closePath();

  ctx.fill(path);

  // Enlarged letter inside the popover top.
  if (char !== " ") {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = font(500, popH * 0.62);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, kcx, (popTop + popBot) / 2 + 4);
  }
  ctx.restore();
}

// ============================================================
// Main draw frame
// ============================================================

export interface DrawContext {
  config: ConversationConfig;
  timings: PhaseTimings;
  avatarImage: HTMLImageElement | null;
  /** Pre-rendered strip of the top-right header icons (smile+, phone, video). */
  headerIconsImage: HTMLImageElement | null;
  /** Pre-rendered strip of the input-bar icons (mic, photo, sticker, plus). */
  inputIconsImage: HTMLImageElement | null;
  /** Transparent camera glyph drawn inside the input pill on the left. */
  cameraIconImage: HTMLImageElement | null;
  /** Transparent search (magnifying glass) glyph that replaces the camera
   *  glyph while typing / the keyboard is open. */
  searchIconImage: HTMLImageElement | null;
  /** Transparent send arrow drawn inside the input pill while typing. */
  sendIconImage: HTMLImageElement | null;
  /** Pre-rendered iOS QWERTY keyboard background. */
  keyboardImage: HTMLImageElement | null;
  /** Pre-rendered status-bar right-side icons (signal, wifi, battery). */
  wifiImage: HTMLImageElement | null;
  /** Screenshots used by the call-to-action browser flow. */
  ctaImages?: {
    google: HTMLImageElement | null;
    busca: HTMLImageElement | null;
    areaLogada: HTMLImageElement | null;
    fotoEnviada: HTMLImageElement | null;
  };
  /** Per-message story-reply images, keyed by `Message.id`. */
  storyImages: Map<string, HTMLImageElement> | null;
  /** Meme videos in `/public/memes`, keyed by filename. */
  memeVideos?: Map<string, HTMLVideoElement> | null;
  /** Offscreen canvas used to cache the "print" snapshot of the Direct
   *  during the Chamada-de-ação scene. When omitted, the snapshot is
   *  rebuilt on the fly each frame (slower but still correct). */
  snapshotCanvas?: HTMLCanvasElement | null;
}

// ---- Story-reply attachment (above-bubble label + image) ----
// Source images are drawn with cover-fit cropping inside this tuned frame.
const STORY_IMAGE_WIDTH = 264;
const STORY_IMAGE_HEIGHT = 466;
const STORY_IMAGE_RADIUS = 52;
/** Horizontal inset that pulls the thumbnail away from the screen edge so
 *  it sits a bit more to the left (matches IG's actual layout). */
const STORY_IMAGE_SIDE_INSET = 24;
const STORY_LABEL_FONT_SIZE = 39;
const STORY_LABEL_HEIGHT = 40;
const STORY_LABEL_IMAGE_GAP = 9;
const STORY_IMAGE_BUBBLE_GAP = 12;

// ---- Top-of-chat timestamp (only when first message has a storyReply) ----
const CHAT_TIMESTAMP_FONT_SIZE = 40;
const CHAT_TIMESTAMP_HEIGHT = 36;
/** Gap between the timestamp baseline and the story-reply label below it. */
const CHAT_TIMESTAMP_BOTTOM_GAP = 50;

interface StoryStyle {
  imageWidth: number;
  imageHeight: number;
  imageRadius: number;
  sideInset: number;
  labelFontSize: number;
  labelHeight: number;
  labelImageGap: number;
  imageBubbleGap: number;
  timestampFontSize: number;
  timestampHeight: number;
  timestampBottomGap: number;
}

interface StoryReplyLayout {
  label: string;
  /** Anchor X for the label text (right-edge for sent, left-edge for received). */
  labelX: number;
  /** Top Y of the label text (with `textBaseline = "top"`). */
  labelY: number;
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
}

/** Per-message layout slot. */
interface BubbleSlot {
  msg: Message;
  measure: BubbleMeasure;
  position: GroupPosition;
  /** Bubble's left edge (X). */
  left: number;
  /** Bubble's top edge (Y). */
  top: number;
  /** Bubble's bottom (Y). Used for stacking. */
  bottom: number;
  /** Text and radius style used by this bubble. */
  bubbleStyle: BubbleStyle;
  /** Avatar center Y for received messages. */
  avatarCy: number;
  /** Avatar geometry and received bubble anchor for this layout. */
  avatarX: number;
  avatarR: number;
  recvBubbleStartX: number;
  /** Layout for the optional story-reply prefix above the bubble. */
  storyReply: StoryReplyLayout | null;
  /** Total height of everything above the bubble (label + image + gap, plus
   *  the optional top-of-chat timestamp). 0 if neither is present. */
  prefixHeight: number;
  /** Optional centered timestamp drawn ABOVE the story-reply prefix.
   *  Only set on the topmost slot (i === 0) when the first message has a
   *  storyReply and the conversation has a `chatTimestamp`. */
  topTimestamp: { text: string; y: number } | null;
}

const MSG_GAP_SAME = 8;
const MSG_GAP_DIFF = 28;
const RECV_AVATAR_R = 44;
const RECV_AVATAR_X = SIDE_PADDING + RECV_AVATAR_R;
const RECV_BUBBLE_START_X = SIDE_PADDING + RECV_AVATAR_R * 2 + 28;
const DEFAULT_MESSAGES_BOTTOM_GAP = 36;
const SEEN_RECEIPT_TEXT = "Visto agora pouco";
const SEEN_RECEIPT_DURATION_MS = 650;
const SEEN_RECEIPT_FONT_SIZE = 34;
const SEEN_RECEIPT_GAP = 8;
/** Horizontal nudge pulling the receipt slightly left of the bubble edge. */
const SEEN_RECEIPT_RIGHT_INSET = 18;
const FOCUS_ZOOM_HOLD_MS = 520;
const FOCUS_ZOOM_DEFAULT_SCALE = 1.55;
const FOCUS_ZOOM_DEFAULT_DELAY_MS = 0;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function paramPx(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  return clamp(Number.isFinite(value) ? value! : fallback, min, max);
}

function paramNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  return clamp(Number.isFinite(value) ? value! : fallback, min, max);
}

function statusBarHeight(_config: ConversationConfig): number {
  return STATUS_BAR_HEIGHT;
}

function headerHeight(config: ConversationConfig): number {
  return paramPx(config.headerHeightPx, HEADER_HEIGHT, 120, 260);
}

function topChromeHeight(config: ConversationConfig): number {
  return statusBarHeight(config) + headerHeight(config);
}

function inputCameraSize(config: ConversationConfig): number {
  return paramPx(config.inputCameraSize, DEFAULT_INPUT_CAMERA_SIZE, 40, 180);
}

function inputIconsHeight(config: ConversationConfig): number {
  return paramPx(config.inputIconsHeight, DEFAULT_INPUT_ICONS_HEIGHT, 30, 180);
}

function inputBarHeight(config: ConversationConfig): number {
  return paramPx(config.inputBarHeight, INPUT_BAR_HEIGHT, 72, 190);
}

function inputBarLift(config: ConversationConfig): number {
  return paramPx(config.inputBarLiftPx, 54, -160, 260);
}

function inputSidePadding(config: ConversationConfig): number {
  return paramPx(config.inputSidePaddingPx, INPUT_BAR_SIDE_PADDING, 0, 160);
}

function inputBorderRadius(config: ConversationConfig, barHeight: number): number {
  return paramPx(config.inputBorderRadiusPx, 89, 0, 140);
}

function inputTextFontSize(config: ConversationConfig): number {
  return paramPx(config.inputTextFontSize, IG_DM_TEXT_SIZE, 24, 80);
}

function inputSendIconHeight(config: ConversationConfig): number {
  return paramPx(config.inputSendIconHeight, 130, 60, 220);
}

function inputIconsRightInset(config: ConversationConfig): number {
  return paramPx(config.inputIconsRightInset, 28, 0, 160);
}

function chatSidePadding(config: ConversationConfig): number {
  return paramPx(config.chatSidePaddingPx, SIDE_PADDING, 0, 180);
}

function receivedAvatarRadius(config: ConversationConfig): number {
  return paramPx(config.receivedAvatarRadius, RECV_AVATAR_R, 16, 90);
}

function receivedBubbleGap(config: ConversationConfig): number {
  return paramPx(config.receivedBubbleGapPx, 28, 0, 90);
}

function bubbleStyle(config: ConversationConfig): BubbleStyle {
  const fontSize = paramPx(config.messageFontSize, DEFAULT_BUBBLE_FONT_SIZE, 18, 86);
  const lineHeightMultiplier = paramNumber(
    config.messageLineHeightMultiplier,
    DEFAULT_BUBBLE_LINE_HEIGHT_MULTIPLIER,
    0.9,
    1.8
  );
  return {
    paddingX: paramPx(
    config.messageBubblePaddingX,
    DEFAULT_BUBBLE_PADDING_X,
      10,
      260
    ),
    paddingY: paramPx(
      config.messageBubblePaddingY,
      DEFAULT_BUBBLE_PADDING_Y,
      8,
      120
    ),
    fontSize,
    lineHeight: fontSize * lineHeightMultiplier,
    radiusFull: paramPx(
      config.messageBubbleRadius,
      DEFAULT_BUBBLE_R_FULL,
      0,
      100
    ),
    radiusGrouped: paramPx(
      config.messageBubbleGroupedRadius,
      DEFAULT_BUBBLE_R_SMALL,
      0,
      80
    ),
  };
}

function maxBubbleWidth(config: ConversationConfig): number {
  return CANVAS_W * (paramNumber(config.messageMaxWidthPercent, 74, 35, 95) / 100);
}

function messagesBottomGap(config: ConversationConfig): number {
  return paramPx(config.messagesBottomGapPx, DEFAULT_MESSAGES_BOTTOM_GAP, 0, 240);
}

function storyStyle(config: ConversationConfig): StoryStyle {
  const labelFontSize = paramPx(
    config.storyLabelFontSize,
    STORY_LABEL_FONT_SIZE,
    14,
    64
  );
  const timestampFontSize = paramPx(
    config.chatTimestampFontSize,
    CHAT_TIMESTAMP_FONT_SIZE,
    12,
    60
  );
  return {
    imageWidth: paramPx(config.storyImageWidth, STORY_IMAGE_WIDTH, 120, 620),
    imageHeight: paramPx(
      config.storyImageHeight,
      STORY_IMAGE_HEIGHT,
      160,
      980
    ),
    imageRadius: paramPx(config.storyImageRadius, STORY_IMAGE_RADIUS, 0, 120),
    sideInset: paramPx(config.storyImageSideInset, STORY_IMAGE_SIDE_INSET, -120, 160),
    labelFontSize,
    labelHeight: Math.max(STORY_LABEL_HEIGHT, labelFontSize + 8),
    labelImageGap: paramPx(
      config.storyLabelImageGap,
      STORY_LABEL_IMAGE_GAP,
      0,
      80
    ),
    imageBubbleGap: paramPx(
      config.storyImageBubbleGap,
      STORY_IMAGE_BUBBLE_GAP,
      0,
      80
    ),
    timestampFontSize,
    timestampHeight: Math.max(CHAT_TIMESTAMP_HEIGHT, timestampFontSize + 8),
    timestampBottomGap: paramPx(
      config.chatTimestampGapPx,
      CHAT_TIMESTAMP_BOTTOM_GAP,
      0,
      120
    ),
  };
}

interface FocusZoomRun {
  indices: number[];
  firstIndex: number;
  lastIndex: number;
  startMs: number;
  holdUntilMs: number;
  endMs: number;
}

interface FocusZoomTransform {
  amount: number;
  messageIndex: number;
  targetScale: number;
  targetX: number;
  targetY: number;
  offsetX: number;
  offsetY: number;
}

function messageWantsFocusZoom(message: Message): boolean {
  return message.focusZoomOnMessage === true;
}

function messageFocusZoomScale(message: Message): number {
  return clamp(message.focusZoomScale ?? FOCUS_ZOOM_DEFAULT_SCALE, 1.05, 2.25);
}

function messageFocusZoomDelayMs(message: Message): number {
  return paramPx(
    message.focusZoomDelayMs,
    FOCUS_ZOOM_DEFAULT_DELAY_MS,
    0,
    10000
  );
}

function messageFocusZoomHoldMs(message: Message): number {
  return paramPx(message.focusZoomHoldMs, FOCUS_ZOOM_HOLD_MS, 80, 10000);
}

function messageFocusZoomOffsetX(message: Message): number {
  return paramPx(message.focusZoomOffsetX, 0, -CANVAS_W, CANVAS_W);
}

function messageFocusZoomOffsetY(message: Message): number {
  return paramPx(message.focusZoomOffsetY, 0, -CANVAS_H, CANVAS_H);
}

function messageFocusZoomStartMs(
  message: Message,
  event: PhaseTimings["events"][number]
): number {
  return event.appearStartMs + messageFocusZoomDelayMs(message);
}

function focusSlotCenter(slot: BubbleSlot): { x: number; y: number } {
  let left = slot.left;
  let top = slot.top;
  let right = slot.left + slot.measure.width;
  let bottom = slot.bottom;

  if (slot.storyReply) {
    left = Math.min(left, slot.storyReply.imageLeft);
    top = Math.min(top, slot.storyReply.labelY);
    right = Math.max(
      right,
      slot.storyReply.imageLeft + slot.storyReply.imageWidth
    );
    bottom = Math.max(
      bottom,
      slot.storyReply.imageTop + slot.storyReply.imageHeight
    );
  }

  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
  };
}

function buildFocusZoomRuns(
  messages: Message[],
  timings: PhaseTimings
): FocusZoomRun[] {
  const runs: FocusZoomRun[] = [];
  let current: FocusZoomRun | null = null;

  for (let i = 0; i < messages.length; i++) {
    const event = timings.events[i];
    if (!event || !messageWantsFocusZoom(messages[i])) {
      current = null;
      continue;
    }
    const zoomStartMs = messageFocusZoomStartMs(messages[i], event);
    const holdUntilMs = zoomStartMs + messageFocusZoomHoldMs(messages[i]);

    const joinsCurrent =
      current !== null &&
      current.lastIndex === i - 1 &&
      messages[i - 1]?.side === messages[i].side;

    if (!joinsCurrent) {
      current = {
        indices: [],
        firstIndex: i,
        lastIndex: i,
        startMs: zoomStartMs,
        holdUntilMs,
        endMs: holdUntilMs,
      };
      runs.push(current);
    }

    if (!current) continue;
    current.indices.push(i);
    current.lastIndex = i;
    current.holdUntilMs = Math.max(current.holdUntilMs, holdUntilMs);
    current.endMs = current.holdUntilMs;
  }

  return runs;
}

function focusZoomRunAmount(timeMs: number, run: FocusZoomRun): number {
  if (timeMs < run.startMs) return 0;
  if (timeMs >= run.endMs) return 0;
  return 1;
}

function activeFocusZoomTransform(
  timeMs: number,
  messages: Message[],
  timings: PhaseTimings,
  layout: BubbleSlot[]
): FocusZoomTransform | null {
  let active: FocusZoomTransform | null = null;

  for (const run of buildFocusZoomRuns(messages, timings)) {
    const amount = focusZoomRunAmount(timeMs, run);
    if (amount <= 0) continue;

    let activeIndex = run.firstIndex;
    for (let i = 0; i < run.indices.length; i++) {
      const index = run.indices[i];
      const event = timings.events[index];
      const message = messages[index];
      if (event && message && timeMs >= messageFocusZoomStartMs(message, event)) {
        activeIndex = index;
      }
    }

    const activeSlot = layout[activeIndex];
    const activeMessage = messages[activeIndex];
    if (!activeSlot || !activeMessage) continue;

    const activeCenter = focusSlotCenter(activeSlot);

    active = {
      amount,
      messageIndex: activeIndex,
      targetScale: messageFocusZoomScale(activeMessage),
      targetX: activeCenter.x,
      targetY: activeCenter.y,
      offsetX: messageFocusZoomOffsetX(activeMessage),
      offsetY: messageFocusZoomOffsetY(activeMessage),
    };
  }

  return active;
}

/**
 * Computes the layout of all messages. The LAST message anchors at
 * `messagesBottom` and the rest stack upward. When a message carries a
 * `storyReply`, the slot reserves vertical space above the bubble for the
 * label + thumbnail.
 */
function layoutMessages(
  ctx: CanvasRenderingContext2D,
  messages: Message[],
  maxBubbleWidth: number,
  messagesBottom: number,
  storyImages: Map<string, HTMLImageElement> | null,
  chatTimestamp: string | null = null,
  frameMessages: MessageFrameState[] | null = null,
  styles: {
    bubble: BubbleStyle;
    story: StoryStyle;
    chatSidePadding: number;
    recvAvatarR: number;
    recvBubbleGap: number;
  }
): BubbleSlot[] {
  const slots: BubbleSlot[] = new Array(messages.length);
  const recvBubbleStartX =
    styles.chatSidePadding + styles.recvAvatarR * 2 + styles.recvBubbleGap;
  let cursor = messagesBottom;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const isTypingSlot =
      frameMessages?.[i]?.state === "typing" && m.side === "received";
    const measure = isTypingSlot
      ? measureTypingBubble()
      : measureBubble(ctx, m.text, maxBubbleWidth, styles.bubble);
    const position = getGroupPosition(messages, i);
    const bottom = cursor;
    const top = bottom - measure.height;
    const left =
      m.side === "sent"
        ? CANVAS_W - styles.chatSidePadding - measure.width
        : recvBubbleStartX;

    // ---- Story-reply prefix ----
    // The thumbnail frame is ALWAYS 9:16, regardless of source image aspect.
    // Source images are cover-fit-cropped to fill the frame in `drawStoryReply`.
    let storyReply: StoryReplyLayout | null = null;
    let prefixHeight = 0;
    if (m.storyReply) {
      // Shift the thumbnail a bit leftward from the bubble's outer edge so
      // it doesn't sit flush against the screen edge (sent) / avatar (received).
      const imageLeft =
        m.side === "sent"
          ? CANVAS_W -
            styles.chatSidePadding -
            styles.story.imageWidth -
            styles.story.sideInset
          : recvBubbleStartX - styles.story.sideInset;
      const imageTop =
        top - styles.story.imageBubbleGap - styles.story.imageHeight;
      const labelY =
        imageTop - styles.story.labelImageGap - styles.story.labelHeight;
      const labelX =
        m.side === "sent" ? imageLeft + styles.story.imageWidth : imageLeft;
      const defaultLabel =
        m.side === "sent"
          ? "Você respondeu ao story"
          : "respondeu ao seu story";
      storyReply = {
        label: m.storyReply.label || defaultLabel,
        labelX,
        labelY,
        imageLeft,
        imageTop,
        imageWidth: styles.story.imageWidth,
        imageHeight: styles.story.imageHeight,
      };
      prefixHeight =
        styles.story.labelHeight +
        styles.story.labelImageGap +
        styles.story.imageHeight +
        styles.story.imageBubbleGap;
    }

    // ---- Top-of-chat timestamp (only on the FIRST message, when it has a
    //      story reply and a `chatTimestamp` was provided). ----
    let topTimestamp: { text: string; y: number } | null = null;
    if (i === 0 && m.storyReply && chatTimestamp) {
      // The story prefix (label + image + gap) sits at `top - prefixHeight`,
      // and the timestamp sits above it with a small gap.
      const stackTop = top - prefixHeight;
      const timestampY =
        stackTop - styles.story.timestampBottomGap - styles.story.timestampHeight;
      topTimestamp = { text: chatTimestamp, y: timestampY };
      // Reserve the timestamp's vertical block in `prefixHeight` so the
      // profile-card layout (which uses `top - prefixHeight`) accounts for it.
      prefixHeight +=
        styles.story.timestampHeight + styles.story.timestampBottomGap;
    }

    slots[i] = {
      msg: m,
      measure,
      position,
      left,
      top,
      bottom,
      bubbleStyle: styles.bubble,
      avatarCy: bottom - styles.recvAvatarR,
      avatarX: styles.chatSidePadding + styles.recvAvatarR,
      avatarR: styles.recvAvatarR,
      recvBubbleStartX,
      storyReply,
      prefixHeight,
      topTimestamp,
    };
    if (i > 0) {
      const sameSender = messages[i - 1].side === m.side;
      const gap = sameSender ? MSG_GAP_SAME : MSG_GAP_DIFF;
      // Stack above the WHOLE slot block (story prefix + bubble), not just the bubble.
      const slotTop = top - prefixHeight;
      cursor = slotTop - gap;
    }
  }
  return slots;
}

function renderBubbleSlot(
  ctx: CanvasRenderingContext2D,
  slot: BubbleSlot,
  avatarImage: HTMLImageElement | null,
  fallbackInitial: string,
  storyImages: Map<string, HTMLImageElement> | null,
  storyStyle: StoryStyle,
  yOffset: number = 0,
  alpha: number = 1,
  /** Optional bubble-only scale around its center. Used by "edited" mode
   *  to pop received bubbles in with an overshoot. */
  bubbleScale: number = 1,
  options: {
    showAvatar?: boolean;
    showTopTimestamp?: boolean;
  } = {}
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const showAvatar = options.showAvatar ?? true;
  const showTopTimestamp = options.showTopTimestamp ?? true;
  if (showAvatar && slot.msg.side === "received") {
    drawAvatar(
      ctx,
      slot.avatarX,
      slot.avatarCy + yOffset,
      slot.avatarR,
      avatarImage,
      fallbackInitial
    );
  }
  if (showTopTimestamp) {
    drawSlotTopTimestamp(ctx, slot, yOffset, storyStyle);
  }
  if (slot.storyReply) {
    drawStoryReply(ctx, slot.storyReply, slot.msg, storyImages, yOffset, storyStyle);
  }

  const bubbleArgs: DrawBubbleArgs = {
    text: slot.msg.text,
    lines: slot.measure.lines,
    left: slot.left,
    top: slot.top + yOffset,
    width: slot.measure.width,
    height: slot.measure.height,
    radii: getBubbleRadii(
      slot.msg.side,
      slot.position,
      slot.bubbleStyle.radiusFull,
      slot.bubbleStyle.radiusGrouped
    ),
    side: slot.msg.side,
    paddingX: slot.bubbleStyle.paddingX,
    paddingY: slot.bubbleStyle.paddingY,
    fontSize: slot.bubbleStyle.fontSize,
    lineHeight: slot.bubbleStyle.lineHeight,
  };

  if (bubbleScale !== 1) {
    // Pivot around the side of the bubble that's anchored to the screen edge
    // so the zoom grows OUTWARD into the chat instead of clipping under the
    // avatar / screen edge. Received bubbles pivot from their left edge
    // (next to the avatar), sent bubbles pivot from their right edge.
    const pivotX =
      slot.msg.side === "received"
        ? bubbleArgs.left
        : bubbleArgs.left + bubbleArgs.width;
    const pivotY = bubbleArgs.top + bubbleArgs.height / 2;
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.scale(bubbleScale, bubbleScale);
    ctx.translate(-pivotX, -pivotY);
    drawBubble(ctx, bubbleArgs);
    ctx.restore();
  } else {
    drawBubble(ctx, bubbleArgs);
  }

  ctx.restore();
}

function renderFocusedBubbleSlot(
  ctx: CanvasRenderingContext2D,
  slot: BubbleSlot,
  state: MessageFrameState,
  shiftEase: number,
  isNewest: boolean,
  totalActive: number,
  avatarImage: HTMLImageElement | null,
  fallbackInitial: string,
  storyImages: Map<string, HTMLImageElement> | null,
  storyStyle: StoryStyle
) {
  if (state.state === "hidden" || state.state === "typing") return;

  const sliding = state.state === "appearing" || state.state === "crossfade";
  const appearP = sliding ? easeOutCubic(state.appearProgress) : 1;
  const useReceivedZoom = slot.msg.side === "received";
  const yOffset = sliding && !useReceivedZoom ? (1 - appearP) * 50 : 0;
  let bubbleAlpha = sliding ? appearP : 1;
  let bubbleScale = 1;

  if (useReceivedZoom) {
    bubbleScale = sliding ? easeOutBack(state.appearProgress) : 1;
    if (sliding) bubbleAlpha = Math.min(1, state.appearProgress * 2.2);
  }

  if (isNewest && totalActive > 1 && slot.msg.side === "sent" && sliding) {
    bubbleAlpha *= shiftEase;
  }

  renderBubbleSlot(
    ctx,
    slot,
    avatarImage,
    fallbackInitial,
    storyImages,
    storyStyle,
    yOffset,
    bubbleAlpha,
    bubbleScale,
    { showAvatar: false, showTopTimestamp: false }
  );
}

/**
 * Draws the story-reply attachment that sits above a bubble: a small grey
 * label and a rounded vertical thumbnail of the story being replied to.
 */
function drawStoryReply(
  ctx: CanvasRenderingContext2D,
  layout: StoryReplyLayout,
  msg: Message,
  storyImages: Map<string, HTMLImageElement> | null,
  yOffset: number,
  style: StoryStyle
) {
  // ---- Label ----
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(400, style.labelFontSize);
  ctx.textBaseline = "top";
  ctx.textAlign = msg.side === "sent" ? "right" : "left";
  ctx.fillText(layout.label, layout.labelX, layout.labelY + yOffset);

  // ---- Image (cover-fit, rounded, with subtle outline) ----
  const img = storyImages?.get(msg.id) ?? null;
  ctx.save();
  ctx.beginPath();
  roundedRect(
    ctx,
    layout.imageLeft,
    layout.imageTop + yOffset,
    layout.imageWidth,
    layout.imageHeight,
    style.imageRadius
  );
  ctx.clip();
  if (img && img.complete && img.naturalWidth > 0) {
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const rectAspect = layout.imageWidth / layout.imageHeight;
    let dw: number;
    let dh: number;
    let dx: number;
    let dy: number;
    if (imgAspect > rectAspect) {
      // Source is wider — match height, crop sides.
      dh = layout.imageHeight;
      dw = dh * imgAspect;
      dx = layout.imageLeft - (dw - layout.imageWidth) / 2;
      dy = layout.imageTop + yOffset;
    } else {
      // Source is taller — match width, crop top/bottom.
      dw = layout.imageWidth;
      dh = dw / imgAspect;
      dx = layout.imageLeft;
      dy = layout.imageTop + yOffset - (dh - layout.imageHeight) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    // Placeholder while the image loads (or when none is set).
    ctx.fillStyle = "#2c2c2e";
    ctx.fillRect(
      layout.imageLeft,
      layout.imageTop + yOffset,
      layout.imageWidth,
      layout.imageHeight
    );
  }
  ctx.restore();
}

interface ActiveMemeOverlay {
  mode: "fullscreen" | "overlay";
  file: string;
  key: string;
  elapsedMs: number;
  opacity: number;
  offsetY?: number;
  rect?: { x: number; y: number; w: number; h: number };
}

function activeMemeOverlay(
  timeMs: number,
  config: ConversationConfig,
  timings: PhaseTimings
): ActiveMemeOverlay | null {
  if (!config.editedMode) return null;
  for (const event of timings.events) {
    const msg = config.messages[event.index];
    if (
      event.memeOverlayStartMs !== undefined &&
      event.memeOverlayEndMs !== undefined &&
      timeMs >= event.memeOverlayStartMs &&
      timeMs < event.memeOverlayEndMs &&
      msg?.memeOverlay?.file
    ) {
      const cfg = msg.memeOverlay;
      return {
        mode: "overlay",
        file: cfg.file,
        key: `${event.index}:overlay:${cfg.file}:${event.memeOverlayStartMs}`,
        elapsedMs: timeMs - event.memeOverlayStartMs,
        opacity: clamp(cfg.opacity ?? 0.45, 0.05, 1),
        rect: {
          x: cfg.x ?? 120,
          y: cfg.y ?? 520,
          w: cfg.width ?? 840,
          h: cfg.height ?? 480,
        },
      };
    }
    if (
      event.memeStartMs !== undefined &&
      event.memeEndMs !== undefined &&
      timeMs >= event.memeStartMs &&
      timeMs < event.memeEndMs &&
      msg?.memeAfter?.file
    ) {
      return {
        mode: "fullscreen",
        file: msg.memeAfter.file,
        key: `${event.index}:fullscreen:${msg.memeAfter.file}:${event.memeStartMs}`,
        elapsedMs: timeMs - event.memeStartMs,
        opacity: 1,
        offsetY: msg.memeAfter.offsetY,
      };
    }
  }
  return null;
}

interface SeenReceiptState {
  /** Slot index the receipt is attached to (the sent message above the
   *  upcoming received-typing). -1 when no receipt is showing. */
  index: number;
  /** 0..1 visibility. Eased fade-in at the start of the window and
   *  fade-out at the end so the bubble shift is smooth. */
  progress: number;
}

const SEEN_RECEIPT_FADE_MS = 160;

function seenReceiptState(
  timeMs: number,
  config: ConversationConfig,
  timings: PhaseTimings,
  activeCount: number
): SeenReceiptState {
  const messages = config.messages;
  for (let i = 1; i < timings.events.length; i++) {
    const event = timings.events[i];
    const prevEvent = timings.events[i - 1];
    const prev = messages[i - 1];
    const next = messages[i];
    if (!prev || !next) continue;
    if (prev.side !== "sent" || next.side !== "received") continue;
    if (event.typingStartMs < 0) continue;
    if (activeCount !== i) continue;

    const startMs = Math.max(
      prevEvent?.appearEndMs ?? 0,
      event.typingStartMs - SEEN_RECEIPT_DURATION_MS
    );
    const endMs = event.typingStartMs;
    if (timeMs >= startMs && timeMs < endMs) {
      const fadeIn = clamp((timeMs - startMs) / SEEN_RECEIPT_FADE_MS, 0, 1);
      const fadeOut = clamp((endMs - timeMs) / SEEN_RECEIPT_FADE_MS, 0, 1);
      const progress = easeOutCubic(Math.min(fadeIn, fadeOut));
      return { index: i - 1, progress };
    }
  }
  return { index: -1, progress: 0 };
}

function deactivateMemeVideos(memeVideos: Map<string, HTMLVideoElement> | null | undefined) {
  if (!memeVideos) return;
  for (const video of memeVideos.values()) {
    if (video.dataset.memeVisible !== "true") continue;
    video.dataset.memeVisible = "false";
    video.dataset.memeActiveKey = "";
    video.pause();
    if (video.readyState > 0) {
      try {
        video.currentTime = 0;
      } catch {
        /* ignore unsupported seek states */
      }
    }
  }
}

const MEME_VIDEO_HARD_RESYNC_SECONDS = 1.5;

function syncMemeVideo(video: HTMLVideoElement, active: ActiveMemeOverlay) {
  const duration =
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : 3;
  const safeDuration = Math.max(0.1, duration - 0.04);
  const targetTime = Math.min(active.elapsedMs / 1000, safeDuration);
  const isNewActivation = video.dataset.memeActiveKey !== active.key;
  video.loop = false;
  video.playbackRate = 1;

  if (isNewActivation) {
    video.dataset.memeActiveKey = active.key;
    video.dataset.memeVisible = "true";
    if (video.readyState > 0) {
      try {
        video.currentTime = targetTime < 0.2 ? 0 : targetTime;
      } catch {
        /* ignore unsupported seek states */
      }
    }
  } else if (
    video.readyState > 0 &&
    !video.seeking &&
    Math.abs(video.currentTime - targetTime) > MEME_VIDEO_HARD_RESYNC_SECONDS
  ) {
    try {
      video.currentTime = targetTime;
    } catch {
      /* ignore unsupported seek states */
    }
  }
  if (video.paused) {
    void video.play().catch(() => {
      /* muted autoplay may still be blocked in unusual browsers */
    });
  }
}

function drawMemeOverlay(
  ctx: CanvasRenderingContext2D,
  active: ActiveMemeOverlay,
  memeVideos: Map<string, HTMLVideoElement> | null | undefined
) {
  const video = memeVideos?.get(active.file) ?? null;
  ctx.save();
  if (active.mode === "fullscreen") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  if (video && video.readyState >= 2) {
    syncMemeVideo(video, active);
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const target =
      active.mode === "overlay" && active.rect
        ? active.rect
        : { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
    const scale =
      active.mode === "overlay"
        ? Math.min(target.w / vw, target.h / vh)
        : Math.max(target.w / vw, target.h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = target.x + (target.w - dw) / 2;
    const dy = target.y + (target.h - dh) / 2 + (active.offsetY ?? 0);
    ctx.globalAlpha *= active.opacity;
    ctx.drawImage(video, dx, dy, dw, dh);
  }

  ctx.restore();
}

/**
 * Renders one frame of the full conversation animation.
 *
 * The animation reveals every message in order. For each message we:
 *   1. Activate its layout slot — older messages slide up to make room
 *      (interpolated between the previous and current layouts).
 *   2. Show a typing indicator (only for received messages) that fades in.
 *   3. Cross-fade the typing indicator into the bubble while the bubble
 *      slides in from below.
 *   4. Hold the bubble in its final position.
 *
 * For non-first SENT messages the third phase is replaced by a full iOS
 * keyboard simulation: keyboard slides up, the message text is typed live in
 * the input bar, the send button pulses, then the bubble appears in the chat.
 *
 * When a message carries a `callToActionAfter`, the entire "Chamada de ação"
 * scene plays between this message and the next one (print → Safari →
 * puxeassunto.com → suggested response → back to Direct).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  drawCtx: DrawContext
) {
  const cta = activeCallToAction(timeMs, drawCtx.config, drawCtx.timings);
  if (cta) {
    drawCallToActionScene(ctx, timeMs, cta, drawCtx);
    return;
  }
  drawDirectFrame(ctx, timeMs, drawCtx);
}

/**
 * Renders the regular Instagram Direct scene at a given time. Splits out
 * from `drawFrame` so the call-to-action scene can render the underlying
 * Direct at its frozen `triggerMs` without triggering a recursive CTA.
 */
function drawDirectFrame(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  drawCtx: DrawContext
) {
  const {
    config,
    timings,
    avatarImage,
    headerIconsImage,
    inputIconsImage,
    cameraIconImage,
    searchIconImage,
    sendIconImage,
    keyboardImage,
    wifiImage,
    storyImages,
    memeVideos,
  } = drawCtx;

  const showTopChrome = config.showHeader;
  const hiddenBorderPx =
    config.hiddenTopChromeBorderPx ?? topChromeHeight(config) / 2;
  const hiddenChromeInsetY = showTopChrome
    ? 0
    : Math.max(0, Math.min(hiddenBorderPx, CANVAS_H / 2 - 1));

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  if (!showTopChrome) {
    ctx.beginPath();
    ctx.rect(
      0,
      hiddenChromeInsetY,
      CANVAS_W,
      CANVAS_H - hiddenChromeInsetY * 2
    );
    ctx.clip();
    ctx.translate(0, -hiddenChromeInsetY);
  }

  const messages = config.messages;
  const messageTexts = messages.map((m) => m.text);
  const fs = frameStateAt(timeMs, timings, messageTexts);

  // ---------- Keyboard offset & input bar position ----------
  // When the keyboard is (partially) open, the chat content and input bar
  // shift upward by the visible portion of the keyboard.
  const kb = fs.keyboard;
  const keyboardEase = kb ? easeOutCubic(kb.openProgress) : 0;
  const activeInputBarHeight = inputBarHeight(config);
  const activeInputBarLift = inputBarLift(config);
  const activeInputCameraSize = inputCameraSize(config);
  const activeInputIconsHeight = inputIconsHeight(config);
  const activeInputSidePadding = inputSidePadding(config);
  const activeInputBorderRadius = inputBorderRadius(config, activeInputBarHeight);
  const activeInputTextFontSize = inputTextFontSize(config);
  const activeInputSendIconHeight = inputSendIconHeight(config);
  const activeInputIconsRightInset = inputIconsRightInset(config);
  const keyboardYOffset = keyboardEase * KEYBOARD_HEIGHT;
  const keyboardTopY = CANVAS_H - keyboardYOffset;
  // The input bar lerps between its default (closed) position and a position
  // where its BOTTOM is flush with the keyboard's top — eliminating the gap
  // between the typing pill and the keyboard once the keyboard is fully open.
  const closedInputBarTopY = defaultInputBarTopY(
    activeInputBarHeight,
    activeInputBarLift
  );
  const flushInputBarTopY =
    keyboardTopY - activeInputBarHeight - INPUT_BAR_KEYBOARD_GAP;
  const inputBarTopY =
    closedInputBarTopY +
    (flushInputBarTopY - closedInputBarTopY) * keyboardEase;

  // ---------- Chat geometry ----------
  // Messages stop just above the input bar pill, with a small breathing gap.
  const messagesBottom = inputBarTopY - messagesBottomGap(config);
  const activeMaxBubbleWidth = maxBubbleWidth(config);
  const fallbackInitial = config.username.charAt(0) || "?";
  const headerBottomY = topChromeHeight(config);
  const activeStoryStyle = storyStyle(config);
  const layoutStyles = {
    bubble: bubbleStyle(config),
    story: activeStoryStyle,
    chatSidePadding: chatSidePadding(config),
    recvAvatarR: receivedAvatarRadius(config),
    recvBubbleGap: receivedBubbleGap(config),
  };

  const k = fs.activeCount;
  // Layout for the current count of active slots (newest at bottom).
  // Computed even when k == 0 so the profile card has a reference point.
  const chatTimestamp = config.chatTimestamp?.trim() || null;
  const currLayout =
    k > 0
      ? layoutMessages(
          ctx,
          messages.slice(0, k),
          activeMaxBubbleWidth,
          messagesBottom,
          storyImages,
          chatTimestamp,
          fs.perMessage,
          layoutStyles
        )
      : [];
  const prevLayout =
    k > 1
      ? layoutMessages(
          ctx,
          messages.slice(0, k - 1),
          activeMaxBubbleWidth,
          messagesBottom,
          storyImages,
          chatTimestamp,
          fs.perMessage,
          layoutStyles
        )
      : [];
  const shiftEase = easeOutCubic(fs.shiftProgress);
  const positionedLayout = currLayout.map((slot, i) => {
    let top = slot.top;
    let bottom = slot.bottom;
    let avatarCy = slot.avatarCy;
    if (i < k - 1 && prevLayout[i]) {
      const prev = prevLayout[i];
      top = prev.top + (slot.top - prev.top) * shiftEase;
      bottom = prev.bottom + (slot.bottom - prev.bottom) * shiftEase;
      avatarCy = prev.avatarCy + (slot.avatarCy - prev.avatarCy) * shiftEase;
    }
    return {
      ...slot,
      top,
      bottom,
      avatarCy,
    };
  });
  const activeMeme = activeMemeOverlay(timeMs, config, timings);
  const seenReceipt = seenReceiptState(timeMs, config, timings, k);
  // While the seen receipt is visible, the entire bubble stack is nudged UP
  // by the receipt's vertical footprint so the text occupies space that
  // belongs to the message — not the gap above the input bar. The shift is
  // eased through `seenReceipt.progress` so the bubble grows/shrinks
  // smoothly as the receipt fades in/out, and the focus-zoom transform
  // (computed below from the same positioned layout) tracks the shifted
  // bubble automatically.
  const seenReceiptShift =
    seenReceipt.index >= 0
      ? (SEEN_RECEIPT_FONT_SIZE + SEEN_RECEIPT_GAP) * seenReceipt.progress
      : 0;
  if (seenReceiptShift > 0) {
    for (let i = 0; i < positionedLayout.length; i++) {
      const slot = positionedLayout[i];
      slot.top -= seenReceiptShift;
      slot.bottom -= seenReceiptShift;
      slot.avatarCy -= seenReceiptShift;
      if (slot.storyReply) {
        slot.storyReply = {
          ...slot.storyReply,
          labelY: slot.storyReply.labelY - seenReceiptShift,
          imageTop: slot.storyReply.imageTop - seenReceiptShift,
        };
      }
      if (slot.topTimestamp) {
        slot.topTimestamp = {
          ...slot.topTimestamp,
          y: slot.topTimestamp.y - seenReceiptShift,
        };
      }
    }
  }

  const focusZoom =
    !activeMeme && config.editedMode && k > 0
      ? activeFocusZoomTransform(timeMs, messages, timings, positionedLayout)
      : null;
  if (focusZoom) {
    const scale = 1 + (focusZoom.targetScale - 1) * focusZoom.amount;
    ctx.translate(
      CANVAS_W / 2 + focusZoom.offsetX * focusZoom.amount,
      CANVAS_H / 2 + focusZoom.offsetY * focusZoom.amount
    );
    ctx.scale(scale, scale);
    ctx.translate(-focusZoom.targetX, -focusZoom.targetY);
  }

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(-CANVAS_W, -CANVAS_H, CANVAS_W * 3, CANVAS_H * 3);

  if (focusZoom) {
    const focusedSlot = positionedLayout[focusZoom.messageIndex];
    const focusedState = fs.perMessage[focusZoom.messageIndex];
    if (focusedSlot && focusedState) {
      renderFocusedBubbleSlot(
        ctx,
        focusedSlot,
        focusedState,
        shiftEase,
        focusZoom.messageIndex === k - 1,
        k,
        avatarImage,
        fallbackInitial,
        storyImages,
        activeStoryStyle
      );
      if (focusedSlot.msg.side === "sent") {
        const receiptAlpha =
          seenReceipt.index === focusZoom.messageIndex
            ? Math.max(seenReceipt.progress, 1)
            : 1;
        drawSeenReceipt(ctx, focusedSlot, receiptAlpha);
      }
    }
    // Seen receipt also belongs to the focused bubble so it tracks the zoom
    // and grows along with the message instead of vanishing during it.
    if (
      seenReceipt.index >= 0 &&
      seenReceipt.index !== focusZoom.messageIndex
    ) {
      const slot = positionedLayout[seenReceipt.index];
      if (slot) drawSeenReceipt(ctx, slot, seenReceipt.progress);
    }
    deactivateMemeVideos(memeVideos);
    ctx.restore();
    return;
  }

  if (showTopChrome) {
    drawStatusBar(ctx, config, wifiImage);
    drawHeader(ctx, config, avatarImage, headerIconsImage);
  }

  // ---------- Profile card (drawn BEFORE messages so it sits behind them) ----------
  // The card behaves like a piece of chat content anchored to the TOP of the
  // message stack: it sits at its natural position below the header until
  // messages need the space, then it gets pushed UP and clipped behind the
  // header — same behavior as iOS Instagram.
  if (config.showProfileCard) {
    const cardHeight = measureProfileCard(config);
    const cardStyle = profileCardStyle(config);
    const cardNaturalTop = headerBottomY + cardStyle.offsetY;
    const cardNaturalBottom = cardNaturalTop + cardHeight;
    // Anchor the card above the WHOLE topmost slot (story prefix + bubble),
    // not just the bubble — otherwise a story image would overlap with it.
    const messageStackTop =
      currLayout.length > 0
        ? currLayout[0].top - currLayout[0].prefixHeight
        : messagesBottom;
    const requiredCardBottom = messageStackTop - cardStyle.messageGap;
    const cardBottomY = Math.min(cardNaturalBottom, requiredCardBottom);
    const cardTopY = cardBottomY - cardHeight;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, headerBottomY, CANVAS_W, CANVAS_H - headerBottomY);
    ctx.clip();
    drawProfileCard(ctx, config, avatarImage, cardTopY);
    ctx.restore();
  }

  if (messages.length === 0 || fs.activeCount === 0) {
    if (kb && kb.openProgress > 0) {
      drawKeyboard(ctx, {
        topY: keyboardTopY,
        highlightedKey: kb.highlightedKey,
        image: keyboardImage,
      });
    }
      drawInputBar(ctx, {
        topY: inputBarTopY,
        iconsImage: inputIconsImage,
        cameraIconImage,
        searchIconImage,
        sendIconImage,
        cameraSize: activeInputCameraSize,
        iconsHeight: activeInputIconsHeight,
        height: activeInputBarHeight,
        sidePadding: activeInputSidePadding,
        borderRadius: activeInputBorderRadius,
        textFontSize: activeInputTextFontSize,
        sendIconHeight: activeInputSendIconHeight,
        iconsRightInset: activeInputIconsRightInset,
      });
    drawHomeIndicator(ctx);
    deactivateMemeVideos(memeVideos);
    ctx.restore();
    return;
  }
  // Clip the message stack to the chat area so anything that scrolls upward
  // (story-reply thumbnails, timestamps, bubbles) gets hidden BEHIND the
  // header instead of overlapping it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, headerBottomY, CANVAS_W, CANVAS_H - headerBottomY);
  ctx.clip();

  for (let i = 0; i < k; i++) {
    const slotPositioned = positionedLayout[i];
    const ms = fs.perMessage[i];
    if (!slotPositioned || ms.state === "hidden") continue;
    const isNewest = i === k - 1;

    if (ms.state === "typing") {
      // Typing indicator only. Tie its alpha to shiftProgress so it isn't
      // visible while older messages are still in their old (overlapping) slot.
      const effectiveAlpha =
        isNewest && k > 1 ? ms.typingAlpha * shiftEase : ms.typingAlpha;
      drawTypingAtSlot(
        ctx,
        slotPositioned,
        timeMs,
        effectiveAlpha,
        avatarImage,
        fallbackInitial,
        activeStoryStyle
      );
      continue;
    }

    // States: crossfade | appearing | visible
    const sliding = ms.state === "appearing" || ms.state === "crossfade";
    const appearP = sliding ? easeOutCubic(ms.appearProgress) : 1;
    const editedMode = !!config.editedMode;
    // In edited mode, received bubbles pop in with an overshoot scale
    // ("zoom") instead of sliding from below. Sent bubbles keep their
    // classic slide-in because it pairs better with the keyboard send tap.
    const useReceivedZoom = editedMode && slotPositioned.msg.side === "received";
    const yOffset =
      sliding && !useReceivedZoom ? (1 - appearP) * 50 : 0;
    let bubbleAlpha = sliding ? appearP : 1;
    let bubbleScale = 1;
    if (useReceivedZoom) {
      // Bubble scale: 0 → ~1.12 → 1.0 with easeOutBack overshoot. The bubble
      // alpha is also accelerated so it's mostly opaque by the time it
      // reaches its overshoot peak.
      bubbleScale = sliding ? easeOutBack(ms.appearProgress) : 1;
      if (sliding) bubbleAlpha = Math.min(1, ms.appearProgress * 2.2);
    }

    // For SENT messages there is no typing pre-phase. The bubble slides in
    // at the same time the older messages shift. Scale alpha by shiftEase so
    // the bubble doesn't pop in over un-shifted messages.
    if (isNewest && k > 1 && slotPositioned.msg.side === "sent" && sliding) {
      bubbleAlpha *= shiftEase;
    }

    // Crossfade: keep the typing indicator visible briefly while the bubble
    // slides in over it.
    if (ms.state === "crossfade" && slotPositioned.msg.side === "received") {
      drawTypingAtSlot(
        ctx,
        slotPositioned,
        timeMs,
        ms.typingAlpha,
        avatarImage,
        fallbackInitial,
        activeStoryStyle
      );
    }

    renderBubbleSlot(
      ctx,
      slotPositioned,
      avatarImage,
      fallbackInitial,
      storyImages,
      activeStoryStyle,
      yOffset,
      bubbleAlpha,
      bubbleScale
    );
  }

  if (seenReceipt.index >= 0) {
    const slot = positionedLayout[seenReceipt.index];
    if (slot) drawSeenReceipt(ctx, slot, seenReceipt.progress);
  }

  ctx.restore();

  // ---------- Keyboard + input bar ----------
  // The keyboard is drawn FIRST (it sits behind the input bar visually) but
  // both ride the same vertical offset. We pull the typed text + send pulse
  // from the keyboard frame state when applicable.
  if (kb && kb.openProgress > 0) {
    drawKeyboard(ctx, {
      topY: keyboardTopY,
      highlightedKey: kb.highlightedKey,
      image: keyboardImage,
    });
  }
  // Input bar enters "typing mode" (focused with caret + send button) as soon
  // as the keyboard is mostly visible, even before any character has been typed.
  let inputOpts: InputBarOpts = {
    topY: inputBarTopY,
    iconsImage: inputIconsImage,
    cameraIconImage,
    searchIconImage,
    sendIconImage,
    cameraSize: activeInputCameraSize,
    iconsHeight: activeInputIconsHeight,
    height: activeInputBarHeight,
    sidePadding: activeInputSidePadding,
    borderRadius: activeInputBorderRadius,
    textFontSize: activeInputTextFontSize,
    sendIconHeight: activeInputSendIconHeight,
    iconsRightInset: activeInputIconsRightInset,
  };
  if (kb && kb.openProgress > 0.5) {
    const idx = kb.activeMessageIndex;
    const fullText = idx >= 0 ? messageTexts[idx] ?? "" : "";
    const visibleText = idx >= 0 ? fullText.slice(0, kb.typedChars) : "";
    inputOpts = {
      topY: inputBarTopY,
      typedText: visibleText,
      sendPulse: kb.sendPulse,
      pasteCommitPulse: kb.pasteCommitPulse,
      typingActive: true,
      iconsImage: inputIconsImage,
      cameraIconImage,
      searchIconImage,
      sendIconImage,
      cameraSize: activeInputCameraSize,
      iconsHeight: activeInputIconsHeight,
      height: activeInputBarHeight,
      sidePadding: activeInputSidePadding,
      borderRadius: activeInputBorderRadius,
      textFontSize: activeInputTextFontSize,
      sendIconHeight: activeInputSendIconHeight,
      iconsRightInset: activeInputIconsRightInset,
    };
  }
  drawInputBar(ctx, inputOpts);
  if (kb?.mode === "paste" && (kb.pasteMenuProgress ?? 0) > 0) {
    drawPasteMenu(ctx, {
      inputTopY: inputBarTopY,
      sidePadding: activeInputSidePadding,
      progress: kb.pasteMenuProgress ?? 0,
    });
  }
  drawHomeIndicator(ctx);
  if (activeMeme) {
    drawMemeOverlay(ctx, activeMeme, memeVideos);
  } else {
    deactivateMemeVideos(memeVideos);
  }
  ctx.restore();
}

/**
 * Draws the typing indicator + receiver avatar at the given slot position.
 * No-op when the slot's message is not received.
 */
function drawTypingAtSlot(
  ctx: CanvasRenderingContext2D,
  slot: BubbleSlot,
  timeMs: number,
  alpha: number,
  avatarImage: HTMLImageElement | null,
  fallbackInitial: string,
  style: StoryStyle
) {
  if (slot.msg.side !== "received" || alpha <= 0) return;
  const scale = 0.7 + 0.3 * alpha;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawAvatar(
    ctx,
    slot.avatarX,
    slot.avatarCy,
    slot.avatarR,
    avatarImage,
    fallbackInitial
  );
  drawSlotTopTimestamp(ctx, slot, 0, style);
  drawTypingBubble(ctx, slot.recvBubbleStartX, slot.bottom, timeMs, scale);
  ctx.restore();
}

function drawSeenReceipt(
  ctx: CanvasRenderingContext2D,
  slot: BubbleSlot,
  alpha: number = 1
) {
  if (slot.msg.side !== "sent") return;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha, 0, 1);
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(400, SEEN_RECEIPT_FONT_SIZE);
  ctx.textBaseline = "top";
  ctx.textAlign = "right";
  ctx.fillText(
    SEEN_RECEIPT_TEXT,
    slot.left + slot.measure.width - SEEN_RECEIPT_RIGHT_INSET,
    slot.bottom + SEEN_RECEIPT_GAP
  );
  ctx.restore();
}

/**
 * Draws the small grey timestamp centered above the topmost slot, when the
 * slot carries one. No-op otherwise. Mirrors the slide-in `yOffset` of the
 * bubble so the timestamp stays visually attached during animations.
 */
function drawSlotTopTimestamp(
  ctx: CanvasRenderingContext2D,
  slot: BubbleSlot,
  yOffset: number,
  style: StoryStyle
) {
  if (!slot.topTimestamp) return;
  ctx.save();
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(400, style.timestampFontSize);
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillText(
    slot.topTimestamp.text,
    CANVAS_W / 2,
    slot.topTimestamp.y + yOffset
  );
  ctx.restore();
}

// ============================================================
// "Chamada de ação" scene
// ============================================================

interface ActiveCallToAction {
  schedule: CallToActionSchedule;
  message: Message;
  /** Next message in the conversation (whose text becomes the suggested
   *  response on the fake site). Null when the marked message is the last. */
  nextMessage: Message | null;
  /** Original `callToActionAfter` config (domain, suggestedResponse, etc.). */
  cfg: NonNullable<Message["callToActionAfter"]>;
}

/**
 * Returns the active CTA at time `t`, if any. A CTA covers the entire
 * window between its flash and its safariClose end.
 */
function activeCallToAction(
  t: number,
  config: ConversationConfig,
  timings: PhaseTimings
): ActiveCallToAction | null {
  if (!config.editedMode) return null;
  for (let i = 0; i < timings.events.length; i++) {
    const ev = timings.events[i];
    const cta = ev.callToAction;
    if (!cta) continue;
    if (t < cta.flashStartMs) continue;
    if (t >= cta.safariCloseEndMs) continue;
    const msg = config.messages[i];
    if (!msg?.callToActionAfter) continue;
    return {
      schedule: cta,
      message: msg,
      nextMessage: config.messages[i + 1] ?? null,
      cfg: msg.callToActionAfter,
    };
  }
  return null;
}

/** 0→1 progress inside the window [start,end]. Clamped. */
function phaseProgress(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp((t - start) / (end - start), 0, 1);
}

// ---------- Snapshot canvas helpers ----------

const SNAPSHOT_TRIGGER_KEY = "ctaSnapshotTriggerMs";

/**
 * Renders the Direct scene at `triggerMs` onto a (cached) offscreen canvas
 * and returns the canvas. The cache key is the trigger time, so the
 * snapshot is only rebuilt when the active CTA changes.
 */
function renderSnapshot(
  triggerMs: number,
  drawCtx: DrawContext
): HTMLCanvasElement | null {
  const target = drawCtx.snapshotCanvas;
  if (!target) return null;
  if (target.width !== CANVAS_W) target.width = CANVAS_W;
  if (target.height !== CANVAS_H) target.height = CANVAS_H;
  const cached = target.dataset[SNAPSHOT_TRIGGER_KEY];
  if (cached === String(triggerMs)) return target;
  const sctx = target.getContext("2d");
  if (!sctx) return null;
  sctx.save();
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  // Render the chat scene at the exact moment the shutter fires. Use the
  // private direct-frame function so we don't recurse into the CTA branch.
  drawDirectFrame(sctx, triggerMs, drawCtx);
  sctx.restore();
  target.dataset[SNAPSHOT_TRIGGER_KEY] = String(triggerMs);
  return target;
}

// ---------- Easing & math ----------

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function imageReady(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return !!img && img.complete && (img.naturalWidth || img.width) > 0;
}

interface ImageFitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function imageFitRect(
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { mode?: "cover" | "contain"; alignY?: "top" | "center" } = {}
): ImageFitRect {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height || 1;
  const mode = opts.mode ?? "contain";
  const scale =
    mode === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = opts.alignY === "top" ? y : y + (h - dh) / 2;
  return { x: dx, y: dy, w: dw, h: dh };
}

function drawImageFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { mode?: "cover" | "contain"; alignY?: "top" | "center" } = {}
) {
  if (!imageReady(img)) return false;
  const rect = imageFitRect(img, x, y, w, h, opts);
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  return true;
}

function sourceRectToCanvas(
  img: HTMLImageElement,
  imageRect: ImageFitRect,
  source: SourceRect
): ImageFitRect {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  return {
    x: imageRect.x + (source.x / iw) * imageRect.w,
    y: imageRect.y + (source.y / ih) * imageRect.h,
    w: (source.w / iw) * imageRect.w,
    h: (source.h / ih) * imageRect.h,
  };
}

function ctaViewport(config: ConversationConfig): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (config.showHeader) {
    return { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
  }
  const hiddenBorderPx =
    config.hiddenTopChromeBorderPx ?? topChromeHeight(config) / 2;
  const y = Math.max(0, Math.min(hiddenBorderPx, CANVAS_H / 2 - 1));
  const h = CANVAS_H - y * 2;
  return { x: 0, y, w: CANVAS_W, h };
}

// ---------- Thumbnail layout ----------

const PRINT_THUMB_MARGIN = 60;
const PRINT_THUMB_WIDTH = 260;
const PRINT_THUMB_RADIUS = 44;
const PRINT_THUMB_BORDER = "rgba(255,255,255,0.85)";

function printThumbHeight(): number {
  return (PRINT_THUMB_WIDTH * CANVAS_H) / CANVAS_W;
}

/** Bottom-left resting position for the print thumbnail. */
function printThumbRestRect(
  viewport: { y: number; h: number } = { y: 0, h: CANVAS_H }
): { x: number; y: number; w: number; h: number } {
  const h = printThumbHeight();
  return {
    x: PRINT_THUMB_MARGIN,
    y: viewport.y + viewport.h - PRINT_THUMB_MARGIN - h,
    w: PRINT_THUMB_WIDTH,
    h,
  };
}

// ---------- Safari chrome ----------

const SAFARI_BG = "#1C1C1E";
const SAFARI_CHROME_BG = "#2C2C2E";
const SAFARI_URL_BAR_BG = "#3A3A3C";
const SAFARI_URL_BAR_TEXT = "#FFFFFF";
const SAFARI_PLACEHOLDER = "#8E8E93";
const SAFARI_TINT = "#0A84FF";

const SAFARI_TOP_BAR_HEIGHT = 178;
const SAFARI_BOTTOM_BAR_HEIGHT = 260;
const SAFARI_URL_BAR_HEIGHT = 110;
const SAFARI_URL_BAR_RADIUS = 30;
const SAFARI_URL_BAR_MARGIN = 36;

function safariTopBarBottomY(): number {
  return STATUS_BAR_HEIGHT + SAFARI_TOP_BAR_HEIGHT;
}

function safariBottomBarTopY(): number {
  return CANVAS_H - SAFARI_BOTTOM_BAR_HEIGHT;
}

/**
 * Draws the Safari top chrome (URL bar + reload + tabs button) plus the
 * bottom toolbar. `urlText` and `caret` control the URL bar contents.
 */
function drawSafariChrome(
  ctx: CanvasRenderingContext2D,
  opts: {
    urlText: string;
    caretVisible: boolean;
    placeholder?: string;
    /** When true, the bar is rendered in the "focused" look (white field). */
    focused?: boolean;
    /** Page-load progress bar (0..1). Hidden when <= 0 or >= 1. */
    loadProgress?: number;
    wifiImage: HTMLImageElement | null;
    statusBarTime?: string;
  }
) {
  const placeholder = opts.placeholder ?? "Pesquisar ou inserir um site";

  // Top chrome background
  ctx.fillStyle = SAFARI_CHROME_BG;
  ctx.fillRect(0, 0, CANVAS_W, safariTopBarBottomY());

  // Status bar (Safari shows it at the top with white text)
  const statusBarTime = opts.statusBarTime || "9:41";
  ctx.save();
  ctx.fillStyle = COLORS.white;
  ctx.font = font(600, 52);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(statusBarTime, 139, 88);
  if (opts.wifiImage && opts.wifiImage.complete) {
    const targetH = 101;
    const aspect =
      (opts.wifiImage.naturalWidth || opts.wifiImage.width) /
      (opts.wifiImage.naturalHeight || opts.wifiImage.height || 1);
    const targetW = targetH * aspect;
    const xLeft = CANVAS_W - 78 - targetW;
    ctx.drawImage(opts.wifiImage, xLeft, 88 - targetH / 2, targetW, targetH);
  }
  ctx.restore();

  // URL bar pill
  const barX = SAFARI_URL_BAR_MARGIN;
  const barY =
    STATUS_BAR_HEIGHT +
    (SAFARI_TOP_BAR_HEIGHT - SAFARI_URL_BAR_HEIGHT) / 2;
  const barW = CANVAS_W - SAFARI_URL_BAR_MARGIN * 2;
  ctx.save();
  roundedRect(ctx, barX, barY, barW, SAFARI_URL_BAR_HEIGHT, SAFARI_URL_BAR_RADIUS);
  ctx.fillStyle = SAFARI_URL_BAR_BG;
  ctx.fill();
  ctx.restore();

  // "aA" icon on left (Safari reader mode), small
  ctx.save();
  ctx.fillStyle = SAFARI_PLACEHOLDER;
  ctx.font = font(500, 38);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("aA", barX + 28, barY + SAFARI_URL_BAR_HEIGHT / 2);
  ctx.restore();

  // URL text (centered or left-aligned when focused)
  ctx.save();
  ctx.font = font(500, 44);
  ctx.textBaseline = "middle";
  const text = opts.urlText;
  const showPlaceholder = text.length === 0;
  const contentY = barY + SAFARI_URL_BAR_HEIGHT / 2 + 2;
  if (opts.focused) {
    ctx.textAlign = "left";
    ctx.fillStyle = showPlaceholder ? SAFARI_PLACEHOLDER : SAFARI_URL_BAR_TEXT;
    const textX = barX + 110;
    const visible = showPlaceholder ? placeholder : text;
    ctx.fillText(visible, textX, contentY);
    if (opts.caretVisible) {
      const w = ctx.measureText(showPlaceholder ? "" : text).width;
      const caretX = textX + (showPlaceholder ? 0 : w) + 4;
      ctx.fillStyle = SAFARI_TINT;
      ctx.fillRect(
        caretX,
        contentY - 28,
        4,
        56
      );
    }
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = showPlaceholder ? SAFARI_PLACEHOLDER : SAFARI_URL_BAR_TEXT;
    const visible = showPlaceholder ? placeholder : text;
    ctx.fillText(visible, CANVAS_W / 2, contentY);
  }
  ctx.restore();

  // Refresh / reload icon on right (subtle)
  ctx.save();
  ctx.strokeStyle = SAFARI_PLACEHOLDER;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const refreshX = barX + barW - 56;
  const refreshY = barY + SAFARI_URL_BAR_HEIGHT / 2;
  ctx.beginPath();
  ctx.arc(refreshX, refreshY, 22, -Math.PI * 0.2, Math.PI * 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(refreshX + 22, refreshY - 22);
  ctx.lineTo(refreshX + 22, refreshY - 6);
  ctx.moveTo(refreshX + 22, refreshY - 22);
  ctx.lineTo(refreshX + 6, refreshY - 22);
  ctx.stroke();
  ctx.restore();

  // Loading progress bar (under the URL bar)
  if (
    typeof opts.loadProgress === "number" &&
    opts.loadProgress > 0 &&
    opts.loadProgress < 1
  ) {
    const p = clamp(opts.loadProgress, 0, 1);
    const lineY = safariTopBarBottomY() - 4;
    ctx.fillStyle = SAFARI_TINT;
    ctx.fillRect(0, lineY, CANVAS_W * p, 4);
  }

  // Bottom toolbar background
  ctx.fillStyle = SAFARI_CHROME_BG;
  ctx.fillRect(0, safariBottomBarTopY(), CANVAS_W, SAFARI_BOTTOM_BAR_HEIGHT);

  // Bottom toolbar icons (back, forward, share, bookmarks, tabs)
  const iconsY = safariBottomBarTopY() + SAFARI_BOTTOM_BAR_HEIGHT / 2 - 30;
  const iconColor = SAFARI_TINT;
  const iconSlots = 5;
  const slotW = CANVAS_W / iconSlots;
  ctx.save();
  ctx.strokeStyle = iconColor;
  ctx.fillStyle = iconColor;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Back chevron
  const cx0 = slotW * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx0 + 12, iconsY - 22);
  ctx.lineTo(cx0 - 12, iconsY);
  ctx.lineTo(cx0 + 12, iconsY + 22);
  ctx.stroke();

  // Forward chevron (dimmer when disabled — keep solid for visual clarity)
  const cx1 = slotW * 1.5;
  ctx.beginPath();
  ctx.moveTo(cx1 - 12, iconsY - 22);
  ctx.lineTo(cx1 + 12, iconsY);
  ctx.lineTo(cx1 - 12, iconsY + 22);
  ctx.stroke();

  // Share (upload arrow into rectangle)
  const cx2 = slotW * 2.5;
  ctx.beginPath();
  ctx.moveTo(cx2, iconsY - 28);
  ctx.lineTo(cx2, iconsY + 10);
  ctx.moveTo(cx2 - 12, iconsY - 16);
  ctx.lineTo(cx2, iconsY - 28);
  ctx.lineTo(cx2 + 12, iconsY - 16);
  ctx.stroke();
  ctx.beginPath();
  roundedRect(ctx, cx2 - 22, iconsY - 4, 44, 32, 6);
  ctx.stroke();

  // Bookmarks (open book)
  const cx3 = slotW * 3.5;
  ctx.beginPath();
  roundedRect(ctx, cx3 - 22, iconsY - 24, 44, 48, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx3, iconsY - 24);
  ctx.lineTo(cx3, iconsY + 24);
  ctx.stroke();

  // Tabs (two stacked rectangles)
  const cx4 = slotW * 4.5;
  ctx.beginPath();
  roundedRect(ctx, cx4 - 22, iconsY - 22, 36, 36, 6);
  ctx.stroke();
  ctx.beginPath();
  roundedRect(ctx, cx4 - 12, iconsY - 14, 36, 36, 6);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws the URL-bar suggestion dropdown that hovers below the chrome
 * while the user is typing in the URL bar. Shows a single highlighted
 * "Go to: <domain>" row that the user is about to tap.
 */
function drawUrlSuggestion(
  ctx: CanvasRenderingContext2D,
  opts: { domain: string; alpha: number }
) {
  if (opts.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  const y = safariTopBarBottomY();
  const rowH = 130;
  ctx.fillStyle = "#1C1C1E";
  ctx.fillRect(0, y, CANVAS_W, rowH * 2);

  // Divider
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, y, CANVAS_W, 2);

  // First row: highlighted suggestion
  ctx.fillStyle = "rgba(10,132,255,0.16)";
  ctx.fillRect(0, y, CANVAS_W, rowH);

  // Icon (globe-ish)
  const iconCx = 90;
  const iconCy = y + rowH / 2;
  ctx.strokeStyle = SAFARI_TINT;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(iconCx, iconCy, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(iconCx - 28, iconCy);
  ctx.lineTo(iconCx + 28, iconCy);
  ctx.moveTo(iconCx, iconCy - 28);
  ctx.lineTo(iconCx, iconCy + 28);
  ctx.stroke();

  // Text
  ctx.fillStyle = COLORS.white;
  ctx.font = font(600, 44);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(opts.domain, 160, iconCy - 4);
  ctx.fillStyle = SAFARI_PLACEHOLDER;
  ctx.font = font(400, 34);
  ctx.fillText("Ir para o site", 160, iconCy + 36);

  // Second row: a faded "Search Google for..."
  const y2 = y + rowH;
  ctx.fillStyle = SAFARI_TINT;
  ctx.lineWidth = 5;
  ctx.beginPath();
  // little magnifying glass
  ctx.arc(iconCx, y2 + rowH / 2 - 6, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(iconCx + 16, y2 + rowH / 2 + 10);
  ctx.lineTo(iconCx + 32, y2 + rowH / 2 + 26);
  ctx.stroke();
  ctx.fillStyle = COLORS.white;
  ctx.font = font(500, 40);
  ctx.fillText(`Pesquisar “${opts.domain}”`, 160, y2 + rowH / 2 - 4);
  ctx.fillStyle = SAFARI_PLACEHOLDER;
  ctx.font = font(400, 32);
  ctx.fillText("Google", 160, y2 + rowH / 2 + 36);

  ctx.restore();
}

// ---------- Google homepage ----------

function drawGooglePage(ctx: CanvasRenderingContext2D) {
  // White page
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(
    0,
    safariTopBarBottomY(),
    CANVAS_W,
    safariBottomBarTopY() - safariTopBarBottomY()
  );

  // Top right "apps" + sign-in avatar (subtle, no need to be exact)
  ctx.save();
  ctx.fillStyle = "#5F6368";
  ctx.font = font(400, 32);
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText("Gmail   Imagens", CANVAS_W - 320, safariTopBarBottomY() + 80);
  ctx.restore();

  // Google logo (multicolor approximation)
  const logoCx = CANVAS_W / 2;
  const logoCy = safariTopBarBottomY() + 580;
  drawGoogleLogo(ctx, logoCx, logoCy, 140);

  // Search bar (rounded, with shadow)
  const sbX = 100;
  const sbY = logoCy + 200;
  const sbW = CANVAS_W - 200;
  const sbH = 120;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  roundedRect(ctx, sbX, sbY, sbW, sbH, sbH / 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#DADCE0";
  ctx.lineWidth = 2;
  roundedRect(ctx, sbX, sbY, sbW, sbH, sbH / 2);
  ctx.stroke();
  ctx.restore();

  // Magnifying glass icon
  ctx.save();
  ctx.strokeStyle = "#9AA0A6";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  const glassCx = sbX + 60;
  const glassCy = sbY + sbH / 2;
  ctx.beginPath();
  ctx.arc(glassCx, glassCy, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(glassCx + 16, glassCy + 16);
  ctx.lineTo(glassCx + 32, glassCy + 32);
  ctx.stroke();
  ctx.restore();

  // Mic icon (right)
  ctx.save();
  const micCx = sbX + sbW - 60;
  const micCy = sbY + sbH / 2;
  ctx.fillStyle = "#4285F4";
  // capsule body
  ctx.beginPath();
  roundedRect(ctx, micCx - 12, micCy - 22, 24, 36, 12);
  ctx.fill();
  ctx.fillStyle = "#34A853";
  ctx.beginPath();
  ctx.arc(micCx - 8, micCy - 22, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#EA4335";
  ctx.beginPath();
  ctx.arc(micCx + 8, micCy - 22, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FBBC05";
  ctx.beginPath();
  ctx.arc(micCx, micCy + 14, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Two buttons under the search bar
  const btnY = sbY + sbH + 60;
  const btnW = 340;
  const btnH = 84;
  const btn1X = (CANVAS_W - btnW * 2 - 40) / 2;
  ctx.fillStyle = "#F8F9FA";
  ctx.strokeStyle = "#F8F9FA";
  roundedRect(ctx, btn1X, btnY, btnW, btnH, 10);
  ctx.fill();
  roundedRect(ctx, btn1X + btnW + 40, btnY, btnW, btnH, 10);
  ctx.fill();
  ctx.fillStyle = "#3C4043";
  ctx.font = font(400, 32);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Pesquisa Google", btn1X + btnW / 2, btnY + btnH / 2);
  ctx.fillText(
    "Estou com sorte",
    btn1X + btnW + 40 + btnW / 2,
    btnY + btnH / 2
  );
}

function drawGoogleLogo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  // "Google" wordmark using brand colors per letter.
  const letters = ["G", "o", "o", "g", "l", "e"];
  const colors = [
    "#4285F4",
    "#EA4335",
    "#FBBC05",
    "#4285F4",
    "#34A853",
    "#EA4335",
  ];
  ctx.save();
  ctx.font = `500 ${size}px ${FONT_STACK}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  // Measure once to center the whole word.
  let totalW = 0;
  const widths: number[] = [];
  for (const letter of letters) {
    const w = ctx.measureText(letter).width;
    widths.push(w);
    totalW += w;
  }
  let x = cx - totalW / 2;
  for (let i = 0; i < letters.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillText(letters[i], x, cy);
    x += widths[i];
  }
  ctx.restore();
}

// ---------- puxeassunto.com fake site ----------

const SITE_BG_TOP = "#0B0B12";
const SITE_BG_BOTTOM = "#1A0F2E";
const SITE_ACCENT = "#A855F7";
const SITE_ACCENT_2 = "#EC4899";
const SITE_CARD_BG = "#15131F";
const SITE_BORDER = "rgba(168,85,247,0.35)";
const SITE_TEXT = "#FFFFFF";
const SITE_TEXT_MUTED = "#8E8AA8";

interface SiteSceneState {
  /** 0 → empty drop zone. 0..1 → print sliding in. 1 → fully docked. */
  printDockProgress: number;
  /** 0 / 1 button highlight after the tap. */
  analyzeClickPulse: number;
  /** "Analisando…" spinner alpha and progress. */
  analyzingAlpha: number;
  analyzingSpinnerT: number;
  /** Response card slide-in 0..1. */
  responseProgress: number;
  /** List scroll 0..1: first 3 options visible, then reveal the 4th. */
  responseScrollProgress: number;
  /** "Copiar resposta" tap pulse. */
  copyPulse: number;
  /** Whether the "Copiado!" toast is visible (after the tap). */
  copied: boolean;
}

function drawPuxeassuntoSite(
  ctx: CanvasRenderingContext2D,
  opts: {
    tagline: string;
    suggestedResponse: string;
    state: SiteSceneState;
    snapshotCanvas: HTMLCanvasElement | null;
  }
) {
  const y0 = safariTopBarBottomY();
  const y1 = safariBottomBarTopY();
  const h = y1 - y0;

  // Gradient background
  const bg = ctx.createLinearGradient(0, y0, 0, y1);
  bg.addColorStop(0, SITE_BG_TOP);
  bg.addColorStop(1, SITE_BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, y0, CANVAS_W, h);

  // Decorative blobs
  ctx.save();
  const blob1 = ctx.createRadialGradient(
    CANVAS_W * 0.18,
    y0 + 220,
    20,
    CANVAS_W * 0.18,
    y0 + 220,
    540
  );
  blob1.addColorStop(0, "rgba(168,85,247,0.35)");
  blob1.addColorStop(1, "rgba(168,85,247,0)");
  ctx.fillStyle = blob1;
  ctx.fillRect(0, y0, CANVAS_W, h);
  const blob2 = ctx.createRadialGradient(
    CANVAS_W * 0.9,
    y1 - 320,
    20,
    CANVAS_W * 0.9,
    y1 - 320,
    580
  );
  blob2.addColorStop(0, "rgba(236,72,153,0.28)");
  blob2.addColorStop(1, "rgba(236,72,153,0)");
  ctx.fillStyle = blob2;
  ctx.fillRect(0, y0, CANVAS_W, h);
  ctx.restore();

  // Brand header
  const brandCy = y0 + 130;
  ctx.save();
  // Logo mark (gradient circle with a chat bubble glyph)
  const logoR = 64;
  const logoCx = CANVAS_W / 2 - 230;
  const logoGrad = ctx.createLinearGradient(
    logoCx - logoR,
    brandCy - logoR,
    logoCx + logoR,
    brandCy + logoR
  );
  logoGrad.addColorStop(0, SITE_ACCENT);
  logoGrad.addColorStop(1, SITE_ACCENT_2);
  ctx.beginPath();
  ctx.arc(logoCx, brandCy, logoR, 0, Math.PI * 2);
  ctx.fillStyle = logoGrad;
  ctx.fill();
  // chat dots
  ctx.fillStyle = "#FFFFFF";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(logoCx + i * 22, brandCy, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wordmark
  ctx.fillStyle = SITE_TEXT;
  ctx.font = font(800, 70);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("puxeassunto", logoCx + logoR + 24, brandCy);
  ctx.fillStyle = SITE_ACCENT;
  ctx.fillText(
    ".com",
    logoCx + logoR + 24 + ctx.measureText("puxeassunto").width,
    brandCy
  );
  ctx.restore();

  // Tagline
  ctx.save();
  ctx.fillStyle = SITE_TEXT_MUTED;
  ctx.font = font(400, 38);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapTextDraw(ctx, opts.tagline, CANVAS_W / 2, y0 + 240, CANVAS_W - 160, 50);
  ctx.restore();

  // Drop zone (or response card, depending on state)
  const showResponse = opts.state.responseProgress > 0.001;

  // ---- Drop zone ----
  const dropX = 80;
  const dropY = y0 + 350;
  const dropW = CANVAS_W - 160;
  const dropH = 700;
  const dropRadius = 48;

  // The drop zone fades out as the response card fades in.
  const dropAlpha = clamp(1 - opts.state.responseProgress * 1.4, 0, 1);
  if (dropAlpha > 0.001) {
    ctx.save();
    ctx.globalAlpha = dropAlpha;
    // Dashed border
    ctx.strokeStyle = SITE_BORDER;
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 14]);
    roundedRect(ctx, dropX, dropY, dropW, dropH, dropRadius);
    ctx.stroke();
    ctx.setLineDash([]);

    // Subtle inner glow
    const dropGrad = ctx.createLinearGradient(0, dropY, 0, dropY + dropH);
    dropGrad.addColorStop(0, "rgba(168,85,247,0.08)");
    dropGrad.addColorStop(1, "rgba(236,72,153,0.05)");
    ctx.fillStyle = dropGrad;
    roundedRect(ctx, dropX, dropY, dropW, dropH, dropRadius);
    ctx.fill();

    // Print docked inside drop zone — only when nearly there.
    const docked = clamp(opts.state.printDockProgress, 0, 1);
    if (docked < 0.95) {
      // Placeholder content (upload icon + label).
      const cx = dropX + dropW / 2;
      const cy = dropY + dropH / 2;

      // Upload icon
      ctx.save();
      ctx.strokeStyle = SITE_ACCENT;
      ctx.fillStyle = SITE_ACCENT;
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // Arrow up
      ctx.beginPath();
      ctx.moveTo(cx, cy - 100);
      ctx.lineTo(cx, cy - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy - 60);
      ctx.lineTo(cx, cy - 100);
      ctx.lineTo(cx + 40, cy - 60);
      ctx.stroke();
      // Tray
      ctx.beginPath();
      roundedRect(ctx, cx - 90, cy + 8, 180, 60, 14);
      ctx.stroke();
      ctx.restore();

      // Label
      ctx.fillStyle = SITE_TEXT;
      ctx.font = font(600, 42);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Solte o print da conversa", cx, cy + 130);
      ctx.fillStyle = SITE_TEXT_MUTED;
      ctx.font = font(400, 32);
      ctx.fillText("PNG, JPG ou screenshot", cx, cy + 184);
    }

    ctx.restore();
  }

  // ---- "Analisar" button ----
  const btnW = CANVAS_W - 160;
  const btnH = 130;
  const btnX = 80;
  const btnY = dropY + dropH + 60;
  if (!showResponse) {
    const pulse = opts.state.analyzeClickPulse;
    const scale = 1 - 0.05 * pulse;
    ctx.save();
    ctx.translate(CANVAS_W / 2, btnY + btnH / 2);
    ctx.scale(scale, scale);
    ctx.translate(-CANVAS_W / 2, -(btnY + btnH / 2));
    const btnGrad = ctx.createLinearGradient(btnX, 0, btnX + btnW, 0);
    btnGrad.addColorStop(0, SITE_ACCENT);
    btnGrad.addColorStop(1, SITE_ACCENT_2);
    ctx.fillStyle = btnGrad;
    roundedRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();

    // Spinner replaces label during analyzing
    if (opts.state.analyzingAlpha > 0.01) {
      const spinnerAlpha = clamp(opts.state.analyzingAlpha, 0, 1);
      ctx.save();
      ctx.globalAlpha = spinnerAlpha;
      drawSpinner(
        ctx,
        CANVAS_W / 2 - 160,
        btnY + btnH / 2,
        28,
        opts.state.analyzingSpinnerT
      );
      ctx.fillStyle = "#FFFFFF";
      ctx.font = font(700, 48);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "Analisando conversa…",
        CANVAS_W / 2 - 110,
        btnY + btnH / 2
      );
      ctx.restore();
    }
    // Default label fades out as analyzing fades in
    const labelAlpha = clamp(1 - opts.state.analyzingAlpha, 0, 1);
    if (labelAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = labelAlpha;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = font(700, 50);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Analisar conversa", CANVAS_W / 2, btnY + btnH / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- Response card ----
  if (showResponse) {
    drawResponseCard(ctx, {
      x: 80,
      y: dropY + 40,
      w: CANVAS_W - 160,
      h: dropH + btnH + 20,
      revealProgress: opts.state.responseProgress,
      suggestedResponse: opts.state.responseProgress > 0.001
        ? opts.suggestedResponse
        : "",
      copyPulse: opts.state.copyPulse,
      copied: opts.state.copied,
    });
  }
}

function drawSpinner(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  tSec: number
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 7;
  ctx.translate(cx, cy);
  ctx.rotate((tSec * Math.PI * 2) / 0.9);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI * 1.0);
  ctx.stroke();
  ctx.restore();
}

function drawResponseCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    revealProgress: number;
    suggestedResponse: string;
    copyPulse: number;
    copied: boolean;
  }
) {
  const p = easeOutCubic(clamp(opts.revealProgress, 0, 1));
  ctx.save();
  ctx.globalAlpha = p;
  const slideY = (1 - p) * 80;
  const x = opts.x;
  const y = opts.y + slideY;
  const w = opts.w;
  const h = opts.h;

  // Card body
  roundedRect(ctx, x, y, w, h, 56);
  ctx.fillStyle = SITE_CARD_BG;
  ctx.fill();

  // Top gradient border
  ctx.save();
  ctx.lineWidth = 6;
  const borderGrad = ctx.createLinearGradient(x, y, x + w, y);
  borderGrad.addColorStop(0, SITE_ACCENT);
  borderGrad.addColorStop(1, SITE_ACCENT_2);
  ctx.strokeStyle = borderGrad;
  roundedRect(ctx, x, y, w, h, 56);
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.fillStyle = SITE_ACCENT;
  ctx.font = font(700, 36);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("RESPOSTA SUGERIDA", x + 56, y + 56);

  // Suggested response text
  ctx.fillStyle = SITE_TEXT;
  ctx.font = font(500, 56);
  const textTop = y + 130;
  wrapTextDraw(
    ctx,
    `“${opts.suggestedResponse}”`,
    x + 56,
    textTop,
    w - 112,
    78,
    "left"
  );

  // Bottom button: "Copiar resposta"
  const btnH = 130;
  const btnY = y + h - btnH - 56;
  const btnX = x + 56;
  const btnW = w - 112;

  const pulse = opts.copyPulse;
  const scale = 1 - 0.04 * pulse;
  ctx.save();
  ctx.translate(btnX + btnW / 2, btnY + btnH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(btnX + btnW / 2), -(btnY + btnH / 2));

  const btnGrad = ctx.createLinearGradient(btnX, 0, btnX + btnW, 0);
  btnGrad.addColorStop(0, SITE_ACCENT);
  btnGrad.addColorStop(1, SITE_ACCENT_2);
  ctx.fillStyle = btnGrad;
  roundedRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = font(700, 48);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    opts.copied ? "Copiado!" : "Copiar resposta",
    btnX + btnW / 2,
    btnY + btnH / 2
  );
  ctx.restore();

  ctx.restore();
}

function drawCtaGoogleSearch(
  ctx: CanvasRenderingContext2D,
  opts: {
    query: string;
    tapPulse: number;
    viewportHeight: number;
    domain: string;
    googleImage?: HTMLImageElement | null;
    keyboardImage?: HTMLImageElement | null;
    keyboardAlpha?: number;
    keyboardProgress?: number;
    highlightedKey?: string | null;
    introProgress?: number;
    resultsImage?: HTMLImageElement | null;
    resultsProgress?: number;
  }
) {
  const introP = easeOutCubic(clamp(opts.introProgress ?? 1, 0, 1));
  ctx.fillStyle = "#202124";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const googleBase = drawCtaGoogleBase(ctx, opts.googleImage, introP);
  const compact = opts.viewportHeight < 1900;
  const logoY = googleBase ? 210 : compact ? 150 : 210;
  const contentDrift = (1 - introP) * 54;

  const sbX = googleBase ? 49 : 72;
  const sbY = googleBase ? 377 : logoY + (compact ? 150 : 160);
  const sbW = googleBase ? 1082 : CANVAS_W - sbX * 2;
  const sbH = googleBase ? 145 : 118;

  if (!googleBase) {
    ctx.save();
    ctx.globalAlpha = introP;
    ctx.translate(0, contentDrift);
    drawGoogleLogo(ctx, CANVAS_W / 2, logoY, 142);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    roundedRect(ctx, sbX, sbY, sbW, sbH, sbH / 2);
    ctx.fillStyle = "#303134";
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "#5F6368";
    ctx.lineWidth = 2;
    roundedRect(ctx, sbX, sbY, sbW, sbH, sbH / 2);
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = "#BDC1C6";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    const glassCx = sbX + 62;
    const glassCy = sbY + sbH / 2;
    ctx.beginPath();
    ctx.arc(glassCx, glassCy, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(glassCx + 16, glassCy + 16);
    ctx.lineTo(glassCx + 34, glassCy + 34);
    ctx.stroke();
    ctx.restore();
  }

  if (opts.query) {
    const textX = googleBase ? 164 : sbX + 116;
    const textY = googleBase ? 449 : sbY + sbH / 2 + 1;
    const clipW = googleBase ? 535 : sbW - 150;
    ctx.save();
    ctx.beginPath();
    ctx.rect(textX, sbY + 18, clipW, sbH - 36);
    ctx.clip();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = font(500, googleBase ? 43 : 44);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.query, textX, textY);
    ctx.restore();
  }

  const resultsP = easeOutCubic(clamp(opts.resultsProgress ?? 0, 0, 1));
  if (resultsP > 0.001 && imageReady(opts.resultsImage)) {
    const resultsY = googleBase ? 540 : sbY + sbH + (compact ? 34 : 44);
    const availableH = Math.max(220, opts.viewportHeight - resultsY - 44);
    const rect = imageFitRect(opts.resultsImage, 0, resultsY, CANVAS_W, availableH, {
      mode: "contain",
      alignY: "top",
    });
    const revealH = rect.h * resultsP;
    ctx.save();
    ctx.globalAlpha = resultsP;
    ctx.beginPath();
    ctx.rect(0, resultsY - 8, CANVAS_W, revealH + 26);
    ctx.clip();
    ctx.translate(0, (1 - resultsP) * 48);
    ctx.drawImage(opts.resultsImage, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  const keyboardProgress = clamp(
    opts.keyboardProgress ?? opts.keyboardAlpha ?? 0,
    0,
    1
  );
  const keyboardEase = easeOutCubic(keyboardProgress);
  if (keyboardEase > 0.001 && resultsP <= 0.001) {
    ctx.save();
    drawKeyboard(ctx, {
      topY: opts.viewportHeight - KEYBOARD_HEIGHT * keyboardEase,
      highlightedKey: opts.highlightedKey ?? null,
      image: opts.keyboardImage ?? null,
    });
    ctx.restore();
  }

  if (!googleBase) ctx.restore();
}

function drawCtaGoogleBase(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  introP: number
): boolean {
  if (!imageReady(img)) return false;
  const rect = imageFitRect(img, 0, 0, CANVAS_W, CANVAS_W, {
    mode: "cover",
    alignY: "top",
  });
  ctx.save();
  ctx.globalAlpha = introP;
  ctx.translate(0, (1 - introP) * 54);
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  return true;
}

function drawCtaInstructionHeader(
  ctx: CanvasRenderingContext2D,
  domain: string,
  viewport: { y: number },
  progress: number = 1
) {
  const p = easeOutCubic(clamp(progress, 0, 1));
  if (p <= 0.001) return;
  const h = 154;
  const padX = 60;
  const borderGap = 26;
  const boxY = viewport.y > h + borderGap
    ? Math.max(22, viewport.y - h - borderGap)
    : 28;
  const line1 = "Pesquise por";
  const line2 = ctaSearchTitleTarget(domain);
  ctx.save();
  ctx.globalAlpha = p;
  ctx.font = font(800, 44);
  const line1W = ctx.measureText(line1).width;
  ctx.font = font(800, 50);
  const line2W = ctx.measureText(line2).width;
  const w = Math.min(CANVAS_W - 160, Math.max(500, Math.max(line1W, line2W) + padX * 2));
  const x = (CANVAS_W - w) / 2;
  const scale = 0.94 + p * 0.06;
  ctx.translate(CANVAS_W / 2, boxY + h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-CANVAS_W / 2, -(boxY + h / 2));
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, x, boxY, w, h, 36);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(800, 44);
  ctx.fillText(line1, CANVAS_W / 2, boxY + 57);
  ctx.font = font(800, 50);
  ctx.fillText(line2, CANVAS_W / 2, boxY + 112);
  ctx.restore();
}

function ctaSearchTitleTarget(domain: string): string {
  const clean = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .replace(/\.(com|com\.br)$/i, "");
  return /^puxeassunto$/i.test(clean) ? "Puxeassunto.com ❤️‍🔥" : clean || domain;
}

function drawCtaImageScreen(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  fallback: () => void,
  viewportHeight: number = CANVAS_H,
  alignY: "top" | "center" = "center"
) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (!drawImageFit(ctx, img, 0, 0, CANVAS_W, viewportHeight, {
    mode: "contain",
    alignY,
  })) {
    fallback();
  }
}

const FOTO_ENVIADA_PRINT_SOURCE: SourceRect = {
  x: 135,
  y: 188,
  w: 678,
  h: 939,
};

const FOTO_ENVIADA_BUTTON_SOURCE: SourceRect = {
  x: 39,
  y: 1453,
  w: 869,
  h: 121,
};

function drawCanvasCover(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: ImageFitRect
) {
  const iw = canvas.width || CANVAS_W;
  const ih = canvas.height || CANVAS_H;
  const scale = Math.max(rect.w / iw, rect.h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = rect.x + (rect.w - dw) / 2;
  const dy = rect.y + (rect.h - dh) / 2;
  ctx.drawImage(canvas, dx, dy, dw, dh);
}

function drawFotoEnviadaComposite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  snapshot: HTMLCanvasElement | null,
  imageRect: ImageFitRect,
  opts: { placeSnapshot: boolean; buttonLabel?: string | null }
) {
  ctx.drawImage(img, imageRect.x, imageRect.y, imageRect.w, imageRect.h);

  if (opts.placeSnapshot && snapshot) {
    const target = sourceRectToCanvas(img, imageRect, FOTO_ENVIADA_PRINT_SOURCE);
    const clipRect = {
      x: target.x,
      y: target.y,
      w: target.w,
      h: target.h,
    };
    ctx.save();
    roundedRect(ctx, clipRect.x, clipRect.y, clipRect.w, clipRect.h, 18);
    ctx.clip();
    drawCanvasCover(ctx, snapshot, clipRect);
    ctx.restore();
  }

  if (opts.placeSnapshot && opts.buttonLabel !== null) {
    drawFotoEnviadaButtonLabel(ctx, img, imageRect, opts.buttonLabel);
  }
}

function fotoEnviadaButtonRect(
  img: HTMLImageElement,
  imageRect: ImageFitRect
): ImageFitRect {
  return sourceRectToCanvas(img, imageRect, FOTO_ENVIADA_BUTTON_SOURCE);
}

function drawFotoEnviadaButtonLabel(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  imageRect: ImageFitRect,
  label: string = "Gerar respostas"
) {
  const btn = fotoEnviadaButtonRect(img, imageRect);
  ctx.save();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = font(800, Math.max(32, btn.h * 0.32));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 2);
  ctx.restore();
}

function drawCtaUploadedScreen(
  ctx: CanvasRenderingContext2D,
  opts: {
    image: HTMLImageElement | null | undefined;
    snapshot: HTMLCanvasElement | null;
    analyzingAlpha: number;
    spinnerT: number;
    viewportHeight: number;
    placeSnapshot: boolean;
  }
) {
  let buttonRect: ImageFitRect | null = null;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (imageReady(opts.image)) {
    const imageRect = imageFitRect(opts.image, 0, 0, CANVAS_W, opts.viewportHeight, {
      mode: "contain",
      alignY: "center",
    });
    drawFotoEnviadaComposite(ctx, opts.image, opts.snapshot, imageRect, {
      placeSnapshot: opts.placeSnapshot,
      buttonLabel: opts.analyzingAlpha > 0.01 ? null : "Gerar respostas",
    });
    buttonRect = opts.placeSnapshot
      ? fotoEnviadaButtonRect(opts.image, imageRect)
      : null;
  } else {
    drawPuxeassuntoSite(ctx, {
      tagline: "",
      suggestedResponse: "",
      state: {
        printDockProgress: 1,
        analyzeClickPulse: 0,
        analyzingAlpha: opts.analyzingAlpha,
        analyzingSpinnerT: opts.spinnerT,
        responseProgress: 0,
        responseScrollProgress: 0,
        copyPulse: 0,
        copied: false,
      },
      snapshotCanvas: opts.snapshot,
    });
  }

  if (opts.analyzingAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = clamp(opts.analyzingAlpha, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const labelY = buttonRect
      ? buttonRect.y + buttonRect.h / 2
      : Math.min(CANVAS_H - 245, opts.viewportHeight - 120);
    const labelX = buttonRect
      ? buttonRect.x + buttonRect.w / 2
      : CANVAS_W / 2;
    const spinnerX = labelX - 210;
    drawSpinner(ctx, spinnerX, labelY, 30, opts.spinnerT);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = font(800, 44);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Gerando respostas...", spinnerX + 58, labelY);
    ctx.restore();
  }
}

function drawDynamicResponseList(
  ctx: CanvasRenderingContext2D,
  opts: {
    suggestedResponse: string;
    responseAlternatives: string[];
    revealProgress: number;
    scrollProgress: number;
    copyPulse: number;
    copied: boolean;
    uploadedImage: HTMLImageElement | null | undefined;
    viewportHeight: number;
    snapshot: HTMLCanvasElement | null;
    placeSnapshot: boolean;
  }
) {
  const viewH = opts.viewportHeight;
  const p = easeOutCubic(clamp(opts.revealProgress, 0, 1));
  const scrollY = easeInOutCubic(clamp(opts.scrollProgress, 0, 1)) * 500;
  const responseBg = "#050505";

  ctx.fillStyle = responseBg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  let responseTop = viewH + 80;
  if (imageReady(opts.uploadedImage)) {
    const rect = imageFitRect(opts.uploadedImage, 0, 0, CANVAS_W, viewH, {
      mode: "contain",
      alignY: "center",
    });
    responseTop = Math.max(responseTop, rect.y + rect.h + 78);
    const scroll = p * (responseTop - 58);
    drawFotoEnviadaComposite(
      ctx,
      opts.uploadedImage,
      opts.snapshot,
      { x: rect.x, y: rect.y - scroll, w: rect.w, h: rect.h },
      { placeSnapshot: opts.placeSnapshot, buttonLabel: "Gerar respostas" }
    );

    ctx.save();
    ctx.translate(0, -scroll);
    ctx.fillStyle = responseBg;
    ctx.fillRect(0, responseTop - 36, CANVAS_W, 1800);
    drawResponseAlternatives(ctx, {
      y: responseTop - scrollY,
      suggestedResponse: opts.suggestedResponse,
      responseAlternatives: opts.responseAlternatives,
      scrollProgress: opts.scrollProgress,
      copyPulse: opts.copyPulse,
      copied: opts.copied,
    });
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = p;
  ctx.translate(0, (1 - p) * 90);
  drawResponseAlternatives(ctx, {
    y: 58 - scrollY,
    suggestedResponse: opts.suggestedResponse,
    responseAlternatives: opts.responseAlternatives,
    scrollProgress: opts.scrollProgress,
    copyPulse: opts.copyPulse,
    copied: opts.copied,
  });
  ctx.restore();
}

function drawResponseAlternatives(
  ctx: CanvasRenderingContext2D,
  opts: {
    y: number;
    suggestedResponse: string;
    responseAlternatives: string[];
    scrollProgress: number;
    copyPulse: number;
    copied: boolean;
  }
) {
  const alternatives = buildCtaResponseAlternatives(
    opts.responseAlternatives,
    opts.suggestedResponse
  );
  const cards = [
    {
      label: "DIRETO",
      text: alternatives[0],
      hint: "Vai ao ponto com naturalidade e deixa a conversa andar.",
    },
    {
      label: "ENGRACADO",
      text: alternatives[1],
      hint: "Mantem o clima leve e aumenta a chance dela responder.",
    },
    {
      label: "ESCOLHIDA",
      text: alternatives[2],
      hint: "Essa e a resposta copiada para continuar a conversa.",
    },
    {
      label: "PROVOCATIVO",
      text: alternatives[3],
      hint: "Usa o contexto da conversa para puxar assunto sem parecer forcado.",
    },
  ];

  let y = opts.y;
  const copiedIndex = 2;
  const selectedIndex = opts.copyPulse > 0 || opts.copied ? copiedIndex : -1;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const h = 430;
    drawSuggestionCard(ctx, {
      x: 48,
      y,
      w: CANVAS_W - 96,
      h,
      label: card.label,
      text: card.text,
      hint: card.hint,
      selected: i === selectedIndex,
      copyPulse: i === copiedIndex ? opts.copyPulse : 0,
      copied: i === copiedIndex && opts.copied,
    });
    y += h + 105;
  }
}

function buildCtaResponseAlternatives(
  custom: string[] | undefined,
  suggestedResponse: string
): string[] {
  const suggested = suggestedResponse.trim();
  const generated = [
    makeDirectSuggestion(suggestedResponse),
    makeFunnySuggestion(suggestedResponse),
    suggested || makeSoftSuggestion(suggestedResponse),
    makeProvocativeSuggestion(suggestedResponse),
  ];

  return generated.map((fallback, index) => {
    const text = custom?.[index]?.trim();
    return text || fallback;
  });
}

function makeFunnySuggestion(text: string): string {
  const clean = text.trim();
  if (!clean) return "Já tô aqui pensando numa resposta boa, segura essa.";
  return clean.length > 90
    ? clean
    : `${clean} kkk agora manda isso antes que eu perca a coragem.`;
}

function makeDirectSuggestion(text: string): string {
  const clean = text.trim();
  if (!clean) return "Bora continuar isso melhor por mensagem?";
  return clean.length > 96 ? clean : `Faz assim: ${clean}`;
}

function makeProvocativeSuggestion(text: string): string {
  const clean = text.trim();
  if (!clean) return "Responde como quem sabe que tem assunto bom vindo.";
  return clean.length > 86 ? clean : `${clean} agora me fala a parte boa disso.`;
}

function makeSoftSuggestion(text: string): string {
  const clean = text.trim();
  if (!clean) return "Curti isso. Me conta mais?";
  return clean.length > 86 ? clean : `${clean} gostei disso, me conta mais.`;
}

function drawSuggestionCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    text: string;
    hint: string;
    selected: boolean;
    copyPulse: number;
    copied: boolean;
  }
) {
  const accent = "#C39A24";
  const neutralBorder = "rgba(255,255,255,0.055)";
  roundedRect(ctx, opts.x, opts.y, opts.w, opts.h, 34);
  ctx.fillStyle = opts.selected ? "#14120D" : "#111111";
  ctx.fill();
  ctx.strokeStyle = opts.selected ? accent : neutralBorder;
  ctx.lineWidth = opts.selected ? 5 : 1.5;
  ctx.stroke();

  const labelW = Math.max(270, opts.label.length * 22);
  roundedRect(ctx, opts.x + 50, opts.y - 38, labelW, 70, 35);
  ctx.fillStyle = opts.selected ? "#241E10" : "#171719";
  ctx.fill();
  if (opts.selected) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = opts.selected ? "#FFE6A3" : "#DADBE5";
  ctx.font = font(800, 31);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(opts.label, opts.x + 50 + labelW / 2, opts.y - 3);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = font(500, 44);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  wrapTextDraw(ctx, `"${opts.text}"`, opts.x + 50, opts.y + 92, opts.w - 100, 62, "left");

  const dividerY = opts.y + opts.h - 155;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(opts.x + 50, dividerY, opts.w - 100, 2);

  const btnW = 292;
  const btnH = 76;
  const btnX = opts.x + opts.w - btnW - 50;
  const btnY = dividerY + 37;

  ctx.fillStyle = "#FF4B68";
  ctx.font = font(800, 42);
  ctx.fillText("⚡", opts.x + 52, dividerY + 54);
  ctx.fillStyle = "#8F91A3";
  ctx.font = font(500, 32);
  wrapTextDraw(
    ctx,
    opts.hint,
    opts.x + 105,
    dividerY + 45,
    Math.max(220, btnX - (opts.x + 105) - 30),
    40,
    "left"
  );

  const scale = 1 + opts.copyPulse * 0.08;
  ctx.save();
  ctx.translate(btnX + btnW / 2, btnY + btnH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(btnX + btnW / 2), -(btnY + btnH / 2));
  roundedRect(ctx, btnX, btnY, btnW, btnH, 18);
  ctx.fillStyle = opts.copied ? "#1F7A45" : "#1D1D20";
  ctx.fill();
  ctx.strokeStyle = opts.copied ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.09)";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (opts.copied) {
    drawCheckIcon(ctx, btnX + 38, btnY + btnH / 2, 34, "#FFFFFF");
  } else {
    drawCopyIcon(ctx, btnX + 35, btnY + btnH / 2 - 18, 34, "#D5D7E3");
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.font = font(700, 34);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(opts.copied ? "Copiado" : "Copiar", btnX + 90, btnY + btnH / 2);
  ctx.restore();
}

function drawCopyIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  roundedRect(ctx, x + size * 0.24, y, size * 0.62, size * 0.72, 7);
  ctx.stroke();
  roundedRect(ctx, x, y + size * 0.28, size * 0.62, size * 0.72, 7);
  ctx.stroke();
  ctx.restore();
}

function drawCheckIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy - size * 0.02);
  ctx.lineTo(cx - size * 0.12, cy + size * 0.28);
  ctx.lineTo(cx + size * 0.46, cy - size * 0.34);
  ctx.stroke();
  ctx.restore();
}

function drawCtaWebScene(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  s: CallToActionSchedule,
  opts: {
    domain: string;
    suggested: string;
    responseAlternatives: string[];
    snapshot: HTMLCanvasElement | null;
    images: DrawContext["ctaImages"];
    keyboardImage: HTMLImageElement | null;
    viewportHeight: number;
  }
) {
  const urlState = computeUrlBarState(timeMs, s, opts.domain);
  const siteState = computeSiteState(timeMs, s);
  const uploadedImage = opts.images?.fotoEnviada ?? opts.images?.areaLogada;
  const placeUploadedSnapshot = imageReady(opts.images?.fotoEnviada);

  if (timeMs < s.urlTypeEndMs) {
    drawCtaGoogleSearch(ctx, {
      query: urlState.text,
      tapPulse: 0,
      viewportHeight: opts.viewportHeight,
      domain: opts.domain,
      googleImage: opts.images?.google,
      keyboardImage: opts.keyboardImage,
      keyboardAlpha: urlState.keyboardAlpha,
      keyboardProgress: urlState.keyboardProgress,
      highlightedKey: urlState.highlightedKey,
      introProgress: 1,
    });
    return;
  }

  if (timeMs < s.safariNavStartMs) {
    const tapP = phaseProgress(timeMs, s.urlTypeEndMs, s.safariNavStartMs);
    const pulse = tapP > 0 && tapP < 1
      ? tapP < 0.35 ? tapP / 0.35 : 1 - (tapP - 0.35) / 0.65
      : 0;
    drawCtaGoogleSearch(ctx, {
      query: opts.domain,
      tapPulse: pulse,
      viewportHeight: opts.viewportHeight,
      domain: opts.domain,
      googleImage: opts.images?.google,
      keyboardImage: opts.keyboardImage,
      keyboardAlpha: urlState.keyboardAlpha,
      keyboardProgress: urlState.keyboardProgress,
      highlightedKey: urlState.highlightedKey,
      introProgress: 1,
    });
    return;
  }

  if (timeMs < s.safariNavEndMs) {
    const p = phaseProgress(timeMs, s.safariNavStartMs, s.safariNavEndMs);
    const keyboardCloseP =
      CTA_GOOGLE_KEYBOARD_CLOSE_MS /
      Math.max(1, s.safariNavEndMs - s.safariNavStartMs);
    drawCtaGoogleSearch(ctx, {
      query: opts.domain,
      tapPulse: 0,
      viewportHeight: opts.viewportHeight,
      domain: opts.domain,
      googleImage: opts.images?.google,
      keyboardImage: opts.keyboardImage,
      keyboardAlpha: urlState.keyboardAlpha,
      keyboardProgress: urlState.keyboardProgress,
      highlightedKey: urlState.highlightedKey,
      introProgress: 1,
      resultsImage: opts.images?.busca,
      resultsProgress: clamp((p - keyboardCloseP) / 0.12, 0, 1),
    });

    const siteAlpha = easeOutCubic(clamp((p - 0.52) / 0.14, 0, 1));
    if (siteAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = siteAlpha;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, CANVAS_W, opts.viewportHeight);
      if (!drawImageFit(ctx, opts.images?.areaLogada, 0, 0, CANVAS_W, opts.viewportHeight, {
        mode: "contain",
        alignY: "center",
      })) {
        drawPuxeassuntoSite(ctx, {
          tagline: "",
          suggestedResponse: opts.suggested,
          state: siteState,
          snapshotCanvas: opts.snapshot,
        });
      }
      ctx.restore();
    }

    if (p > 0.92 && !imageReady(opts.images?.areaLogada)) {
      drawPuxeassuntoSite(ctx, {
        tagline: "",
        suggestedResponse: opts.suggested,
        state: siteState,
        snapshotCanvas: opts.snapshot,
      });
    }
    return;
  }

  if (timeMs < s.siteIdleStartMs + (s.siteIdleEndMs - s.siteIdleStartMs) * 0.5) {
    drawCtaImageScreen(ctx, opts.images?.areaLogada, () => drawPuxeassuntoSite(ctx, {
      tagline: "",
      suggestedResponse: opts.suggested,
      state: siteState,
      snapshotCanvas: opts.snapshot,
    }), opts.viewportHeight);
    return;
  }

  if (timeMs < s.printDragEndMs) {
    drawCtaImageScreen(ctx, opts.images?.areaLogada, () => drawPuxeassuntoSite(ctx, {
      tagline: "",
      suggestedResponse: opts.suggested,
      state: siteState,
      snapshotCanvas: opts.snapshot,
    }), opts.viewportHeight);
    return;
  }

  if (timeMs < s.responseRevealStartMs) {
    drawCtaUploadedScreen(ctx, {
      image: uploadedImage,
      snapshot: opts.snapshot,
      analyzingAlpha: siteState.analyzingAlpha,
      spinnerT: siteState.analyzingSpinnerT,
      viewportHeight: opts.viewportHeight,
      placeSnapshot: placeUploadedSnapshot,
    });
    return;
  }

  drawDynamicResponseList(ctx, {
    suggestedResponse: opts.suggested,
    responseAlternatives: opts.responseAlternatives,
    revealProgress: siteState.responseProgress,
    scrollProgress: siteState.responseScrollProgress,
    copyPulse: siteState.copyPulse,
    copied: siteState.copied,
    uploadedImage,
    viewportHeight: opts.viewportHeight,
    snapshot: opts.snapshot,
    placeSnapshot: placeUploadedSnapshot,
  });
}

/** Helper: word-wrap and draw multi-line text within a max width. */
function wrapTextDraw(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = "center"
) {
  ctx.textAlign = align;
  const lines = wrapText(ctx, text, maxWidth);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
}

// ---------- Print thumbnail drawing ----------

interface PrintThumbDraw {
  snapshot: HTMLCanvasElement | null;
  cx: number;
  cy: number;
  width: number;
  /** 0..1 — used for fade and subtle scale during transitions. */
  alpha?: number;
  /** Extra rotation in radians (for the "drag in" wobble). */
  rotation?: number;
  /** Whether to draw the white border + shadow framing. */
  framed?: boolean;
}

function drawPrintThumb(ctx: CanvasRenderingContext2D, opts: PrintThumbDraw) {
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0) return;
  const aspect = CANVAS_H / CANVAS_W;
  const w = opts.width;
  const h = w * aspect;
  const radius = PRINT_THUMB_RADIUS * (w / PRINT_THUMB_WIDTH);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(opts.cx, opts.cy);
  if (opts.rotation) ctx.rotate(opts.rotation);
  // Drop shadow / framing
  if (opts.framed !== false) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 20;
    roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.restore();
  }

  // Clip to rounded rect and draw the snapshot
  ctx.save();
  roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.clip();
  if (opts.snapshot) {
    ctx.drawImage(opts.snapshot, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = "#1A1A1A";
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();

  // White outline
  if (opts.framed !== false) {
    ctx.save();
    roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.strokeStyle = PRINT_THUMB_BORDER;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---------- Main CTA scene ----------

function drawCallToActionScene(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  cta: ActiveCallToAction,
  drawCtx: DrawContext
) {
  const { schedule: s, cfg, message, nextMessage } = cta;
  const snapshot = renderSnapshot(s.triggerMs, drawCtx);
  const domain = (cfg.domain || "puxeassunto.com").trim();
  const suggested =
    (cfg.suggestedResponse && cfg.suggestedResponse.trim()) ||
    nextMessage?.text ||
    message.text;
  const responseAlternatives = buildCtaResponseAlternatives(
    cfg.responseAlternatives,
    suggested
  );
  const viewport = ctaViewport(drawCtx.config);

  // ===== Determine phase progresses =====
  const flashAlpha = (() => {
    if (timeMs < s.flashStartMs) return 0;
    if (timeMs >= s.flashEndMs) return 0;
    const half = (s.flashEndMs - s.flashStartMs) / 2;
    const center = s.flashStartMs + half;
    return clamp(1 - Math.abs(timeMs - center) / half, 0, 1);
  })();

  // Shrink: chat goes from full-screen → small thumbnail at bottom-left.
  const shrinkP = easeInOutCubic(
    phaseProgress(timeMs, s.shrinkStartMs, s.shrinkEndMs)
  );
  // Safari slide-in 0..1 (1 = fully on-screen).
  const safariOpenP = easeOutCubic(
    phaseProgress(timeMs, s.safariOpenStartMs, s.safariOpenEndMs)
  );
  // Print drag: thumbnail moves from the corner into the drop zone.
  const dragP = easeInOutCubic(
    phaseProgress(timeMs, s.printDragStartMs, s.printDragEndMs)
  );
  // Safari slide-out 0..1 (1 = fully gone).
  const safariClosingP = easeInOutCubic(
    phaseProgress(timeMs, s.safariCloseStartMs, s.safariCloseEndMs)
  );

  // ===== Backdrop =====
  // The visible composition layers in order:
  //   1. System background (dark) — fills any area not covered by other layers.
  //   2. Direct snapshot — only visible while the thumbnail is at full size
  //      (so it reads as the actual Direct screen). The thumbnail layer
  //      handles drawing the snapshot once shrink kicks in.
  //   3. Safari layer (Google → puxeassunto site) — slides in from below.
  //   4. Print thumbnail (full screen → corner → drop zone).
  //   5. Flash overlay (white shutter).

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (timeMs >= s.flashEndMs && timeMs < s.safariOpenStartMs) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
    ctx.clip();
    ctx.translate(0, viewport.y);
    drawCtaGoogleSearch(ctx, {
      query: "",
      tapPulse: 0,
      viewportHeight: viewport.h,
      domain,
      googleImage: drawCtx.ctaImages?.google,
      introProgress: 1,
    });
    ctx.restore();
  }

  // While shrink hasn't begun, the snapshot covers the screen (no thumbnail
  // frame yet). Once shrink starts we let the thumbnail layer take over —
  // the dimming overlay below provides the surrounding "system" backdrop.
  const beforeSafariOpens = timeMs < s.safariOpenStartMs;
  if (beforeSafariOpens && snapshot && timeMs < s.flashEndMs) {
    const dim = clamp(shrinkP * 0.7, 0, 0.9);
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ----- Phase: CTA web layer is on screen -----
  // Keep the Google layer steady on open so it does not replay a second
  // entrance after the print shrink; only the close transition slides down.
  const safariActive =
    timeMs >= s.safariOpenStartMs && timeMs < s.safariCloseEndMs;
  if (safariActive) {
    const slideOut = safariClosingP; // 0..1 (1 = fully gone)
    const yOff = viewport.h * slideOut;
    // While Safari closes, keep the Direct visible underneath so the return
    // transition has something real to reveal.
    if (slideOut > 0 && snapshot) {
      ctx.drawImage(snapshot, 0, 0, CANVAS_W, CANVAS_H);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
    ctx.clip();
    ctx.translate(0, viewport.y + yOff);

    drawCtaWebScene(ctx, timeMs, s, {
      domain,
      suggested,
      responseAlternatives,
      snapshot: snapshot ?? null,
      images: drawCtx.ctaImages,
      keyboardImage: drawCtx.keyboardImage,
      viewportHeight: viewport.h,
    });

    ctx.restore();
  } else if (timeMs >= s.safariCloseEndMs && snapshot) {
    // After safari closes — show Direct again. (Schedule guarantees the
    // CTA scene returns false at this point, but for safety.)
    ctx.drawImage(snapshot, 0, 0, CANVAS_W, CANVAS_H);
  } else if (!beforeSafariOpens && snapshot) {
    // Between shrink end and safariOpenStart (very brief): dim system bg.
    ctx.fillStyle = "#0A0A0F";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ===== Print thumbnail (corner / drag) =====
  // Phases:
  //   - During shrink: thumbnail interpolates from full-screen → corner.
  //   - holdThumb / safariOpen / urlType / safariNav / siteIdle: rests in corner.
  //   - printDrag: flies from corner into the site's drop zone.
  //   - After printDrag: thumbnail is "docked" inside the drop zone.
  drawPrintThumbnailPhase(ctx, {
    schedule: s,
    timeMs,
    shrinkP,
    dragP,
    snapshot,
    safariOpenP,
    safariClosingP,
    viewport,
  });

  drawCtaInstructionHeader(ctx, domain, viewport, phaseProgress(
    timeMs,
    s.flashEndMs,
    s.flashEndMs + 220
  ));

  // ===== Flash overlay (top-most so it covers chrome + thumb during snap) =====
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

function drawPrintThumbnailPhase(
  ctx: CanvasRenderingContext2D,
  opts: {
    schedule: CallToActionSchedule;
    timeMs: number;
    shrinkP: number;
    dragP: number;
    snapshot: HTMLCanvasElement | null;
    safariOpenP: number;
    safariClosingP: number;
    viewport: { y: number; h: number };
  }
) {
  const { schedule: s, timeMs, snapshot } = opts;
  const rest = printThumbRestRect(opts.viewport);
  const restCx = rest.x + rest.w / 2;
  const restCy = rest.y + rest.h / 2;

  // 1) During shrink: animate from full-screen-centered to corner rest.
  if (timeMs < s.shrinkEndMs) {
    const p = opts.shrinkP;
    const startCx = CANVAS_W / 2;
    const startCy = CANVAS_H / 2;
    // Start the thumbnail covering the full canvas (effectively the Direct
    // itself) and tween toward the small rest position. The frame fades in
    // alongside the shrink so the first frames look identical to the live
    // Direct (no abrupt border pop).
    const startW = CANVAS_W;
    const cx = lerp(startCx, restCx, p);
    const cy = lerp(startCy, restCy, p);
    const w = lerp(startW, rest.w, p);
    drawPrintThumb(ctx, {
      snapshot,
      cx,
      cy,
      width: w,
      alpha: 1,
      framed: p > 0.18,
    });
    return;
  }

  // 2) Between shrinkEnd and printDragStart: thumbnail rests at corner.
  if (timeMs < s.printDragStartMs) {
    drawPrintThumb(ctx, {
      snapshot,
      cx: restCx,
      cy: restCy,
      width: rest.w,
      alpha: 1,
      framed: true,
    });
    return;
  }

  // 3) During printDrag: thumbnail flies into the site's drop zone.
  if (timeMs < s.printDragEndMs) {
    const p = opts.dragP;
    // Target: center of the upload card in area-logada.jpeg.
    const dropZoneCx = CANVAS_W / 2;
    const dropZoneCy = opts.viewport.y + 855;
    const dropZoneW = 340;
    const cx = lerp(restCx, dropZoneCx, p);
    const cy = lerp(restCy, dropZoneCy, p);
    const w = lerp(rest.w, dropZoneW, p);
    const rotation = (1 - p) * -0.04; // subtle wobble that flattens out
    drawPrintThumb(ctx, {
      snapshot,
      cx,
      cy,
      width: w,
      alpha: 1,
      rotation,
      framed: true,
    });
    return;
  }

  // 4) After printDrag: docked inside drop zone. Hide once response card
  //    has revealed itself, since the response card covers the drop area.
  if (timeMs < s.responseRevealStartMs) return;

  // 5) Response reveal — fade thumbnail behind the response card.
  if (timeMs < s.safariCloseStartMs) return;
}

// ---------- URL bar state ----------

interface UrlBarState {
  text: string;
  caretVisible: boolean;
  focused: boolean;
  loadProgress: number;
  suggestionAlpha: number;
  keyboardAlpha: number;
  keyboardProgress: number;
  highlightedKey: string | null;
}

const CTA_GOOGLE_KEYBOARD_OPEN_MS = 320;
const CTA_GOOGLE_KEYBOARD_CLOSE_MS = 280;

function computeUrlBarState(
  timeMs: number,
  s: CallToActionSchedule,
  domain: string
): UrlBarState {
  const keyboardOpenStartMs = s.urlTypeStartMs - CTA_GOOGLE_KEYBOARD_OPEN_MS;
  // Before the keyboard starts sliding in: unfocused, empty.
  if (timeMs < keyboardOpenStartMs) {
    return {
      text: "",
      caretVisible: false,
      focused: false,
      loadProgress: 0,
      suggestionAlpha: 0,
      keyboardAlpha: 0,
      keyboardProgress: 0,
      highlightedKey: null,
    };
  }
  if (timeMs < s.urlTypeStartMs) {
    const p = phaseProgress(timeMs, keyboardOpenStartMs, s.urlTypeStartMs);
    return {
      text: "",
      caretVisible: false,
      focused: true,
      loadProgress: 0,
      suggestionAlpha: 0,
      keyboardAlpha: p,
      keyboardProgress: p,
      highlightedKey: null,
    };
  }
  // During typing: focus + characters appear one by one + suggestion fades in.
  if (timeMs < s.urlTypeEndMs) {
    const dur = Math.max(1, s.urlTypeEndMs - s.urlTypeStartMs);
    const elapsed = timeMs - s.urlTypeStartMs;
    const typed = Math.min(
      domain.length,
      Math.floor((elapsed / dur) * domain.length)
    );
    // Highlighted key animation.
    const charDur = dur / Math.max(1, domain.length);
    const lastCharStart = s.urlTypeStartMs + typed * charDur;
    const highlighted =
      typed > 0 && timeMs - lastCharStart < KEY_HIGHLIGHT_MS
        ? domain[typed - 1]?.toLowerCase() ?? null
        : null;
    return {
      text: domain.slice(0, typed),
      caretVisible: Math.floor(timeMs / 500) % 2 === 0,
      focused: true,
      loadProgress: 0,
      suggestionAlpha: clamp(typed / Math.max(1, domain.length / 3), 0, 1),
      keyboardAlpha: 1,
      keyboardProgress: 1,
      highlightedKey: highlighted,
    };
  }
  // After typing, before nav: still focused, suggestion visible.
  if (timeMs < s.safariNavStartMs) {
    const lastCharElapsed = timeMs - s.urlTypeEndMs;
    const highlighted =
      lastCharElapsed >= 0 && lastCharElapsed < KEY_HIGHLIGHT_MS
        ? domain[domain.length - 1]?.toLowerCase() ?? null
        : null;
    return {
      text: domain,
      caretVisible: Math.floor(timeMs / 500) % 2 === 0,
      focused: true,
      loadProgress: 0,
      suggestionAlpha: 1,
      keyboardAlpha: 1,
      keyboardProgress: 1,
      highlightedKey: highlighted,
    };
  }
  // During navigation: defocus, hide keyboard + suggestion, show load progress.
  if (timeMs < s.safariNavEndMs) {
    const p = phaseProgress(timeMs, s.safariNavStartMs, s.safariNavEndMs);
    return {
      text: domain,
      caretVisible: false,
      focused: false,
      loadProgress: p,
      suggestionAlpha: 0,
      keyboardAlpha: clamp(1 - p * 2, 0, 1),
      keyboardProgress: clamp(
        1 -
          phaseProgress(
            timeMs,
            s.safariNavStartMs,
            s.safariNavStartMs + CTA_GOOGLE_KEYBOARD_CLOSE_MS
          ),
        0,
        1
      ),
      highlightedKey: null,
    };
  }
  // Site is loaded — URL bar shows domain.
  return {
    text: domain,
    caretVisible: false,
    focused: false,
    loadProgress: 0,
    suggestionAlpha: 0,
    keyboardAlpha: 0,
    keyboardProgress: 0,
    highlightedKey: null,
  };
}

// ---------- Site phase state ----------

function computeSiteState(
  timeMs: number,
  s: CallToActionSchedule
): SiteSceneState {
  const printDockProgress = clamp(
    phaseProgress(timeMs, s.printDragStartMs, s.printDragEndMs),
    0,
    1
  );

  const analyzeClickPulse = (() => {
    const p = phaseProgress(timeMs, s.analyzeClickStartMs, s.analyzeClickEndMs);
    // Pulse shape: ramp up first 30%, ramp down rest.
    if (p <= 0 || p >= 1) return 0;
    return p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
  })();

  // Analyzing visible: from analyzeClickStart through analyzeLoadEnd; fades
  // out as response card comes in.
  let analyzingAlpha = 0;
  if (timeMs >= s.analyzeClickStartMs && timeMs < s.responseRevealStartMs) {
    analyzingAlpha = 1;
  } else if (
    timeMs >= s.responseRevealStartMs &&
    timeMs < s.responseRevealEndMs
  ) {
    analyzingAlpha = clamp(
      1 - phaseProgress(timeMs, s.responseRevealStartMs, s.responseRevealEndMs),
      0,
      1
    );
  }

  const analyzingSpinnerT = (timeMs - s.analyzeClickStartMs) / 1000;
  const responseProgress = phaseProgress(
    timeMs,
    s.responseRevealStartMs,
    s.responseRevealEndMs
  );
  const responseScrollProgress = phaseProgress(
    timeMs,
    s.responseHoldStartMs + 120,
    Math.max(s.responseHoldStartMs + 121, s.responseHoldEndMs - 260)
  );
  const copyTapP = phaseProgress(timeMs, s.copyTapStartMs, s.copyTapEndMs);
  const copyPulse = copyTapP > 0 && copyTapP < 1
    ? (copyTapP < 0.3 ? copyTapP / 0.3 : 1 - (copyTapP - 0.3) / 0.7)
    : 0;
  const copied = timeMs >= s.copyTapStartMs + (s.copyTapEndMs - s.copyTapStartMs) * 0.3;

  return {
    printDockProgress,
    analyzeClickPulse,
    analyzingAlpha,
    analyzingSpinnerT,
    responseProgress,
    responseScrollProgress,
    copyPulse,
    copied,
  };
}

// ============================================================
// Image loading helper
// ============================================================

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
