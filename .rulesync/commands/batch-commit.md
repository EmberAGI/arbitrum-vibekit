---
description: 'Review and commit changes in logical batches following Angular commit conventions'
targets: ["*"]
allowed-tools: ['Bash', 'Read', 'Task']
argument-hint: '(optional) specific file pattern or directory to focus on'
---

# Batch Commit Changes - Angular Convention

Review all current uncommitted changes and commit them in logical, atomic batches following [Angular's commit message conventions](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md).

## Commit Message Format

```
<type>(<scope>): <short summary>

<body>

<footer>
```

### Allowed Types

- **build**: Changes affecting build system or external dependencies (e.g., pnpm, docker, tsconfig)
- **ci**: Changes to CI configuration files and scripts
- **docs**: Documentation only changes
- **feat**: A new feature
- **fix**: A bug fix
- **perf**: A code change that improves performance
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **test**: Adding missing tests or correcting existing tests
- **chore**: Other changes that don't modify src or test files

### Scope Guidelines

- Use the affected module/component name that best describes the area of change
- Scope should be noun describing the section of codebase affected
- For changes affecting multiple areas, omit the scope
- Discover scopes by looking at:
  - Directory names under `src/` (e.g., `adapters`, `services`, `domain`)
  - Major feature areas (e.g., `mcp`, `graph`, `types`)
  - Infrastructure components (e.g., `docker`, `config`, `deps`)
- Common scopes in this project:
  - `adapters`: Protocol adapter implementations
  - `services`: API service layer changes
  - `mcp`: Model Context Protocol server
  - `graph`: Memgraph database operations
  - `domain`: Core business logic and models
  - `types`: TypeScript type definitions
  - `config`: Configuration files
  - `tests`: Test file changes
- New scopes can emerge as the codebase evolves - use what makes sense
- Keep scopes consistent once established (check `git log --oneline` for patterns)

### Subject Rules

- Use imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize the first letter
- No period (.) at the end
- Maximum 50 characters

### Body Guidelines

- Use imperative, present tense
- Explain the motivation for the change
- Contrast this with previous behavior
- Wrap at 72 characters

## Instructions

1. First, run these commands in parallel to understand the current state:
   - `git status` to see all changed files
   - `git diff --cached` to see staged changes (handle any pre-staged files carefully)
   - `git diff` to see unstaged changes
   - `git log --oneline -10` to see recent commit style
   - If files are already staged, consider if they belong with new changes or should be committed separately

2. Analyze the changes and group them into logical commits by:
   - Type (feat, fix, docs, etc.)
   - Scope (discover from file paths and existing patterns in git log)
   - Related functionality

3. For each logical group:
   - Stage only the files for that specific change
   - Create a commit message following the format above
   - Include a body if the change requires explanation

4. If arguments are provided: $ARGUMENTS
   - Focus on changes matching the pattern/directory specified
   - Still ensure commits are logical and atomic

## Example Commits

```bash
# Documentation update
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with current project practices

- change On-chain to Onchain terminology
- update testing framework from Mocha to Vitest migration notes
- add code quality standards and best practices
- update TypeScript target to ES2022"

# Feature addition
git add src/adapters/newprotocol.ts src/types/newprotocol.ts
git commit -m "feat(adapters): add support for NewProtocol swaps

implement swap adapter for NewProtocol DEX with support for
multi-hop swaps and native token wrapping"

# Bug fix
git add src/services/token-context.ts
git commit -m "fix(services): handle null token prices in TokenContext

previously threw when token price data was unavailable,
now returns null and logs warning"

# Build configuration
git add package.json pnpm-lock.yaml
git commit -m "build: upgrade tsx to v4.9.0 for better ESM support"

# Breaking change
git add src/adapters/interfaces.ts
git commit -m "refactor(adapters)!: rename ISwapAdapter methods for clarity

BREAKING CHANGE: ISwapAdapter.getQuote() is now getSwapQuote()
and ISwapAdapter.execute() is now executeSwap()

Migration: Update all adapter implementations and consumers to use new method names"
```

## Important Notes

- Never commit all changes in a single commit unless they're truly related
- Always review staged changes with `git diff --cached` before committing
- For breaking changes, add `!` after type/scope and include BREAKING CHANGE in footer
- Check for any pre-commit hooks that might modify files
- If pre-commit hooks fail, review the error and fix issues before retrying
- If hooks modify files (e.g., auto-formatting), stage those changes and amend the commit
- Keep commits atomic - each commit should be a logical unit of change
- Keep commit messages concise and professional - no emojis or attribution footers
- Focus on what changed and why, not verbose descriptions
- If you encounter merge conflicts, resolve them before committing
- Watch for commit message length: subject ≤50 chars, body lines ≤72 chars
