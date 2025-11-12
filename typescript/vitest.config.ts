import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    include: [
      "src/**/*.unit.test.ts",
      "tests/**/*.int.test.ts",
      "tests/**/*.e2e.test.ts",
    ],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules",
        "dist",
        "tests/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/index.ts",
        "**/*.d.ts",
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: process.env["CI"] ? ["default", "github-actions"] : ["default"],
    pool: "forks",
  },
  resolve: {
    extensions: [".ts", ".js", ".json"],
  },
});