import { Delegation } from "@metamask/delegation-toolkit";
import { useMemo } from "react";

export type DelegationData = {
  id: string;
  name: string;
  description: string;
  policy: string;
  delegation: Delegation;
};

interface ExtractedDelegations {
  delegationsData: DelegationData[];
}

/**
 * Helper function to extract data from artifact (handles both parts array and output/input)
 */
function extractArtifactData(artifact: any): any[] {
  const results: any[] = [];

  // Check for parts array structure (from A2A stream)
  if (artifact.parts && Array.isArray(artifact.parts)) {
    artifact.parts.forEach((part: any) => {
      if (part.kind === "data" && part.data) {
        results.push(part.data);
      }
    });
  }

  // Check for output/input structure (from ToolResultRenderer)
  const data = artifact.output || artifact.input;
  if (data) {
    if (Array.isArray(data)) {
      results.push(...data);
    } else if (typeof data === "object") {
      results.push(data);
    }
  }

  return results;
}

/**
 * Hook to extract and process delegation data from artifacts
 * Separates display data from signing data while preserving the original delegation structure
 */
export function useDelegationExtractor(
  artifacts?: Record<string, any>,
): ExtractedDelegations {
  return useMemo(() => {
    const delegationsDisplay: any[] = [];
    const delegationsData: DelegationData[] = [];
    const seenDelegationIds = new Set<string>(); // Track seen delegation IDs to prevent duplicates

    if (!artifacts) {
      return {
        delegationsData,
      };
    }

    // Extract display data
    if (artifacts["delegations-display"]) {
      const displayItems = extractArtifactData(
        artifacts["delegations-display"],
      );
      delegationsDisplay.push(...displayItems);
    }

    // Extract delegation data and transform to DelegationData format
    if (artifacts["delegations-data"]) {
      const dataItems = extractArtifactData(artifacts["delegations-data"]);

      dataItems.forEach((item: any) => {
        try {
          // Skip if we've already seen this delegation ID (prevent duplicates)
          const delegationId = item.id;
          if (seenDelegationIds.has(delegationId)) {
            console.warn(
              "[useDelegationExtractor] Skipping duplicate delegation:",
              delegationId
            );
            return;
          }
          seenDelegationIds.add(delegationId);

          // Transform to DelegationData format while preserving original delegation structure
          const delegationData: DelegationData = {
            id: delegationId,
            name: item.name || `Delegation ${delegationId}`,
            description: item.description || "Delegation policy",
            policy: item.policy || "No policy description available",
            delegation: item.delegation, // DO NOT ALTER the delegation key structure
          };

          delegationsData.push(delegationData);
        } catch (error) {
          console.error(
            "[useDelegationExtractor] Error parsing delegation data:",
            error,
            item,
          );
        }
      });
    }

    return {
      delegationsData,
    };
  }, [artifacts]);
}
