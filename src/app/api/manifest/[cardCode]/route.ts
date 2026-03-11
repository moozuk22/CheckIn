import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardCode: string }> }
) {
  const { cardCode } = await params;
  const encodedCardCode = encodeURIComponent(cardCode);
  const memberPath = `/member/${encodedCardCode}`;

  const manifest = {
    name: "Dalida Dance",
    short_name: "Dalida Dance",
    description: "NFC member profile and attendance tracking with browser notifications.",
    id: memberPath,
    start_url: memberPath,
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
