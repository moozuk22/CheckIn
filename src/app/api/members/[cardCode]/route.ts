import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cardCode: string }> }
) {
  const { cardCode } = await params;

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

    return NextResponse.json(
      {
        id: card.member.id,
        cardCode: card.cardCode,
        name: `${card.member.firstName} ${card.member.secondName}`,
        visits_total: card.member.visitsTotal,
        visits_used: card.member.visitsUsed,
        isActive: card.isActive,
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      }
    );
  }
}
