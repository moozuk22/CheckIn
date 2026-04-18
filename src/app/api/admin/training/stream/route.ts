import { NextRequest } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { subscribeTrainingAttendanceEvents } from "@/lib/trainingAttendanceEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifySession(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  return token ? await verifyAdminToken(token) : null;
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      let keepAlive: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;

      const close = () => {
        if (isClosed) return;
        isClosed = true;
        if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        try { controller.close(); } catch { /* ignore */ }
      };

      const send = (event: string, data: Record<string, unknown>) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { close(); }
      };

      send("connected", { at: Date.now() });

      unsubscribe = subscribeTrainingAttendanceEvents((event) => {
        send("attendance-update", { date: event.trainingDate, at: event.timestamp });
      });

      keepAlive = setInterval(() => send("heartbeat", { at: Date.now() }), 30000);

      request.signal.addEventListener("abort", close);
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
