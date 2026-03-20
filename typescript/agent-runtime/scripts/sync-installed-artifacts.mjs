import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const pnpmStoreRoot = path.resolve(packageRoot, '..', 'node_modules', '.pnpm');
const packageName = 'agent-runtime';
const packageDirName = 'agent-runtime';
const artifactDirs = ['dist', path.join('lib', 'pi', 'dist')];

async function listPackageSnapshots() {
  const entries = await readdir(pnpmStoreRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`))
    .map((entry) => path.join(pnpmStoreRoot, entry.name, 'node_modules', packageDirName));
}

async function copyArtifactDir(relativeDir, targetRoot) {
  const sourceDir = path.join(packageRoot, relativeDir);
  const sourceStats = await stat(sourceDir);

  if (!sourceStats.isDirectory()) {
    return;
  }

  const targetDir = path.join(targetRoot, relativeDir);
  await mkdir(path.dirname(targetDir), { recursive: true });
  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

const snapshotDirs = await listPackageSnapshots();

await Promise.all(
  snapshotDirs.map(async (snapshotDir) => {
    await Promise.all(artifactDirs.map((relativeDir) => copyArtifactDir(relativeDir, snapshotDir)));
  }),
);
