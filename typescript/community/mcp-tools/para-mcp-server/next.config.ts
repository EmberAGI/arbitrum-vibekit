import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Turbopack (Next 16) requires this to be a boolean, not an object/map
  reactProductionProfiling: false,
};

export default nextConfig;
