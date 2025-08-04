# Claude Code

This directory contains all of the project-specific configuration, prompts, and lifecycle hooks that power the [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) developer agent.

## Quick-Start

1. **Install the CLI (one-time):**
   ```bash
   npm install -g @anthropic-ai/claude-code  # or: pnpm add -g @anthropic-ai/claude-code
   ```
2. **Navigate to the repo root and start Claude:**
   ```bash
   cd arbitrum-vibekit
   claude
   ```

Claude will automatically read the configuration in `.claude/`, load the custom agents & commands described below, and begin interacting with you.

## Folder Contents

| Path                    | Purpose                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/settings.json` | Top-level configuration: default model(s), environment variables, permissions, and hook registrations.                                                                                    |
| `.claude/agents/`       | Sub-agent definitions. Each file describes an agent persona such as `test-driven-coder.md` or `docs-updater.md`. Claude loads these files on demand to delegate specialized tasks.        |
| `.claude/commands/`     | Command templates. Map your CLI invocations (`claude plan`, `claude execute`, etc.) to detailed instructions shown to the LLM. Modify these to customize workflows without touching code. |
| `.claude/hooks/`        | Lifecycle hooks. Shell scripts invoked before/after tool calls or when a sub-agent stops. Useful for logging, custom validation, notifying Slack, etc.                                    |
| `.claude/README.md`     | You are here.                                                                                                                                                                             |

## Customizing Agent Behavior

1. **Change the default model**
   - Edit the `model` variable in `settings.json` (e.g. `"claude-opus-4-20250514"`).
   - You can also provide a fast model that Claude will automatically fall back to for inexpensive tasks: `ANTHROPIC_SMALL_FAST_MODEL`.
2. **Add new sub-agents**
   - Drop a new Markdown file into `.claude/agents/` following the existing pattern (title, role description, examples).
   - Reference it from your tasks with `@subagent {filename}` or let the main agent decide when to delegate.
3. **Create a custom workflow command**
   - Copy an existing file in `.claude/commands/`; rename and tweak the prompt.
   - The filename becomes the CLI subcommand, e.g. `my-command.md` becomes`claude my-command`.
4. **Run code before/after tasks**
   - Add/modify scripts in `.claude/hooks/`.
   - Register them in `settings.json` under the appropriate lifecycle event (`PreToolUse`, `PostToolUse`, `SubagentStop`).
