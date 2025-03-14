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
  await supabase.auth.getSession()

  // Handle protected routes
  const { data: { session } } = await supabase.auth.getSession()
  const isLoggedIn = !!session?.user
  const pathname = request.nextUrl.pathname

  // Check if the route is a chat route or root path
  const isChatRoute = pathname === '/chat' || pathname.startsWith('/chat/')
  const isRootPath = pathname === '/'
  const isOnRegister = pathname === '/register'
  const isOnLogin = pathname === '/login'

  // Redirect authenticated users away from auth pages
  if (isLoggedIn && (isOnLogin || isOnRegister)) {
    return NextResponse.redirect(new URL('/chat', request.url))
  }

  // Allow access to auth pages for non-authenticated users
  if (isOnRegister || isOnLogin) {
    return response
  }

  // Handle chat routes and root path - require authentication
  if (isChatRoute || isRootPath) {
    if (!isLoggedIn) {
      // Store the intended destination for post-login redirect
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirect', pathname === '/' ? '/chat' : pathname)
      return NextResponse.redirect(redirectUrl)
    }
    if (isRootPath) {
      return NextResponse.redirect(new URL('/chat', request.url))
    }
    return response
  }

  return response
}

export const config = {
  matcher: [
    '/chat',
    '/chat/:path*',
    '/login',
    '/register'
  ]
}
