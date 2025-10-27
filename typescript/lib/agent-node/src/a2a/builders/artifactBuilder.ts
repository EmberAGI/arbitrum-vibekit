/**
 * Artifact message builder for A2A Agent Executor
 */

import type { WorkflowExecution } from '../../workflows/types.js';

/**
 * Builds a descriptive message text for an artifact
 */
export function buildArtifactMessageText(
  artifact: unknown,
  execution: WorkflowExecution,
  requestActionText?: string,
): string {
  const defaultText = 'Artifact generated';
  if (!artifact || typeof artifact !== 'object') {
    return defaultText;
  }

  const artifactRecord = artifact as {
    name?: unknown;
    description?: unknown;
    metadata?: unknown;
  };

  const artifactName = typeof artifactRecord.name === 'string' ? artifactRecord.name : undefined;
  const metadataSummary = getArtifactMetadataSummary(artifactRecord.metadata);
  const description =
    typeof artifactRecord.description === 'string' ? artifactRecord.description : undefined;
  const actionText = requestActionText ?? getActionTextFromExecution(execution);

  if (artifactName && actionText) {
    const normalizedName = artifactName.toLowerCase();
    if (normalizedName === 'tx-summary.json') {
      return `Transaction summary prepared for request: ${actionText}. Please confirm to proceed.`;
    }
    if (normalizedName === 'unsigned-tx') {
      return `Unsigned transaction generated for request: ${actionText}`;
    }
    if (normalizedName === 'tx-status.jsonl') {
      return `Transaction status log updated for request: ${actionText}`;
    }
    if (normalizedName === 'tx-receipt.json') {
      return `Transaction receipt available for request: ${actionText}`;
    }
  }

  if (metadataSummary) {
    return metadataSummary;
  }

  if (description) {
    return description;
  }

  return defaultText;
}

/**
 * Extracts a summary from artifact metadata
 */
function getArtifactMetadataSummary(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const summaryCandidate = (metadata as { summary?: unknown }).summary;
  if (typeof summaryCandidate === 'string' && summaryCandidate.trim().length > 0) {
    return summaryCandidate;
  }

  return undefined;
}

/**
 * Extracts action text from workflow parameters
 */
export function getActionTextFromParams(
  params: Record<string, unknown> | undefined,
): string | undefined {
  if (!params) {
    return undefined;
  }

  const actionCandidate = params['action'];
  if (typeof actionCandidate === 'string' && actionCandidate.trim().length > 0) {
    return actionCandidate.trim();
  }

  return undefined;
}

/**
 * Extracts action text from a workflow execution
 */
function getActionTextFromExecution(execution: WorkflowExecution): string | undefined {
  const parameters = execution?.context?.parameters;
  if (!parameters || typeof parameters !== 'object') {
    return undefined;
  }

  const actionCandidate = (parameters as { action?: unknown }).action;
  if (typeof actionCandidate === 'string' && actionCandidate.trim().length > 0) {
    return actionCandidate.trim();
  }

  return undefined;
}
