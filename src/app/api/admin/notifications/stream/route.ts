import { NextRequest } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { subscribeAdminNotificationEvents } from "@/lib/adminNotificationEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      let keepAlive: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;

      const closeStream = () => {
        if (isClosed) return;
        isClosed = true;
        if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        try { controller.close(); } catch { /* ignore */ }
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

      sendEvent("connected", { at: Date.now() });

      unsubscribe = subscribeAdminNotificationEvents((event) => {
        sendEvent("notification-created", { at: event.timestamp });
      });

      keepAlive = setInterval(() => {
        sendEvent("heartbeat", { at: Date.now() });
      }, 30000);

      request.signal.addEventListener("abort", closeStream);
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
