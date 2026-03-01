import executePregenTransaction from "../src/tools/execute-pregen-transaction.js";

type ExecutePregenTxParams = Parameters<typeof executePregenTransaction>[0];

async function main() {
  try {
    // Args:
    //   2: userIdentifier (email or UUID)
    //   3: rpcUrl
    //   4: rawTx JSON string (matching execute-pregen-transaction schema)
    const userIdentifier = process.argv[2];
    const rpcUrl = process.argv[3];
    const rawTxArg = process.argv[4];

    if (!userIdentifier || !rpcUrl || !rawTxArg) {
      console.error(
        "Usage: pnpm exec tsx --env-file=.env scripts/execute-pregen-transaction.ts <userIdentifier> <rpcUrl> '<rawTxJson>'",
      );
      console.error("Example rawTx JSON:");
      console.error(
        '{"to":"0x...","value":"0","data":"0x...","chainId":"84532"}',
      );
      process.exit(1);
    }

    let rawTx: ExecutePregenTxParams["rawTx"];
    try {
      rawTx = JSON.parse(rawTxArg) as ExecutePregenTxParams["rawTx"];
    } catch (err) {
      console.error("Failed to parse rawTx JSON:", err);
      process.exit(1);
    }

    const params: ExecutePregenTxParams = {
      userIdentifier,
      rawTx,
      rpcUrl,
    };

    const result = await executePregenTransaction(params);

    // The tool already returns a { content: [...] } structure with JSON text;
    // just print it so you can see the full receipt/result.
    console.log("Tool result:\n");
    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Error executing pregen transaction script:");
    console.error(error);
    process.exit(1);
  }
}

main();
