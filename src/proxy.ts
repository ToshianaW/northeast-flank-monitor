import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/admin-auth";

// First line of defence only: every admin page and Server Action checks the session again.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const valid = await isValidAdminSession(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );

  if (pathname === "/admin/login") {
    return valid
      ? NextResponse.redirect(new URL("/admin", request.url))
      : NextResponse.next();
  }

  // Logout only clears the cookie, so it needs no session.
  if (pathname === "/admin/logout" || valid) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
