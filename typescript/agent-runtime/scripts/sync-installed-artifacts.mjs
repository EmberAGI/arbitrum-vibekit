import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyArtifactDir } from '../dist/syncInstalledArtifacts.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const pnpmStoreRoot = path.resolve(packageRoot, '..', 'node_modules', '.pnpm');
const packageSpecs = [
  {
    packageName: 'agent-runtime',
    packageRoot,
    artifactDirs: [
      'dist',
      path.join('lib', 'postgres', 'dist'),
      path.join('lib', 'pi', 'dist'),
    ],
  },
  {
    packageName: 'pi-runtime-legacy-contracts',
    packageRoot: path.join(packageRoot, '..', 'lib', 'pi-runtime-legacy-contracts'),
    artifactDirs: ['dist'],
  },
  {
    packageName: 'agent-runtime-postgres',
    packageRoot: path.join(packageRoot, 'lib', 'postgres'),
    artifactDirs: ['dist'],
  },
  {
    packageName: 'agent-runtime-pi',
    packageRoot: path.join(packageRoot, 'lib', 'pi'),
    artifactDirs: ['dist'],
  },
];

async function listPackageSnapshots(packageName) {
  const entries = await readdir(pnpmStoreRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`))
    .map((entry) => path.join(pnpmStoreRoot, entry.name, 'node_modules', packageName));
}

await Promise.all(
  packageSpecs.map(async ({ packageName, packageRoot: sourceRoot, artifactDirs }) => {
    const snapshotDirs = await listPackageSnapshots(packageName);

    await Promise.all(
      snapshotDirs.map(async (snapshotDir) => {
        await Promise.all(
          artifactDirs.map((relativeDir) =>
            copyArtifactDir({
              sourceRoot,
              relativeDir,
              targetRoot: snapshotDir,
            }),
          ),
        );
      }),
    );
  }),
);
