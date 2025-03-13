import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/database.types'

export async function middleware(request: NextRequest) {
  try {
    const res = NextResponse.next()
    const supabase = createMiddlewareClient<Database>({ req: request, res })

    // Refresh session if expired - required for Server Components
    const { data: { session } } = await supabase.auth.getSession()

    // Handle protected routes
    const isLoggedIn = !!session?.user
    const isOnChat = request.nextUrl.pathname === '/'
    const isOnRegister = request.nextUrl.pathname === '/register'
    const isOnLogin = request.nextUrl.pathname === '/login'

    if (isLoggedIn && (isOnLogin || isOnRegister)) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    if (isOnRegister || isOnLogin) {
      return res
    }

    if (isOnChat) {
      if (isLoggedIn) return res
      return NextResponse.redirect(new URL('/login', request.url))
    }

    return res
  } catch (error) {
    return NextResponse.next()
  }
}

export const config = {
  matcher: ['/', '/login', '/register']
}
