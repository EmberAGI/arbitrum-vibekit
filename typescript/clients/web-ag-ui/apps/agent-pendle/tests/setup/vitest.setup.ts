import './msw.setup.js';

process.env.NODE_ENV = 'test';
process.env.ONCHAIN_ACTIONS_API_URL =
  process.env.ONCHAIN_ACTIONS_API_URL ?? 'http://onchain-actions.test';
