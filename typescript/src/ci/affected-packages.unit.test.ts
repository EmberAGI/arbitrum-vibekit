import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  detectAffectedPackages,
  discoverWorkspacePackages,
  resolveAffectedPackages,
  type WorkspacePackage,
} from "./affected-packages.js";

describe("resolveAffectedPackages", () => {
  it("selects the deepest changed package and expands to dependents", () => {
    const packages: WorkspacePackage[] = [
      {
        name: "monorepo-root",
        rootRelativeDir: "",
        workspaceDependencies: [],
      },
      {
        name: "langgraph-js-starter",
        rootRelativeDir: "clients/web-ag-ui",
        workspaceDependencies: [],
      },
      {
        name: "agent",
        rootRelativeDir: "clients/web-ag-ui/apps/agent",
        workspaceDependencies: ["agent-workflow-core"],
      },
      {
        name: "agent-workflow-core",
        rootRelativeDir: "clients/web-ag-ui/apps/agent-workflow-core",
        workspaceDependencies: [],
      },
      {
        name: "agent-shell",
        rootRelativeDir: "clients/web-ag-ui/apps/agent-shell",
        workspaceDependencies: ["agent"],
      },
    ];

    const result = resolveAffectedPackages({
      changedFiles: ["clients/web-ag-ui/apps/agent/src/index.ts"],
      globalInvalidators: [],
      packages,
    });

    expect(result.scope).toBe("partial");
    expect(result.selectedPackageNames).toEqual(["agent", "agent-shell"]);
  });

  it("switches to full scope when a global invalidator changes", () => {
    const packages: WorkspacePackage[] = [
      {
        name: "agent",
        rootRelativeDir: "clients/web-ag-ui/apps/agent",
        workspaceDependencies: [],
      },
      {
        name: "@emberai/agent-node",
        rootRelativeDir: "lib/agent-node",
        workspaceDependencies: [],
      },
    ];

    const result = resolveAffectedPackages({
      changedFiles: ["pnpm-workspace.yaml"],
      globalInvalidators: ["pnpm-workspace.yaml", "package.json"],
      packages,
    });

    expect(result.scope).toBe("full");
    expect(result.selectedPackageNames).toEqual(["@emberai/agent-node", "agent"]);
  });

  it("returns no packages for ignored documentation-only changes", () => {
    const packages: WorkspacePackage[] = [
      {
        name: "agent",
        rootRelativeDir: "clients/web-ag-ui/apps/agent",
        workspaceDependencies: [],
      },
    ];

    const result = resolveAffectedPackages({
      changedFiles: ["README.md", "docs/ci.md"],
      globalInvalidators: ["pnpm-workspace.yaml"],
      ignoredPaths: ["README.md", "docs/"],
      packages,
    });

    expect(result.scope).toBe("none");
    expect(result.selectedPackageNames).toEqual([]);
  });

  it("ignores package-local docs so app changes do not pull in the web-ag-ui root package", () => {
    const packages: WorkspacePackage[] = [
      {
        name: "langgraph-js-starter",
        rootRelativeDir: "clients/web-ag-ui",
        workspaceDependencies: [],
      },
      {
        name: "agent-ember-lending",
        rootRelativeDir: "clients/web-ag-ui/apps/agent-ember-lending",
        workspaceDependencies: [],
      },
    ];

    const result = resolveAffectedPackages({
      changedFiles: [
        "clients/web-ag-ui/apps/agent-ember-lending/src/sharedEmberAdapter.ts",
        "clients/web-ag-ui/docs/c4-target-architecture-web-ag-ui-agents.md",
        "clients/web-ag-ui/apps/agent-ember-lending/README.md",
      ],
      globalInvalidators: ["pnpm-workspace.yaml"],
      ignoredPaths: ["README.md", "**/README.md", "docs/", "**/docs/"],
      packages,
    });

    expect(result.scope).toBe("partial");
    expect(result.selectedPackageNames).toEqual(["agent-ember-lending"]);
  });

  it("treats the top-level agent-runtime tree as the deepest owning package set and expands to facade dependents", () => {
    const packages: WorkspacePackage[] = [
      {
        name: "agent-runtime",
        rootRelativeDir: "agent-runtime",
        workspaceDependencies: ["agent-runtime-pi"],
      },
      {
        name: "agent-runtime-pi",
        rootRelativeDir: "agent-runtime/lib/pi",
        workspaceDependencies: ["agent-runtime-postgres"],
      },
      {
        name: "agent-runtime-postgres",
        rootRelativeDir: "agent-runtime/lib/postgres",
        workspaceDependencies: [],
      },
      {
        name: "langgraph-js-starter",
        rootRelativeDir: "clients/web-ag-ui",
        workspaceDependencies: [],
      },
    ];

    const result = resolveAffectedPackages({
      changedFiles: ["agent-runtime/lib/postgres/src/schema.ts"],
      globalInvalidators: [],
      packages,
    });

    expect(result.scope).toBe("partial");
    expect(result.selectedPackageNames).toEqual([
      "agent-runtime",
      "agent-runtime-pi",
      "agent-runtime-postgres",
    ]);
  });

  it("discovers workspace packages and internal dependencies from pnpm-workspace.yaml", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-packages-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
      );
      await writeFile(path.join(workspaceRoot, "README.md"), "# Docs only\n");
      await mkdir(path.join(workspaceRoot, "packages/core"), { recursive: true });
      await mkdir(path.join(workspaceRoot, "apps/web"), { recursive: true });

      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "apps/web/package.json"),
        JSON.stringify({
          name: "web",
          version: "1.0.0",
          dependencies: {
            core: "workspace:^",
            react: "^19.0.0",
          },
        }),
      );

      const packages = await discoverWorkspacePackages(workspaceRoot);

      expect(packages).toEqual([
        {
          name: "monorepo-root",
          rootRelativeDir: "",
          workspaceDependencies: [],
        },
        {
          name: "web",
          rootRelativeDir: "apps/web",
          workspaceDependencies: ["core"],
        },
        {
          name: "core",
          rootRelativeDir: "packages/core",
          workspaceDependencies: [],
        },
      ]);
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("uses default rules to ignore documentation-only changes", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-packages-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      await writeFile(path.join(workspaceRoot, "README.md"), "# Docs only\n");
      await mkdir(path.join(workspaceRoot, "packages/core"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          version: "1.0.0",
        }),
      );

      const result = await detectAffectedPackages({
        changedFiles: ["README.md"],
        workspaceRoot,
      });

      expect(result.scope).toBe("none");
      expect(result.selectedPackageNames).toEqual([]);
      expect(result.selectedPackageDirs).toEqual([]);
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("uses default rules to ignore nested package docs and readmes", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-packages-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'clients/web-ag-ui'\n  - 'clients/web-ag-ui/apps/*'\n",
      );
      await mkdir(path.join(workspaceRoot, "clients/web-ag-ui/apps/agent-ember-lending/src"), {
        recursive: true,
      });
      await writeFile(
        path.join(workspaceRoot, "clients/web-ag-ui/package.json"),
        JSON.stringify({
          name: "langgraph-js-starter",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "clients/web-ag-ui/apps/agent-ember-lending/package.json"),
        JSON.stringify({
          name: "agent-ember-lending",
          version: "1.0.0",
        }),
      );

      const result = await detectAffectedPackages({
        changedFiles: [
          "clients/web-ag-ui/apps/agent-ember-lending/src/sharedEmberAdapter.ts",
          "clients/web-ag-ui/docs/c4-target-architecture-web-ag-ui-agents.md",
          "clients/web-ag-ui/apps/agent-ember-lending/README.md",
        ],
        workspaceRoot,
      });

      expect(result.scope).toBe("partial");
      expect(result.selectedPackageNames).toEqual(["agent-ember-lending"]);
      expect(result.selectedPackageDirs).toEqual(["clients/web-ag-ui/apps/agent-ember-lending"]);
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("discovers the agent-runtime package family from the top-level runtime directory layout", async () => {
    const workspaceRoot = path.resolve(import.meta.dirname, "../..");

    const packages = await discoverWorkspacePackages(workspaceRoot);
    const packageDirsByName = new Map(
      packages.map((pkg) => [pkg.name, pkg.rootRelativeDir] as const),
    );

    expect(packageDirsByName.get("agent-runtime")).toBe("agent-runtime");
    expect(packageDirsByName.has("pi-runtime-legacy-contracts")).toBe(false);
    expect(packageDirsByName.get("agent-runtime-pi")).toBe("agent-runtime/lib/pi");
    expect(packageDirsByName.get("agent-runtime-postgres")).toBe("agent-runtime/lib/postgres");
    expect(packageDirsByName.get("agent-runtime-langgraph")).toBe("clients/web-ag-ui/apps/agent-runtime-langgraph");
  });

  it("treats global invalidator prefixes as full-workspace changes", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-packages-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      await mkdir(path.join(workspaceRoot, "packages/core"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          version: "1.0.0",
        }),
      );

      const result = await detectAffectedPackages({
        changedFiles: ["patches/some-dependency.patch"],
        globalInvalidators: ["patches/"],
        workspaceRoot,
      });

      expect(result.scope).toBe("full");
      expect(result.selectedPackageNames).toEqual(["core", "monorepo-root"]);
      expect(result.selectedPackageDirs).toEqual(["", "packages/core"]);
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("selects the workspace root package for non-ignored root-owned files", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-packages-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      await mkdir(path.join(workspaceRoot, "packages/core"), { recursive: true });
      await mkdir(path.join(workspaceRoot, "src/ci"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          version: "1.0.0",
        }),
      );

      const result = await detectAffectedPackages({
        changedFiles: ["src/ci/detect-affected-packages.ts"],
        workspaceRoot,
      });

      expect(result.scope).toBe("partial");
      expect(result.selectedPackageNames).toEqual(["monorepo-root"]);
      expect(result.selectedPackageDirs).toEqual([""]);
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
