import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isAppRoute = nextUrl.pathname.startsWith("/app");
  const isLoginRoute = nextUrl.pathname === "/login";

  // Unauthenticated user tries to access protected /app/* → redirect to /login
  if (isAppRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Already logged-in user visits /login → redirect to /app
  if (isLoginRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/app", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*", "/login"],
};
