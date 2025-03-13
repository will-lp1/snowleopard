import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function signIn(email: string, password: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data.user;
}

export async function signUp(email: string, password: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getCurrentUser() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUser() {
  const supabase = createServerSupabaseClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('Error getting user session:', error.message);
    return null;
  }

  return session?.user ?? null;
}

export async function getUserDetails() {
  const user = await getUser();
  if (!user) return null;

  const supabase = createServerSupabaseClient();
  const { data: userDetails, error } = await supabase
    .from('User')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error getting user details:', error.message);
    return null;
  }

  return userDetails;
}

export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

export async function requireUnauth() {
  const user = await getUser();
  if (user) {
    throw new Error('Already authenticated');
  }
}
