// Tiny link checker for the generated site: resolves every relative href/src
// in generated HTML against the filesystem, including #fragment targets.
import { existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function listHtml(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listHtml(path.join(dir, entry.name), rel)));
    else if (entry.name.endsWith(".html")) out.push(rel);
  }
  return out;
}

const ATTR_PATTERN = /\s(?:href|src)="([^"]*)"/g;
const ID_PATTERN = /\sid="([^"]+)"/g;

function decodeAttr(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#96;/g, "`")
    .replace(/&#61;/g, "=")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export async function checkLinks(outDir, { basePath = "/" } = {}) {
  const root = path.resolve(outDir);
  const pages = await listHtml(root);
  const idCache = new Map();
  const idsFor = async (file) => {
    if (!idCache.has(file)) {
      const text = await readFile(file, "utf8");
      idCache.set(file, new Set([...text.matchAll(ID_PATTERN)].map((m) => decodeAttr(m[1]))));
    }
    return idCache.get(file);
  };
  const broken = [];
  let checked = 0;
  for (const page of pages) {
    const original = await readFile(path.join(root, page), "utf8");
    // Pages with <base> (404.html, served at arbitrary depths) resolve against the site root.
    const hasBase = /<base\s[^>]*>/.test(original);
    const text = original.replace(/<base\s[^>]*>/g, "");
    const pageUrl = new URL(hasBase ? basePath : `${basePath}${page}`, "http://site.invalid/");
    for (const match of text.matchAll(ATTR_PATTERN)) {
      const value = decodeAttr(match[1]);
      if (/^(?:https?:|mailto:|data:)/i.test(value)) continue;
      checked += 1;
      const url = new URL(value, pageUrl);
      if (url.origin !== "http://site.invalid" || !url.pathname.startsWith(basePath)) {
        broken.push({ page, href: value, reason: "escapes site root" });
        continue;
      }
      let target = path.join(root, decodeURIComponent(url.pathname.slice(basePath.length)));
      if (url.pathname.endsWith("/")) target = path.join(target, "index.html");
      else if (existsSync(target) && statSync(target).isDirectory()) target = path.join(target, "index.html");
      if (!existsSync(target)) {
        broken.push({ page, href: value, reason: "missing file" });
        continue;
      }
      if (url.hash && target.endsWith(".html")) {
        const ids = await idsFor(target);
        if (!ids.has(decodeURIComponent(url.hash.slice(1)))) broken.push({ page, href: value, reason: "missing anchor" });
      }
    }
  }
  return { pages: pages.length, checked, broken };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dir = process.argv[2] ?? process.env.SITE_OUT_DIR ?? "site-dist";
  const result = await checkLinks(dir, { basePath: process.env.SITE_CHECK_BASE_PATH ?? "/" });
  console.log(`Checked ${result.checked} links across ${result.pages} pages; ${result.broken.length} broken.`);
  for (const item of result.broken.slice(0, 50)) console.log(`  ${item.page}: ${item.href} (${item.reason})`);
  process.exitCode = result.broken.length ? 1 : 0;
}

export const CHECK_LINKS_PATH = fileURLToPath(import.meta.url);
