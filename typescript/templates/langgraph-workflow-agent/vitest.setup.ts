import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file for tests
config({ path: resolve(__dirname, '.env') });
