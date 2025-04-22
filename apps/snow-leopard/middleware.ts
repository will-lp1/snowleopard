import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// A very simple middleware example
export function middleware(request: NextRequest) {
  console.log('[Middleware] Request path:', request.nextUrl.pathname);
  return NextResponse.next(); // Just continue the request
}

// Minimal config
export const config = {
  // runtime: 'nodejs', // Temporarily comment out runtime to use default
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
