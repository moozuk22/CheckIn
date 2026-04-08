import { NextRequest, NextResponse } from "next/server";
import { createAdminToken } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    let role: "ADMIN" | "MEDIA_MANAGER" | null = null;

    if (password === process.env.ADMIN_PASSWORD) {
      role = "ADMIN";
    } else if (password === process.env.MEDIA_MANAGER_PASSWORD) {
      role = "MEDIA_MANAGER";
    }

    if (!role) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = await createAdminToken(role);

    const response = NextResponse.json({ success: true, role });

    response.cookies.set({
      name: "admin_session",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
