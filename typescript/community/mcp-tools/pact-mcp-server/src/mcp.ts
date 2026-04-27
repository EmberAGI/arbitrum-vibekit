import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createPublicClient, http, encodeFunctionData, parseUnits, formatUnits, isAddress } from 'viem';
import { arbitrum } from 'viem/chains';
import {
  ADDRESSES,
  CHAIN_ID,
  ERC20_ABI,
  ESCROW_V2_ABI,
  CHANNEL_ABI,
  ESCROW_STATUS,
  CHANNEL_STATE,
  PACT_DECIMALS,
} from './contracts.js';

const RPC_URL = process.env['ARBITRUM_RPC_URL'] ?? 'https://arb1.arbitrum.io/rpc';

function getPublicClient() {
  return createPublicClient({
    chain: arbitrum,
    transport: http(RPC_URL),
  });
}

// Helper: convert human-readable PACT amount ("100") to wei (bigint)
function parsePact(amount: string): bigint {
  return parseUnits(amount, Number(PACT_DECIMALS));
}

// Helper: format wei to human-readable PACT
function formatPact(wei: bigint): string {
  return formatUnits(wei, Number(PACT_DECIMALS));
}

// Transaction plan returned by builder tools
interface TransactionPlan {
  chainId: number;
  to: string;
  data: string;
  value: string;
  description: string;
  // For multi-step flows, we may return a sequence
  steps?: { to: string; data: string; description: string }[];
}

