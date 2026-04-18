import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { SHARE_LINK_BASE_URL } from "@/lib/media/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NEVER_EXPIRES_AT = new Date("9999-12-31T23:59:59.999Z");

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const shares = await prisma.shareLink.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({
      shares: shares.map((s) => ({
        ...s,
        videoCount: s._count.items,
        publicUrl: `${SHARE_LINK_BASE_URL}/${s.token}`,
        isExpired: false,
        _count: undefined,
      })),
    });
  } catch (error) {
    console.error("List shares error:", error);
    return NextResponse.json(
      { error: "Грешка при зареждане на линковете" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = body.name ? String(body.name).trim() : null;
    const mediaFileIds: string[] = body.mediaFileIds;

    if (!Array.isArray(mediaFileIds) || mediaFileIds.length === 0) {
      return NextResponse.json(
        { error: "Изберете поне едно видео" },
        { status: 400 }
      );
    }

    // Verify all media files exist and are READY
    const files = await prisma.mediaFile.findMany({
      where: { id: { in: mediaFileIds } },
      select: { id: true, status: true },
    });

    const readyIds = new Set(files.filter((f) => f.status === "READY").map((f) => f.id));
    const invalidIds = mediaFileIds.filter((id) => !readyIds.has(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Някои видеа не са готови или не съществуват", invalidIds },
        { status: 400 }
      );
    }

    const shareToken = randomBytes(32).toString("base64url");
    const expiresAt = NEVER_EXPIRES_AT;

    const shareLink = await prisma.shareLink.create({
      data: {
        token: shareToken,
        name,
        expiresAt,
        items: {
          create: mediaFileIds.map((mediaFileId, index) => ({
            mediaFileId,
            sortOrder: index,
          })),
        },
      },
      include: { _count: { select: { items: true } } },
    });

    const publicUrl = `${SHARE_LINK_BASE_URL}/${shareToken}`;

    return NextResponse.json(
      {
        shareLink: {
          ...shareLink,
          videoCount: shareLink._count.items,
          publicUrl,
          _count: undefined,
        },
        publicUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create share error:", error);
    return NextResponse.json(
      { error: "Грешка при създаване на линк за споделяне" },
      { status: 500 }
    );
  }
}
