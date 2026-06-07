import { createPublicAssetRoute } from "@/lib/publicAssetRoute";
import { MEME_EXTENSIONS } from "@/lib/publicAssets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createPublicAssetRoute("memes", MEME_EXTENSIONS);
