import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

execFileSync(process.execPath, [path.join(root, "scripts/validate-social-cards.mjs")], {
  stdio: "inherit",
});

const publicFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "privacy.html",
  "terms.html",
  "gg-privacy.html",
  "transaction.html",
  "tiktok-creative-lab-app.html",
  "tiktok-creative-lab.html",
  "404.html",
];
const publicDirectories = ["api", "blog", "images"];

// Pages already serves extensionless HTML routes. Netlify's rewrites back to
// .html would loop with Pages' automatic redirects, so do not publish _redirects.

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const name of [...publicFiles, ...publicDirectories]) {
  fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}

console.log("Built static Cloudflare Pages assets in dist/.");
