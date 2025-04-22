import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies'; // Import Better Auth helper
// import { headers } from 'next/headers'; // No longer needed if not using checkSessionServerSide
// import { auth } from "@/lib/auth"; // <-- Remove this import

// Function to check session using Better Auth server-side API
// Recommended for Next.js 15.2.0+ as it avoids extra fetches
/* <-- Remove this function
async function checkSessionServerSide(request: NextRequest) {
  try {
    // Use headers() from next/headers for server components/middleware
    // Await the headers promise and then convert to a standard Headers object
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });
    return !!session; // Return true if session exists, false otherwise
  } catch (error) {
    console.error('[Middleware] Error fetching session:', error);
    return false; // Assume not logged in if error occurs
  }
}
*/

// Function to check session using cookie helper (works on older Next.js versions)
// Faster as it doesn't hit the API, but only checks cookie existence/basic validity
async function checkSessionCookieOnly(request: NextRequest) {
  try {
    // Pass request directly, no need for specific config if using defaults in lib/auth.ts
    const sessionCookie = getSessionCookie(request);
    return !!sessionCookie; // Return true if cookie exists, false otherwise
  } catch (error) {
    console.error('[Middleware] Error checking session cookie:', error);
    return false; // Assume not logged in if error occurs
  }
}

export async function middleware(request: NextRequest) {
  const isLoggedIn = await checkSessionCookieOnly(request);
  const pathname = request.nextUrl.pathname;

  // Define protected and public routes
  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const isProtectedRoute = pathname.startsWith('/documents');

  // --- Redirect logged-in users from AUTH pages ONLY --- 
  // Let the landing page component handle redirecting logged-in users from root
  if (isLoggedIn && isAuthRoute) { 
    // Redirect logged-in users trying to access login/register to the dashboard
    return NextResponse.redirect(new URL('/documents', request.url));
  }

  // --- Protect routes --- 
  if (!isLoggedIn && isProtectedRoute) {
    // Redirect non-logged-in users trying to access protected routes to the landing page
    return NextResponse.redirect(new URL('/', request.url)); 
  }

  // --- Allow access to all other routes ---
  return NextResponse.next();
}

export const config = {
  // Ensure Node.js runtime is enabled if using auth.api.getSession (Next.js 15.2.0+)
  runtime: "nodejs",
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (Better Auth API routes)
     * - api (Other API routes - adjust if some need protection)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (static image assets)
     * - fonts (static font assets)
     */
    // Ensure /api/auth is excluded from the middleware
    '/((?!api/auth|_next/static|_next/image|favicon.ico|images|fonts|api(?!/auth)).*)',
  ],
};
