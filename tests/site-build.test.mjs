import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { buildSite } from "../scripts/site/build.mjs";
import { checkLinks } from "../scripts/site/check-links.mjs";

const BUILD_TIME = "2026-11-03T00:00:00.000Z";
let tmp;
let dataDir;
let outDir;
let summary;

const control = (version, id, overrides = {}) => ({
  objectID: `${version}_${id.toLowerCase()}`,
  id: id.toLowerCase(),
  controlId: id,
  version,
  release: version.slice(1),
  title: id,
  chapter: "Guidelines for email",
  section: "Email gateways and servers / Email content filtering",
  topic: "Email content filtering",
  path: ["Guidelines for email", "Email gateways and servers", "Email content filtering"],
  statement: `Statement for ${id}.`,
  body: `Statement for ${id}.`,
  text: "duplicate",
  revision: "1",
  updated: "Mar-26",
  applicability: ["NC", "OS", "P", "S", "TS"],
  applicabilityLabels: [],
  essentialEight: [],
  sortId: id,
  ...overrides,
});

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

async function listFiles(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "ism-site-test-"));
  dataDir = path.join(tmp, "data");
  outDir = path.join(tmp, "out");
  const releases = {
    "v2025.12.9": [
      control("v2025.12.9", "ISM-0001", { applicability: ["ALL"] }),
      control("v2025.12.9", "ISM-0002"),
      control("v2025.12.9", "ISM-1234", { title: "Email <b>filtering</b>" }),
    ],
    "v2026.03.24": [
      control("v2026.03.24", "ISM-0001", { statement: "Changed statement for ISM-0001 with </script><script>alert(1)</script>." }),
      control("v2026.03.24", "ISM-1234", { title: "Email <b>filtering</b>", essentialEight: ["ML2"] }),
      control("v2026.03.24", "ISM-PRINCIPLE-GOV-01", { title: "Executive accountability", chapter: "Cyber security principles" }),
      control("v2026.03.24", "../evil", {}),
    ],
  };
  await writeJson(path.join(dataDir, "ism", "manifest.json"), {
    generatedAt: "2026-10-30T00:00:00.000Z",
    source: "AustralianCyberSecurityCentre/ism-oscal",
    releases: Object.keys(releases)
      .reverse()
      .map((version) => ({ version, release: version.slice(1), title: "ISM", sourceUrl: "x", count: releases[version].length, syncedAt: "2026-10-30T00:00:00.000Z" })),
  });
  for (const [version, controls] of Object.entries(releases)) {
    await writeJson(path.join(dataDir, "ism", "releases", `${version}.json`), { version, release: version.slice(1), title: "ISM", controls });
  }
  await writeJson(path.join(dataDir, "acsc", "advisories.json"), {
    source: "test",
    feeds: ["https://www.cyber.gov.au/rss/alerts"],
    fetchedAt: "2026-10-01T00:00:00.000Z",
    advisories: [
      { objectID: "a1", title: "Critical <img src=x onerror=alert(1)> thing", summary: "=cmd", href: "https://www.cyber.gov.au/a1", published: "2026-10-23", date: "23 Oct 2026", firstSeenAt: "2026-10-23T00:00:00Z", type: "Alert", severity: "Critical", audiences: ["Government"], source: "rss" },
      { objectID: "a2", title: "Evil link", summary: "", href: "https://www.cyber.gov.au@evil.example/", date: "01 May 2026", type: "Advisory", severity: null, audiences: [] },
      { objectID: "a3", title: "JS link", summary: "", href: "javascript:alert(1)", date: "02 May 2026", type: "Advisory", severity: null, audiences: [] },
    ],
  });
  summary = await buildSite({ dataDir, outDir, buildTime: BUILD_TIME, baseUrl: "https://example.github.io/ISMSearch/", warn: () => {} });
});

