import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { inferDeviceLabel } from "@/lib/push/device";
import {
  deactivateAdminPushSubscription,
  isAdminPushSubscriptionActive,
  saveAdminPushSubscription,
} from "@/lib/push/adminService";
import { parseBrowserPushSubscription } from "@/lib/push/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifySession(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  return token ? await verifyAdminToken(token) : null;
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const endpoint = request.nextUrl.searchParams.get("endpoint")?.trim() ?? "";
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

  try {
    const isActive = await isAdminPushSubscriptionActive(endpoint);
    return NextResponse.json({ success: true, isActive });
  } catch (error) {
    console.error("Admin push GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subscription state" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subscription = parseBrowserPushSubscription((body as { subscription?: unknown }).subscription);
  if (!subscription) {
    return NextResponse.json({ error: "Invalid push subscription payload" }, { status: 400 });
  }

  try {
    const userAgent = request.headers.get("user-agent");
    const saved = await saveAdminPushSubscription({
      subscription,
      userAgent,
      device: inferDeviceLabel(userAgent),
    });
    return NextResponse.json({ success: true, id: saved.id, isActive: saved.isActive });
  } catch (error) {
    console.error("Admin push POST error:", error);
    return NextResponse.json({ error: "Failed to save push subscription" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const endpoint = String((body as { endpoint?: unknown }).endpoint ?? "").trim();
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

  try {
    await deactivateAdminPushSubscription(endpoint);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin push DELETE error:", error);
    return NextResponse.json({ error: "Failed to deactivate push subscription" }, { status: 500 });
  }
}
