/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    DELEGATIONS_BYPASS: process.env.DELEGATIONS_BYPASS,
  },
  serverExternalPackages: ['@copilotkit/runtime'],
};

export default nextConfig;
