import { describe, expect, it } from "vitest";

import { createSignedDelegationsForEmberTransactions } from "./emberDelegations.js";

const DELEGATOR_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const DELEGATEE = "0x0000000000000000000000000000000000000002" as const;

describe("createSignedDelegationsForEmberTransactions", () => {
  it("rejects an empty transaction list", async () => {
    await expect(
      createSignedDelegationsForEmberTransactions({
        transactions: [],
        delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
        delegatee: DELEGATEE,
      }),
    ).rejects.toThrow(/empty transaction list/u);
  });

  it("rejects mixed chain IDs", async () => {
    await expect(
      createSignedDelegationsForEmberTransactions({
        transactions: [
          {
            type: "EVM_TX",
            to: "0x0000000000000000000000000000000000000001",
            data: "0x12345678",
            chainId: "42161",
            value: "0",
          },
          {
            type: "EVM_TX",
            to: "0x0000000000000000000000000000000000000001",
            data: "0x12345678",
            chainId: "1",
            value: "0",
          },
        ],
        delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
        delegatee: DELEGATEE,
      }),
    ).rejects.toThrow(/mixed chain IDs/u);
  });

  it("rejects calldata shorter than 4 bytes", async () => {
    await expect(
      createSignedDelegationsForEmberTransactions({
        transactions: [
          {
            type: "EVM_TX",
            to: "0x0000000000000000000000000000000000000001",
            data: "0x12",
            chainId: "42161",
            value: "0",
          },
        ],
        delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
        delegatee: DELEGATEE,
      }),
    ).rejects.toThrow(/Calldata too short/u);
  });

  it("rejects non-zero value by default", async () => {
    await expect(
      createSignedDelegationsForEmberTransactions({
        transactions: [
          {
            type: "EVM_TX",
            to: "0x0000000000000000000000000000000000000001",
            data: "0x12345678",
            chainId: "42161",
            value: "1",
          },
        ],
        delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
        delegatee: DELEGATEE,
      }),
    ).rejects.toThrow(/Non-zero value transaction rejected/u);
  });

  it("allows non-zero value when enabled and returns a warning", async () => {
    const result = await createSignedDelegationsForEmberTransactions({
      transactions: [
        {
          type: "EVM_TX",
          to: "0x0000000000000000000000000000000000000001",
          data: "0x12345678",
          chainId: "42161",
          value: "1",
        },
      ],
      delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
      delegatee: DELEGATEE,
      options: { allowNonZeroValue: true },
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.delegations).toHaveLength(1);
  });

  it("enforces target allowlist when enabled", async () => {
    await expect(
      createSignedDelegationsForEmberTransactions({
        transactions: [
          {
            type: "EVM_TX",
            to: "0x0000000000000000000000000000000000000001",
            data: "0x12345678",
            chainId: "42161",
            value: "0",
          },
        ],
        delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
        delegatee: DELEGATEE,
        options: {
          enforceTargetAllowlist: true,
          targetAllowlist: ["0x0000000000000000000000000000000000000002"],
        },
      }),
    ).rejects.toThrow(/Target not in allowlist/u);
  });

  it("splits delegations per target when selector sets differ (auto)", async () => {
    const result = await createSignedDelegationsForEmberTransactions({
      transactions: [
        {
          type: "EVM_TX",
          to: "0x0000000000000000000000000000000000000001",
          data: "0xaaaaaaaa",
          chainId: "42161",
          value: "0",
        },
        {
          type: "EVM_TX",
          to: "0x0000000000000000000000000000000000000002",
          data: "0xbbbbbbbb",
          chainId: "42161",
          value: "0",
        },
      ],
      delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
      delegatee: DELEGATEE,
    });

    expect(result.selectorDiagnostics).toHaveLength(2);
    expect(result.delegations).toHaveLength(2);
  });

  it("consolidates into one delegation when selector sets are identical across targets (auto)", async () => {
    const result = await createSignedDelegationsForEmberTransactions({
      transactions: [
        {
          type: "EVM_TX",
          to: "0x0000000000000000000000000000000000000001",
          data: "0xaaaaaaaa",
          chainId: "42161",
          value: "0",
        },
        {
          type: "EVM_TX",
          to: "0x0000000000000000000000000000000000000002",
          data: "0xaaaaaaaa",
          chainId: "42161",
          value: "0",
        },
      ],
      delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
      delegatee: DELEGATEE,
    });

    expect(result.selectorDiagnostics).toHaveLength(2);
    expect(result.delegations).toHaveLength(1);
  });

  it("derives selector 0x00000000 for empty calldata when enabled", async () => {
    const result = await createSignedDelegationsForEmberTransactions({
      transactions: [
        {
          type: "EVM_TX",
          to: "0x0000000000000000000000000000000000000001",
          data: "0x",
          chainId: "42161",
          value: "0",
        },
      ],
      delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
      delegatee: DELEGATEE,
      options: { allowEmptyCalldata: true },
    });

    expect(result.selectorDiagnostics[0]?.selectors[0]).toBe("0x00000000");
  });
});

