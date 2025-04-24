import { headers } from 'next/headers';
import { auth } from '@/lib/auth'; // Import the Better Auth server instance
import type { Session, User } from '@/lib/auth'; // Import inferred types

// Import Drizzle db and schema for user details query
import { db } from '@snow-leopard/db'; 
import * as schema from '@snow-leopard/db'; 
import { eq } from 'drizzle-orm';

// --- Client-Side Actions (Commented Out) ---
// Server-side sign-in, sign-up, and sign-out using simple email/password 
// are typically handled client-side with Better Auth using `authClient` from '@/lib/auth-client.ts'.
// See Better Auth documentation for `authClient.signIn.email`, `authClient.signUp.email`, and `authClient.signOut`.

// export async function signIn(email: string, password: string) {
//   // Requires using auth.api.signInEmail, potentially handling response/cookies
//   // Or initiating flow from client-side with authClient.signIn.email
//   console.warn("Server-side signIn function is deprecated. Use authClient.signIn.email on the client.");
//   throw new Error('Server-side signIn not implemented for Better Auth in this helper.');
// }

// export async function signUp(email: string, password: string) {
//   // Better Auth docs emphasize client-side signup with authClient.signUp.email
//   console.warn("Server-side signUp function is deprecated. Use authClient.signUp.email on the client.");
//   throw new Error('Server-side signUp not implemented for Better Auth in this helper.');
// }

// export async function signOut() {
//   // Better Auth docs emphasize client-side signout with authClient.signOut
//   // Server-side session invalidation happens via cookie expiration/removal triggered by client.
//   console.warn("Server-side signOut function is deprecated. Use authClient.signOut on the client.");
//   throw new Error('Server-side signOut not implemented for Better Auth in this helper.');
// }

// --- Server-Side Session/User Helpers ---

/**
 * Gets the current Better Auth session from request headers.
 * Recommended for use in Server Components, Route Handlers, Server Actions.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const readonlyHeaders = await headers(); // Await headers() result
    // Note: If headers() is not available (e.g., Pages Router getServerSideProps),
    // you might need to pass the request object and extract headers manually.
    // Better Auth also expects a standard Headers object, not ReadonlyHeaders
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders }); 
    return session;
  } catch (error) {
    console.error('[Auth Helper] Error getting session:', error);
    return null;
  }
}

/**
 * Gets the current authenticated user object from the session.
 * Returns null if the user is not authenticated.
 */
export async function getUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

// Keep original getCurrentUser for compatibility if needed, it's identical to getUser now.
export async function getCurrentUser(): Promise<User | null> {
  return await getUser();
}

/**
 * Gets additional user details from your custom 'User' table 
 * based on the authenticated user's ID.
 * Assumes your Drizzle schema has a 'User' table matching Better Auth user IDs.
 */
export async function getUserDetails(): Promise<typeof schema.user.$inferSelect | null> {
  const user = await getUser(); // Get Better Auth user
  if (!user?.id) return null;

  try {
    const userDetails = await db
      .select()
      .from(schema.user) // Use your Drizzle user schema
      .where(eq(schema.user.id, user.id))
      .limit(1);

    if (!userDetails || userDetails.length === 0) {
      console.warn(`[Auth Helper] No details found in DB for user ID: ${user.id}`);
      return null;
    }

    return userDetails[0];
  } catch (error) {
    console.error('[Auth Helper] Error getting user details:', error);
    return null;
  }
}

/**
 * Utility function to ensure a user is authenticated.
 * Throws an error if no user is found in the session.
 * @returns The authenticated user object.
 */
export async function requireAuth(): Promise<User> {
  const user = await getUser();
  if (!user) {
    throw new Error('Authentication required. User not found in session.');
  }
  return user;
}

/**
 * Utility function to ensure a user is *not* authenticated.
 * Throws an error if a user *is* found in the session.
 */
export async function requireUnauth(): Promise<void> {
  const user = await getUser();
  if (user) {
    throw new Error('User is already authenticated.');
  }
}