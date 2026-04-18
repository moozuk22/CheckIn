import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAuditLog, getClientIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  try {
    const share = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: {
            mediaFile: {
              select: {
                id: true,
                displayName: true,
                sizeBytes: true,
                durationSecs: true,
                status: true,
                isVisible: true,
              },
            },
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json(
        { error: "Невалиден линк" },
        { status: 404 }
      );
    }

    // Update access stats
    await prisma.shareLink.update({
      where: { id: share.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessAt: new Date(),
      },
    });

    await createAuditLog(
      "SHARE_LINK_OPENED",
      "ShareLink",
      share.id,
      { token: token.slice(0, 8) + "..." },
      { ipAddress: getClientIp(request) ?? undefined }
    );

    // Only return READY and visible videos
    const videos = share.items
      .filter((item) => item.mediaFile.status === "READY" && item.mediaFile.isVisible)
      .map((item) => ({
        id: item.mediaFile.id,
        displayName: item.mediaFile.displayName,
        sizeBytes: Number(item.mediaFile.sizeBytes),
        durationSecs: item.mediaFile.durationSecs,
      }));

    return NextResponse.json({
      name: share.name,
      videos,
    });
  } catch (error) {
    console.error("Public share error:", error);
    return NextResponse.json(
      { error: "Грешка при зареждане" },
      { status: 500 }
    );
  }
}
