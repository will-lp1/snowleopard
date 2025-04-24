import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client"; // Import Stripe client plugin

export const authClient = createAuthClient({
  plugins: [
    stripeClient({ 
        subscription: true // Enable client-side subscription methods
    }),
  ],
});

export type ClientSession = typeof authClient.$Infer.Session;
export type ClientUser = ClientSession["user"];

