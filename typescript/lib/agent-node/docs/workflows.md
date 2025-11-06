# Workflows as Packages

Agent Node supports workflows as first-class packages with their own dependency management. Each workflow can have its own `package.json` and `node_modules` directory, allowing for isolated dependency trees and version control.

## Overview

Workflows can be organized in two ways:

1. **Package-based workflows**: Workflows with their own `package.json` and dependencies
2. **Simple script workflows**: Plain TypeScript/JavaScript files without dependencies

Both types are automatically discovered and loaded by the agent runtime.

## Directory Structure

```
config/
└── workflows/
    ├── sample-package/           # Package-based workflow
    │   ├── package.json          # Dependencies and configuration
    │   ├── pnpm-lock.yaml        # Per-workflow lockfile
    │   ├── node_modules/         # Isolated dependency tree
    │   └── src/
    │       └── index.ts          # Workflow entry point
    ├── simple-script/            # Simple workflow
    │   └── hello.js              # No dependencies needed
    └── example-workflow.ts       # Legacy flat file (still supported)
```

## Creating a Package-Based Workflow

### 1. Create Directory Structure

```bash
mkdir -p config/workflows/my-workflow/src
cd config/workflows/my-workflow
```

### 2. Create package.json

```json
{
  "name": "my-workflow",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "zod": "^3.24.1",
    "lodash": "^4.17.21"
  }
}
```

### 3. Install Dependencies

```bash
# From the workflow directory
pnpm install

# Or use the CLI command (from anywhere)
agent workflow install my-workflow
```

### 4. Create Workflow Plugin

Create `src/index.ts`:

```typescript
import {
  z,
  type WorkflowContext,
  type WorkflowPlugin,
  type WorkflowState,
} from '@emberai/agent-node/workflow';
import { chunk } from 'lodash'; // Using workflow-specific dependency

const plugin: WorkflowPlugin = {
  id: 'my-workflow',
  name: 'My Workflow',
  description: 'A workflow with its own dependencies',
  version: '1.0.0',

  inputSchema: z.object({
    items: z.array(z.string()),
  }),

  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
    const { items } = context.parameters ?? { items: [] };

    // Use workflow-specific dependencies
    const batches = chunk(items, 10);

    for (const batch of batches) {
      yield {
        type: 'status-update',
        message: `Processing batch of ${batch.length} items`,
      };
      // Process batch...
    }

    return { success: true };
  },
};

export default plugin;
```

## Creating a Simple Script Workflow

For workflows without dependencies, create a plain TypeScript/JavaScript file:

```bash
mkdir -p config/workflows/simple-task
```

Create `simple-task/task.js`:

```javascript
const plugin = {
  id: 'simple-task',
  name: 'Simple Task',
  description: 'A workflow without dependencies',
  version: '1.0.0',

  inputSchema: null,

  async *execute(context) {
    yield {
      type: 'status-update',
      message: 'Running simple task...',
    };

    return { success: true };
  },
};

export default plugin;
```

## CLI Commands

### Install Workflow Dependencies

```bash
# Install all workflows with package.json
agent workflow install --all

# Install specific workflow
agent workflow install my-workflow

# Use frozen lockfile (CI/CD)
agent workflow install --all --frozen-lockfile

# Quiet mode (suppress output)
agent workflow install --all --quiet
```

### Auto-Installation

Workflow dependencies are automatically installed when:

- Running `agent init` (scaffolds and installs example workflows)
- Running `agent run` or `agent` (installs before starting server)

To skip auto-installation:

```bash
# Skip installation during init
agent init --no-install

# Skip installation during run
agent run --no-install
```

## Entry Point Resolution

The runtime resolves workflow entry points in this order:

1. `package.json` `main` field (if present)
2. `index.ts`
3. `workflow.ts`
4. `src/index.ts`
5. `index.js`
6. `workflow.js`
7. `src/index.js`

## Module Resolution

Each workflow resolves modules from its own `node_modules` directory first, then falls back to the root `node_modules`. This allows:

- **Version isolation**: Different workflows can use different versions of the same package
- **Selective dependencies**: Only include what each workflow needs
- **Cleaner dependency trees**: Avoid bloating the root package.json

