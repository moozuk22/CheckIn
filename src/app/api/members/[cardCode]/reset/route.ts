import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { publishMemberUpdated } from "@/lib/memberEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ cardCode: string }> }
) {
  const { cardCode } = await params;

  const token = request.cookies.get("admin_session")?.value;

  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const member = await prisma.member.findFirst({
      where: {
        cards: {
          some: {
            cardCode,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updatedMember = await prisma.member.update({
      where: { id: member.id },
      data: { visitsUsed: 0 },
    });

    publishMemberUpdated(cardCode, "reset");

    return NextResponse.json({
      id: updatedMember.id,
      name: `${updatedMember.firstName} ${updatedMember.secondName}`,
      visits_total: updatedMember.visitsTotal,
      visits_used: updatedMember.visitsUsed,
    });
  } catch (error) {
    console.error("Reset visits error:", error);
    return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 }
    );
  }
}
