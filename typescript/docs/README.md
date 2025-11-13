# Auto-Generated Documentation

This directory contains automatically generated documentation for TypeScript files **that don't have existing documentation**.

**Primary Use Case**: Root-level and standalone TypeScript files that don't belong to organized modules with their own README files.

## Documentation Strategy

The AI documentation system follows this priority order:

1. **Updates existing documentation** (README.md, DOCS.md, API.md in the same directory)
2. **Creates new files here** only if no existing documentation is found
3. **Never touches the main repository README.md**

## When Files Are Created Here

Files are created in this `docs/` directory when:

- **Root-level TypeScript files** without associated README files
- **Standalone utility files** that don't belong to a documented module
- **Individual scripts** that don't have their own documentation
- No existing README.md, DOCS.md, API.md, or `{filename}.md` exists near the source file
- The main repository README.md is protected and never used

**Note**: Most organized modules/packages will have their own README files, so their documentation will be updated in-place rather than created here.

## Structure

```
docs/
├── utils.md                 # From typescript/utils.ts (root-level file)
├── config.md                # From typescript/config.ts (root-level file)
├── lib/
│   └── standalone/
│       └── helper.md        # From lib/standalone/helper.ts (no module README)
└── scripts/
    └── build.md             # From scripts/build.ts (standalone script)
```

## How It Works

1. **Code Change**: You modify a TypeScript file and push to main
2. **Detection**: GitHub Actions detects the changes
3. **Documentation Search**: Script looks for existing documentation files:
   - `README.md` in same/parent directories (excluding main repo README)
   - `DOCS.md`, `API.md`, `{filename}.md` in same directory
4. **AI Generation**: OpenRouter/OpenAI analyzes the git diff
5. **Update Strategy**:
   - **If existing docs found**: Updates existing file with AUTO-DOC section
   - **If no existing docs**: Creates new file in this `docs/` directory
6. **Pull Request**: Creates PR with documentation changes

## Examples

**Scenario 1: Existing Documentation**

```
Source: typescript/lib/agent-node/src/example.ts
Existing: typescript/lib/agent-node/README.md
Result: Updates the existing README.md ✅
```

**Scenario 2: Root-Level File Without Documentation**

```
Source: typescript/utils.ts (root-level utility file)
Existing: None found
Result: Creates typescript/docs/utils.md ✅
```

**Scenario 3: Main README Protected**

```
Source: typescript/scripts/build.ts
Existing: Main README.md (repository root)
Result: Creates typescript/docs/scripts/build.md ✅ (main README never touched)
```

## File Naming Convention

- Source: `typescript/lib/agent-node/src/example.ts`
- Documentation: `typescript/docs/lib/agent-node/src/example.md`

The directory structure mirrors your source code for easy navigation.
