import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function checkAuth(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isLoggedIn = !!session?.user;
  const nextUrl = new URL(request.url);
  
  const isOnChat = nextUrl.pathname.startsWith('/');
  const isOnRegister = nextUrl.pathname.startsWith('/register');
  const isOnLogin = nextUrl.pathname.startsWith('/login');

  if (isLoggedIn && (isOnLogin || isOnRegister)) {
    return Response.redirect(new URL('/', nextUrl));
  }

  if (isOnRegister || isOnLogin) {
    return true;
  }

  if (isOnChat) {
    if (isLoggedIn) return true;
    return Response.redirect(new URL('/login', nextUrl));
  }

  if (isLoggedIn) {
    return Response.redirect(new URL('/', nextUrl));
  }

  return true;
}

export type AuthRequest = {
  request: {
    nextUrl: URL;
  };
};

export type AuthConfig = {
  pages: {
    signIn: string;
    newUser: string;
  };
  callbacks: {
    authorized: (params: AuthRequest) => Promise<Response | true>;
  };
};

export const authConfig: AuthConfig = {
  pages: {
    signIn: '/login',
    newUser: '/',
  },
  callbacks: {
    authorized: async ({ request: { nextUrl } }) => {
      const supabase = createServerSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const isLoggedIn = !!session?.user;
      const isOnChat = nextUrl.pathname.startsWith('/');
      const isOnRegister = nextUrl.pathname.startsWith('/register');
      const isOnLogin = nextUrl.pathname.startsWith('/login');

      if (isLoggedIn && (isOnLogin || isOnRegister)) {
        return Response.redirect(new URL('/', nextUrl));
      }

      if (isOnRegister || isOnLogin) {
        return true;
      }

      if (isOnChat) {
        if (isLoggedIn) return true;
        return Response.redirect(new URL('/login', nextUrl));
      }

      if (isLoggedIn) {
        return Response.redirect(new URL('/', nextUrl));
      }

      return true;
    },
  },
};
