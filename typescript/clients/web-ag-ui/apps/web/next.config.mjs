/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    DELEGATIONS_BYPASS: process.env.DELEGATIONS_BYPASS,
  },
  serverExternalPackages: ['@copilotkit/runtime'],
  transpilePackages: ['agent-runtime', 'agent-runtime-pi'],
};

export default nextConfig;
