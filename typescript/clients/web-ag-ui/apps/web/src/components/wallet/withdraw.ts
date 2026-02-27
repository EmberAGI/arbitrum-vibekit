export function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

type ConnectedWalletLike = {
  address: string;
  walletClientType?: string | null;
};

export function selectConnectedDestinationWallet(input: {
  sourceAddress: string;
  wallets: ConnectedWalletLike[];
}): string | null {
  const sourceLower = input.sourceAddress.toLowerCase();

  for (const wallet of input.wallets) {
    if (wallet.walletClientType === 'privy') continue;
    if (!isHexAddress(wallet.address)) continue;
    if (wallet.address.toLowerCase() === sourceLower) continue;
    return wallet.address;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function includesUserRejectionText(value: string): boolean {
  return /(user rejected|user denied|rejected the request|denied transaction signature)/i.test(value);
}

export function isUserRejectedTransactionError(error: unknown): boolean {
  if (typeof error === 'string') {
    return includesUserRejectionText(error);
  }

  if (!isRecord(error)) return false;

  const code = error.code;
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return true;
  }

  const candidateTexts: string[] = [];
  for (const key of ['message', 'shortMessage', 'details']) {
    const value = error[key];
    if (typeof value === 'string') candidateTexts.push(value);
  }

  const cause = error.cause;
  if (isRecord(cause)) {
    const causeMessage = cause.message;
    if (typeof causeMessage === 'string') candidateTexts.push(causeMessage);
  }

  return candidateTexts.some((text) => includesUserRejectionText(text));
}

type ValidateWithdrawRequestInput = {
  mode: 'connected' | 'custom';
  customDestination: string;
  connectedDestination: string | null;
  sourceAddress: string;
  amount: string;
};

export function validateWithdrawRequest(
  input: ValidateWithdrawRequestInput,
): { ok: true; destinationAddress: string } | { ok: false; error: string } {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be greater than 0.' };
  }

  const destinationAddress =
    input.mode === 'connected' ? input.connectedDestination : input.customDestination.trim();

  if (!destinationAddress || destinationAddress.length === 0) {
    return { ok: false, error: 'No connected destination wallet available.' };
  }

  if (!isHexAddress(destinationAddress)) {
    return { ok: false, error: 'Please enter a valid wallet address.' };
  }

  if (destinationAddress.toLowerCase() === input.sourceAddress.toLowerCase()) {
    return { ok: false, error: 'Destination wallet must be different from source wallet.' };
  }

  return { ok: true, destinationAddress };
}
