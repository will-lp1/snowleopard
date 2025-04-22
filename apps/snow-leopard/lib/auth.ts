import 'server-only';
import { betterAuth } from 'better-auth';
// Use the adapter import path potentially provided by the core library or a plugin
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from 'better-auth/next-js';
import { db, user as schemaUser } from '@snow-leopard/db'; // Use the actual package name
import * as schema from '@snow-leopard/db'; // Import all exports if needed, or specific tables
// import { count } from 'drizzle-orm'; // No longer needed for test query

// Check for required environment variables
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('Missing BETTER_AUTH_SECRET environment variable');
}
if (!process.env.BETTER_AUTH_URL) {
    throw new Error('Missing BETTER_AUTH_URL environment variable');
}

// TODO: Verify adapter usage and potential database schema adjustments needed for Better Auth.
// The Drizzle schema might need User/Session/Account tables compatible with Better Auth.
// Refer to Better Auth Drizzle adapter documentation.
// You might need to run `npx @better-auth/cli generate` and `npx @better-auth/cli migrate` 
// after installing the adapter/plugin to update your schema.

// --> Add logging for environment variables <--
console.log('--- Checking env vars in lib/auth.ts ---');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'MISSING!');
console.log('BETTER_AUTH_SECRET:', process.env.BETTER_AUTH_SECRET ? 'Set' : 'MISSING!');
console.log('BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL ? 'Set' : 'MISSING!');
console.log('-----------------------------------------\n'); // Added newline for clarity

// Remove the test query block
// console.log('--- Attempting test query in lib/auth.ts ---');
// try {
//   const userCountResult = await db.select({ value: count() }).from(schemaUser);
//   console.log('Test query success! User count:', userCountResult[0]?.value);
// } catch (error) {
//   console.error('Test query FAILED:', error);
// }
// console.log('------------------------------------------');

// Minimal configuration based on docs
export const auth = betterAuth({
  // Database adapter config - Pass the correctly imported db instance
  database: drizzleAdapter(db, { 
    provider: 'pg',
    // schema can usually be inferred from the db instance by the adapter
  }), 
  
  // Enable email/password auth -- RE-ENABLE THIS
  emailAndPassword: {    
      enabled: true, // Set back to true
      requireEmailVerification: false // Explicitly disable verification
  },

  // Remove social providers block
  // socialProviders: {
  //   google: {
  //     clientId: process.env.GOOGLE_CLIENT_ID!,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //     // Add scope if needed, e.g., scope: ["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email"]
  //   },
  //   twitter: {
  //     clientId: process.env.TWITTER_CLIENT_ID!, // Or TWITTER_API_KEY
  //     clientSecret: process.env.TWITTER_CLIENT_SECRET!, // Or TWITTER_API_SECRET
  //     // Twitter might use OAuth 1.0a or 2.0 - check Better Auth specific docs if issues arise
  //   }
  // },

  // Add back the plugins array with nextCookies
  plugins: [
   nextCookies(),
  ],
  
  // Remove model name mappings for simplification
  // user: { modelName: "user" },
  // session: { modelName: "session" },
  // account: { modelName: "account" },
  // verification: { modelName: "verification" },

  // Core required variables
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

// Infer types for use elsewhere in the application
export type Session = typeof auth.$Infer.Session;
export type User = Session["user"]; 