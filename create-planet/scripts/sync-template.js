#!/usr/bin/env node
/**
 * Syncs the planet source into create-planet/template/.
 * Run before publishing: npm run sync-template
 * Also runs automatically via prepublishOnly.
 */
import { cpSync, rmSync, existsSync, readdirSync, statSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(path.join(__dirname, "../../"));
const DEST = path.resolve(path.join(__dirname, "../template"));

const EXCLUDE = new Set([
  "node_modules",
  "dist",
  ".wrangler",
  ".git",
  "create-planet",
  "wrangler.deploy.jsonc",
  "wrangler.log",
  "package-lock.json",
]);

const shouldExclude = (name) =>
  EXCLUDE.has(name) || name.startsWith(".env");

const copyDir = (src, dest) => {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (shouldExclude(entry)) continue;
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
    }
  }
};

if (existsSync(DEST)) {
  rmSync(DEST, { recursive: true });
}

copyDir(SRC, DEST);
console.log("Template synced to create-planet/template/");
