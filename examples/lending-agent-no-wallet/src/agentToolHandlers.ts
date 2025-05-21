import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  type TokenInfo,
} from 'ember-schemas';

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, Array<TokenInfo>>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  openRouterApiKey: string;
  aaveContextContent: string;
}

export type FindTokenResult =
  | { type: 'found'; token: TokenInfo }
  | { type: 'notFound' }
  | { type: 'clarificationNeeded'; options: TokenInfo[] };
