import { NextRequest } from "next/server";
import { subscribeMemberEvents } from "@/lib/memberEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardCode: string }> }
) {
  const { cardCode } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Connected event
      send({ type: "connected", cardCode, timestamp: Date.now() });

      const unsubscribe = subscribeMemberEvents(cardCode, (event) => {
        send(event);
      });

      const keepAlive = setInterval(() => {
        send({ type: "ping", timestamp: Date.now() });
      }, 30000);

      const abortHandler = () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Ignore close errors after abrupt disconnect.
        }
      };

      request.signal.addEventListener("abort", abortHandler);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Connection: "keep-alive",
    },
  });
}
