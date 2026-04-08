import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { ensureDirectories, hasEnoughDiskSpace } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const fileName = String(body.fileName ?? "").trim();
    const fileSize = Number(body.fileSize);
    const mimeType = String(body.mimeType ?? "").trim();
    const totalChunks = Number(body.totalChunks);

    if (!fileName) {
      return NextResponse.json(
        { error: "fileName is required" },
        { status: 400 }
      );
    }

    if (!mimeType.startsWith("video/") && !mimeType.startsWith("audio/")) {
      return NextResponse.json(
        { error: "Само видео и аудио файлове са позволени" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json(
        { error: "Invalid fileSize" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(totalChunks) || totalChunks <= 0) {
      return NextResponse.json(
        { error: "Invalid totalChunks" },
        { status: 400 }
      );
    }

    const folderId = body.folderId ? String(body.folderId).trim() : null;
    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder) {
        return NextResponse.json(
          { error: "Папката не е намерена" },
          { status: 404 }
        );
      }
    }

    // Check disk space: need room for chunks + assembled file + potential transcode
    const requiredSpace = fileSize * 2.5;
    if (!(await hasEnoughDiskSpace(requiredSpace))) {
      return NextResponse.json(
        { error: "Недостатъчно дисково пространство" },
        { status: 507 }
      );
    }

    await ensureDirectories();

    const uploadId = randomUUID();
    const mediaFileId = randomUUID();
    const ext = fileName.split(".").pop()?.toLowerCase() || "mp4";
    const diskFileName = `${mediaFileId}.${ext}`;

    const mediaFile = await prisma.mediaFile.create({
      data: {
        id: mediaFileId,
        originalName: fileName,
        displayName: fileName.replace(/\.[^.]+$/, ""),
        diskFileName,
        mimeType,
        sizeBytes: BigInt(Math.round(fileSize)),
        status: "UPLOADING",
        isVisible: true,
        uploadId,
      },
    });

    return NextResponse.json(
      { uploadId, mediaFileId: mediaFile.id, totalChunks, folderId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload init error:", error);
    return NextResponse.json(
      { error: "Грешка при инициализиране на качването" },
      { status: 500 }
    );
  }
}
