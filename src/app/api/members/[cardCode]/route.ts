import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cardCode: string }> }
) {
  const { cardCode } = await params;
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const card = await prisma.card.findUnique({
      where: {
        cardCode,
      },
      include: {
        member: true,
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: "Member not found" },
        {
          status: 404,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        }
      );
    }

    // Auto-activate card on first access if it's inactive
    if (!card.isActive) {
      await prisma.card.update({
        where: { id: card.id },
        data: { isActive: true }
      });
      card.isActive = true;
    }

    let notifications: {
      id: string;
      type: string;
      title: string;
      body: string;
      url: string | null;
      sentAt: Date;
      readAt: Date | null;
    }[] = [];
    let unreadCount = 0;

    try {
      const [items, count] = await Promise.all([
        prisma.memberNotification.findMany({
          where: {
            memberId: card.member.id,
            sentAt: {
              gte: oneWeekAgo,
            },
          },
          orderBy: { sentAt: "desc" },
          take: 20,
        }),
        prisma.memberNotification.count({
          where: {
            memberId: card.member.id,
            readAt: null,
            sentAt: {
              gte: oneWeekAgo,
            },
          },
        }),
      ]);
      notifications = items;
      unreadCount = count;
    } catch (notificationError) {
      // Keep profile available if notification history table is not migrated yet.
      const code =
        typeof notificationError === "object" &&
        notificationError !== null &&
        "code" in notificationError
          ? String((notificationError as { code?: unknown }).code)
          : "";

      if (code !== "P2021") {
        console.error("Notification history unavailable:", notificationError);
      }
    }

    return NextResponse.json(
      {
        id: card.member.id,
        cardCode: card.cardCode,
        name: `${card.member.firstName} ${card.member.secondName}`,
        visits_total: card.member.visitsTotal,
        visits_used: card.member.visitsUsed,
        isActive: card.isActive,
        notifications: notifications.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          url: item.url,
          sentAt: item.sentAt,
          readAt: item.readAt,
        })),
        unread_notifications: unreadCount,
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      }
    );
  } catch (error) {
    console.error("Member fetch error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      }
    );
  }
}
