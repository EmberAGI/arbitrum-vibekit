import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

const nextConfig: NextConfig = {
  serverExternalPackages: ["@copilotkit/runtime"],
  turbopack: {
    root: path.join(currentDirPath, "../.."),
  },
};

export default nextConfig;
