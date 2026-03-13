import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { buildNotificationPayload } from "@/lib/push/templates";
import { saveMemberNotificationHistory } from "@/lib/push/history";
import { sendPushToMember } from "@/lib/push/service";
import type { NotificationTemplateType } from "@/lib/push/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_TYPES = new Set<NotificationTemplateType>([
  "visit_registered",
  "membership_almost_finished",
  "training_reminder",
  "trainer_message",
]);

function normalizeMemberIds(payload: {
  memberId?: unknown;
  memberIds?: unknown;
}): string[] {
  const single = typeof payload.memberId === "string" ? payload.memberId.trim() : "";
  const list = Array.isArray(payload.memberIds)
    ? payload.memberIds
        .filter((entry): entry is string => typeof entry === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  return Array.from(new Set([single, ...list].filter(Boolean)));
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as {
    type?: unknown;
    memberId?: unknown;
    memberIds?: unknown;
    broadcast?: unknown;
    url?: unknown;
    trainingDate?: unknown;
    trainerMessage?: unknown;
  };

  if (typeof payload.type !== "string") {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  const type = payload.type as NotificationTemplateType;
  if (!SUPPORTED_TYPES.has(type)) {
    return NextResponse.json(
      { error: "Unsupported notification type" },
      { status: 400 }
    );
  }

  const broadcast = payload.broadcast === true;
  let memberIds = normalizeMemberIds(payload);

  if (broadcast) {
    const subscribedMembers = await prisma.pushSubscription.findMany({
      where: { isActive: true },
      distinct: ["memberId"],
      select: { memberId: true },
    });
    memberIds = subscribedMembers.map((item) => item.memberId);
  }

  if (memberIds.length === 0) {
    return NextResponse.json(
      { error: "memberId/memberIds is required unless broadcast=true" },
      { status: 400 }
    );
  }

  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: {
      id: true,
      firstName: true,
      secondName: true,
      visitsTotal: true,
      visitsUsed: true,
      cards: {
        select: { cardCode: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (members.length === 0) {
    return NextResponse.json({ error: "No members found" }, { status: 404 });
  }

  try {
    const results = await Promise.all(
      members.map(async (member) => {
        const memberName = `${member.firstName} ${member.secondName}`.trim();
        const remainingVisits = member.visitsTotal - member.visitsUsed;
        const fallbackUrl = member.cards[0]
          ? `/member/${member.cards[0].cardCode}`
          : "/";
        const url =
          typeof payload.url === "string" && payload.url.trim()
            ? payload.url.trim()
            : fallbackUrl;
        const trainingDate =
          typeof payload.trainingDate === "string" && payload.trainingDate.trim()
            ? payload.trainingDate.trim()
            : undefined;
        const trainerMessage =
          typeof payload.trainerMessage === "string" && payload.trainerMessage.trim()
            ? payload.trainerMessage.trim()
            : undefined;

        const pushPayload = buildNotificationPayload({
          type,
          memberName,
          remainingVisits,
          trainingDate,
          trainerMessage,
          url,
        });

        const sendResult = await sendPushToMember(member.id, pushPayload);
        if (sendResult.sent > 0) {
          await saveMemberNotificationHistory(member.id, type, pushPayload);
        }

        return {
          memberId: member.id,
          ...sendResult,
        };
      })
    );

    const summary = results.reduce(
      (acc, item) => {
        acc.total += item.total;
        acc.sent += item.sent;
        acc.failed += item.failed;
        acc.deactivated += item.deactivated;
        return acc;
      },
      { total: 0, sent: 0, failed: 0, deactivated: 0 }
    );

    return NextResponse.json({
      success: true,
      type,
      targetedMembers: members.length,
      summary,
      results,
    });
  } catch (error) {
    console.error("Admin push send error:", error);
    return NextResponse.json(
      { error: "Failed to send push notifications" },
      { status: 500 }
    );
  }
}
