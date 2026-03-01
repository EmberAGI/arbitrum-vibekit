---
inclusion: always
---

# Shell Execution Standards

## Fish Shell Requirement

**MANDATORY**: Use fish shell syntax for ALL terminal commands. Never use bash syntax.

### Core Syntax Rules

- **Variables**: `set VAR_NAME value` (not `export VAR=value`)
- **Environment**: `set -x VAR value` (exported variables)
- **Conditionals**: `if test condition; command; end`
- **Logic**: Use `; and` and `; or` (not `&&` and `||`)

### Essential Fish Commands

```fish
# Variable assignment
set PROJECT_ID (grep '^project_id' config.toml | cut -d'"' -f2)

# Conditional execution
if test -f file.txt; echo "exists"; end

# Environment variables
set -x NODE_ENV production

# Universal variables (persistent)
set -U EDITOR vim
```

### Common Bash to Fish Conversions

| Bash | Fish |
|------|------|
| `export VAR=value` | `set -x VAR value` |
| `cmd1 && cmd2` | `cmd1; and cmd2` |
| `cmd1 \|\| cmd2` | `cmd1; or cmd2` |
| `if [ condition ]` | `if test condition` |

### Project-Specific Patterns

Use these patterns for common project operations:

```fish
# Docker container detection
set CONTAINER_ID (docker ps --filter "name=pattern" --format "{{.ID}}")

# Configuration reading
set CONFIG_VALUE (grep '^key' config.file | cut -d'"' -f2)

# Conditional container operations
if test -n "$CONTAINER_ID"
    docker exec $CONTAINER_ID command
else
    echo "Container not found"
end
```

This ensures consistent, readable terminal operations across all project automation.