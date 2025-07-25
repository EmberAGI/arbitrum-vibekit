import { startEnv } from "./helpers/start-env";

try {
  await startEnv(true);
} catch (e) {
  console.error(e);
  process.exit(1);
}
