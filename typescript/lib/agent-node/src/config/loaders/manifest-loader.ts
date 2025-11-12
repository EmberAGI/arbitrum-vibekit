import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import { AgentManifestSchema, type AgentManifest } from '../schemas/manifest.schema.js';

export interface LoadedManifest {
  manifest: AgentManifest;
  path: string;
}

/**
 * Load agent manifest from JSON file
 * @param manifestPath - Path to agent.manifest.json
 * @returns Loaded and validated manifest
 */
export function loadManifest(manifestPath: string): LoadedManifest {
  const fullPath = resolve(manifestPath);

  if (!existsSync(fullPath)) {
    throw new Error(`Manifest file not found: ${fullPath}`);
  }

  try {
    const fileContent = readFileSync(fullPath, 'utf-8');
    const data: unknown = JSON.parse(fileContent);

    // Validate manifest
    const manifest = AgentManifestSchema.parse(data);

    return {
      manifest,
      path: fullPath,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load manifest from ${fullPath}: ${error.message}`);
    }
    throw error;
  }
}
