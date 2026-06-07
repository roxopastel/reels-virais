import { createPublicAssetRoute } from "@/lib/publicAssetRoute";
import { MUSIC_EXTENSIONS } from "@/lib/publicAssets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createPublicAssetRoute("musics", MUSIC_EXTENSIONS);
