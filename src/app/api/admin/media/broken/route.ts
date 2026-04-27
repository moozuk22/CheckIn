import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_VIDEO_MIMETYPES = new Set(["video/mp4", "video/webm"]);

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const files = await prisma.mediaFile.findMany({
      where: {
        status: "READY",
        cloudinaryUrl: null,
        mimeType: { startsWith: "video/" },
      },
      select: { id: true, displayName: true, mimeType: true, diskFileName: true },
    });

    const broken = files.filter((f) => !SAFE_VIDEO_MIMETYPES.has(f.mimeType));

    return NextResponse.json({ files: broken, total: broken.length });
  } catch (error) {
    console.error("Broken videos check error:", error);
    return NextResponse.json(
      { error: "Грешка при търсене на грешни видеа" },
      { status: 500 }
    );
  }
}
