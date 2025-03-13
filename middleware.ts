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
  await supabase.auth.getUser()

  // Handle protected routes
  const { data: { session } } = await supabase.auth.getSession()
  const isLoggedIn = !!session?.user
  const isOnChat = request.nextUrl.pathname.startsWith('/chat/')
  const isOnRegister = request.nextUrl.pathname === '/register'
  const isOnLogin = request.nextUrl.pathname === '/login'

  if (isLoggedIn && (isOnLogin || isOnRegister)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (isOnRegister || isOnLogin) {
    return response
  }

  if (isOnChat) {
    if (isLoggedIn) return response
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/chat/:path*',
    '/login',
    '/register',
    '/app/(chat)/:path*'
  ]
}
