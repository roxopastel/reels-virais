import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Always read the directory at request time so newly-added files are
// picked up without restarting the dev server.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v"]);

export async function GET() {
  const dir = path.join("public", "memes");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => ALLOWED_EXTS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ files });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ files: [] });
    }
    return NextResponse.json(
      { files: [], error: (err as Error).message },
      { status: 500 }
    );
  }
}
