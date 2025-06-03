import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

const tsProjectPaths = [
  "./tsconfig.base.json",
  "./lib/test-utils/tsconfig.json",
  "./lib/ember-schemas/tsconfig.json",
  "./lib/arbitrum-vibekit/tsconfig.json",
  "./examples/pendle-agent/tsconfig.json",
  "./lib/mcp-tools/emberai-mcp/tsconfig.json",
  "./examples/lending-agent-no-wallet/tsconfig.json",
  "./examples/swapping-agent-no-wallet/tsconfig.json",
  "./examples/liquidity-agent-no-wallet/tsconfig.json",
  "./lib/a2a/tsconfig.json",
  "./lib/mcp-tools/allora-mcp-server/tsconfig.json",
  "./examples/swapping-agent/tsconfig.json"
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-test/**",
      "**/.pnpm/**",
      "**/*.js", 
      "**/*.d.ts",
      "**/coverage/**",
      "clients/web/**",
      "src/proto/"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        project: tsProjectPaths,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
    },
    rules: {
      "no-constant-condition": [
        "error",
        {
          checkLoops: false,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  eslintConfigPrettier
); 