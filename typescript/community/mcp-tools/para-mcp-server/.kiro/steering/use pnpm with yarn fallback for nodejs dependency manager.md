---
inclusion: always
---

# Node.js Package Manager Standards

## Required Package Managers

**MANDATORY**: Use `pnpm` as the primary package manager, with `yarn` as fallback only if pnpm doesn't exist or encounters errors. Never use `npm` or `bun`.

### Preferred Order
1. **pnpm** - Efficient disk usage, strict dependency resolution, fast performance
2. **yarn** - Fallback option when pnpm is unavailable or fails

### Installation Commands

```bash
# Using pnpm (preferred)
pnpm install
pnpm add <package>
pnpm remove <package>
pnpm run <script>

# Using yarn (fallback only)
yarn install
yarn add <package>
yarn remove <package>
yarn run <script>
```

### Project Detection

- If `pnpm-lock.yaml` exists, use `pnpm`
- If `yarn.lock` exists and pnpm is unavailable, use `yarn`
- Always try `pnpm` first, fallback to `yarn` only on error
- Never generate `package-lock.json` or `bun.lock`

### Script Execution

Always use the detected package manager for running scripts:
- `pnpm dev` (preferred)
- `yarn dev` (fallback only)

This ensures consistent dependency resolution with pnpm's superior performance and disk efficiency, while maintaining yarn as a reliable fallback option.