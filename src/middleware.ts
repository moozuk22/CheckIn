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
          const { payload } = await jwtVerify(adminSession, SECRET);
          const role = payload.role as string;
          const redirectTo = role === "MEDIA_MANAGER" ? "/admin/media" : "/admin/members";
          return NextResponse.redirect(new URL(redirectTo, request.url));
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
      const { payload } = await jwtVerify(adminSession, SECRET);
      const role = payload.role as string;

      if (role === "MEDIA_MANAGER") {
        const isMediaPage = pathname.startsWith("/admin/media");
        const isMediaApi =
          pathname.startsWith("/api/admin/media") ||
          pathname.startsWith("/api/admin/folders") ||
          pathname.startsWith("/api/admin/shares");

        if (!isMediaPage && !isMediaApi) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
          return NextResponse.redirect(new URL("/admin/media", request.url));
        }
      }

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
