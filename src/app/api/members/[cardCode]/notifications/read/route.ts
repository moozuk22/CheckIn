import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ cardCode: string }> }
) {
  const { cardCode } = await params;
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const card = await prisma.card.findUnique({
      where: { cardCode },
      select: { memberId: true },
    });

    if (!card) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    try {
      const updated = await prisma.memberNotification.updateMany({
        where: {
          memberId: card.memberId,
          readAt: null,
          sentAt: {
            gte: oneWeekAgo,
          },
        },
        data: {
          readAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        markedRead: updated.count,
      });
    } catch (notificationError) {
      const code =
        typeof notificationError === "object" &&
        notificationError !== null &&
        "code" in notificationError
          ? String((notificationError as { code?: unknown }).code)
          : "";

      if (code !== "P2021") {
        console.error("Mark notifications read failed:", notificationError);
      }

      return NextResponse.json({
        success: true,
        markedRead: 0,
      });
    }
  } catch (error) {
    console.error("Notification read route error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
