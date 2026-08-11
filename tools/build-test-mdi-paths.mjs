import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repositoryRoot, mdiModulePath, outputPath] = process.argv.slice(2);
if (!repositoryRoot || !mdiModulePath || !outputPath) {
  throw new Error(
    "Usage: node build-test-mdi-paths.mjs <repository-root> <mdi.js> <output.js>",
  );
}

const mdi = await import(pathToFileURL(path.resolve(mdiModulePath)).href);
const frontendRoot = path.join(repositoryRoot, "custom_components", "dratek_eink", "frontend");
const harnessPath = path.join(repositoryRoot, "tests", "dratek-eink-panel-harness.html");
const cssPath = path.join(repositoryRoot, "tests", "vendor", "mdi", "materialdesignicons.min.css");

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(entryPath) : [entryPath];
});

const css = fs.readFileSync(cssPath, "utf8");
const availableNames = new Set(
  [...css.matchAll(/\.mdi-([a-z0-9-]+)::?before\{/g)].map((match) => match[1]),
);
const sources = [
  ...walk(frontendRoot).filter((file) => file.endsWith(".js")),
  harnessPath,
].map((file) => fs.readFileSync(file, "utf8"));

const usedNames = new Set();
const ignoredNames = new Set(["light", "spin"]);
for (const source of sources) {
  for (const match of source.matchAll(/mdi:([a-z0-9-]+)/g)) {
    usedNames.add(match[1]);
  }
  for (const match of source.matchAll(/["'`]([a-z][a-z0-9-]+)["'`]/g)) {
    if (availableNames.has(match[1])) usedNames.add(match[1]);
  }
}

const exportName = (iconName) => `mdi${iconName
  .split("-")
  .map((part) => part ? part[0].toUpperCase() + part.slice(1) : "")
  .join("")}`;

const paths = {};
const missing = [];
for (const iconName of [...usedNames].sort()) {
  if (ignoredNames.has(iconName)) continue;
  const value = mdi[exportName(iconName)];
  if (typeof value === "string") paths[iconName] = value;
  else missing.push(iconName);
}

const output = [
  "// Generated from @mdi/js 7.4.47 by tools/build-test-mdi-paths.mjs.",
  "// Contains only icons referenced by the DRATEK frontend and local harness.",
  `export const mdiPaths = ${JSON.stringify(paths, null, 2)};`,
  "",
].join("\n");
fs.writeFileSync(outputPath, output, "utf8");

console.log(`Generated ${Object.keys(paths).length} SVG icon paths.`);
if (missing.length) {
  console.log(`Missing ${missing.length}: ${missing.join(", ")}`);
  process.exitCode = 2;
}
