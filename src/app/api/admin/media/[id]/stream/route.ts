import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getFilePath } from "@/lib/media/storage";

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
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id },
      select: {
        diskFileName: true,
        mimeType: true,
        status: true,
        sizeBytes: true,
      },
    });

    if (!mediaFile || mediaFile.status !== "READY") {
      return NextResponse.json({ error: "Видеото не е налично" }, { status: 404 });
    }

    const filePath = getFilePath(mediaFile.diskFileName);
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      return NextResponse.json({ error: "Файлът не е намерен на диска" }, { status: 404 });
    }

    const fileSize = stat.size;
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
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
      const stream = createReadStream(filePath, { start, end, highWaterMark: 512 * 1024 });

      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: Buffer | string) => {
            const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
            controller.enqueue(new Uint8Array(buf));
          });
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
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
          "Cache-Control": "private, max-age=3600",
          "Last-Modified": stat.mtime.toUTCString(),
        },
      });
    }

    const stream = createReadStream(filePath, { highWaterMark: 512 * 1024 });
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer | string) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(buf));
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
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
        "Cache-Control": "private, max-age=3600",
        "Last-Modified": stat.mtime.toUTCString(),
      },
    });
  } catch (error) {
    console.error("Admin stream error:", error);
    return NextResponse.json({ error: "Грешка при стрийминг" }, { status: 500 });
  }
}
