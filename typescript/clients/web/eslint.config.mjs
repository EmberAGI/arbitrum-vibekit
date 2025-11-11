import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "*.config.*",
    ]
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      // Console logs allowed in Next.js app
      "no-console": "off",

      // Relax TypeScript strict rules to warnings for gradual migration
      "@typescript-eslint/no-explicit-any": "warn",

      // Import organization - only warning to avoid blocking builds
      "import/order": "off",

      // Allow unused vars prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],

      // Disable rules that conflict with Next.js patterns or are too strict for current codebase
      "react-hooks/exhaustive-deps": "warn",
    }
  }
];

export default eslintConfig;
