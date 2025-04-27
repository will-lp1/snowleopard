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


console.log('--- Checking env vars in lib/auth.ts ---');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'MISSING!');
console.log('BETTER_AUTH_SECRET:', process.env.BETTER_AUTH_SECRET ? 'Set' : 'MISSING!');
console.log('BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL ? 'Set' : 'MISSING!');
console.log('-----------------------------------------\n'); // Added newline for clarity


const stripeClient = process.env.STRIPE_ENABLED === 'true' && process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;


const resend = emailVerificationEnabled && process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const plans = process.env.STRIPE_ENABLED === 'true' ? [
  {
    name: "snowleopard", 
    priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,        
    annualDiscountPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID!, 
    freeTrial: {
      days: 3,
    },
  },
] : [];

type HookUser = {
  id: string;
  email?: string | null;
};

const authPlugins: any[] = [];

if (process.env.STRIPE_ENABLED === 'true') {
  console.log('Stripe is ENABLED. Adding Stripe plugin to Better Auth.');
  if (!stripeClient) {
    throw new Error('STRIPE_ENABLED is true, but STRIPE_SECRET_KEY is missing or Stripe client failed to initialize.');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_ENABLED is true, but STRIPE_WEBHOOK_SECRET is missing.');
  }
  if (plans.length === 0 || !process.env.STRIPE_PRO_MONTHLY_PRICE_ID || !process.env.STRIPE_PRO_YEARLY_PRICE_ID) {
     throw new Error('STRIPE_ENABLED is true, but required Stripe Price IDs (Monthly/Yearly) are missing or plans array is misconfigured.');
  }

  authPlugins.push(
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: plans,
        requireEmailVerification: true,
      },
    })
  );
} else {
  console.log('Stripe is DISABLED. Skipping Stripe plugin for Better Auth.');
}

// Ensure the nextCookies plugin is always last in the chain
authPlugins.push(nextCookies());

export const auth = betterAuth({
  database: drizzleAdapter(db, { 
    provider: 'pg',
  }), 
  
  emailAndPassword: {    
      enabled: true,
      requireEmailVerification: emailVerificationEnabled, 
  },

  emailVerification: {
    sendOnSignUp: emailVerificationEnabled,
    sendVerificationEmail: emailVerificationEnabled && resend ? async ({ user, url, token }: { user: HookUser, url: string, token: string }, request?: Request) => {
       if (!user.email) {
            console.error('Missing user email in sendVerificationEmail hook');
            return;
        }
        console.log(`Attempting to send verification email to ${user.email} via Resend...`);
        console.log(`Verification URL: ${url}`);
        try {
          const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM!, 
            to: [user.email],
            subject: 'Verify your email for Snow Leopard',
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
    } : undefined,
  },

  plugins: authPlugins,
  
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];
