/**
 * Server Entry Point Loader
 * Loads environment variables before importing the main server module
 */

import process from 'node:process';

// Load environment variables BEFORE any application imports
// This must happen before config.ts is loaded by any module
try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local is optional, ignore if not found
}

try {
  process.loadEnvFile('.env');
} catch {
  // .env may not exist in production (uses actual env vars)
}

// Now import and run the server (this will import config.ts with env vars already loaded)
await import('./server.js');
