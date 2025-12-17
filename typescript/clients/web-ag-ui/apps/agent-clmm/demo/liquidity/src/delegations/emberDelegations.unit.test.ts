import { encodeFunctionData, type Abi } from "viem";
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

  it("expands multicall(bytes[]) (0xac9650d8) before deriving selectors", async () => {
    const abi = [
      {
        type: "function",
        name: "multicall",
        stateMutability: "nonpayable",
        inputs: [{ name: "data", type: "bytes[]" }],
        outputs: [{ name: "results", type: "bytes[]" }],
      },
    ] as const satisfies Abi;

    const data = encodeFunctionData({
      abi,
      functionName: "multicall",
      args: [["0xaaaaaaaa", "0xbbbbbbbb"]],
    });

    const result = await createSignedDelegationsForEmberTransactions({
      transactions: [
        {
          type: "EVM_TX",
          to: "0x0000000000000000000000000000000000000001",
          data,
          chainId: "42161",
          value: "0",
        },
      ],
      delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
      delegatee: DELEGATEE,
    });

    expect(result.normalizedTransactions.map((tx) => tx.selector)).toEqual(["0xaaaaaaaa", "0xbbbbbbbb"]);
    expect(result.selectorDiagnostics[0]?.selectors).not.toContain("0xac9650d8");
  });

  it("fails closed on known-unsupported multicall selector variants", async () => {
    await expect(
      createSignedDelegationsForEmberTransactions({
        transactions: [
          {
            type: "EVM_TX",
            to: "0x0000000000000000000000000000000000000001",
            data: "0x5ae401dc",
            chainId: "42161",
            value: "0",
          },
        ],
        delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
        delegatee: DELEGATEE,
      }),
    ).rejects.toThrow(/Unsupported multicall selector/u);
  });

  it("expands fundAndRunMulticall(...) (0x58181a80) into underlying calls", async () => {
    const abi = [
      {
        type: "function",
        name: "fundAndRunMulticall",
        stateMutability: "nonpayable",
        inputs: [
          { name: "fundingToken", type: "address" },
          { name: "fundingAmount", type: "uint256" },
          {
            name: "calls",
            type: "tuple[]",
            components: [
              { name: "callType", type: "uint8" },
              { name: "target", type: "address" },
              { name: "value", type: "uint256" },
              { name: "callData", type: "bytes" },
              { name: "extraData", type: "bytes" },
            ],
          },
        ],
        outputs: [{ name: "results", type: "bytes[]" }],
      },
    ] as const satisfies Abi;

    const data = encodeFunctionData({
      abi,
      functionName: "fundAndRunMulticall",
      args: [
        "0x0000000000000000000000000000000000000011",
        0n,
        [
          {
            callType: 0,
            target: "0x0000000000000000000000000000000000000022",
            value: 0n,
            callData: "0x12345678",
            extraData: "0x",
          },
        ],
      ],
    });

    const result = await createSignedDelegationsForEmberTransactions({
      transactions: [
        {
          type: "EVM_TX",
          to: "0x00000000000000000000000000000000000000ff",
          data,
          chainId: "42161",
          value: "0",
        },
      ],
      delegatorPrivateKey: DELEGATOR_PRIVATE_KEY,
      delegatee: DELEGATEE,
    });

    expect(result.normalizedTransactions).toHaveLength(1);
    expect(result.normalizedTransactions[0]?.to).toBe("0x0000000000000000000000000000000000000022");
    expect(result.normalizedTransactions[0]?.selector).toBe("0x12345678");
  });
});
