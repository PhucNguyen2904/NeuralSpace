import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/health"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("auth_token")?.value;
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (!token && !isPublicRoute) {
    // Tạm thời tắt chuyển hướng để test các giao diện khác
    // const url = new URL("/login", request.url);
    // url.searchParams.set("next", pathname);
    // return NextResponse.redirect(url);
  }

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/workspaces", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
