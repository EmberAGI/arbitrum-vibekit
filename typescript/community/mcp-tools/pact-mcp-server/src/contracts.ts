/**
 * PACT Protocol contract addresses and ABIs (Arbitrum One)
 */

export const CHAIN_ID = 42161; // Arbitrum One

export const ADDRESSES = {
  pactToken: '0x809c2540358E2cF37050cCE41A610cb6CE66Abe1' as const,
  pactEscrowV2: '0x220B97972d6028Acd70221890771E275e7734BFB' as const,
  pactPaymentChannel: '0x5a9D124c05B425CD90613326577E03B3eBd1F891' as const,
} as const;

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const ESCROW_V2_ABI = [
  {
    name: 'getPact',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'pactId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'arbitrator', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'arbitratorFee', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'disputeWindow', type: 'uint256' },
          { name: 'arbitrationWindow', type: 'uint256' },
          { name: 'workSubmittedAt', type: 'uint256' },
          { name: 'disputeRaisedAt', type: 'uint256' },
          { name: 'workHash', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
  },
  {
    name: 'isReleaseable',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'pactId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'nextPactId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'create',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'arbitrator', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'arbitratorFee', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'disputeWindow', type: 'uint256' },
      { name: 'arbitrationWindow', type: 'uint256' },
    ],
    outputs: [{ name: 'pactId', type: 'uint256' }],
  },
  {
    name: 'submitWork',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pactId', type: 'uint256' },
      { name: 'workHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'pactId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'dispute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'pactId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'release',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'pactId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'reclaim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'pactId', type: 'uint256' }],
    outputs: [],
  },
] as const;

export const CHANNEL_ABI = [
  {
    name: 'getChannel',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'channelId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'agentA', type: 'address' },
          { name: 'agentB', type: 'address' },
          { name: 'depositA', type: 'uint256' },
          { name: 'depositB', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'balanceA', type: 'uint256' },
          { name: 'balanceB', type: 'uint256' },
          { name: 'closeTime', type: 'uint256' },
          { name: 'state', type: 'uint8' },
        ],
      },
    ],
  },
  {
    name: 'isSettleable',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'channelId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'nextChannelId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'open',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentB', type: 'address' },
      { name: 'depositA', type: 'uint256' },
    ],
    outputs: [{ name: 'channelId', type: 'uint256' }],
  },
  {
    name: 'fund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'depositB', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'settle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'channelId', type: 'uint256' }],
    outputs: [],
  },
] as const;

// Status names for human-readable output
export const ESCROW_STATUS = ['Active', 'WorkSubmitted', 'Disputed', 'Complete', 'Refunded'] as const;
export const CHANNEL_STATE = ['Open', 'Closing', 'Closed'] as const;

// PACT has 18 decimals
export const PACT_DECIMALS = 18n;
