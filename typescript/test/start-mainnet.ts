import { startEnv } from "./helpers/start-env";

try {
  await startEnv(false);
} catch (e) {
  console.error(e);
  process.exit(1);
}
