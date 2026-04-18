import { NextRequest } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { isIsoDate } from "@/lib/training";
import { subscribeTrainingAttendanceEvents } from "@/lib/trainingAttendanceEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifySession(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  return token ? await verifyAdminToken(token) : null;
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (!isIsoDate(dateParam)) {
    return new Response("Invalid date query parameter", { status: 400 });
  }
  const trainingDateIso = dateParam;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      let keepAlive: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;

      const closeStream = () => {
        if (isClosed) return;
        isClosed = true;
        if (keepAlive) {
          clearInterval(keepAlive);
          keepAlive = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        try {
          controller.close();
        } catch {
          // Ignore
        }
      };

      const sendEvent = (event: string, data: Record<string, unknown>) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closeStream();
        }
      };

      sendEvent("connected", { date: trainingDateIso });

      unsubscribe = subscribeTrainingAttendanceEvents((event) => {
        if (event.trainingDate !== trainingDateIso) return;
        sendEvent("attendance-update", { date: event.trainingDate, at: event.timestamp });
      });

      keepAlive = setInterval(() => {
        sendEvent("heartbeat", { at: Date.now() });
      }, 30000);

      request.signal.addEventListener("abort", () => {
        closeStream();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
