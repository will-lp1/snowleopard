'use server';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
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
}

export async function register(
  prevState: string | undefined,
  formData: FormData,
) {
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
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
