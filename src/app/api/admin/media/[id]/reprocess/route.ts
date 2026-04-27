import { NextRequest, NextResponse } from "next/server";
import { access } from "fs/promises";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getFilePath } from "@/lib/media/storage";
import { probeFile, decideProcessing, enqueueProcessing } from "@/lib/media/processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function deriveMimeType(probe: { videoCodec: string | null; audioCodec: string | null; container: string }): string | null {
  if (!probe.videoCodec) {
    if (probe.container === "mp4" || probe.container === "m4a") return "audio/mp4";
    return null;
  }
  if (probe.container === "mp4") return "video/mp4";
  if (probe.container === "webm") return "video/webm";
  return null;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id },
      select: {
        id: true,
        diskFileName: true,
        mimeType: true,
        status: true,
        cloudinaryUrl: true,
      },
    });

    if (!mediaFile) {
      return NextResponse.json({ error: "Файлът не е намерен" }, { status: 404 });
    }

    if (mediaFile.status !== "READY" && mediaFile.status !== "FAILED") {
      return NextResponse.json(
        { error: "Файлът трябва да е в статус READY или FAILED" },
        { status: 409 }
      );
    }

    if (mediaFile.cloudinaryUrl) {
      return NextResponse.json(
        { error: "Файлът е хостван в Cloudinary и не може да се преобработи" },
        { status: 400 }
      );
    }

    const filePath = getFilePath(mediaFile.diskFileName);
    try {
      await access(filePath);
    } catch {
      return NextResponse.json(
        { error: "Файлът не е намерен на диска" },
        { status: 404 }
      );
    }

    const probe = await probeFile(mediaFile.diskFileName);
    const decision = decideProcessing(probe);

    if (decision === "unsupported") {
      return NextResponse.json(
        { error: "Неподдържан формат — файлът няма разпознаем медиен поток" },
        { status: 422 }
      );
    }

    if (decision === "ready") {
      const correctMime = deriveMimeType(probe);
      if (correctMime && correctMime !== mediaFile.mimeType) {
        await prisma.mediaFile.update({
          where: { id },
          data: { mimeType: correctMime },
        });
      }
      return NextResponse.json({ status: "READY", decision: "ready" });
    }

    const isAudioOnly = !probe.videoCodec && !!probe.audioCodec;

    await prisma.mediaFile.update({
      where: { id },
      data: { status: "PROCESSING", errorMessage: null },
    });

    enqueueProcessing({
      mediaFileId: mediaFile.id,
      diskFileName: mediaFile.diskFileName,
      decision,
      isAudioOnly,
    });

    return NextResponse.json({ status: "PROCESSING", decision });
  } catch (error) {
    console.error("Reprocess error:", error);
    return NextResponse.json(
      { error: "Грешка при стартиране на преобработката" },
      { status: 500 }
    );
  }
}
