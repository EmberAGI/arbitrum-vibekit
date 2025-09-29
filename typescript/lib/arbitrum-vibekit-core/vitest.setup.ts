import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.test file
config({ path: resolve(__dirname, '.env.test') });