export async function createServer() {
  const server = new McpServer({
    name: 'pact-mcp-server',
    version: '1.0.0',
  });

  // ─────────────────────── Query: Get Escrow ───────────────────────

  server.tool(
    'pact_get_escrow',
    'Read a PACT escrow agreement from Arbitrum. Returns creator, recipient, amount, status, deadline, and work submission details.',
    {
      pactId: z.number().int().nonnegative().describe('The escrow pact ID to look up'),
    },
    async ({ pactId }) => {
      try {
        const client = getPublicClient();
        const pact = await client.readContract({
          address: ADDRESSES.pactEscrowV2,
          abi: ESCROW_V2_ABI,
          functionName: 'getPact',
          args: [BigInt(pactId)],
        });

        const isReleaseable = await client.readContract({
          address: ADDRESSES.pactEscrowV2,
          abi: ESCROW_V2_ABI,
          functionName: 'isReleaseable',
          args: [BigInt(pactId)],
        });

        const statusName = ESCROW_STATUS[pact.status] ?? 'Unknown';
        const deadlineDate = new Date(Number(pact.deadline) * 1000).toISOString();

        const result = {
          pactId,
          creator: pact.creator,
          recipient: pact.recipient,
          arbitrator: pact.arbitrator === '0x0000000000000000000000000000000000000000' ? 'none' : pact.arbitrator,
          amount: `${formatPact(pact.amount)} PACT`,
          amountWei: pact.amount.toString(),
          arbitratorFee: `${formatPact(pact.arbitratorFee)} PACT`,
          deadline: deadlineDate,
          deadlineUnix: pact.deadline.toString(),
          disputeWindowSeconds: pact.disputeWindow.toString(),
          arbitrationWindowSeconds: pact.arbitrationWindow.toString(),
          status: statusName,
          workSubmittedAt: pact.workSubmittedAt > 0n ? new Date(Number(pact.workSubmittedAt) * 1000).toISOString() : 'not submitted',
          disputeRaisedAt: pact.disputeRaisedAt > 0n ? new Date(Number(pact.disputeRaisedAt) * 1000).toISOString() : 'no dispute',
          workHash: pact.workHash === '0x0000000000000000000000000000000000000000000000000000000000000000' ? 'none' : pact.workHash,
          isReleaseable,
          escrowContract: ADDRESSES.pactEscrowV2,
          explorerUrl: `https://arbiscan.io/address/${ADDRESSES.pactEscrowV2}`,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to read escrow: ${(err as Error).message}` }, null, 2) }],
        };
      }
    },
  );

  // ─────────────────────── Query: Get Channel ──────────────────────

  server.tool(
    'pact_get_channel',
    'Read a PACT payment channel from Arbitrum. Returns both agents, balances, nonce, and channel state.',
    {
      channelId: z.number().int().nonnegative().describe('The payment channel ID to look up'),
    },
    async ({ channelId }) => {
      try {
        const client = getPublicClient();
        const ch = await client.readContract({
          address: ADDRESSES.pactPaymentChannel,
          abi: CHANNEL_ABI,
          functionName: 'getChannel',
          args: [BigInt(channelId)],
        });

        const isSettleable = await client.readContract({
          address: ADDRESSES.pactPaymentChannel,
          abi: CHANNEL_ABI,
          functionName: 'isSettleable',
          args: [BigInt(channelId)],
        });

        const stateName = CHANNEL_STATE[ch.state] ?? 'Unknown';

        const result = {
          channelId,
          agentA: ch.agentA,
          agentB: ch.agentB,
          depositA: `${formatPact(ch.depositA)} PACT`,
          depositB: `${formatPact(ch.depositB)} PACT`,
          nonce: ch.nonce.toString(),
          balanceA: `${formatPact(ch.balanceA)} PACT`,
          balanceB: `${formatPact(ch.balanceB)} PACT`,
          state: stateName,
          closeTime: ch.closeTime > 0n ? new Date(Number(ch.closeTime) * 1000).toISOString() : 'not closing',
          isSettleable,
          channelContract: ADDRESSES.pactPaymentChannel,
          explorerUrl: `https://arbiscan.io/address/${ADDRESSES.pactPaymentChannel}`,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to read channel: ${(err as Error).message}` }, null, 2) }],
        };
      }
    },
  );

  // ─────────────────────── Query: PACT Balance ─────────────────────

  server.tool(
    'pact_get_balance',
    'Get the PACT token balance of any address on Arbitrum.',
    {
      address: z.string().describe('The wallet address to check'),
    },
    async ({ address }) => {
      try {
        if (!isAddress(address)) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid Ethereum address' }, null, 2) }] };
        }
        const client = getPublicClient();
        const balance = await client.readContract({
          address: ADDRESSES.pactToken,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              address,
              balance: `${formatPact(balance)} PACT`,
              balanceWei: balance.toString(),
              tokenContract: ADDRESSES.pactToken,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to read balance: ${(err as Error).message}` }, null, 2) }],
        };
      }
    },
  );

  // ─────────────────────── Builder: Approve Token ──────────────────

  server.tool(
    'pact_build_approve_token',
    'Build an unsigned ERC-20 approve transaction to allow PactEscrow or PactPaymentChannel to spend PACT tokens. Must be submitted before creating an escrow or opening/funding a channel.',
    {
      spender: z.enum(['escrow', 'channel']).describe('Which contract to approve: "escrow" for PactEscrowV2, "channel" for PactPaymentChannel'),
      amount: z.string().describe('Amount of PACT to approve, in human-readable form (e.g. "100" for 100 PACT)'),
    },
    async ({ spender, amount }) => {
      try {
        const spenderAddress = spender === 'escrow' ? ADDRESSES.pactEscrowV2 : ADDRESSES.pactPaymentChannel;
        const amountWei = parsePact(amount);

        const data = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spenderAddress, amountWei],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactToken,
          data,
          value: '0',
          description: `Approve ${amount} PACT for ${spender === 'escrow' ? 'PactEscrowV2' : 'PactPaymentChannel'} (${spenderAddress})`,
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Builder: Create Escrow ──────────────────

  server.tool(
    'pact_build_create_escrow',
    'Build an unsigned transaction to create a PACT escrow agreement. Requires a prior approve transaction for the escrow contract. Returns transaction calldata to submit on Arbitrum.',
    {
      recipient: z.string().describe('Address of the agent who will do the work'),
      amount: z.string().describe('PACT tokens to lock in escrow, e.g. "500"'),
      deadlineHours: z.number().positive().describe('Hours from now until the deadline (minimum 1)'),
      arbitrator: z.string().optional().describe('Optional arbitrator address. Omit or use "0x0000000000000000000000000000000000000000" for no arbitration.'),
      arbitratorFee: z.string().optional().describe('PACT tokens paid to arbitrator if invoked, e.g. "50". Required if arbitrator is set.'),
      disputeWindowHours: z.number().optional().describe('Hours creator has to dispute after work is submitted (minimum 1, default 24)'),
      arbitrationWindowHours: z.number().optional().describe('Hours arbitrator has to rule after dispute (minimum 24, default 72). Only relevant if arbitrator is set.'),
    },
    async ({ recipient, amount, deadlineHours, arbitrator, arbitratorFee, disputeWindowHours, arbitrationWindowHours }) => {
      try {
        if (!isAddress(recipient)) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid recipient address' }, null, 2) }] };
        }

        const arbitratorAddr = (arbitrator && isAddress(arbitrator))
          ? arbitrator as `0x${string}`
          : '0x0000000000000000000000000000000000000000' as `0x${string}`;

        const amountWei = parsePact(amount);
        const feeWei = arbitratorFee ? parsePact(arbitratorFee) : 0n;

        const nowSec = Math.floor(Date.now() / 1000);
        const deadlineSec = BigInt(nowSec + deadlineHours * 3600);

        const disputeWindowSec = BigInt(Math.max((disputeWindowHours ?? 24) * 3600, 3600)); // min 1h
        const arbitrationWindowSec = BigInt(Math.max((arbitrationWindowHours ?? 72) * 3600, 86400)); // min 24h

        const data = encodeFunctionData({
          abi: ESCROW_V2_ABI,
          functionName: 'create',
          args: [
            recipient as `0x${string}`,
            arbitratorAddr,
            amountWei,
            feeWei,
            deadlineSec,
            disputeWindowSec,
            arbitrationWindowSec,
          ],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactEscrowV2,
          data,
          value: '0',
          description: `Create escrow: ${amount} PACT to ${recipient}, deadline in ${deadlineHours}h`,
          steps: [
            {
              to: ADDRESSES.pactToken,
              data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [ADDRESSES.pactEscrowV2, amountWei],
              }),
              description: `Step 1: Approve ${amount} PACT for PactEscrowV2`,
            },
            {
              to: ADDRESSES.pactEscrowV2,
              data,
              description: `Step 2: Create escrow for ${amount} PACT`,
            },
          ],
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Builder: Submit Work ────────────────────

  server.tool(
    'pact_build_submit_work',
    'Build an unsigned transaction for a recipient to submit work evidence on a PACT escrow. The workHash is a SHA256 or IPFS CID commitment to off-chain evidence.',
    {
      pactId: z.number().int().nonnegative().describe('The escrow pact ID'),
      workHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe('32-byte hex hash of work evidence (SHA256 or similar). Format: 0x followed by 64 hex chars.'),
    },
    async ({ pactId, workHash }) => {
      try {
        const data = encodeFunctionData({
          abi: ESCROW_V2_ABI,
          functionName: 'submitWork',
          args: [BigInt(pactId), workHash as `0x${string}`],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactEscrowV2,
          data,
          value: '0',
          description: `Submit work for pact #${pactId} with hash ${workHash}`,
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Builder: Approve Escrow ─────────────────

  server.tool(
    'pact_build_approve_escrow',
    'Build an unsigned transaction for the creator to approve (accept) submitted work on a PACT escrow. This releases tokens to the recipient.',
    {
      pactId: z.number().int().nonnegative().describe('The escrow pact ID to approve'),
    },
    async ({ pactId }) => {
      try {
        const data = encodeFunctionData({
          abi: ESCROW_V2_ABI,
          functionName: 'approve',
          args: [BigInt(pactId)],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactEscrowV2,
          data,
          value: '0',
          description: `Approve work and release funds for pact #${pactId}`,
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Builder: Dispute Escrow ─────────────────

  server.tool(
    'pact_build_dispute_escrow',
    'Build an unsigned transaction for the creator to dispute submitted work on a PACT escrow. Only valid after work is submitted and during the dispute window.',
    {
      pactId: z.number().int().nonnegative().describe('The escrow pact ID to dispute'),
    },
    async ({ pactId }) => {
      try {
        const data = encodeFunctionData({
          abi: ESCROW_V2_ABI,
          functionName: 'dispute',
          args: [BigInt(pactId)],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactEscrowV2,
          data,
          value: '0',
          description: `Dispute work submission for pact #${pactId}`,
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Builder: Release Escrow ─────────────────

  server.tool(
    'pact_build_release_escrow',
    'Build an unsigned transaction to release funds to the recipient after the dispute window expires without a dispute. Anyone can call this.',
    {
      pactId: z.number().int().nonnegative().describe('The escrow pact ID to release'),
    },
    async ({ pactId }) => {
      try {
        const data = encodeFunctionData({
          abi: ESCROW_V2_ABI,
          functionName: 'release',
          args: [BigInt(pactId)],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactEscrowV2,
          data,
          value: '0',
          description: `Release funds to recipient for pact #${pactId} (anyone can call after dispute window)`,
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Builder: Reclaim Escrow ─────────────────

  server.tool(
    'pact_build_reclaim_escrow',
    'Build an unsigned transaction for the creator to reclaim locked PACT if the deadline passed without work being submitted.',
    {
      pactId: z.number().int().nonnegative().describe('The escrow pact ID to reclaim'),
    },
    async ({ pactId }) => {
      try {
        const data = encodeFunctionData({
          abi: ESCROW_V2_ABI,
          functionName: 'reclaim',
          args: [BigInt(pactId)],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactEscrowV2,
          data,
          value: '0',
          description: `Reclaim PACT from expired pact #${pactId}`,
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Builder: Open Channel ───────────────────

  server.tool(
    'pact_build_open_channel',
    'Build unsigned transactions to open a PACT payment channel with another agent. Returns both the approve and open calldata as steps.',
    {
      agentB: z.string().describe('Address of the counterparty agent'),
      depositA: z.string().describe('PACT tokens to deposit when opening (e.g. "500")'),
    },
    async ({ agentB, depositA }) => {
      try {
        if (!isAddress(agentB)) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid agentB address' }, null, 2) }] };
        }

        const depositAWei = parsePact(depositA);

        const openData = encodeFunctionData({
          abi: CHANNEL_ABI,
          functionName: 'open',
          args: [agentB as `0x${string}`, depositAWei],
        });

        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ADDRESSES.pactPaymentChannel, depositAWei],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactPaymentChannel,
          data: openData,
          value: '0',
          description: `Open payment channel with ${agentB}, depositing ${depositA} PACT`,
          steps: [
            {
              to: ADDRESSES.pactToken,
              data: approveData,
              description: `Step 1: Approve ${depositA} PACT for PactPaymentChannel`,
            },
            {
              to: ADDRESSES.pactPaymentChannel,
              data: openData,
              description: `Step 2: Open channel with ${agentB}`,
            },
          ],
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Builder: Fund Channel ───────────────────

  server.tool(
    'pact_build_fund_channel',
    'Build unsigned transactions for agentB to fund an existing PACT payment channel. Returns both approve and fund calldata as steps.',
    {
      channelId: z.number().int().nonnegative().describe('The channel ID to fund'),
      depositB: z.string().describe('PACT tokens agentB deposits (e.g. "500")'),
    },
    async ({ channelId, depositB }) => {
      try {
        const depositBWei = parsePact(depositB);

        const fundData = encodeFunctionData({
          abi: CHANNEL_ABI,
          functionName: 'fund',
          args: [BigInt(channelId), depositBWei],
        });

        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ADDRESSES.pactPaymentChannel, depositBWei],
        });

        const plan: TransactionPlan = {
          chainId: CHAIN_ID,
          to: ADDRESSES.pactPaymentChannel,
          data: fundData,
          value: '0',
          description: `Fund channel #${channelId} with ${depositB} PACT`,
          steps: [
            {
              to: ADDRESSES.pactToken,
              data: approveData,
              description: `Step 1: Approve ${depositB} PACT for PactPaymentChannel`,
            },
            {
              to: ADDRESSES.pactPaymentChannel,
              data: fundData,
              description: `Step 2: Fund channel #${channelId}`,
            },
          ],
        };

        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to build transaction: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  // ─────────────────────── Info: Protocol Overview ─────────────────

  server.tool(
    'pact_get_info',
    'Get an overview of the PACT Protocol: contract addresses, current escrow count, channel count, and PACT token info.',
    {},
    async () => {
      try {
        const client = getPublicClient();

        const [nextPactId, nextChannelId] = await Promise.all([
          client.readContract({
            address: ADDRESSES.pactEscrowV2,
            abi: ESCROW_V2_ABI,
            functionName: 'nextPactId',
          }),
          client.readContract({
            address: ADDRESSES.pactPaymentChannel,
            abi: CHANNEL_ABI,
            functionName: 'nextChannelId',
          }),
        ]);

        const info = {
          protocol: 'PACT Protocol',
          description: 'Agent-native cryptocurrency and trustless settlement layer for autonomous agents on Arbitrum',
          website: 'https://dopeasset.com',
          grants: 'https://dopeasset.com/grants',
          network: 'Arbitrum One',
          chainId: CHAIN_ID,
          contracts: {
            pactToken: ADDRESSES.pactToken,
            pactEscrowV2: ADDRESSES.pactEscrowV2,
            pactPaymentChannel: ADDRESSES.pactPaymentChannel,
          },
          stats: {
            totalEscrowsCreated: (nextPactId - 1n).toString(),
            totalChannelsOpened: (nextChannelId - 1n).toString(),
          },
          escrowFeatures: [
            'No self-verified mode — all releases require creator approval or timeout',
            'Work submission starts a configurable dispute clock',
            'Creator cannot reclaim once work is submitted',
            'Optional arbitration with configurable fee and window',
            'Anyone can trigger release after dispute window expires',
          ],
          channelFeatures: [
            'Bidirectional PACT payment channels',
            'Unlimited off-chain payments with 2 on-chain transactions',
            'EIP-712 typed signatures for payment updates',
            '1-hour challenge period protects against stale state',
            'Cooperative close option for instant settlement',
          ],
        };

        return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to fetch info: ${(err as Error).message}` }, null, 2) }] };
      }
    },
  );

  return server;
}
