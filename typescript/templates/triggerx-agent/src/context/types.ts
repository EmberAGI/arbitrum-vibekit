/**
 * TriggerX Agent Context Types
 */

import type { ethers } from 'ethers';
import type { TriggerXClient } from 'sdk-triggerx';

export interface TriggerXContext {
  triggerxClient: TriggerXClient;
  signer: ethers.Signer;
  userAddress: string;
  supportedChains: string[];
}
