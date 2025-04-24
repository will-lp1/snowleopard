import 'server-only';
import { betterAuth } from 'better-auth';
// Use the adapter import path potentially provided by the core library or a plugin
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from 'better-auth/next-js';
import { db, user as schemaUser } from '@snow-leopard/db'; // Use the actual package name
import * as schema from '@snow-leopard/db'; // Import all exports if needed, or specific tables
import Stripe from "stripe"; // Import Stripe SDK
import { stripe } from "@better-auth/stripe"; // Import Better Auth Stripe plugin
import { Resend } from 'resend'; // Import Resend SDK
// import { count } from 'drizzle-orm'; // No longer needed for test query

// Check for required environment variables
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('Missing BETTER_AUTH_SECRET environment variable');
}
if (!process.env.BETTER_AUTH_URL) {
    throw new Error('Missing BETTER_AUTH_URL environment variable');
}

// Only check Stripe keys if Stripe is explicitly enabled
if (process.env.STRIPE_ENABLED === 'true') {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY but STRIPE_ENABLED is true');
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Missing STRIPE_WEBHOOK_SECRET but STRIPE_ENABLED is true');
  if (!process.env.STRIPE_PRO_MONTHLY_PRICE_ID) throw new Error('Missing STRIPE_PRO_MONTHLY_PRICE_ID but STRIPE_ENABLED is true'); // Example Price ID env var
  if (!process.env.STRIPE_PRO_YEARLY_PRICE_ID) throw new Error('Missing STRIPE_PRO_YEARLY_PRICE_ID but STRIPE_ENABLED is true'); // Add check for yearly price ID
}

// ---> Add check for email verification enabled <---
const emailVerificationEnabled = process.env.EMAIL_VERIFY_ENABLED === 'true';
console.log(`Email Verification Enabled: ${emailVerificationEnabled}`);

// Check Resend/Email From keys ONLY if verification is enabled
if (emailVerificationEnabled) {
  if (!process.env.RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY because EMAIL_VERIFY_ENABLED is true');
  if (!process.env.EMAIL_FROM) throw new Error('Missing EMAIL_FROM because EMAIL_VERIFY_ENABLED is true');
}

// Environment Variable Checks (Ensure all required vars are present)
if (process.env.STRIPE_ENABLED === 'true') {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY environment variable is missing but STRIPE_ENABLED is true.");
  }
  if (!process.env.STRIPE_PRO_MONTHLY_PRICE_ID) {
    throw new Error("STRIPE_PRO_MONTHLY_PRICE_ID environment variable is missing but STRIPE_ENABLED is true.");
  }
    if (!process.env.STRIPE_PRO_YEARLY_PRICE_ID) {
    throw new Error("STRIPE_PRO_YEARLY_PRICE_ID environment variable is missing but STRIPE_ENABLED is true.");
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is missing but STRIPE_ENABLED is true.");
  }
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

// --- Initialize SDKs ---
// Conditionally initialize Stripe client only if enabled
const stripeClient = process.env.STRIPE_ENABLED === 'true' && process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null; // Initialize as null if not enabled or secret key is missing

// ---> Conditionally initialize Resend client <---
const resend = emailVerificationEnabled && process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// --- Define Subscription Plans (only relevant if Stripe is enabled) ---
const plans = process.env.STRIPE_ENABLED === 'true' ? [
  {
    name: "snowleopard", // Plan name used in client.subscription.upgrade
    // Use keys expected by better-auth/stripe plugin documentation:
    priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,         // Standard/Monthly Price ID
    annualDiscountPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID!, // Annual Price ID
    freeTrial: {
      days: 3,
    },
  },
  // Add other plans like 'basic' (could be free) or 'enterprise' if needed
] : []; // Empty array if Stripe is not enabled

// --- Pre-define basic User type for hook annotation ---
// This avoids circular dependency with the final inferred User type
type HookUser = {
  id: string;
  email?: string | null; // Ensure email is optional as it might not always be present initially
  // Add other essential fields if needed by the hook
};

// Construct the plugins array dynamically
// Use 'any[]' to allow different plugin shapes (Stripe vs NextCookies)
const authPlugins: any[] = [
  nextCookies(),
];

// --- Conditionally add Stripe Plugin ---
if (process.env.STRIPE_ENABLED === 'true') {
  console.log('Stripe is ENABLED. Adding Stripe plugin to Better Auth.');
  if (!stripeClient) {
    // This check is redundant due to the env var check above, but good practice
    throw new Error('STRIPE_ENABLED is true, but STRIPE_SECRET_KEY is missing or Stripe client failed to initialize.');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    // Redundant check
    throw new Error('STRIPE_ENABLED is true, but STRIPE_WEBHOOK_SECRET is missing.');
  }
  if (plans.length === 0 || !process.env.STRIPE_PRO_MONTHLY_PRICE_ID || !process.env.STRIPE_PRO_YEARLY_PRICE_ID) {
     // Redundant check
     throw new Error('STRIPE_ENABLED is true, but required Stripe Price IDs (Monthly/Yearly) are missing or plans array is misconfigured.');
  }

  authPlugins.push(
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: true, // Automatically create Stripe customer
      subscription: {
        enabled: true, // Enable subscription features
        plans: plans,  // Pass the defined plans
        // Require email verification before allowing subscription actions
        requireEmailVerification: true,
      },
      // Optional event hooks
      // onCustomerCreate: async ({ customer, stripeCustomer, user }, request) => { ... },
      // onEvent: async (event) => { /* Handle custom Stripe events */ },
    })
  );
} else {
  console.log('Stripe is DISABLED. Skipping Stripe plugin for Better Auth.');
}

