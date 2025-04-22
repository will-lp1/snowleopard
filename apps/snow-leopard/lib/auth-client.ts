import { createAuthClient } from "better-auth/react";
// Import client-side plugins if you use any server-side plugins that have client components
// import { twoFactorClient } from "better-auth/client/plugins"; 

// Import the server auth type ONLY for type inference if needed
// import type { auth } from "./auth";
// import { inferAdditionalFields } from "better-auth/client/plugins";

// Create the client instance
// If your auth API routes are on a different domain or port than your frontend,
// you would need to specify the baseURL here.
// Since they are likely on the same origin (e.g., http://localhost:3000),
// we can omit the baseURL.
export const authClient = createAuthClient({
  // If using plugins with client-side aspects, configure them here:
  // plugins: [
  //   twoFactorClient({
  //     twoFactorPage: "/two-factor" // Example for 2FA plugin
  //   })
  // ],

  // If using additional user/session fields defined on the server,
  // infer them for type safety (requires server/client in same project/monorepo):
  // plugins: [inferAdditionalFields<typeof auth>()],
  
  // Or define additional fields manually if client/server are separate:
  // plugins: [inferAdditionalFields({ user: { role: { type: "string" } } })]
});

// Export inferred client types (optional but helpful)
export type ClientSession = typeof authClient.$Infer.Session;
export type ClientUser = ClientSession["user"];

// Export the entire client or specific methods for convenience
// It's generally safer to export the whole client and call methods on it,
// e.g., authClient.signIn.email(), authClient.useSession()
// export const { 
//     signIn, 
//     signUp, 
//     signOut, 
//     useSession, 
//     getSession, 
//     // ... other methods if needed
// } = authClient;

// You can also just export the client directly:
// export default authClient; 