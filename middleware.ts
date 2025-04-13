import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  // No need to await getSession here, we'll get it if needed below
  // await supabase.auth.getSession() 

  // Handle routes
  const { data: { session } } = await supabase.auth.getSession()
  const isLoggedIn = !!session?.user
  const pathname = request.nextUrl.pathname

  // Check if the route is a documents route
  const isDocumentsRoute = pathname === '/documents' || pathname.startsWith('/documents/')
  const isOnRegister = pathname === '/register'
  const isOnLogin = pathname === '/login'
  const isRootPath = pathname === '/' // Keep track of root path

  // Redirect authenticated users away from auth pages or root path
  if (isLoggedIn && (isOnLogin || isOnRegister)) {
    return NextResponse.redirect(new URL('/documents', request.url))
  }
  // If logged in and on root, redirect to documents
  if (isLoggedIn && isRootPath) {
    return NextResponse.redirect(new URL('/documents', request.url))
  }

  // Allow access to auth pages for non-authenticated users
  if (!isLoggedIn && (isOnRegister || isOnLogin)) {
    return response
  }
  
  // Allow access to root path for everyone
  if (isRootPath) {
    return response
  }

  // Handle documents routes - require authentication, redirect to root if not logged in
  if (isDocumentsRoute) {
    if (!isLoggedIn) {
      // Redirect unauthenticated users to the landing page instead of login
      return NextResponse.redirect(new URL('/', request.url))
    }
    // If logged in, allow access to documents routes
    return response
  }

  // For any other paths not explicitly handled, allow access
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (static image assets)
     * - fonts (static font assets)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|images|fonts).*)',
  ],
}
