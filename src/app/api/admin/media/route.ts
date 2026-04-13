import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 20));
    const status = params.get("status");
    const search = params.get("search")?.trim();
    const excludeFolderId = params.get("excludeFolderId")?.trim();

    const where: Prisma.MediaFileWhereInput = {};

    if (status && ["UPLOADING", "PROCESSING", "READY", "FAILED"].includes(status)) {
      where.status = status as Prisma.EnumMediaFileStatusFilter;
    }

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { originalName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (excludeFolderId) {
      where.folderItems = {
        none: {
          folderId: excludeFolderId,
        },
      };
    }

    const [files, total] = await Promise.all([
      prisma.mediaFile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              folderItems: true,
              shareItems: true,
            },
          },
        },
      }),
      prisma.mediaFile.count({ where }),
    ]);

    return NextResponse.json({
      files: files.map((f) => ({
        ...f,
        sizeBytes: Number(f.sizeBytes),
        references: f._count.folderItems + f._count.shareItems,
        _count: undefined,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("List media error:", error);
    return NextResponse.json(
      { error: "Грешка при зареждане на медийните файлове" },
      { status: 500 }
    );
  }
}
