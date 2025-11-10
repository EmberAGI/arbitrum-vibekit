#!/usr/bin/env node

/**
 * Remove the local pnpm shim that gets created when @pnpm/exe is installed.
 * The shim should never shadow the developer's pnpm executable, otherwise
 * nested pnpm invocations inside package scripts will fail.
 */

import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const binDir = resolve(process.cwd(), 'node_modules', '.bin');
const binNames = ['pnpm', 'pnpm.cmd', 'pnpm.ps1'];

for (const bin of binNames) {
  const target = resolve(binDir, bin);
  try {
    rmSync(target);
  } catch (error) {
    if (isNoEntryError(error)) {
      continue;
    }
    console.warn(`[agent-node] Failed to remove local pnpm shim at ${target}:`, error);
  }
}

function isNoEntryError(error) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' && code === 'ENOENT';
}
