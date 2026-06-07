import { createPublicAssetRoute } from "@/lib/publicAssetRoute";
import { PHOTO_EXTENSIONS } from "@/lib/publicAssets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createPublicAssetRoute("fotos", PHOTO_EXTENSIONS);
