import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLangGraphE2EGlobalSetup } from '../../../../scripts/testing/langgraphE2eGlobalSetup.js';

const setupFilePath = fileURLToPath(import.meta.url);
const appDir = path.resolve(path.dirname(setupFilePath), '..', '..');

export default createLangGraphE2EGlobalSetup({
  appDir,
  graphId: 'agent-clmm',
  defaultPort: 8124,
});
