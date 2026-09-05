#!/usr/bin/env node

/*
  Assembles a copy of the site that can be served from a subpath, so a branch can be looked at next
  to production without being production. Three things separate a preview from the real thing: it
  carries no analytics, it asks not to be indexed, and the handful of paths that are written from the
  site root are rewritten to sit under the preview's own base.

  Usage: node scripts/build-preview.mjs --out preview/pr-15 --base /preview/pr-15/
*/

import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Everything that exists for the repository rather than for the browser.
const NOT_SERVED = new Set([
  ".git",
  ".github",
  ".cursor",
  ".gitignore",
  ".env.example",
  "node_modules",
  "scripts",
  "supabase",
  "docs",
  "preview",
  "CNAME",
  "README.md",
]);

function parseArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) options[key] = argv[i + 1];
  }
  if (!options.out || !options.base) {
    throw new Error("both --out and --base are required");
  }
  // A base that neither starts nor ends with a slash makes every join below ambiguous.
  options.base = `/${options.base.replace(/^\/+|\/+$/g, "")}/`;
  options.source = path.resolve(options.source || ".");
  options.out = path.resolve(options.out);
  return options;
}

const { source, out, base } = parseArguments(process.argv.slice(2));

await rm(out, { recursive: true, force: true });
await cp(source, out, {
  recursive: true,
  filter: (entry) => {
    const relative = path.relative(source, entry);
    if (!relative) return true;
    const [top] = relative.split(path.sep);
    if (NOT_SERVED.has(top)) return false;
    return !relative.endsWith(".csv");
  },
});

const indexPath = path.join(out, "index.html");
let html = await readFile(indexPath, "utf8");

// A preview that reports to PostHog would put staging traffic in the site's own numbers.
const analytics = /[ \t]*<!-- Posthog -->[\s\S]*?<\/script>\r?\n?/;
if (!analytics.test(html)) {
  throw new Error("could not find the analytics block to strip; check index.html before publishing");
}
html = html.replace(analytics, "");

// Previews live on the same domain as the site, so they have to say they are not it.
const head = "<head>";
if (!html.includes(head)) throw new Error("no <head> to mark noindex");
html = html.replace(head, `${head}\n  <meta name="robots" content="noindex, nofollow">`);

// Anything written from the root would otherwise reach past the preview and hit production.
const rootRelative = /(href|src)="\/(?!\/)([^"]*)"/g;
const rewritten = [];
html = html.replace(rootRelative, (whole, attribute, rest) => {
  rewritten.push(`/${rest}`);
  return `${attribute}="${base}${rest}"`;
});

await writeFile(indexPath, html);

const manifestPath = path.join(out, "site.webmanifest");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: icon.src.replace(/^\//, base) }));
manifest.start_url = base;
manifest.scope = base;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`preview built at ${path.relative(process.cwd(), out) || "."} for base ${base}`);
console.log(`  analytics stripped, noindex added`);
console.log(`  ${rewritten.length} root-relative paths rebased: ${rewritten.join(", ")}`);
console.log(`  manifest scope and start_url set to ${base}`);
