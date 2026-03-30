import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const userRole = (req.auth?.user as { role?: string } | undefined)?.role;

  const isAppRoute = nextUrl.pathname.startsWith("/app");
  const isAdminRoute = nextUrl.pathname.startsWith("/app/admin");
  const isSuperAdminRoute = nextUrl.pathname.startsWith(
    "/app/admin/super-admin",
  );
  const isLoginRoute = nextUrl.pathname === "/login";

  // Unauthenticated user tries to access protected /app/* → redirect to /login
  if (isAppRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Already logged-in user visits /login → redirect to /app
  if (isLoginRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/app", nextUrl));
  }

  // Super-admin route requires superadmin role.
  if (isSuperAdminRoute && userRole !== "superadmin") {
    return NextResponse.redirect(new URL("/app", nextUrl));
  }

  // Non-admin/non-superadmin users cannot access admin-only routes.
  if (isAdminRoute && userRole !== "admin" && userRole !== "superadmin") {
    return NextResponse.redirect(new URL("/app", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*", "/login"],
};
