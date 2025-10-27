---
description: 'Create a new branch and draft PR, analyzing git status to properly handle modified vs new files'
targets: ["*"]
allowed-tools: ['Bash', 'Read', 'Task']
argument-hint: '<branch-name> <pr-title>'
---

# Create Pull Request

Create a new feature branch and draft pull request following the project's PR-based workflow. All changes must be merged via PR - direct commits to main are not allowed.

## Workflow Overview

1. **Analyze current state** - Check git status and properly identify modified vs new files
2. Check for uncommitted changes and report their nature to user
3. Create a new branch from the current state
4. Commit any uncommitted changes to the new branch
5. Push the branch to origin
6. Create a draft PR using GitHub CLI
7. Return the PR URL for the user

## Branch Naming Conventions

Use descriptive branch names following these patterns:

- `feature/<description>` - New features
- `fix/<description>` - Bug fixes
- `refactor/<description>` - Code refactoring
- `docs/<description>` - Documentation updates
- `test/<description>` - Test additions/updates
- `chore/<description>` - Maintenance tasks

Examples:

- `feature/add-uniswap-v4-adapter`
- `fix/token-price-null-handling`
- `refactor/simplify-swap-interface`
- `docs/update-setup-guide`

## Instructions

Think harder about the following steps to ensure thorough analysis and proper execution:

1. Parse arguments: $ARGUMENTS
   - Extract branch name (first argument)
   - Extract PR title (remaining arguments)
   - If no arguments provided, intelligently generate them:
     - Analyze uncommitted changes using `git diff` and `git status`
     - Look at file paths and content to determine the type of changes
     - Categorize as feature/fix/refactor/docs/test/chore based on:
       - New functionality = feature
       - Bug fixes or error corrections = fix
       - Code reorganization without behavior change = refactor
       - Documentation or markdown changes = docs
       - Test file changes = test
       - Dependencies, configs, or maintenance = chore
     - Generate branch name: `<type>/<concise-description>`
     - Generate PR title: `<type>(<scope>): <description>`
     - Use kebab-case for branch names (e.g., add-claude-commands)
     - Keep descriptions concise but descriptive

2. **IMPORTANT: First check and report current state**:
   - Run `git status --porcelain` and analyze the output:
     - `M` = Modified existing file
     - `A` = Added to index
     - `D` = Deleted
     - `R` = Renamed
     - `C` = Copied
     - `U` = Updated but unmerged
     - `??` = Untracked new file
   - **CRITICAL**: Before reporting changes, use LS or Read tools to verify:
     - Check if "new" files (marked with ??) actually already exist
     - Understand the actual nature of modifications
     - Never assume files are new based solely on git status
   - Report accurately to user: "You have X modified files, Y new files, Z deleted files"
   - List each file with its actual status (new vs modified)
   - Check current branch with `git branch --show-current`
   - If on main branch:
     - With changes: Create new branch and commit changes
     - Without changes: Create new branch from latest main
   - If already on a feature branch:
     - With changes: Commit them before creating PR
     - Without changes: Create PR from existing commits

3. Handle branch creation:
   - If on main:
     - First fetch latest changes: `git fetch origin main`
     - Create and switch to new branch from origin/main
   - If on existing branch: use current branch
   - Ensure branch name follows conventions

4. Commit any uncommitted changes (if they exist):
   - **VERIFY FIRST**: For any files marked as "new" in git status:
     - Use LS to check if parent directories already exist
     - Use Read to check if files are truly new or modifications
     - Cross-reference with project structure to understand context
   - Run these commands in parallel to understand changes:
     - `git status` to see all changed files
     - `git diff --cached` to see staged changes
     - `git diff` to see unstaged changes
     - `git log --oneline -10` to see recent commit style
     - `git ls-files` to see tracked files
   - Follow Angular commit message conventions:

     ```
     <type>(<scope>): <short summary>

     <body>

     <footer>
     ```

   - **Allowed Types**: build, ci, docs, feat, fix, perf, refactor, test, chore
   - **Scope**: Use affected module/component (e.g., adapters, services, mcp, graph)
   - **Subject Rules**: Imperative tense, lowercase, no period, max 50 chars
   - **Body**: Explain motivation and contrast with previous behavior (72 char wrap)
   - **ANALYZE CHANGES ACCURATELY**:
     - Never commit "new" files that are actually modifications
     - Verify file history with `git log --follow <file>` if uncertain
     - Check if files were previously tracked with `git ls-files --deleted`
   - Group changes into logical, atomic commits by:
     - Type (feat, fix, docs, etc.)
     - Scope (from file paths and existing patterns)
     - Related functionality
   - For each logical group:
     - Stage only files for that specific change
     - Create commit following format above
     - Include body if change requires explanation
     - **COMMIT MESSAGE MUST REFLECT ACTUAL CHANGES**:
       - Never say "Create" or "Add" for modified files
       - Use "Update", "Modify", "Enhance" for existing files
       - Only use "Add" or "Create" for genuinely new files
   - Always review staged changes with `git diff --cached` before committing
   - Skip this step if no changes to commit

5. Create the draft PR:
   - Push the branch with `-u` flag
   - Use `gh pr create` with draft flag
   - Set title from arguments or commit message
   - Add initial PR body with template

## PR Template

The PR body should include:

```markdown
## Summary

<!-- Brief description of changes -->

## Changes

<!-- List of specific changes made -->

-

## Testing

<!-- How to test these changes -->

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Related Issues

<!-- Link any related issues -->

Closes #

## Notes

<!-- Any additional context -->
```

## Example Usage

```bash
# Create a feature branch and PR with explicit arguments
/create-pr feature/add-pendle-adapter "feat: Add Pendle protocol adapter"

# Create a fix branch and PR
/create-pr fix/swap-slippage-calc "fix: Correct slippage calculation in swap service"

# Create a docs branch and PR
/create-pr docs/api-endpoints "docs: Document new API endpoints"

# Let the command intelligently generate branch name and title
/create-pr
# Will analyze changes and might generate:
# - Branch: docs/claude-commands-setup
# - Title: "docs(claude): add custom command support and create-pr command"
```

## Important Notes

- Always create the PR as a draft initially
- The PR can be marked ready for review after changes are complete
- Ensure branch name follows conventions
- PR title should follow Angular commit format: `<type>(<scope>): <description>`
- The command handles all scenarios:
  - On main with changes: Creates branch, commits changes, creates PR
  - On main without changes: Creates empty branch and PR for future work
  - On feature branch with changes: Commits changes, creates PR
  - On feature branch without changes: Creates PR from existing commits
- Follows Angular commit conventions strictly
- Never commit all changes in single commit unless truly related
- Keep commits atomic - each should be a logical unit of change
- For breaking changes, add '!' after type/scope and include BREAKING CHANGE in footer
- Check for pre-commit hooks that might modify files
- If commit fails due to pre-commit hooks, retry once to include hook changes
- If gh command fails, ensure you're authenticated: `gh auth login`
- If push fails with remote rejection, check branch protection rules
