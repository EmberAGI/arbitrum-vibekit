import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false, // Temporarily disabled due to Para SDK alpha compatibility issues
  // Turbopack (Next 16) requires this to be a boolean, not an object/map
  reactProductionProfiling: false,
  // Skip TypeScript type checking during builds
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
