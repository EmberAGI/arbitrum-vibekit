import { useMemo } from 'react';
import { Policy } from '@zerodev/permissions';
import { CallPolicyParams, toCallPolicy } from '@zerodev/permissions/policies';
import { Hex } from 'viem';
import { KERNEL_V2_VERSION_TYPE, KERNEL_V3_VERSION_TYPE } from '@zerodev/sdk/types';
import { EntryPointVersion } from 'viem/account-abstraction';

export type PolicyData = {
  type: 'call';
  policy: CallPolicyParams<unknown[]>;
};

export type PolicyDataResponse = {
  policy: PolicyData;
  publicSessionKey: Hex;
  kernelVersion: KERNEL_V3_VERSION_TYPE | KERNEL_V2_VERSION_TYPE;
  entryPointVersion: EntryPointVersion;
};

export interface PolicyDisplay {
  name: string;
  description: string;
  policy: string;
}

export interface ExtractedPolicies {
  policy: Policy;
  publicSessionKey: Hex;
  kernelVersion: KERNEL_V3_VERSION_TYPE | KERNEL_V2_VERSION_TYPE;
  entryPointVersion: EntryPointVersion;
  display: PolicyDisplay[];
}

/**
 * Helper function to extract data from artifact (handles both parts array and output/input)
 */
function extractArtifactData(artifact: any): any[] {
  const results: any[] = [];

  // Check for parts array structure (from A2A stream)
  if (artifact.parts && Array.isArray(artifact.parts)) {
    artifact.parts.forEach((part: any) => {
      if (part.kind === 'data' && part.data) {
        results.push(part.data);
      }
    });
  }

  // Check for output/input structure (from ToolResultRenderer)
  const data = artifact.output || artifact.input;
  if (data) {
    if (Array.isArray(data)) {
      results.push(...data);
    } else if (typeof data === 'object') {
      results.push(data);
    }
  }

  return results;
}

function processPolicy(data: PolicyData): Policy {
  switch (data.type) {
    case 'call':
      return toCallPolicy(data.policy);
    default:
      throw new Error(`Unsupported policy type: ${data.type}`);
  }
}

/**
 * Hook to extract and process policy data from artifacts
 * Separates display data from signing data while preserving the original policy structure
 */
export function usePolicyExtractor(artifacts?: Record<string, any>): ExtractedPolicies | undefined {
  return useMemo(() => {
    if (!artifacts) {
      return undefined;
    }

    const policyDisplay = artifacts['policy-display'];
    const policyData = artifacts['policy-data'];

    if (!policyDisplay || !policyData) {
      return undefined;
    }

    const policyItem = extractArtifactData(policyData)[0] as PolicyDataResponse;
    if (!policyItem) {
      return undefined;
    }

    // Convert the single policy into an array for the policies field
    const policy = processPolicy(policyItem.policy);

    return {
      policy: policy,
      publicSessionKey: policyItem.publicSessionKey,
      kernelVersion: policyItem.kernelVersion,
      entryPointVersion: policyItem.entryPointVersion,
      display: extractArtifactData(policyDisplay),
    };
  }, [artifacts]);
}