The `@emberai/agent-node` aliases are preserved, so workflows can always import from the agent node package:

```typescript
import { z, type WorkflowPlugin } from '@emberai/agent-node/workflow';
```

## Workflow Registry

Workflows are discovered through two mechanisms:

1. **Automatic discovery**: Any directory in `config/workflows/` with a valid entry point
2. **Explicit registry**: Entries in `config/workflow.json`

Registry entries take precedence over discovered workflows and can provide additional configuration.

Example `workflow.json`:

```json
{
  "workflows": [
    {
      "id": "my-workflow",
      "from": "workflows/my-workflow/src/index.ts",
      "enabled": true,
      "config": {
        "customOption": "value"
      }
    }
  ]
}
```

## Best Practices

### Dependency Management

- **Keep workflows focused**: Each workflow should have a clear, single responsibility
- **Share common dependencies**: Use the root `package.json` for dependencies needed by multiple workflows
- **Pin versions**: Use exact versions or ranges in workflow `package.json` for reproducibility
- **Document dependencies**: Add comments explaining why specific packages are needed

### Directory Organization

```
workflows/
├── data-processing/          # Domain-specific workflow
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── parsers.ts
│       └── validators.ts
├── notifications/            # Another workflow
│   ├── package.json
│   └── src/
│       └── index.ts
└── utilities/                # Simple utilities
    └── format.js             # No package.json needed
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Install workflow dependencies
  run: agent workflow install --all --frozen-lockfile --config-dir ./config

- name: Run tests
  run: pnpm test
```

### Development Workflow

1. **Create workflow**: `mkdir -p config/workflows/my-workflow/src`
2. **Add package.json**: Define dependencies
3. **Install**: `agent workflow install my-workflow`
4. **Develop**: Write workflow logic
5. **Test**: `agent run --dev` (hot reload enabled)
6. **Deploy**: Commit with lockfiles

## Troubleshooting

### Workflow Not Found

**Symptom**: "Workflow 'x' not found" error

**Solutions**:
- Verify workflow directory has a valid entry point
- Check `workflow.json` if using explicit registry
- Ensure workflow is referenced in skill `workflows.include`

### Module Resolution Issues

**Symptom**: "Cannot find module 'xyz'" error

**Solutions**:
- Run `agent workflow install --all` to install dependencies
- Check `package.json` includes the missing module
- Verify `node_modules` directory exists in workflow folder

### Import Path Issues

**Symptom**: Relative imports failing

**Solutions**:
- Use `.js` extensions for relative imports (ESM requirement)
- Verify `type: "module"` in package.json
- Check jiti is resolving from workflow directory

### Lockfile Conflicts

**Symptom**: Lock file conflicts in CI

**Solutions**:
- Use `--frozen-lockfile` in CI
- Commit `pnpm-lock.yaml` files for each workflow
- Ensure workflows are outside workspace globs

## Migration Guide

### From Flat Files to Packages

1. **Create workflow directory**:
   ```bash
   mkdir -p config/workflows/my-workflow/src
   ```

2. **Move existing file**:
   ```bash
   mv config/workflows/my-workflow.ts config/workflows/my-workflow/src/index.ts
   ```

3. **Add package.json** (if dependencies needed):
   ```json
   {
     "name": "my-workflow",
     "version": "1.0.0",
     "type": "module",
     "main": "src/index.ts"
   }
   ```

4. **Install dependencies**:
   ```bash
   agent workflow install my-workflow
   ```

5. **Update registry** (if using explicit entries):
   ```json
   {
     "from": "workflows/my-workflow/src/index.ts"
   }
   ```

### Backward Compatibility

Flat file workflows (e.g., `workflows/example-workflow.ts`) continue to work without modification. The runtime supports both structures simultaneously.

## Examples

See the scaffolded workflows created by `agent init`:

- **`sample-package/`**: Package-based workflow with dependencies
- **`simple-script/`**: Simple workflow without dependencies
- **`example-workflow.ts`**: Legacy flat file format

All three formats are valid and work side-by-side.
