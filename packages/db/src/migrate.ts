import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

// Ensure loading from .env in the current directory (packages/db)
dotenv.config({ path: ['.env', '.env.local'] });

const runMigrate = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required in packages/db/.env');
  }

  // Configure postgres client for SSL connection required by Render
  const migrationClient = postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: 'require' // Explicitly require SSL for the connection
  });

  console.log('⏳ Running migrations...');

  const start = Date.now();

  // Correct migrations folder path based on drizzle.config.ts ('./migrations')
  await migrate(drizzle(migrationClient), { migrationsFolder: 'migrations' });

  const end = Date.now();

  console.log(`✅ Migrations completed in ${end - start}ms`);

  process.exit(0);
};

runMigrate().catch((err) => {
  console.error('❌ Migration failed');
  console.error(err);
  process.exit(1);
}); 