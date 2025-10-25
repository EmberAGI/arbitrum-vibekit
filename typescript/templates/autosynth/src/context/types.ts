/**
 * AutoSynth Agent Context Types
 */

import type { TriggerXClient } from 'sdk-triggerx';
import type { Signer } from 'ethers';

export interface TriggerXContext {
  triggerxClient: TriggerXClient;
  supportedChains: string[];
  signer?: Signer;
}

export interface AutoSynthContext extends TriggerXContext {
  signer?: Signer;
  chainId?: number;
  triggerXApiKey?: string;
}
