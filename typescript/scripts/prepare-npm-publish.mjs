import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_DIR = path.join(REPO_ROOT, 'onchain-actions-plugins/registry');
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
clean.dependencies = deCatalog(pkg.dependencies);
clean.devDependencies = deCatalog(pkg.devDependencies);
clean.peerDependencies = deCatalog(pkg.peerDependencies);

// deja solo lo necesario para publicar
clean.files = ['dist', 'README.md', 'LICENSE'].filter(f => fs.existsSync(path.join(PKG_DIR, f)));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'package.json'), JSON.stringify(clean, null, 2));

copy('dist');
copy('README.md');
copy('LICENSE');

console.log('Prepared publish folder:', OUT_DIR);
