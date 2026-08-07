import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SWORN_RELAY_URL = process.env.SWORN_RELAY_URL ?? "https://sworn-pact-relay.chitacloud.dev";

interface AttestationResult {
  id: string;
  pact_id: number;
  status: string;
  network: string;
  solana_tx?: string;
  anchored_at?: string;
  work_hash?: string;
  error?: string;
}

interface NetworkStatus {
  arbitrum: {
    chain_id: number;
    block_number: number;
    contract: string;
    connected: boolean;
  };
  solana: {
    network: string;
    connected: boolean;
  };
  relay_version?: string;
  error?: string;
}

async function attestWork(pactId: number, workHash?: string): Promise<AttestationResult> {
  const payload: Record<string, unknown> = { pact_id: pactId };
  if (workHash) {
    payload.work_hash = workHash;
  }

  const response = await fetch(`${SWORN_RELAY_URL}/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`SWORN relay attest failed: HTTP ${response.status} — ${errorText}`);
  }

  const data = (await response.json()) as AttestationResult;
  return data;
}

async function verifyAttestation(attestationId: string): Promise<AttestationResult> {
  const url = `${SWORN_RELAY_URL}/verify/${encodeURIComponent(attestationId)}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return { id: attestationId, pact_id: 0, status: "not_found", network: "unknown" };
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`SWORN relay verify failed: HTTP ${response.status} — ${errorText}`);
  }

  const data = (await response.json()) as AttestationResult;
  return data;
}

async function getNetworkStatus(): Promise<NetworkStatus> {
  const response = await fetch(`${SWORN_RELAY_URL}/network`);

  if (!response.ok) {
    return {
      arbitrum: { chain_id: 0, block_number: 0, contract: "", connected: false },
      solana: { network: "mainnet-beta", connected: false },
      error: `HTTP ${response.status}`,
    };
  }

  const data = (await response.json()) as NetworkStatus;
  return data;
}

export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "sworn-attestation-mcp-server",
    version: "1.0.0",
  });

  // Tool 1: Attest work
  const AttestWorkSchema = z.object({
    pact_id: z
      .number()
      .int()
      .positive()
      .describe(
        "The Pact ID from the PactEscrow V2 contract on Arbitrum One " +
          "(contract: 0x220B97972d6028Acd70221890771E275e7734BFB). " +
          "This links the attestation to a specific escrow milestone."
      ),
    work_hash: z
      .string()
      .optional()
      .describe(
        "Optional SHA-256 hash of the work deliverable (hex string without 0x prefix, or with). " +
          "Used to bind the attestation to a specific output so it can be verified on-chain."
      ),
  });

  server.tool(
    "sworn_attest_work",
    "Submit a cross-chain work attestation using SWORN Protocol. " +
      "Creates a verifiable record anchored on Solana mainnet, tied to an Arbitrum PactEscrow milestone. " +
      "Returns an attestation ID that can be used to verify the work was completed.",
    AttestWorkSchema.shape,
    async ({ pact_id, work_hash }) => {
      try {
        console.error(
          `[SWORN MCP] Attesting work for pact_id=${pact_id}${work_hash ? ` with hash=${work_hash}` : ""}`
        );

        const result = await attestWork(pact_id, work_hash);

        const summary = [
          `Attestation created successfully.`,
          ``,
          `Attestation ID: ${result.id}`,
          `Pact ID: ${result.pact_id}`,
          `Status: ${result.status}`,
          `Network: ${result.network}`,
          ...(result.solana_tx ? [`Solana TX: ${result.solana_tx}`] : []),
          ...(result.anchored_at ? [`Anchored at: ${result.anchored_at}`] : []),
          ...(result.work_hash ? [`Work hash: ${result.work_hash}`] : []),
          ``,
          `Verify this attestation with: sworn_verify_attestation("${result.id}")`,
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, attestation: result, summary }, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SWORN MCP] Attest error:`, message);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: message }, null, 2),
            },
          ],
        };
      }
    }
  );

  // Tool 2: Verify attestation
  const VerifyAttestationSchema = z.object({
    attestation_id: z
      .string()
      .describe(
        "The attestation ID returned by sworn_attest_work, e.g. attest_pact-worker-4_85a75b46. " +
          "Used to verify that a specific piece of work was attested and is valid."
      ),
  });

  server.tool(
    "sworn_verify_attestation",
    "Verify a SWORN Protocol attestation by ID. " +
      "Checks if the attestation is valid and returns its full metadata including the Solana anchor transaction. " +
      "Use this to confirm that another agent or party has genuinely completed attested work.",
    VerifyAttestationSchema.shape,
    async ({ attestation_id }) => {
      try {
        console.error(`[SWORN MCP] Verifying attestation: ${attestation_id}`);

        const result = await verifyAttestation(attestation_id);
        const isValid = result.status === "valid";

        const summary = isValid
          ? [
              `Attestation VALID.`,
              ``,
              `ID: ${result.id}`,
              `Pact ID: ${result.pact_id}`,
              `Network: ${result.network}`,
              ...(result.solana_tx ? [`Solana TX: ${result.solana_tx}`] : []),
              ...(result.anchored_at ? [`Anchored at: ${result.anchored_at}`] : []),
              ...(result.work_hash ? [`Work hash bound: ${result.work_hash}`] : []),
            ].join("\n")
          : result.status === "not_found"
          ? `Attestation NOT FOUND: "${attestation_id}" does not exist in the SWORN registry.`
          : `Attestation status: ${result.status}`;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ valid: isValid, attestation: result, summary }, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SWORN MCP] Verify error:`, message);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ valid: false, error: message }, null, 2),
            },
          ],
        };
      }
    }
  );

  // Tool 3: Network status
  server.tool(
    "sworn_get_network_status",
    "Get the current connectivity status of the SWORN Protocol relay, " +
      "including Arbitrum One and Solana mainnet connection state. " +
      "Use this to check if the SWORN service is healthy before submitting attestations.",
    {},
    async () => {
      try {
        console.error(`[SWORN MCP] Fetching network status`);
        const status = await getNetworkStatus();

        const summary = [
          `SWORN Relay Network Status`,
          ``,
          `Arbitrum One:`,
          `  Connected: ${status.arbitrum?.connected ?? "unknown"}`,
          `  Chain ID: ${status.arbitrum?.chain_id ?? "unknown"}`,
          `  Block: ${status.arbitrum?.block_number ?? "unknown"}`,
          `  PactEscrow V2: ${status.arbitrum?.contract ?? "0x220B97972d6028Acd70221890771E275e7734BFB"}`,
          ``,
          `Solana:`,
          `  Network: ${status.solana?.network ?? "mainnet-beta"}`,
          `  Connected: ${status.solana?.connected ?? "unknown"}`,
          ...(status.relay_version ? [``, `Relay version: ${status.relay_version}`] : []),
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status, summary }, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: message, summary: `SWORN relay unreachable: ${message}` }, null, 2),
            },
          ],
        };
      }
    }
  );

  return server;
}