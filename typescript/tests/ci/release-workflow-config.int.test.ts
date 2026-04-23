import { readFile } from "node:fs/promises";
import path from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

type WorkflowTrigger = {
  branches?: string[];
  paths?: string[];
};

type WorkflowStep = {
  name?: string;
};

type WorkflowConfig = {
  on?: {
    pull_request?: WorkflowTrigger;
    push?: WorkflowTrigger;
    workflow_dispatch?: Record<string, unknown>;
  };
  jobs?: {
    prepare?: {
      steps?: WorkflowStep[];
    };
  };
};

async function readReleaseWorkflow(): Promise<WorkflowConfig> {
  const workflowPath = path.resolve(import.meta.dirname, "../../../.github/workflows/release.yml");
  const workflowContent = await readFile(workflowPath, "utf8");

  return yaml.load(workflowContent) as WorkflowConfig;
}

describe("release workflow trusted-branch configuration", () => {
  it("runs on trusted branch pushes without top-level push path gating", async () => {
    const workflow = await readReleaseWorkflow();

    expect(workflow.on?.workflow_dispatch).toBeDefined();
    expect(workflow.on?.push?.branches).toEqual(["main", "next"]);
    expect(workflow.on?.push?.paths).toBeUndefined();
    expect(workflow.on?.pull_request?.paths).toContain("typescript/onchain-actions-plugins/registry/**");
  });

  it("keeps the prepare job lightweight by avoiding dependency installation", async () => {
    const workflow = await readReleaseWorkflow();
    const stepNames = workflow.jobs?.prepare?.steps?.map((step) => step.name) ?? [];

    expect(stepNames).not.toContain("Setup pnpm");
    expect(stepNames).not.toContain("Install dependencies");
  });
});
