import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";

async function runTests() {
  console.log(`Testing SWORN Attestation MCP Server at ${SERVER_URL}`);

  const transport = new StreamableHTTPClientTransport(new URL(`${SERVER_URL}/mcp`));
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await client.connect(transport);
  console.log("Connected to MCP server");

  // List tools
  const toolsList = await client.listTools();
  const toolNames = toolsList.tools.map((t) => t.name);
  console.log("Available tools:", toolNames);

  const expectedTools = ["sworn_get_network_status", "sworn_attest_work", "sworn_verify_attestation"];
  for (const expected of expectedTools) {
    if (!toolNames.includes(expected)) {
      throw new Error(`Missing tool: ${expected}`);
    }
  }
  console.log("All expected tools present");

  // Test 1: Get network status
  console.log("\nTest 1: sworn_get_network_status");
  const networkResult = await client.callTool({ name: "sworn_get_network_status", arguments: {} });
  const networkContent = networkResult.content[0] as { type: string; text: string };
  const networkData = JSON.parse(networkContent.text);
  console.log("Network status:", networkData.summary ?? networkData);

  // Test 2: Attest work (test with pact_id=1)
  console.log("\nTest 2: sworn_attest_work (pact_id=1)");
  const attestResult = await client.callTool({
    name: "sworn_attest_work",
    arguments: { pact_id: 1 },
  });
  const attestContent = attestResult.content[0] as { type: string; text: string };
  const attestData = JSON.parse(attestContent.text);
  console.log("Attest result:", attestData.success ? "SUCCESS" : "FAILED", attestData.error ?? "");
  if (attestData.success) {
    console.log("Attestation ID:", attestData.attestation?.id);

    // Test 3: Verify the attestation we just created
    console.log("\nTest 3: sworn_verify_attestation");
    const verifyResult = await client.callTool({
      name: "sworn_verify_attestation",
      arguments: { attestation_id: attestData.attestation.id },
    });
    const verifyContent = verifyResult.content[0] as { type: string; text: string };
    const verifyData = JSON.parse(verifyContent.text);
    console.log("Verify result:", verifyData.valid ? "VALID" : "INVALID");
    console.log("Summary:", verifyData.summary);
  }

  await client.close();
  console.log("\nAll tests passed!");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});