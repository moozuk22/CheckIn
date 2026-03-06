import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const token = request.cookies.get("admin_session")?.value;

    if (!token || !(await verifyAdminToken(token))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { firstName, secondName, visitsTotal } = await request.json();

        if (!firstName || !secondName) {
            return NextResponse.json(
                { error: "First name and second name are required" },
                { status: 400 }
            );
        }

        const cardCode = randomBytes(4).toString("hex").toUpperCase();

        const newMember = await prisma.member.create({
            data: {
                firstName,
                secondName,
                visitsTotal: visitsTotal || 0,
                visitsUsed: 0,
                card: {
                    create: {
                        cardCode,
                        isActive: false,
                    },
                },
            },
            include: {
                card: true,
            },
        });

        return NextResponse.json(newMember, { status: 201 });
    } catch (error) {
        console.error("Member creation error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    const token = request.cookies.get("admin_session")?.value;

    if (!token || !(await verifyAdminToken(token))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const members = await prisma.member.findMany({
            include: {
                card: true,
            },
            orderBy: {
                firstName: "asc",
            },
        });

        return NextResponse.json(members);
    } catch (error) {
        console.error("Members fetch error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}