#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.join(currentDir, '../dist/index.js');

if (!existsSync(distEntry)) {
  console.error('allora-mcp-server: compiled output missing. Run `pnpm build` in @alloralabs/mcp-server before executing the CLI.');
  process.exit(1);
}

const distModuleUrl = pathToFileURL(distEntry).href;

await import(distModuleUrl);
