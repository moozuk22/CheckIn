import { prisma } from "@/lib/db";
import { publishMemberUpdated } from "@/lib/memberEvents";
import type { NotificationTemplateType, PushNotificationPayload } from "@/lib/push/types";

export async function saveMemberNotificationHistory(
  memberId: string,
  type: NotificationTemplateType,
  payload: PushNotificationPayload
) {
  const saved = await prisma.memberNotification.create({
    data: {
      memberId,
      type,
      title: payload.title,
      body: payload.body,
      url: payload.url,
    },
  });

  try {
    const cards = await prisma.card.findMany({
      where: { memberId },
      select: { cardCode: true },
    });
    for (const card of cards) {
      publishMemberUpdated(card.cardCode, "notification-created");
    }
  } catch (error) {
    console.error("Notification SSE publish error:", error);
  }

  return saved;
}
