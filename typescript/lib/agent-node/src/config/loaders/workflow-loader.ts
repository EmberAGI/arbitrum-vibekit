import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import { WorkflowRegistrySchema, type WorkflowRegistry } from '../schemas/workflow.schema.js';

export interface LoadedWorkflowRegistry {
  registry: WorkflowRegistry;
  path: string;
}

/**
 * Load workflow registry from JSON file
 * @param workflowPath - Path to workflow.json
 * @returns Loaded and validated workflow registry
 */
export function loadWorkflowRegistry(workflowPath: string): LoadedWorkflowRegistry {
  const fullPath = resolve(workflowPath);

  if (!existsSync(fullPath)) {
    throw new Error(`Workflow registry not found: ${fullPath}`);
  }

  try {
    const fileContent = readFileSync(fullPath, 'utf-8');
    const data: unknown = JSON.parse(fileContent);

    // Validate schema
    const registry = WorkflowRegistrySchema.parse(data);

    return {
      registry,
      path: fullPath,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load workflow registry from ${fullPath}: ${error.message}`);
    }
    throw error;
  }
}
