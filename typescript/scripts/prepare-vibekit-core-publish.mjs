import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
// We'll parse the yaml manually since js-yaml is not available
// import yaml from 'js-yaml';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_DIR = path.join(REPO_ROOT, 'lib/arbitrum-vibekit-core');
const OUT_DIR = path.join(PKG_DIR, '.npm-publish');

// Helper function to copy files/directories
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
  // Hardcoded catalog from pnpm-workspace.yaml since js-yaml is not available
  // These are the catalog values from the workspace file
  return {
    'zod': '^3.24.3',
    '@modelcontextprotocol/sdk': '^1.13.1',
    'dotenv': '^16.3.1',
    '@openrouter/ai-sdk-provider': '^0.4.5',
    'ai': '^4.3.2',
    'express': '^4.21.2',
    '@types/chai': '^4.3.11',
    '@types/mocha': '^10.0.6',
    'chai': '^4.3.10',
    'mocha': '^10.2.0',
    'tsx': '^4.6.2',
    'typescript': '^5.8.3'
  };
}

const catalog = loadCatalog();

// Function to resolve catalog: references
function deCatalog(deps = {}) {
  const out = {};
  for (const [name, ver] of Object.entries(deps)) {
    if (typeof ver === 'string' && ver.startsWith('catalog:')) {
      // Use the version from catalog
      out[name] = catalog[name] || '^0.0.0';
      continue;
    }
    out[name] = ver;
  }
  return out;
}

// Resolve workspace dependencies for internal packages
function resolveWorkspaceDeps(deps = {}) {
  const out = {};
  for (const [name, ver] of Object.entries(deps)) {
    if (typeof ver === 'string' && ver.startsWith('workspace:')) {
      // For workspace dependencies, we need to check their actual versions
      if (name === 'ember-schemas') {
        out[name] = '^1.0.0';
      } else if (name === '@google-a2a/types') {
        out[name] = '^1.0.0';
      } else {
        // Default fallback for unknown workspace dependencies
        out[name] = '^1.0.0';
      }
      continue;
    }
    out[name] = ver;
  }
  return out;
}

// Clean up dependencies
clean.dependencies = deCatalog(resolveWorkspaceDeps(pkg.dependencies));
clean.devDependencies = deCatalog(pkg.devDependencies);
clean.peerDependencies = deCatalog(pkg.peerDependencies);

// Remove devDependencies for publish
delete clean.devDependencies;

// Remove scripts that aren't needed in published package
clean.scripts = {
  // Keep minimal scripts if needed
};

// Remove packageManager field as it's not needed in published package
delete clean.packageManager;

// Ensure files field is set correctly
clean.files = ['dist', 'README.md', 'LICENSE'].filter(f => fs.existsSync(path.join(PKG_DIR, f)));

// Create clean publish directory
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'package.json'), JSON.stringify(clean, null, 2));

// Copy necessary files
copy('dist');
copy('README.md');
copy('LICENSE');

console.log('Prepared publish folder:', OUT_DIR);
console.log('\nPackage.json preview:');
console.log(JSON.stringify(clean, null, 2));