// Minimal configuration based on docs
export const auth = betterAuth({
  // Database adapter config - Pass the correctly imported db instance
  database: drizzleAdapter(db, { 
    provider: 'pg',
    // schema can usually be inferred from the db instance by the adapter
  }), 
  
  // Enable email/password auth -- RE-ENABLE THIS
  emailAndPassword: {    
      enabled: true,
      // ---> Use environment variable for email verification requirement <---
      requireEmailVerification: emailVerificationEnabled, 
  },

  // *** Use dedicated emailVerification block ***
  emailVerification: {
    // ---> Use environment variable for sending on sign up <---
    sendOnSignUp: emailVerificationEnabled,
    // ---> Conditionally define sendVerificationEmail function <--- 
    sendVerificationEmail: emailVerificationEnabled && resend ? async ({ user, url, token }: { user: HookUser, url: string, token: string }, request?: Request) => {
       if (!user.email) {
            console.error('Missing user email in sendVerificationEmail hook');
            return;
        }
        console.log(`Attempting to send verification email to ${user.email} via Resend...`);
        console.log(`Verification URL: ${url}`); // Log the URL better-auth provides
        try {
          // Using the url directly is recommended by better-auth docs
          const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM!, 
            to: [user.email],
            subject: 'Verify your email for Snow Leopard',
            // You can use a proper React Email template here later
            html: `<p>Welcome! Please click the link below to verify your email address:</p><p><a href="${url}">Verify Email</a></p><p>If the link doesn't work, copy and paste this URL into your browser: ${url}</p>`,
          });

          if (error) {
            console.error('Resend error:', error);
            throw new Error(`Failed to send verification email: ${error.message}`);
          }

          console.log(`Verification email sent successfully to ${user.email}. ID: ${data?.id}`);
        } catch (err) {
          console.error('Failed to send verification email:', err);
          // Handle error appropriately
        }
    } : undefined, // Set to undefined if verification is disabled or Resend is unavailable
    // Optional: Automatically sign in user after they click the link
    // autoSignInAfterVerification: true, 
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

  // Use the dynamically constructed plugins array
  plugins: authPlugins,
  
  // Remove model name mappings for simplification
  // user: { modelName: "user" },
  // session: { modelName: "session" },
  // account: { modelName: "account" },
  // verification: { modelName: "verification" },

  // Core required variables
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

// --- Type Inference (Now after auth object is defined) ---
export type Session = typeof auth.$Infer.Session;
// Define final User type based on the inferred Session
export type User = Session["user"];
// Remove incorrect subscription type inference - access via Session
// export type Subscription = typeof auth.$Infer.Subscription; 