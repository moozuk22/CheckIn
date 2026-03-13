import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveMemberNotificationHistory } from "@/lib/push/history";
import { buildNotificationPayload } from "@/lib/push/templates";
import { sendPushToMember } from "@/lib/push/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ cardCode: string }> }
) {
  const { cardCode } = await params;

  try {
    const card = await prisma.card.findUnique({
      where: { cardCode },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            secondName: true,
            visitsTotal: true,
            visitsUsed: true,
          },
        },
      },
    });

    if (!card) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const memberName = `${card.member.firstName} ${card.member.secondName}`.trim();
    const remainingVisits = card.member.visitsTotal - card.member.visitsUsed;

    const payload = buildNotificationPayload({
      type: "trainer_message",
      memberName,
      remainingVisits,
      trainerMessage: "Тестово известие: push notifications работят.",
      url: `/member/${cardCode}`,
    });

    const result = await sendPushToMember(card.member.id, payload);
    if (result.sent > 0) {
      await saveMemberNotificationHistory(card.member.id, "trainer_message", payload);
    }

    return NextResponse.json({
      success: true,
      ...result,
      memberId: card.member.id,
    });
  } catch (error) {
    console.error("Push test send error:", error);
    return NextResponse.json(
      { error: "Failed to send test notification" },
      { status: 500 }
    );
  }
}
