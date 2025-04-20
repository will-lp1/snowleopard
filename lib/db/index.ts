import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Disable prefetch as it is not supported for "Transaction" pool mode
// const client = postgres(process.env.DATABASE_URL, { prepare: false }); // OLD
const client = postgres(process.env.DATABASE_URL); // NEW - Use default options
export const db = drizzle(client, { schema }); 