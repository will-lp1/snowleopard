'use server';

// Remove Supabase client import
// import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
// Import Better Auth types/client if needed for future server actions
// import { auth } from '@/lib/auth';
// import { authClient } from '@/lib/auth-client'; // Not typically used server-side

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  // DEPRECATED: Authentication is now handled client-side via app/(auth)/login/page.tsx using authClient.
  // This server action is no longer used for email/password login.
  console.warn("Server action 'authenticate' is deprecated. Use client-side auth.");
  // If server-side provider login (e.g., social) is needed, use auth.api methods.
  return 'Authentication logic moved to client-side login page.';
  /* Original Supabase logic:
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    });

    if (error) {
      return error.message;
    }

    redirect('/');
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Something went wrong';
  }
  */
}

export async function register(
  prevState: string | undefined,
  formData: FormData,
) {
  // DEPRECATED: Registration is now handled client-side via app/(auth)/register/page.tsx using authClient.
  // This server action is no longer used for email/password registration.
  console.warn("Server action 'register' is deprecated. Use client-side auth.");
  return 'Registration logic moved to client-side registration page.';
  /* Original Supabase logic:
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });

    if (error) {
      return error.message;
    }

    return 'Check your email to confirm your account';
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Something went wrong';
  }
  */
}

export async function logout() {
  // DEPRECATED: Logout should be initiated client-side using authClient.signOut().
  // The client-side call will invalidate the session cookies.
  // Redirecting here might happen before cookies are cleared.
  console.warn("Server action 'logout' is deprecated. Use authClient.signOut() on the client.");
  // Consider if server-side cleanup is needed beyond cookie invalidation.
  // redirect('/login'); // Redirect should happen client-side after signOut success.
  return 'Logout logic moved to client-side.';
  /* Original Supabase logic:
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
  */
}
