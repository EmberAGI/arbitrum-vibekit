import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PACKAGE_DEFINITIONS = [
  {
    id: 'registry',
    packageJson: 'onchain-actions-plugins/registry/package.json',
    packageName: '@emberai/onchain-actions-registry',
    directory: 'onchain-actions-plugins/registry',
  },
  {
    id: 'contracts',
    packageJson: 'onchain-actions-plugins/contracts/package.json',
    packageName: '@emberai/onchain-actions-contracts',
    directory: 'onchain-actions-plugins/contracts',
  },
];

const PACKAGE_LOOKUP = new Map(
  PACKAGE_DEFINITIONS.flatMap((definition) => [
    [definition.id, definition],
    [definition.packageJson, definition],
    [definition.packageName, definition],
    [definition.directory, definition],
  ]),
);

function resolvePackage() {
  const args = process.argv.slice(2);
  let packageSpec = 'registry';

  while (args.length > 0) {
    const argument = args.shift();

    if (argument === '--package') {
      packageSpec = args.shift();
      continue;
    }

    if (argument?.startsWith('--package=')) {
      packageSpec = argument.slice('--package='.length);
      continue;
    }

    throw new Error(`Unknown argument "${argument}". Supported argument: --package.`);
  }

  const definition = PACKAGE_LOOKUP.get(packageSpec);

  if (!definition) {
    throw new Error(`Unknown package "${packageSpec}".`);
  }

  return definition;
}

const packageDefinition = resolvePackage();
const PKG_DIR = path.join(REPO_ROOT, packageDefinition.directory);
const OUT_DIR = path.join(PKG_DIR, '.npm-publish');

function copy(rel) {
  const src = path.join(PKG_DIR, rel);
  const dst = path.join(OUT_DIR, rel);
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.statSync(src).isDirectory()) fs.cpSync(src, dst, { recursive: true });
  else fs.copyFileSync(src, dst);
}

const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));
const clean = { ...pkg };

// Read and parse the pnpm-workspace.yaml catalog
function loadCatalog() {
  const workspaceFile = path.join(REPO_ROOT, 'pnpm-workspace.yaml');
  const content = fs.readFileSync(workspaceFile, 'utf8');
  const workspace = yaml.load(content);

  return workspace?.catalog || {};
}

const catalog = loadCatalog();

const workspacePackageVersions = new Map(
  PACKAGE_DEFINITIONS.map((definition) => {
    const manifestPath = path.join(REPO_ROOT, definition.packageJson);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    return [definition.packageName, manifest.version];
  }),
);

function deWorkspace(deps = {}) {
  const out = {};

  for (const [name, ver] of Object.entries(deps)) {
    if (typeof ver !== 'string' || !ver.startsWith('workspace:')) {
      out[name] = ver;
      continue;
    }

    const workspaceVersion = workspacePackageVersions.get(name);

    if (!workspaceVersion) {
      throw new Error(`Cannot publish unresolved workspace dependency "${name}".`);
    }

    const selector = ver.slice('workspace:'.length);

    if (selector === '*') {
      out[name] = workspaceVersion;
      continue;
    }

    if (selector === '^' || selector === '~') {
      out[name] = `${selector}${workspaceVersion}`;
      continue;
    }

    throw new Error(`Unsupported workspace dependency selector "${ver}" for "${name}".`);
  }

  return out;
}

function deCatalog(deps = {}) {
  const out = {};
  for (const [name, ver] of Object.entries(deps)) {
    if (typeof ver === 'string' && ver.startsWith('catalog:')) {
      // Use the version from catalog, fallback to ^0.0.0 if not found
      out[name] = catalog[name] || '^0.0.0';
      continue;
    }
    out[name] = ver;
  }
  return out;
}
clean.dependencies = deCatalog(deWorkspace(pkg.dependencies));
clean.devDependencies = deCatalog(deWorkspace(pkg.devDependencies));
clean.peerDependencies = deCatalog(deWorkspace(pkg.peerDependencies));

// deja solo lo necesario para publicar
clean.files = ['dist', 'README.md', 'LICENSE'].filter((f) => fs.existsSync(path.join(PKG_DIR, f)));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'package.json'), JSON.stringify(clean, null, 2));

copy('dist');
copy('README.md');
copy('LICENSE');

console.log(`Prepared publish folder for ${packageDefinition.packageName}:`, OUT_DIR);
