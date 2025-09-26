import { randomUUID } from 'node:crypto';

export type PregenIdentifierKey = string;

export interface StoredPregenWallet {
  recordId: string;
  walletId: string;
  address?: string;
  walletType: string;
  identifierKey: PregenIdentifierKey;
  identifierValue: string;
  userShareJson: string;
  createdAt: string;
  recoverySecret?: string;
  lastUsedAt?: string;
  // Whether this pregenerated wallet has been claimed
  isClaimed: boolean;
  rawWallet: unknown;
}

const STORE: StoredPregenWallet[] = [];

export function addPregenWallet(entry: Omit<StoredPregenWallet, 'recordId' | 'createdAt' | 'isClaimed'>): StoredPregenWallet {
  const stored: StoredPregenWallet = {
    ...entry,
    recordId: randomUUID(),
    createdAt: new Date().toISOString(),
    // Ensure default claimed state if not provided by caller
    isClaimed: (entry as any).isClaimed ?? false,
  };
  STORE.push(stored);
  return stored;
}

export function findPregenWallet(identifierKey: PregenIdentifierKey, identifierValue: string): StoredPregenWallet | undefined {
  return STORE.find((wallet) => wallet.identifierKey === identifierKey && wallet.identifierValue === identifierValue);
}

export function findPregenWalletByAddress(address: string): StoredPregenWallet | undefined {
  const needle = address?.toLowerCase?.() ?? address;
  return STORE.find((wallet) => (wallet.address?.toLowerCase?.() ?? wallet.address) === needle);
}

export function listPregenWallets(): StoredPregenWallet[] {
  return STORE.map((wallet) => ({ ...wallet }));
}



export function touchPregenWallet(params: {
  identifierKey: PregenIdentifierKey;
  identifierValue: string;
}): StoredPregenWallet | undefined {
  const entry = findPregenWallet(params.identifierKey, params.identifierValue);
  if (!entry) {
    return undefined;
  }
 
  entry.lastUsedAt = new Date().toISOString();
  return { ...entry };
}

export function setPregenWalletClaimStatus(params: {
  identifierKey?: PregenIdentifierKey;
  identifierValue?: string;
  address?: string;
  isClaimed: boolean;
  recoverySecret?: string;
}): StoredPregenWallet | undefined {
  let entry: StoredPregenWallet | undefined;
  if (params.address) {
    entry = findPregenWalletByAddress(params.address);
  }
  if (!entry && params.identifierKey && params.identifierValue) {
    entry = findPregenWallet(params.identifierKey, params.identifierValue);
  }
  if (!entry) return undefined;

  entry.isClaimed = params.isClaimed;
  if (typeof params.recoverySecret !== 'undefined') {
    entry.recoverySecret = params.recoverySecret;
  }
  entry.lastUsedAt = new Date().toISOString();
  return { ...entry };
}
