import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables from .env or .env.local in the current directory (packages/db)
dotenv.config({ path: ['.env', '.env.local'] });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required in packages/db/.env');
}

export default {
  schema: './src/schema.ts', // Path relative to this config file
  out: './migrations', // Output migrations directly in packages/db/migrations
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
} satisfies Config; 