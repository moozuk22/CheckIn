import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminSession = request.cookies.get("admin_session")?.value;

  const SECRET = new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET || "default_secret_for_safety");

  // Protect admin routes
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    // Exception for login page and login API
    if (
      pathname === "/admin/login" ||
      pathname === "/api/admin/login" ||
      pathname === "/api/admin/check-session"
    ) {
      if (adminSession && pathname === "/admin/login") {
        try {
          await jwtVerify(adminSession, SECRET);
          // If valid session, redirect away from login to admin dashboard
          return NextResponse.redirect(new URL("/admin/members", request.url));
        } catch {
          // Invalid token, allow access to login
        }
      }
      return NextResponse.next();
    }

    if (!adminSession) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    try {
      await jwtVerify(adminSession, SECRET);
      return NextResponse.next();
    } catch {
      const response = pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : NextResponse.redirect(new URL("/admin/login", request.url));
      
      response.cookies.delete("admin_session");
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
