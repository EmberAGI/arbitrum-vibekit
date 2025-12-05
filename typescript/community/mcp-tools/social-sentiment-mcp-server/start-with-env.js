#!/usr/bin/env node

/**
 * Wrapper script to load .env file before starting the MCP server
 * This is needed because Node.js < 20.6 doesn't support --env-file flag
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file manually
try {
  const envPath = join(__dirname, '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  
  // Parse .env file (simple parser - handles KEY=value format)
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Set environment variable if not already set
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
} catch (error) {
  // .env file not found or error reading - continue without it
  console.error('Warning: Could not load .env file:', error.message);
}

// Spawn the actual server with all environment variables
const serverPath = join(__dirname, 'dist', 'index.js');
const child = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

