import { NextResponse } from "next/server";
import { ADMIN_COOKIE_PATH, ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";

export async function POST() {
  // 303 so the browser follows with GET. Relative, because request.url can report a different host.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin/login" },
  });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: ADMIN_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}
