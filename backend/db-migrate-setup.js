#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const backendDir = __dirname; // Assumes this script is in backend/
const migrationsDir = path.join(backendDir, 'migrations');
const pgMigrateRcPath = path.join(migrationsDir, '.pgmigraterc.js');
const envFilePath = path.join(backendDir, '.env');
const schemaSqlPath = path.join(backendDir, 'database', 'schema.sql');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, ans => {
    resolve(ans);
  }));
}

async function main() {
  console.log('🚀 AdventureConnect: node-pg-migrate Setup Script 🚀');
  console.log('--------------------------------------------------\n');
  console.log('This script will guide you through setting up database migrations using node-pg-migrate.');

  // --- 1. Dependency Check ---
  console.log('\n--- Step 1: Dependencies ---');
  console.log('Please ensure you have the following Node.js packages installed in your `backend` directory:');
  console.log('  - `node-pg-migrate`: For running migrations.');
  console.log('  - `dotenv`: For loading environment variables from the .env file.');
  console.log('\nIf not installed, run this in your `backend` directory:');
  console.log('  `npm install --save-dev node-pg-migrate dotenv`');
  console.log('(If you don\'t have a `package.json` in `backend/`, run `npm init -y` first.)\n');
  const proceedDeps = await askQuestion('Have you installed these dependencies? (yes/no): ');
  if (proceedDeps.toLowerCase() !== 'yes') {
    console.log('Please install the dependencies and re-run this script. Exiting.');
    rl.close();
    return;
  }

  // --- 2. Migrations Directory ---
  console.log('\n--- Step 2: Migrations Directory ---');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    console.log(`✅ Created migrations directory: ${migrationsDir}`);
  } else {
    console.log(`ℹ️ Migrations directory already exists: ${migrationsDir}`);
  }

  // --- 3. Configuration File ---
  console.log('\n--- Step 3: Migration Configuration File ---');
  const pgMigrateRcContent = `// backend/migrations/.pgmigraterc.js
// This file configures node-pg-migrate.
// It loads the DATABASE_URL from your backend/.env file.

// Ensure dotenv is available. If this script is run via 'npx node-pg-migrate',
// dotenv might not be loaded automatically from the project root for this config file.
// So, we require it explicitly here.
try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
} catch (e) {
  console.warn(
    'Could not load .env file from backend/migrations/.pgmigraterc.js. ' +
    'Ensure DATABASE_URL is set in your environment if not using .env for migrations.'
  );
}

module.exports = {
  // Connection string for the database. Loaded from .env.
  databaseUrl: process.env.DATABASE_URL,

  // Name of the table to keep track of applied migrations.
  migrationsTable: 'pgmigrations', // Default: pgmigrations

  // Directory where migration files are stored, relative to this config file.
  dir: '.',

  // Specify the schema to run migrations in, if needed (e.g., 'public')
  // schema: 'public',

  // Enable/disable transactions for migrations.
  // true: run each migration inside a transaction.
  // false: run each migration without a transaction (useful for certain DDL commands).
  // 'disable': same as false.
  migrationsTransaction: 'disable', // Often DDL like CREATE EXTENSION needs this

  // For SSL connections to PostgreSQL (e.g., on Railway, Heroku, AWS RDS)
  // Set DB_SSL=true and optionally DB_SSL_REJECT_UNAUTHORIZED=false in your .env
  ssl: process.env.DB_SSL === 'true' 
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } 
    : false,
  
  // Decides how to acquire a client from the pg connection pool.
  // It is possible to use a connection string or a custom pg client instance.
  // Alternatively, you can define 'user', 'host', 'database', 'password', 'port' individually.
  // Check node-pg-migrate documentation for more options.
};
`;
  fs.writeFileSync(pgMigrateRcPath, pgMigrateRcContent);
  console.log(`✅ Created migration configuration file: ${pgMigrateRcPath}`);
  console.log('   This file is configured to use the DATABASE_URL from your `backend/.env` file.');

  // --- 4. .env File Check ---
  console.log('\n--- Step 4: .env File ---');
  console.log(`Please ensure your \`backend/.env\` file exists and contains a valid \`DATABASE_URL\`.`);
  console.log('Example for local development:');
  console.log('  `DATABASE_URL=postgresql://your_user:your_password@localhost:5432/adventureconnect_dev`');
  console.log('If you use SSL for your database (common in production/staging, e.g., Railway), also set:');
  console.log('  `DB_SSL=true`');
  console.log('  `# DB_SSL_REJECT_UNAUTHORIZED=false` (if using self-signed certs or some cloud providers)');

  if (!fs.existsSync(envFilePath)) {
    console.warn(`\n⚠️ Warning: \`backend/.env\` file not found. Please create it with your DATABASE_URL.`);
  } else {
    const envContent = fs.readFileSync(envFilePath, 'utf-8');
    if (!envContent.includes('DATABASE_URL=')) {
      console.warn(`\n⚠️ Warning: \`DATABASE_URL\` not found in \`backend/.env\`. Please add it.`);
    } else {
      console.log(`\n✅ \`backend/.env\` file found. Ensure DATABASE_URL is correctly set.`);
    }
  }

  // --- 5. Initial Migration from schema.sql ---
  console.log('\n--- Step 5: Creating an Initial Migration from existing schema.sql ---');
  console.log('Since you have an existing `backend/database/schema.sql`, we should create an initial migration from it.');
  const initialMigrationName = 'initial-schema-setup';
  console.log(`\n1. Create the first migration file. Run this command in your \`backend\` directory:`);
  console.log(`     \`npx node-pg-migrate -m "${migrationsDir}" create ${initialMigrationName}\``);
  console.log(`   (If node-pg-migrate is installed globally, you can use: \`node-pg-migrate -m "${migrationsDir}" create ${initialMigrationName}\`)`);

  console.log(`\n2. Open the newly created migration file in \`${migrationsDir}/\`. It will have a timestamp prefix.`);
  console.log(`   Example: \`${migrationsDir}/<timestamp>-${initialMigrationName}.js\``);

  console.log(`\n3. Copy the entire content of your \`backend/database/schema.sql\` file into the \`exports.up\` function of this new migration file.`);
  console.log(`   Replace the placeholder content in \`exports.up\` with your SQL schema.`);
  console.log('   Your `exports.up` function should look something like this:');
  console.log('   ----------------------------------------------------------');
  console.log('   exports.up = pgm => {');
  console.log('     pgm.sql(`');
  console.log('       -- Paste content of schema.sql here --');
  console.log('       CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  console.log('       CREATE TABLE IF NOT EXISTS users ( ... );');
  console.log('       -- ... and so on for all your tables and indexes ...');
  console.log('     `);');
  console.log('   };');
  console.log('   ----------------------------------------------------------');
  console.log(`   NOTE: Ensure any comments in your SQL are valid within JavaScript template literals (e.g., avoid backticks \` inside the SQL comments).`);
  console.log(`   Consider setting 'migrationsTransaction: "disable"' in .pgmigraterc.js if your schema.sql has transaction-breaking statements (like CREATE EXTENSION outside a transaction).`);


  console.log(`\n4. Define the \`exports.down\` function. This function should revert the changes made by \`exports.up\`.`);
  console.log(`   For an initial schema, this usually means dropping all tables created in \`exports.up\`.`);
  console.log('   Example `exports.down` (drop tables in reverse order of creation, considering dependencies):');
  console.log('   ----------------------------------------------------------');
  console.log('   exports.down = pgm => {');
  console.log('     pgm.sql(`');
  console.log('       DROP TABLE IF EXISTS notifications CASCADE;');
  console.log('       DROP TABLE IF EXISTS custom_trips CASCADE;');
  console.log('       DROP TABLE IF EXISTS user_favorites CASCADE;');
  console.log('       DROP TABLE IF EXISTS pricing_rules CASCADE;');
  console.log('       DROP TABLE IF EXISTS locations CASCADE;');
  console.log('       DROP TABLE IF EXISTS hotel_cache CASCADE;');
  console.log('       DROP TABLE IF EXISTS flight_cache CASCADE;');
  console.log('       DROP TABLE IF EXISTS bookings CASCADE;');
  console.log('       DROP TABLE IF EXISTS search_history CASCADE;');
  console.log('       DROP TABLE IF EXISTS users CASCADE;');
  console.log('       DROP EXTENSION IF EXISTS "uuid-ossp";');
  console.log('     `);');
  console.log('   };');
  console.log('   ----------------------------------------------------------');
  console.log('   Adjust the table names and order based on your actual schema and dependencies.');

  // --- 6. Running Migrations ---
  console.log('\n--- Step 6: Running Migrations ---');
  console.log('Once your initial migration file is prepared:');
  console.log('\n1. Apply the migration (run from `backend/` directory):');
  console.log(`     \`npx node-pg-migrate -m "${migrationsDir}" up\``);
  console.log('   This will create the tables in your database and record the migration in the `pgmigrations` table.');

  console.log('\n2. To revert the last migration (run from `backend/` directory):');
  console.log(`     \`npx node-pg-migrate -m "${migrationsDir}" down\``);

  console.log('\nFor future schema changes:');
  console.log('  - Create a new migration: `npx node-pg-migrate -m "migrations" create describe_your_change`');
  console.log('  - Edit the new file to define `exports.up` and `exports.down`.');
  console.log('  - Apply with `npx node-pg-migrate -m "migrations" up`.');

  // --- 7. Package.json Scripts (Recommended) ---
  console.log('\n--- Step 7: Add Scripts to package.json (Recommended) ---');
  console.log('Consider adding these scripts to your `backend/package.json` for easier use:');
  console.log('----------------------------------------------------------');
  console.log('  "scripts": {');
  console.log('    "db:migrate:create": "node-pg-migrate -m \\"migrations\\" create",');
  console.log('    "db:migrate:up": "node-pg-migrate -m \\"migrations\\" up",');
  console.log('    "db:migrate:down": "node-pg-migrate -m \\"migrations\\" down",');
  console.log('    "db:migrate:status": "node-pg-migrate -m \\"migrations\\" status"');
  console.log('    // Add other scripts as needed');
  console.log('  }');
  console.log('----------------------------------------------------------');
  console.log('Then you can run them with `npm run db:migrate:create -- name_of_migration`, `npm run db:migrate:up`, etc.');
  console.log('Note: The `-m "migrations"` part tells node-pg-migrate where to find the .pgmigraterc.js and migration files.');

  console.log('\n\n🎉 Setup guidance complete! 🎉');
  console.log('Follow the steps above to integrate database migrations into your project.');
  console.log('Remember to test your migrations thoroughly in a development environment.');

  rl.close();
}

main().catch(err => {
  console.error('\nAn error occurred during setup:', err);
  rl.close();
  process.exit(1);
});
