import process from 'node:process';

import { bytesToHex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

type Args = {
  index: number;
  count: number;
  basePath: string;
};

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function parseArgs(argv: string[]): Args {
  // Minimal flag parsing: --index N --count N --base-path "m/44'/60'/0'/0"
  let index = 0;
  let count = 1;
  let basePath = `m/44'/60'/0'/0`;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--index') {
      index = parseInteger(next, index);
      i += 1;
      continue;
    }
    if (arg === '--count') {
      count = parseInteger(next, count);
      i += 1;
      continue;
    }
    if (arg === '--base-path') {
      if (next) {
        basePath = next;
      }
      i += 1;
      continue;
    }
  }

  if (index < 0) index = 0;
  if (count < 1) count = 1;
  if (count > 50) count = 50;

  return { index, count, basePath };
}

function resolveMnemonic(): string {
  const raw = process.env['MNEMONIC']?.trim();
  if (!raw) {
    throw new Error(
      'MNEMONIC is required. Use the `scripts/mnemonic` wrapper which prompts securely.',
    );
  }
  return raw;
}

function resolvePrivateKeyHex(account: ReturnType<typeof mnemonicToAccount>): `0x${string}` {
  const hdKey = account.getHdKey();
  const pk = hdKey.privateKey;
  if (typeof pk === 'string') {
    return pk as `0x${string}`;
  }
  return bytesToHex(pk) as `0x${string}`;
}

const args = parseArgs(process.argv.slice(2));
const mnemonic = resolveMnemonic();

for (let offset = 0; offset < args.count; offset += 1) {
  const index = args.index + offset;
  const path = `${args.basePath}/${index}`;
  const account = mnemonicToAccount(mnemonic, { path });
  const privateKey = resolvePrivateKeyHex(account);

  // Print machine-readable JSON for easy copy/paste.
  process.stdout.write(
    `${JSON.stringify({
      index,
      path,
      address: account.address,
      privateKey,
    })}\n`,
  );
}

