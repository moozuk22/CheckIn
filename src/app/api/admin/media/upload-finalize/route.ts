import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import {
  assembleChunks,
  getReceivedChunks,
  hasEnoughDiskSpace,
  deleteFile,
} from "@/lib/media/storage";
import { CHUNK_SIZE } from "@/lib/media/config";
import { probeFile, decideProcessing, enqueueProcessing } from "@/lib/media/processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assignToFolder(mediaFileId: string, folderId: string): Promise<string | null> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return null;

  const lastItem = await prisma.folderItem.findFirst({
    where: { folderId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  try {
    const item = await prisma.folderItem.create({
      data: {
        folderId,
        mediaFileId,
        sortOrder: (lastItem?.sortOrder ?? -1) + 1,
      },
    });
    return item.id;
  } catch (error) {
    // Duplicate constraint — already linked, ignore
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
      return null;
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const uploadId = String(body.uploadId ?? "").trim();
    const folderId = body.folderId ? String(body.folderId).trim() : null;

    if (!uploadId) {
      return NextResponse.json(
        { error: "uploadId is required" },
        { status: 400 }
      );
    }

    const mediaFile = await prisma.mediaFile.findUnique({
      where: { uploadId },
    });

    if (!mediaFile) {
      return NextResponse.json(
        { error: "Upload session not found" },
        { status: 404 }
      );
    }

    if (mediaFile.status !== "UPLOADING") {
      return NextResponse.json(
        { error: "Upload already finalized" },
        { status: 409 }
      );
    }

    // Check all chunks are present
    const totalChunks = Math.ceil(Number(mediaFile.sizeBytes) / CHUNK_SIZE);
    const received = await getReceivedChunks(uploadId);
    if (received.length < totalChunks) {
      return NextResponse.json(
        {
          error: "Не всички части са качени",
          receivedChunks: received.length,
          totalChunks,
        },
        { status: 400 }
      );
    }

    // Re-check disk space before assembly
    if (!(await hasEnoughDiskSpace(Number(mediaFile.sizeBytes)))) {
      return NextResponse.json(
        { error: "Недостатъчно дисково пространство за сглобяване" },
        { status: 507 }
      );
    }

    // Assemble chunks into final file
    await assembleChunks(uploadId, totalChunks, mediaFile.diskFileName);

    // Probe the file to determine codec compatibility
    let probe;
    try {
      probe = await probeFile(mediaFile.diskFileName);
    } catch (probeError) {
      console.error("FFprobe failed:", probeError);
      // FFprobe not available or file unrecognized — mark as failed
      await deleteFile(mediaFile.diskFileName);
      await prisma.mediaFile.update({
        where: { id: mediaFile.id },
        data: {
          status: "FAILED",
          errorMessage: "Неподдържан видео формат",
          uploadId: null,
        },
      });
      await createAuditLog(
        "UPLOAD_FAILED",
        "MediaFile",
        mediaFile.id,
        { reason: "probe_failed" },
        { mediaFileId: mediaFile.id, ipAddress: getClientIp(request) ?? undefined }
      );
      return NextResponse.json(
        { mediaFileId: mediaFile.id, status: "FAILED", error: "Неподдържан видео формат" },
        { status: 422 }
      );
    }

    const decision = decideProcessing(probe);

    if (decision === "unsupported") {
      await deleteFile(mediaFile.diskFileName);
      await prisma.mediaFile.update({
        where: { id: mediaFile.id },
        data: {
          status: "FAILED",
          errorMessage: "Неподдържан видео формат — няма видео поток",
          uploadId: null,
          durationSecs: probe.durationSecs,
        },
      });
      await createAuditLog(
        "UPLOAD_FAILED",
        "MediaFile",
        mediaFile.id,
        { reason: "unsupported", probe },
        { mediaFileId: mediaFile.id, ipAddress: getClientIp(request) ?? undefined }
      );
      return NextResponse.json(
        { mediaFileId: mediaFile.id, status: "FAILED", error: "Неподдържан видео формат" },
        { status: 422 }
      );
    }

    if (decision === "ready") {
      // File can be served directly
      await prisma.mediaFile.update({
        where: { id: mediaFile.id },
        data: {
          status: "READY",
          uploadId: null,
          durationSecs: probe.durationSecs,
        },
      });
      let folderItemId: string | null = null;
      if (folderId) {
        folderItemId = await assignToFolder(mediaFile.id, folderId);
      }

      await createAuditLog(
        "UPLOAD_COMPLETED",
        "MediaFile",
        mediaFile.id,
        { decision: "ready", probe, folderId },
        { mediaFileId: mediaFile.id, ipAddress: getClientIp(request) ?? undefined }
      );
      return NextResponse.json({
        mediaFileId: mediaFile.id,
        status: "READY",
        folderId,
        folderItemId,
      });
    }

    // Needs remux or transcode — enqueue for background processing
    await prisma.mediaFile.update({
      where: { id: mediaFile.id },
      data: {
        status: "PROCESSING",
        uploadId: null,
        durationSecs: probe.durationSecs,
      },
    });

    let folderItemId: string | null = null;
    if (folderId) {
      folderItemId = await assignToFolder(mediaFile.id, folderId);
    }

    enqueueProcessing({
      mediaFileId: mediaFile.id,
      diskFileName: mediaFile.diskFileName,
      decision,
    });

    return NextResponse.json({
      mediaFileId: mediaFile.id,
      status: "PROCESSING",
      decision,
      folderId,
      folderItemId,
    });
  } catch (error) {
    console.error("Upload finalize error:", error);
    return NextResponse.json(
      { error: "Грешка при финализиране на качването" },
      { status: 500 }
    );
  }
}