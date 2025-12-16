import { CAMEL0T_CLMM_NOTES } from "./notes.js";

export function main() {
  console.info("demo/liquidity: starting");
  console.info(CAMEL0T_CLMM_NOTES);
}

try {
  main();
} catch (error: unknown) {
  console.error("demo/liquidity: fatal error", error);
  process.exitCode = 1;
}
