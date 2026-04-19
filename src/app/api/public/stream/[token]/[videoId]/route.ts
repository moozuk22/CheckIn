import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { prisma } from "@/lib/db";
import { getFilePath } from "@/lib/media/storage";
import { createAuditLog, getClientIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ token: string; videoId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { token, videoId } = await params;

  try {
    // Validate share link
    const share = await prisma.shareLink.findUnique({
      where: { token },
      select: {
        id: true,
        items: {
          where: { mediaFileId: videoId },
          select: { id: true },
        },
      },
    });

    if (!share) {
      return NextResponse.json({ error: "Невалиден линк" }, { status: 404 });
    }

    if (share.items.length === 0) {
      return NextResponse.json(
        { error: "Видеото не е част от този линк" },
        { status: 404 }
      );
    }

    // Get file info
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: videoId },
      select: {
        diskFileName: true,
        mimeType: true,
        status: true,
        isVisible: true,
        sizeBytes: true,
        cloudinaryUrl: true,
      },
    });

    if (!mediaFile || mediaFile.status !== "READY" || !mediaFile.isVisible) {
      return NextResponse.json(
        { error: "Видеото не е налично" },
        { status: 404 }
      );
    }

    if (mediaFile.cloudinaryUrl) {
      return NextResponse.redirect(mediaFile.cloudinaryUrl, {
        status: 302,
        headers: { "Cache-Control": "private, max-age=3600" },
      });
    }

    const filePath = getFilePath(mediaFile.diskFileName);
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      return NextResponse.json(
        { error: "Файлът не е намерен на диска" },
        { status: 404 }
      );
    }

    const fileSize = stat.size;
    const rangeHeader = request.headers.get("range");

    // Log stream access (fire and forget)
    createAuditLog(
      "SHARE_VIDEO_WATCHED",
      "MediaFile",
      videoId,
      { shareLinkId: share.id, token: token.slice(0, 8) + "..." },
      { mediaFileId: videoId, ipAddress: getClientIp(request) ?? undefined }
    );

    if (rangeHeader) {
      // Parse range header
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const contentLength = end - start + 1;
      const stream = createReadStream(filePath, { start, end, highWaterMark: 64 * 1024 });

      // Convert Node.js readable stream to web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: Buffer | string) => {
            const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
            controller.enqueue(new Uint8Array(buf));
          });
          stream.on("end", () => {
            controller.close();
          });
          stream.on("error", (err) => {
            controller.error(err);
          });
        },
        cancel() {
          stream.destroy();
        },
      });

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(contentLength),
          "Content-Type": mediaFile.mimeType,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    // No range - serve full file
    const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer | string) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(buf));
        });
        stream.on("end", () => {
          controller.close();
        });
        stream.on("error", (err) => {
          controller.error(err);
        });
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(fileSize),
        "Content-Type": mediaFile.mimeType,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("Stream error:", error);
    return NextResponse.json(
      { error: "Грешка при стрийминг" },
      { status: 500 }
    );
  }
}
