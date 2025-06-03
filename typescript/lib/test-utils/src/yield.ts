import type { Task, DataPart } from 'a2a-samples-js';
import { GetYieldMarketsResponseSchema, type GetYieldMarketsResponse } from 'ember-schemas';

export function extractYieldMarketsData(response: Task): GetYieldMarketsResponse {
  if (!response.artifacts) {
    throw new Error(`No artifacts found in response. Response: ${JSON.stringify(response, null, 2)}`);
  }

  // Look for yield-markets artifact
  const yieldMarketsArtifact = response.artifacts.find(artifact => artifact.name === 'yield-markets');
  if (!yieldMarketsArtifact) {
    throw new Error(`No yield-markets artifact found. Available artifacts: ${JSON.stringify(response.artifacts.map(a => ({ name: a.name, partsCount: a.parts?.length || 0 })), null, 2)}`);
  }

  if (!yieldMarketsArtifact.parts || yieldMarketsArtifact.parts.length === 0) {
    throw new Error(`Yield markets artifact has no parts. Artifact: ${JSON.stringify(yieldMarketsArtifact, null, 2)}`);
  }

  // Extract the markets from the data parts
  const markets = yieldMarketsArtifact.parts
    .filter((part): part is DataPart => part.type === 'data')
    .map(part => part.data);

  if (markets.length === 0) {
    throw new Error(`No data parts found in yield markets artifact. Artifact parts: ${JSON.stringify(yieldMarketsArtifact.parts, null, 2)}`);
  }

  // Construct the response object
  const yieldMarketsResponse = {
    markets: markets
  };

  try {
    // Validate using schema
    return GetYieldMarketsResponseSchema.parse(yieldMarketsResponse);
  } catch (error) {
    throw new Error(`Failed to parse yield markets response. Raw data: ${JSON.stringify(yieldMarketsResponse, null, 2)}. Parse error: ${error instanceof Error ? error.message : String(error)}`);
  }
} 