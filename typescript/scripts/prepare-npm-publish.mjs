import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PKG_DIR = path.join(REPO_ROOT, "lib/ember-plugin-registry");
const OUT_DIR = path.join(PKG_DIR, ".npm-publish");

function copy(rel) {
  const src = path.join(PKG_DIR, rel);
  const dst = path.join(OUT_DIR, rel);
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.statSync(src).isDirectory()) fs.cpSync(src, dst, { recursive: true });
  else fs.copyFileSync(src, dst);
}

const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8"));
const clean = { ...pkg };

// “Aplana” cualquier catalog si algún día lo agregan (hoy no hay, pero queda robusto)
function deCatalog(deps = {}) {
  const out = {};
  for (const [name, ver] of Object.entries(deps)) {
    out[name] = (typeof ver === "string" && ver.startsWith("catalog:")) ? "^0.0.0" : ver;
  }
  return out;
}
clean.dependencies = deCatalog(pkg.dependencies);
clean.devDependencies = deCatalog(pkg.devDependencies);
clean.peerDependencies = deCatalog(pkg.peerDependencies);

// deja solo lo necesario para publicar
clean.files = ["dist", "README.md", "LICENSE"].filter(f => fs.existsSync(path.join(PKG_DIR, f)));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "package.json"), JSON.stringify(clean, null, 2));

copy("dist");
copy("README.md");
copy("LICENSE");

console.log("Prepared publish folder:", OUT_DIR);