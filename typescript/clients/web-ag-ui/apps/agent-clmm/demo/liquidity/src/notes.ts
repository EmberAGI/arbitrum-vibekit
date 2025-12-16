export const CAMEL0T_CLMM_NOTES = {
  goal: "Test creation + redemption of delegations for Camelot concentrated liquidity provisioning (Arbitrum).",
  next: [
    "Decide exact target contract(s) to delegate (position manager vs router).",
    "Generate transaction calldata via viem + ABI (mint/increaseLiquidity/collect), then derive 4-byte selector from calldata.",
    "Create functionCall delegation scoped to {target, selector}, redeem via DelegationManager.",
  ],
} as const;

