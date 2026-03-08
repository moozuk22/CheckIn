import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("admin_session")?.value;
  const { id } = await params;

  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const answers = await prisma.memberQuestionAnswer.findMany({
      where: {
        questionId: id,
      },
      include: {
        member: {
          select: {
            firstName: true,
            secondName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      answers: answers.map((item) => ({
        id: item.id,
        answer: item.answer,
        member: item.member,
      })),
    });
  } catch (error) {
    console.error("Question answers fetch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
