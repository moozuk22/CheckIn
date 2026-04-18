import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { SHARE_LINK_BASE_URL } from "@/lib/media/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const share = await prisma.shareLink.findUnique({
      where: { id },
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
              },
            },
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json(
        { error: "Линкът не е намерен" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...share,
      publicUrl: `${SHARE_LINK_BASE_URL}/${share.token}`,
      isExpired: false,
      items: share.items.map((item) => ({
        ...item,
        mediaFile: {
          ...item.mediaFile,
          sizeBytes: Number(item.mediaFile.sizeBytes),
        },
      })),
    });
  } catch (error) {
    console.error("Get share error:", error);
    return NextResponse.json(
      { error: "Грешка при зареждане на линка" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const share = await prisma.shareLink.findUnique({
      where: { id },
      select: { id: true, token: true },
    });

    if (!share) {
      return NextResponse.json(
        { error: "Линкът не е намерен" },
        { status: 404 }
      );
    }

    // Cascade deletes ShareLinkItems. Physical files are NOT affected.
    await prisma.shareLink.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete share error:", error);
    return NextResponse.json(
      { error: "Грешка при деактивиране на линка" },
      { status: 500 }
    );
  }
}
