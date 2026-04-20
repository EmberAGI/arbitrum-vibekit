import { v5 as uuidv5, v7 } from 'uuid';

const HEX_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;
const DEFAULT_BYPASS_WALLET_ADDRESS = '0x0000000000000000000000000000000000000000';
const ANONYMOUS_THREAD_STORAGE_PREFIX = 'ember:anonymous-agent-thread';

function normalizeWalletAddress(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveBypassWalletAddress(): string | null {
  if (process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS !== 'true') {
    return null;
  }

  const configuredAddress = normalizeWalletAddress(process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS);
  const normalized = configuredAddress ?? DEFAULT_BYPASS_WALLET_ADDRESS;

  return HEX_ADDRESS_PATTERN.test(normalized) ? normalized : null;
}

export function resolveAgentThreadWalletAddress(privyAddress?: string | null): string | null {
  const normalizedPrivyAddress = normalizeWalletAddress(privyAddress);
  if (normalizedPrivyAddress) {
    return normalizedPrivyAddress;
  }

  return resolveBypassWalletAddress();
}

export function getAgentThreadId(agentId: string, privyAddress?: string | null): string | null {
  const normalized = resolveAgentThreadWalletAddress(privyAddress);
  if (!normalized) {
    return null;
  }
  return uuidv5(`copilotkit:${agentId}:${normalized}`, uuidv5.URL);
}

export function supportsAnonymousAgentThread(agentId: string): boolean {
  void agentId;
  return false;
}

export function ensureAnonymousAgentThreadId(
  agentId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
): string | null {
  if (!supportsAnonymousAgentThread(agentId)) {
    return null;
  }

  const resolvedStorage =
    storage === undefined
      ? typeof window !== 'undefined'
        ? window.localStorage
        : null
      : storage;

  if (!resolvedStorage) {
    return null;
  }

  const storageKey = `${ANONYMOUS_THREAD_STORAGE_PREFIX}:${agentId}`;
  const existing = resolvedStorage.getItem(storageKey)?.trim();
  if (existing) {
    return existing;
  }

  const created = v7();
  resolvedStorage.setItem(storageKey, created);
  return created;
}
