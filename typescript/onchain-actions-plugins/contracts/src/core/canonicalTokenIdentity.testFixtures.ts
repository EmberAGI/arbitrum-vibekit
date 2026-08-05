/**
 * Shared Solana Base58 fixtures for the chain-aware canonical token identity
 * test matrix (unit, integration, and packed ESM/CJS consumer tests).
 *
 * Naively lowercasing a Base58 string does not, in general, preserve its
 * decoded byte length — Base58 digit values differ by case, so folding case
 * changes the underlying numeric value and can change how many bytes it
 * takes to represent. A case-transform pair built from an unverified address
 * can therefore silently test against a string that could never occur as a
 * real Solana key. `decodedBase58ByteLength` proves both members of the pair
 * below are genuine 32-byte values (the length of a Solana ed25519 public
 * key) before any test relies on them.
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_DIGIT_VALUE = new Map(
  Array.from(BASE58_ALPHABET, (character, index) => [character, index] as const),
);

/**
 * Decodes a Base58 string and returns its byte length, or `null` if it
 * contains a character outside the Base58 alphabet. Test-only fixture
 * validity proof — not production chain-family logic. The canonical
 * identity classifier deliberately never inspects address shape; family is
 * derived from `chainId` alone.
 */
export function decodedBase58ByteLength(value: string): number | null {
  let numericValue = 0n;

  for (const character of value) {
    const digitValue = BASE58_DIGIT_VALUE.get(character);
    if (digitValue === undefined) {
      return null;
    }
    numericValue = numericValue * 58n + BigInt(digitValue);
  }

  let leadingZeroBytes = 0;
  for (const character of value) {
    if (character !== '1') break;
    leadingZeroBytes++;
  }

  let magnitudeByteCount = 0;
  while (numericValue > 0n) {
    numericValue /= 256n;
    magnitudeByteCount++;
  }

  return leadingZeroBytes + magnitudeByteCount;
}

/** A real 32-byte Solana ed25519 public key, Base58-encoded with mixed case. */
export const SOLANA_ADDRESS_MIXED_CASE = '48ZgHweqoq3sU1Y29itgvAQBhhKY4v8o87r7GFszdRGm';

/**
 * The exact-lowercase transform of {@link SOLANA_ADDRESS_MIXED_CASE}. Because
 * Base58 digit values differ by case, this is a *different* 32-byte value —
 * not the same key re-cased — so the pair proves that two independently
 * valid, case-distinct Solana addresses are never collapsed by identity
 * comparison. Both members are verified in
 * `canonicalTokenIdentity.int.test.ts` to decode to exactly 32 bytes.
 */
export const SOLANA_ADDRESS_LOWERCASED = SOLANA_ADDRESS_MIXED_CASE.toLowerCase();

/**
 * Shared evm address fixtures for the EIP-55 canonical-representation test
 * matrix (unit, integration, and packed ESM/CJS consumer tests).
 *
 * A short address such as `0xABCDEF` is not a full 20-byte evm address, so
 * it cannot exercise real format/checksum validation — it would have been
 * silently accepted by the pre-EIP-55 lowercase-only implementation this
 * fixture set replaces. Every fixture below is a genuine 20-byte (40 hex
 * character) address, and {@link EVM_ADDRESS_CHECKSUMMED} is the real EIP-55
 * checksum of {@link EVM_ADDRESS_LOWERCASE} (computed with viem's
 * `getAddress`, the same codec `canonicalTokenIdentity.ts` uses as its evm
 * family-specific codec).
 */
export const EVM_ADDRESS_LOWERCASE = '0xabc000000000000000000000000000000000000f';

/** The deterministic EIP-55 checksum form of {@link EVM_ADDRESS_LOWERCASE}. */
export const EVM_ADDRESS_CHECKSUMMED = '0xAbc000000000000000000000000000000000000F';

/**
 * {@link EVM_ADDRESS_CHECKSUMMED} with its first letter's case flipped
 * (`A` → `a`). It is still a full 20-byte hex address and still mixed-case
 * (the trailing `F` stays uppercase), but that casing no longer matches the
 * address's real EIP-55 checksum — the exact shape that a strict-mode
 * validator must reject rather than silently "correct".
 */
export const EVM_ADDRESS_INVALID_CHECKSUM = '0xabc000000000000000000000000000000000000F';

/**
 * The V1 zero/native-token placeholder address. It contains no hexadecimal
 * letters, so EIP-55 checksumming is a no-op for it — it must still parse
 * and compare exactly as before under the stricter format/checksum
 * validation {@link EVM_ADDRESS_LOWERCASE} exercises. Shared across the
 * unit, public integration, and packed ESM/CJS consumer tiers so the V1
 * zero/native-address convention is proven identically at every boundary.
 */
export const EVM_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
