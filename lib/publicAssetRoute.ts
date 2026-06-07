import { NextResponse } from "next/server";
import {
  isMissingDirectoryError,
  listPublicAssetFiles,
} from "@/lib/serverPublicAssets";

export function createPublicAssetRoute(
  publicDir: string,
  allowedExtensions: readonly string[]
) {
  return async function GET() {
    try {
      const files = await listPublicAssetFiles(publicDir, allowedExtensions);
      return NextResponse.json({ files });
    } catch (error) {
      if (isMissingDirectoryError(error)) {
        return NextResponse.json({ files: [] });
      }
      return NextResponse.json(
        { files: [], error: (error as Error).message },
        { status: 500 }
      );
    }
  };
}
