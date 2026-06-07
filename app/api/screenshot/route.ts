import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.SCREENSHOTONE_KEY ?? "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  if (!ACCESS_KEY) {
    return NextResponse.json({ error: "SCREENSHOTONE_KEY not set" }, { status: 500 });
  }

  // Garante que a URL tem esquema
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  const params = new URLSearchParams({
    access_key: ACCESS_KEY,
    url: fullUrl,
    // Viewport mobile (9:16) para combinar com o canvas 1080x1920
    viewport_width: "390",
    viewport_height: "844",
    device_scale_factor: "2",
    format: "jpg",
    image_quality: "85",
    // Aguarda a página carregar completamente
    delay: "2",
    block_ads: "true",
    block_cookie_banners: "true",
    block_trackers: "true",
    dark_mode: "true",
  });

  const apiUrl = `https://api.screenshotone.com/take?${params.toString()}`;

  try {
    const resp = await fetch(apiUrl, { next: { revalidate: 3600 } }); // cache 1h

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Screenshotone error: ${resp.status}`, detail: text },
        { status: 502 }
      );
    }

    const buffer = await resp.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
