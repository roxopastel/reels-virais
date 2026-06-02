import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { spawn } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import chromium from "puppeteer-core";
import type { Browser } from "puppeteer-core";
import type { ConversationConfig, VideoPublishMetadata } from "@/lib/types";
import type { OutputAspect } from "@/lib/recorder";
import {
  filenameBaseFromTitle,
  formatPublishDescription,
  formatVideoKeywords,
} from "@/lib/videoMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
].filter(Boolean) as string[];

let browserPromise: Promise<Browser> | null = null;

export async function POST(request: NextRequest) {
  const { config, outputAspect: requestedOutputAspect } =
    (await request.json()) as {
      config?: ConversationConfig;
      outputAspect?: OutputAspect;
    };
  if (!config || !Array.isArray(config.messages)) {
    return NextResponse.json({ error: "Configuração inválida." }, { status: 400 });
  }
  const outputAspect = normalizeOutputAspect(requestedOutputAspect);

  let webmPath = "";
  let mp4Path = "";
  try {
    const origin = internalOrigin();
    const browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(300_000);

    try {
      await page.goto(`${origin}/render-worker`, { waitUntil: "networkidle0" });
      await page.waitForFunction("window.renderConversationOnServer");
      const rendered = await page.evaluate(
        ({ conversationConfig, aspect }) => {
          return window.renderConversationOnServer!(conversationConfig, aspect);
        },
        { conversationConfig: config, aspect: outputAspect }
      );

      const jobDir = path.join(tmpdir(), `direct-viral-${randomUUID()}`);
      await mkdir(jobDir, { recursive: true });
      webmPath = path.join(jobDir, "render.webm");
      mp4Path = path.join(jobDir, "render.mp4");
      await writeFile(webmPath, Buffer.from(rendered.base64, "base64"));
      await convertToMp4(webmPath, mp4Path, config.videoMetadata);

      const video = await readFile(mp4Path);
      const filename = suggestFilename(
        config.username,
        outputAspect,
        config.videoMetadata
      );
      return new NextResponse(video, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": contentDispositionAttachment(filename),
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await page.close().catch(() => undefined);
    }
  } catch (error) {
    console.error("Server video render failed:", error);
    return NextResponse.json(
      { error: "Falha ao gerar o vídeo no servidor." },
      { status: 500 }
    );
  } finally {
    if (webmPath) await rm(path.dirname(webmPath), { recursive: true, force: true });
    if (mp4Path && path.dirname(mp4Path) !== path.dirname(webmPath)) {
      await rm(path.dirname(mp4Path), { recursive: true, force: true });
    }
  }
}

function contentDispositionAttachment(filename: string): string {
  const asciiFallback =
    filename
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/["\\]/g, "")
      .trim() || "video.mp4";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function normalizeOutputAspect(value: unknown): OutputAspect {
  return value === "16:9" ? "16:9" : "9:16";
}

function internalOrigin() {
  return `http://127.0.0.1:${process.env.PORT || "3000"}`;
}

async function getBrowser() {
  if (!browserPromise) {
    const executablePath = CHROME_PATHS.find((candidate) =>
      existsSync(candidate)
    );
    if (!executablePath) {
      throw new Error("Chromium não encontrado. Configure CHROME_PATH.");
    }
    browserPromise = chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
  }
  return browserPromise;
}

function suggestFilename(
  username: string,
  outputAspect: OutputAspect,
  metadata?: VideoPublishMetadata | null
): string {
  const titleBase = filenameBaseFromTitle(metadata?.title);
  if (titleBase) {
    return `${titleBase}${outputAspect === "16:9" ? " - 16x9" : ""}.mp4`;
  }

  const safe = (username || "conversa")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 32);
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const suffix = outputAspect === "16:9" ? "_16x9" : "";
  return `${safe}_${ts}${suffix}.mp4`;
}

function convertToMp4(
  input: string,
  output: string,
  metadata?: VideoPublishMetadata | null
) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      input,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-vf",
      "fps=60",
      "-r",
      "60",
      "-movflags",
      "+faststart+use_metadata_tags",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      ...ffmpegMetadataArgs(metadata),
      output,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

function ffmpegMetadataArgs(metadata?: VideoPublishMetadata | null): string[] {
  if (!metadata) return [];

  const title = metadata.title?.trim().slice(0, 120);
  const description = formatPublishDescription(metadata).slice(0, 1000);
  const keywords = formatVideoKeywords(metadata).slice(0, 300);
  const args = ["-map_metadata", "-1"];

  if (title) args.push("-metadata", `title=${title}`);
  if (description) {
    args.push("-metadata", `description=${description}`);
    args.push("-metadata", `comment=${description}`);
  }
  if (keywords) args.push("-metadata", `keywords=${keywords}`);
  args.push("-metadata", "artist=Direct Viral");

  return args;
}