after(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

test("build writes the expected files", () => {
  for (const file of [
    ".nojekyll",
    "index.html",
    "404.html",
    "about/index.html",
    "advisories/index.html",
    "controls/index.html",
    "controls/ISM-0001/index.html",
    "controls/ISM-0002/index.html",
    "controls/ISM-PRINCIPLE-GOV-01/index.html",
    "releases/index.html",
    "releases/v2026.03.24/index.html",
    "releases/v2026.03.24/changes.csv",
    "releases/v2025.12.9/index.html",
    "data/latest-controls.json",
    "api/status.json",
    "api/releases.json",
    "api/releases/v2026.03.24/changes.json",
    "api/controls.json",
    "api/controls/ISM-0002.json",
    "api/advisories.json",
    "advisories.xml",
    "advisories.json",
    "releases.xml",
    "sitemap.xml",
    "robots.txt",
    "assets/site.css",
    "assets/search.js",
    "assets/search-core.js",
    "assets/csv.js",
    "assets/advisories.js",
    "assets/not-found.js",
    "assets/copy.js",
  ]) {
    assert.ok(existsSync(path.join(outDir, file)), `missing ${file}`);
  }
  assert.ok(!existsSync(path.join(outDir, "controls", "..", "evil")));
  assert.equal(summary.controlPages, 4);
  assert.equal(summary.removedControls, 1);
});

test("generated HTML is relative, CSP-protected and has no inline scripts or styles", async () => {
  const files = (await listFiles(outDir)).filter((file) => file.endsWith(".html"));
  assert.ok(files.length >= 10);
  for (const file of files) {
    const text = await readFile(path.join(outDir, file), "utf8");
    assert.match(text, /<meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; script-src &#39;self&#39;;/, file);
    assert.match(text, /<meta name="referrer" content="strict-origin-when-cross-origin">/, file);
    assert.equal((text.match(/<h1[\s>]/g) ?? []).length, 1, `${file} should have one h1`);
    for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      assert.match(match[1], /\bsrc="/, `${file} has a script without src`);
      assert.equal(match[2].trim(), "", `${file} has an inline script body`);
    }
    assert.ok(!/\sstyle="/.test(text), `${file} has an inline style attribute`);
    assert.ok(!/<style[\s>]/.test(text), `${file} has a <style> element`);
    assert.ok(!/\son[a-z]+="/i.test(text), `${file} has an inline event handler`);
    const withoutBase = text.replace(/<base\s[^>]*>/g, "");
    for (const m of withoutBase.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const value = m[1];
      if (value.startsWith("https://")) continue;
      assert.ok(!value.startsWith("/"), `${file} has absolute internal link ${value}`);
      assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(value), `${file} has unexpected scheme ${value}`);
    }
  }
});

test("data is escaped and unsafe advisory links are not linked", async () => {
  const advisories = await readFile(path.join(outDir, "advisories/index.html"), "utf8");
  assert.ok(!advisories.includes("<img src=x"));
  assert.ok(advisories.includes('href="https://www.cyber.gov.au/a1" rel="noopener noreferrer" target="_blank"'));
  assert.ok(!advisories.includes('href="https://www.cyber.gov.au@evil'));
  assert.ok(!advisories.includes('href="javascript:'));
  assert.ok(advisories.includes("may be out of date"), "stale warning expected (fetched > 14 days before build)");
  const control = await readFile(path.join(outDir, "controls/ISM-0001/index.html"), "utf8");
  assert.ok(!control.includes("<script>alert(1)"));
  assert.ok(control.includes("&lt;/script&gt;"));
  assert.ok(control.includes("<ins>") && control.includes("<del>"));
  const csv = await readFile(path.join(outDir, "releases/v2026.03.24/changes.csv"), "utf8");
  assert.ok(csv.includes(`"changed","ISM-0001"`));
  const rss = await readFile(path.join(outDir, "advisories.xml"), "utf8");
  assert.ok(rss.includes('<guid isPermaLink="true">https://www.cyber.gov.au/a1</guid>'));
  assert.ok(rss.includes("<pubDate>Fri, 23 Oct 2026 00:00:00 GMT</pubDate>"));
  assert.ok(!rss.includes("<img"));
});

test("history, API and feeds reflect the fixture", async () => {
  const removed = await readFile(path.join(outDir, "controls/ISM-0002/index.html"), "utf8");
  assert.ok(removed.includes("Removed in v2026.03.24 — last seen v2025.12.9"));
  const current = await readFile(path.join(outDir, "controls/ISM-1234/index.html"), "utf8");
  assert.ok(current.includes("Current in v2026.03.24"));
  assert.ok(current.includes("https://github.com/AustralianCyberSecurityCentre/ism-oscal/blob/v2026.03.24/ISM_catalog.json"));
  assert.ok(current.includes('href="../../api/controls/ISM-1234.json"'));

  const status = JSON.parse(await readFile(path.join(outDir, "api/status.json"), "utf8"));
  assert.deepEqual(
    { latestVersion: status.latestVersion, releases: status.releases, controls: status.controls, advisories: status.advisories, builtAt: status.builtAt, schemaVersion: status.schemaVersion },
    { latestVersion: "v2026.03.24", releases: 2, controls: 3, advisories: 3, builtAt: BUILD_TIME, schemaVersion: 1 },
  );
  const changes = JSON.parse(await readFile(path.join(outDir, "api/releases/v2026.03.24/changes.json"), "utf8"));
  // ALL -> full set must not count as an applicability change.
  assert.deepEqual(changes.counts, { added: 1, changed: 2, removed: 1 });
  assert.deepEqual(changes.changed.find((c) => c.controlId === "ISM-0001").fields, ["statement"]);
  const api = JSON.parse(await readFile(path.join(outDir, "api/controls/ISM-0002.json"), "utf8"));
  assert.equal(api.control, null);
  assert.equal(api.status, "removed");
  assert.deepEqual(api.history.map((h) => h.type), ["introduced", "removed"]);
  const controls = JSON.parse(await readFile(path.join(outDir, "api/controls.json"), "utf8"));
  assert.ok(controls.controls.every((c) => !("text" in c) && !("body" in c)));
  const slim = JSON.parse(await readFile(path.join(outDir, "data/latest-controls.json"), "utf8"));
  assert.equal(slim.controls.find((c) => c.id === "ISM-1234").title, "Email <b>filtering</b>");
  const feed = JSON.parse(await readFile(path.join(outDir, "advisories.json"), "utf8"));
  assert.equal(feed.version, "https://jsonfeed.org/version/1.1");
  const sitemap = await readFile(path.join(outDir, "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes("<loc>https://example.github.io/ISMSearch/controls/ISM-0001/</loc>"));
  assert.ok(!sitemap.includes("404"));
  const robots = await readFile(path.join(outDir, "robots.txt"), "utf8");
  assert.ok(robots.includes("Sitemap: https://example.github.io/ISMSearch/sitemap.xml"));
  const notFound = await readFile(path.join(outDir, "404.html"), "utf8");
  assert.ok(notFound.includes('<base href="/ISMSearch/">'));
  assert.ok(notFound.includes('data-base="/ISMSearch/"'));
});

test("output is deterministic and every relative link resolves", async () => {
  const first = new Map();
  for (const file of await listFiles(outDir)) first.set(file, await readFile(path.join(outDir, file), "utf8"));
  await buildSite({ dataDir, outDir, buildTime: BUILD_TIME, baseUrl: "https://example.github.io/ISMSearch/", warn: () => {} });
  const files = await listFiles(outDir);
  assert.deepEqual(files.sort(), [...first.keys()].sort());
  for (const file of files) assert.equal(await readFile(path.join(outDir, file), "utf8"), first.get(file), `${file} changed between builds`);
  const result = await checkLinks(outDir);
  assert.deepEqual(result.broken, []);
  assert.ok(result.checked > 50);
});

test("refuses to wipe dangerous output directories", async () => {
  const manifest = path.join(dataDir, "ism", "manifest.json");
  const original = await readFile(manifest, "utf8");
  await assert.rejects(buildSite({ dataDir, outDir: tmp, buildTime: BUILD_TIME }), /Refusing to wipe/);
  await assert.rejects(buildSite({ dataDir, outDir: process.cwd(), buildTime: BUILD_TIME }), /Refusing to wipe/);
  await assert.rejects(buildSite({ dataDir, outDir: path.join(dataDir, "ism"), buildTime: BUILD_TIME }), /Refusing to wipe/);
  await assert.rejects(buildSite({ dataDir, outDir: path.join(dataDir, "ism", "new-output"), buildTime: BUILD_TIME }), /Refusing to wipe/);
  await assert.rejects(buildSite({ dataDir, outDir: path.resolve("scripts/site/assets"), buildTime: BUILD_TIME }), /Refusing to wipe/);
  const alias = path.join(tmp, "data-alias");
  await symlink(dataDir, alias, "dir");
  await assert.rejects(buildSite({ dataDir, outDir: path.join(alias, "ism"), buildTime: BUILD_TIME }), /Refusing to wipe/);
  await assert.rejects(buildSite({ dataDir: alias, outDir: path.join(dataDir, "ism"), buildTime: BUILD_TIME }), /Refusing to wipe/);
  assert.equal(await readFile(manifest, "utf8"), original);
});
