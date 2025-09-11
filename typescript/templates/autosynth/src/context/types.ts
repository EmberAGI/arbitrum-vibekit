/**
 * TriggerX Agent Context Types
 */

import type { TriggerXClient } from 'sdk-triggerx';

export interface TriggerXContext {
  triggerxClient: TriggerXClient;
  supportedChains: string[];
}
