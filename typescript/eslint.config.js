import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import { globSync } from "glob";
import importPlugin from "eslint-plugin-import";

// Auto-discover tsconfig.json files from pnpm workspace packages
const workspacePatterns = [
  "lib/**/*",
  "examples/*",
  "templates/*",
  "clients/*",
  "onchain-actions-plugins/**/*"
];

const tsProjectPaths = [
  "./tsconfig.base.json",
  ...workspacePatterns.flatMap(pattern =>
    globSync(`${pattern}/tsconfig.json`, { ignore: "**/node_modules/**" })
  )
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
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2022,
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
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: tsProjectPaths,
        },
      },
    },
    rules: {
      // General code quality
      "no-constant-condition": [
        "error",
        {
          checkLoops: false,
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "smart"],
      curly: ["error", "all"],

      // TypeScript rules
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
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Import rules
      "import/extensions": [
        "error",
        "ignorePackages",
        {
          ts: "never",
          tsx: "never",
          js: "always",
          jsx: "always",
          json: "always",
        },
      ],
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import/no-unresolved": "error",
      "import/no-cycle": "error",
      "import/no-self-import": "error",
    },
  },
  {
    files: ["lib/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },
  {
    files: ["**/tests/**/*.ts", "**/fixtures/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**/*.ts"],
    rules: {
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/unbound-method": "warn",
      "no-console": "off",
    },
  },
  {
    files: ["**/scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
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
      "no-console": "off",
    },
  },
  eslintConfigPrettier
); 