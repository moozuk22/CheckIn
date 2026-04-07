import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createAuditLog, getClientIp } from "@/lib/audit";

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
    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        children: {
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { children: true, items: true } },
          },
        },
        items: {
          orderBy: { sortOrder: "asc" },
          include: {
            mediaFile: {
              select: {
                id: true,
                displayName: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                status: true,
                isVisible: true,
                durationSecs: true,
                createdAt: true,
                _count: {
                  select: { folderItems: true },
                },
              },
            },
          },
        },
        parent: { select: { id: true, name: true } },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Папката не е намерена" }, { status: 404 });
    }

    return NextResponse.json({
      folder: {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        parent: folder.parent,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      },
      children: folder.children,
      items: folder.items.map((item) => ({
        ...item,
        mediaFile: {
          ...item.mediaFile,
          sizeBytes: Number(item.mediaFile.sizeBytes),
          references: item.mediaFile._count.folderItems,
        },
      })),
    });
  } catch (error) {
    console.error("Get folder error:", error);
    return NextResponse.json(
      { error: "Грешка при зареждане на папката" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Името на папката е задължително" },
        { status: 400 }
      );
    }

    const existing = await prisma.folder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Папката не е намерена" }, { status: 404 });
    }

    const folder = await prisma.folder.update({
      where: { id },
      data: { name },
    });

    await createAuditLog(
      "FOLDER_RENAMED",
      "Folder",
      id,
      { oldName: existing.name, newName: name },
      { ipAddress: getClientIp(request) ?? undefined }
    );

    return NextResponse.json(folder);
  } catch (error) {
    console.error("Update folder error:", error);
    return NextResponse.json(
      { error: "Грешка при преименуване на папката" },
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
    const folder = await prisma.folder.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!folder) {
      return NextResponse.json({ error: "Папката не е намерена" }, { status: 404 });
    }

    // Prisma cascades handle deleting children folders and folder items.
    // Physical files are NOT deleted — MediaFile records remain as the anchor.
    await prisma.folder.delete({ where: { id } });

    await createAuditLog(
      "FOLDER_DELETED",
      "Folder",
      id,
      { name: folder.name },
      { ipAddress: getClientIp(request) ?? undefined }
    );

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete folder error:", error);
    return NextResponse.json(
      { error: "Грешка при изтриване на папката" },
      { status: 500 }
    );
  }
}
