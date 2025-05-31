import type { Task, DataPart } from 'a2a-samples-js';
import { GetWalletBalancesResponseSchema, type GetWalletBalancesResponse } from 'ember-schemas';

export function extractBalanceData(response: Task): GetWalletBalancesResponse {
  if (!response.artifacts) {
    throw new Error(`No artifacts found in response. Response: ${JSON.stringify(response, null, 2)}`);
  }

  // Look for wallet-balances artifact
  const walletBalancesArtifact = response.artifacts.find(artifact => artifact.name === 'wallet-balances');
  if (!walletBalancesArtifact) {
    throw new Error(`No wallet-balances artifact found. Available artifacts: ${JSON.stringify(response.artifacts.map(a => ({ name: a.name, partsCount: a.parts?.length || 0 })), null, 2)}`);
  }

  if (!walletBalancesArtifact.parts || walletBalancesArtifact.parts.length === 0) {
    throw new Error(`Wallet balances artifact has no parts. Artifact: ${JSON.stringify(walletBalancesArtifact, null, 2)}`);
  }

  // Extract the balances from the data parts
  const balances = walletBalancesArtifact.parts
    .filter((part): part is DataPart => part.type === 'data')
    .map(part => part.data);

  if (balances.length === 0) {
    throw new Error(`No data parts found in wallet balances artifact. Artifact parts: ${JSON.stringify(walletBalancesArtifact.parts, null, 2)}`);
  }

  // Construct the response object
  const walletBalancesResponse = {
    balances: balances
  };

  try {
    // Validate using schema
    return GetWalletBalancesResponseSchema.parse(walletBalancesResponse);
  } catch (error) {
    throw new Error(`Failed to parse wallet balances response. Raw data: ${JSON.stringify(walletBalancesResponse, null, 2)}. Parse error: ${error instanceof Error ? error.message : String(error)}`);
  }
} 