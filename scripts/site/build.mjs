// Static site build: reads data/, computes history and diffs, writes HTML,
// feeds and static JSON API to the output directory.
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { apiAdvisory, isStale, normaliseAdvisoryFeed } from "./lib/advisories.mjs";
import {
  apiControl,
  compareControlIds,
  compareVersions,
  isValidControlId,
  normaliseControl,
  releaseDate,
  slimControl,
} from "./lib/controls.mjs";
import { toCsv } from "./lib/csv.mjs";
import { toDate } from "./lib/dates.mjs";
import { wordDiff } from "./lib/diff.mjs";
import { jsonFeed, rssFeed, sitemap } from "./lib/feeds.mjs";
import { computeHistories, computeReleaseDiffs } from "./lib/history.mjs";
import {
  absoluteUrl,
  basePath,
  controlPath,
  isSafeVersion,
  normaliseBaseUrl,
  officialSourceUrl,
  releasePath,
  slugify,
} from "./lib/url.mjs";
import {
  aboutPage,
  advisoriesPage,
  controlPage,
  controlsIndexPage,
  homePage,
  notFoundPage,
  releasePage,
  releasesIndexPage,
} from "./templates.mjs";

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_VERSION = 1;

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

// ---------------------------------------------------------------- data loading

export async function loadData(dataDir, { warn = () => {} } = {}) {
  const manifestPath = path.join(dataDir, "ism", "manifest.json");
  const manifest = await readJson(manifestPath);
  const entries = Array.isArray(manifest.releases) ? manifest.releases : [];
  const releases = [];
  for (const entry of entries) {
    if (!isSafeVersion(entry?.version)) {
      warn(`Skipping release with unsafe version ${JSON.stringify(entry?.version)}`);
      continue;
    }
    const file = path.join(dataDir, "ism", "releases", `${entry.version}.json`);
    if (!existsSync(file)) {
      warn(`Release file missing for ${entry.version}`);
      continue;
    }
    const raw = await readJson(file);
    const meta = {
      version: entry.version,
      release: raw.release ?? entry.release ?? entry.version.replace(/^v/, ""),
      title: raw.title ?? entry.title ?? "Information Security Manual",
      sourceUrl: raw.sourceUrl ?? entry.sourceUrl ?? null,
      syncedAt: raw.syncedAt ?? entry.syncedAt ?? null,
    };
    const seen = new Set();
    const controls = [];
    for (const rawControl of raw.controls ?? []) {
      const control = normaliseControl(rawControl, meta);
      if (!isValidControlId(control.controlId)) {
        warn(`Skipping control with unsafe id ${JSON.stringify(rawControl?.controlId)} in ${entry.version}`);
        continue;
      }
      if (seen.has(control.controlId)) continue;
      seen.add(control.controlId);
      controls.push(control);
    }
    releases.push({ ...meta, releaseDate: releaseDate(meta.release) ?? releaseDate(entry.version), controls });
  }
  if (!releases.length) throw new Error(`No ISM releases found under ${dataDir}`);
  releases.sort((a, b) => compareVersions(a.version, b.version));

  const advisoriesPath = path.join(dataDir, "acsc", "advisories.json");
  const advisories = normaliseAdvisoryFeed(existsSync(advisoriesPath) ? await readJson(advisoriesPath) : {});
  return { manifest, releases, advisories };
}

// ---------------------------------------------------------------- helpers

function chapterGroups(controls) {
  const chapters = new Map();
  const usedSlugs = new Set();
  const uniqueSlug = (text) => {
    const base = slugify(text);
    let slug = base;
    for (let i = 2; usedSlugs.has(slug); i += 1) slug = `${base}-${i}`;
    usedSlugs.add(slug);
    return slug;
  };
  for (const control of controls) {
    if (!chapters.has(control.chapter)) {
      chapters.set(control.chapter, { name: control.chapter, slug: uniqueSlug(control.chapter), sections: new Map(), count: 0 });
    }
    const chapter = chapters.get(control.chapter);
    chapter.count += 1;
    if (!chapter.sections.has(control.section)) {
      chapter.sections.set(control.section, {
        name: control.section,
        slug: uniqueSlug(`${chapter.slug}-${control.section || "general"}`),
        controls: [],
      });
    }
    chapter.sections.get(control.section).controls.push(control);
  }
  return [...chapters.values()].map((chapter) => ({ ...chapter, sections: [...chapter.sections.values()] }));
}

function createDiffCache() {
  const cache = new Map();
  return (before, after) => {
    const key = `${before}\u0000${after}`;
    if (!cache.has(key)) cache.set(key, wordDiff(before ?? "", after ?? ""));
    return cache.get(key);
  };
}

const json = (value, pretty = false) => `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;

function assertSafeOutDir(outDir, guarded) {
  const resolved = path.resolve(outDir);
  const forbidden = [path.parse(resolved).root, os.homedir(), process.cwd(), ...guarded].map((p) => path.resolve(p));
  for (const dir of forbidden) {
    if (resolved === dir || dir.startsWith(resolved + path.sep)) {
      throw new Error(`Refusing to wipe output directory ${resolved}: it is or contains ${dir}`);
    }
  }
  return resolved;
}

// ---------------------------------------------------------------- build

export async function buildSite(options = {}) {
  const started = performance.now();
  const dataDir = path.resolve(options.dataDir ?? "data");
  const outDir = assertSafeOutDir(options.outDir ?? "site-dist", [dataDir, SITE_DIR]);
  const baseUrl = normaliseBaseUrl(options.baseUrl);
  const buildDate = toDate(options.buildTime ?? new Date());
  if (!buildDate) throw new Error(`Invalid BUILD_TIME: ${options.buildTime}`);
  const buildTime = buildDate.toISOString();
  const log = options.log ?? (() => {});
  const warn = options.warn ?? ((message) => log(`warning: ${message}`));

  const { manifest, releases, advisories } = await loadData(dataDir, { warn });
  const latest = releases.at(-1);
  const histories = computeHistories(releases);
  const diffs = computeReleaseDiffs(releases);
  const latestDiff = diffs.get(latest.version);
  const chapters = chapterGroups(latest.controls);
  const chapterSlugs = new Map(chapters.map((chapter) => [chapter.name, chapter.slug]));
  const diffFor = createDiffCache();
  const stale = isStale(advisories.fetchedAt, buildTime);

  const ctx = {
    baseUrl,
    basePath: basePath(baseUrl),
    buildTime,
    latestVersion: latest.version,
    ismGeneratedAt: manifest.generatedAt ?? latest.syncedAt ?? null,
    advisoriesUpdatedAt: advisories.fetchedAt,
    releaseCount: releases.length,
    abs: (target) => absoluteUrl(baseUrl, target),
  };

  const files = new Map();
  const put = (file, content) => {
    if (files.has(file)) throw new Error(`Duplicate output path ${file}`);
    files.set(file, content);
  };
  const pageUrls = [];
  const page = (dir, content) => {
    put(`${dir}index.html`, String(content));
    pageUrls.push(ctx.abs(dir));
  };

  // Pages
  page("", homePage(ctx, { latest, latestDiff, advisories, chapters }));
  page("controls/", controlsIndexPage(ctx, { latest, chapters }));
  for (const history of histories.values()) {
    page(controlPath(history.controlId), controlPage(ctx, { history, chapterSlugs, diffFor }));
  }
  page("releases/", releasesIndexPage(ctx, { releases, diffs }));
  releases.forEach((release, i) => {
    page(
      releasePath(release.version),
      releasePage(ctx, {
        release,
        diff: diffs.get(release.version),
        previous: releases[i - 1] ?? null,
        next: releases[i + 1] ?? null,
        diffFor,
      }),
    );
  });
  page("advisories/", advisoriesPage(ctx, { advisories, stale }));
  const firstNumeric = [...histories.keys()].find((id) => /^ISM-\d+$/.test(id)) ?? [...histories.keys()][0];
  page(
    "about/",
    aboutPage(ctx, { oldestVersion: releases[0].version, advisoryFeeds: advisories.feeds, exampleControlId: firstNumeric }),
  );
  put("404.html", String(notFoundPage(ctx)));

  // Release change CSVs
  for (const release of releases) {
    const diff = diffs.get(release.version);
    if (!diff) continue;
    const row = (status, item, extra = {}) => [
      status,
      item.controlId,
      item.control.displayTitle,
      item.control.chapter,
      item.control.section,
      extra.fields ?? "",
      extra.previousStatement ?? "",
      item.control.statement,
      item.control.revision ?? "",
      item.control.updated ?? "",
      item.control.applicability,
      item.control.essentialEight,
      ctx.abs(controlPath(item.controlId)),
    ];
    const rows = [
      ...diff.added.map((item) => row(item.reintroduced ? "reintroduced" : "added", item)),
      ...diff.changed.map((item) =>
        row("changed", item, {
          fields: item.fields.join("; "),
          previousStatement: item.fields.includes("statement") ? item.changes.statement.before : "",
        }),
      ),
      ...diff.removed.map((item) => row("removed", item)),
    ];
    put(
      `${releasePath(release.version)}changes.csv`,
      toCsv(
        [
          "Status",
          "Control ID",
          "Title",
          "Chapter",
          "Section",
          "Changed fields",
          "Previous statement",
          "Statement",
          "Revision",
          "Updated",
          "Applicability",
          "Essential Eight",
          "URL",
        ],
        rows,
      ),
    );
  }

  // Search data
  put(
    "data/latest-controls.json",
    json({ version: latest.version, count: latest.controls.length, controls: latest.controls.map(slimControl) }),
  );

  // Static API
  const releaseSummaries = [...releases].reverse().map((release) => {
    const diff = diffs.get(release.version);
    return {
      version: release.version,
      release: release.release,
      title: release.title,
      releaseDate: release.releaseDate,
      count: release.controls.length,
      previousVersion: diff?.previousVersion ?? null,
      changes: diff ? diff.counts : null,
      sourceUrl: release.sourceUrl,
      officialSourceUrl: officialSourceUrl(release.version),
      syncedAt: release.syncedAt,
      url: ctx.abs(releasePath(release.version)),
    };
  });
  put(
    "api/status.json",
    json(
      {
        schemaVersion: SCHEMA_VERSION,
        latestVersion: latest.version,
        releases: releases.length,
        controls: latest.controls.length,
        advisories: advisories.count,
        advisoriesUpdatedAt: advisories.fetchedAt,
        advisoriesStale: stale,
        ismGeneratedAt: ctx.ismGeneratedAt,
        builtAt: buildTime,
      },
      true,
    ),
  );
  put(
    "api/releases.json",
    json(
      {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: manifest.generatedAt ?? null,
        source: manifest.source ?? "AustralianCyberSecurityCentre/ism-oscal",
        latestVersion: latest.version,
        releases: releaseSummaries,
      },
      true,
    ),
  );
  for (const release of releases) {
    const diff = diffs.get(release.version);
    put(
      `api/releases/${release.version}/changes.json`,
      json({
        schemaVersion: SCHEMA_VERSION,
        version: release.version,
        previousVersion: diff?.previousVersion ?? null,
        counts: diff?.counts ?? null,
        added: (diff?.added ?? []).map((item) => ({
          controlId: item.controlId,
          reintroduced: item.reintroduced,
          control: apiControl(item.control),
        })),
        changed: (diff?.changed ?? []).map((item) => ({
          controlId: item.controlId,
          fields: item.fields,
          changes: item.changes,
        })),
        removed: (diff?.removed ?? []).map((item) => ({ controlId: item.controlId, control: apiControl(item.control) })),
      }),
    );
  }
  put(
    "api/controls.json",
    json({
      schemaVersion: SCHEMA_VERSION,
      version: latest.version,
      count: latest.controls.length,
      controls: latest.controls.map(apiControl),
    }),
  );
  for (const history of histories.values()) {
    put(
      `api/controls/${history.controlId}.json`,
      json({
        schemaVersion: SCHEMA_VERSION,
        controlId: history.controlId,
        status: history.current ? "current" : "removed",
        latestVersion: history.latestVersion,
        firstSeen: history.firstSeen,
        lastSeen: history.lastSeen,
        removedIn: history.removedIn,
        presentIn: history.presentIn,
        control: history.current ? apiControl(history.latest) : null,
        lastSeenControl: history.current ? null : apiControl(history.latest),
        history: history.entries,
      }),
    );
  }
  put(
    "api/advisories.json",
    json({
      schemaVersion: SCHEMA_VERSION,
      source: advisories.source,
      sourceUrl: advisories.sourceUrl,
      feeds: advisories.feeds,
      fetchedAt: advisories.fetchedAt,
      count: advisories.count,
      advisories: advisories.advisories.map(apiAdvisory),
    }),
  );

  // Feeds
  const feedAdvisories = advisories.advisories.slice(0, 50);
  put(
    "advisories.xml",
    rssFeed({
      title: "ACSC alerts and advisories (ISM Search archive)",
      link: ctx.abs("advisories/"),
      selfUrl: ctx.abs("advisories.xml"),
      description: "Recent Cyber.gov.au alerts and advisories archived by ISM Search. Not an official ASD/ACSC feed.",
      lastBuildDate: advisories.fetchedAt ?? buildTime,
      items: feedAdvisories.map((a) => ({
        title: a.severity ? `[${a.type}: ${a.severity}] ${a.title}` : `[${a.type}] ${a.title}`,
        link: a.safeHref,
        guid: a.safeHref ?? `ismsearch-advisory:${a.objectID}`,
        isPermaLink: Boolean(a.safeHref),
        pubDate: a.published,
        description: a.summary,
        categories: [a.type, ...(a.severity ? [a.severity] : []), ...a.audiences],
      })),
    }),
  );
  put(
    "advisories.json",
    json(
      jsonFeed({
        title: "ACSC alerts and advisories (ISM Search archive)",
        homePageUrl: ctx.abs("advisories/"),
        feedUrl: ctx.abs("advisories.json"),
        description: "Recent Cyber.gov.au alerts and advisories archived by ISM Search. Not an official ASD/ACSC feed.",
        items: feedAdvisories.map((a) => ({
          id: a.safeHref ?? `ismsearch-advisory:${a.objectID}`,
          url: a.safeHref,
          title: a.title,
          summary: a.summary,
          datePublished: a.published,
          tags: [a.type, ...(a.severity ? [a.severity] : []), ...a.audiences],
        })),
      }),
      true,
    ),
  );
  put(
    "releases.xml",
    rssFeed({
      title: "ISM releases (ISM Search)",
      link: ctx.abs("releases/"),
      selfUrl: ctx.abs("releases.xml"),
      description: "Australian Information Security Manual OSCAL releases with added, changed and removed control counts.",
      lastBuildDate: ctx.ismGeneratedAt ?? buildTime,
      items: [...releases].reverse().map((release) => {
        const diff = diffs.get(release.version);
        return {
          title: `ISM ${release.version}`,
          link: ctx.abs(releasePath(release.version)),
          guid: ctx.abs(releasePath(release.version)),
          isPermaLink: true,
          pubDate: release.releaseDate ?? release.syncedAt,
          description: diff
            ? `${release.controls.length} controls. Compared with ${diff.previousVersion}: ${diff.counts.added} added, ${diff.counts.changed} changed, ${diff.counts.removed} removed.`
            : `${release.controls.length} controls. Earliest tracked release.`,
        };
      }),
    }),
  );

  put("sitemap.xml", sitemap(pageUrls));
  put("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${ctx.abs("sitemap.xml")}\n`);
  put(".nojekyll", "");

  // Write everything
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const dirs = new Set([...files.keys()].map((file) => path.dirname(path.join(outDir, file))));
  await Promise.all([...dirs].sort().map((dir) => mkdir(dir, { recursive: true })));
  const writes = [...files.entries()];
  let bytes = 0;
  for (let i = 0; i < writes.length; i += 64) {
    await Promise.all(
      writes.slice(i, i + 64).map(([file, content]) => {
        bytes += Buffer.byteLength(content);
        return writeFile(path.join(outDir, file), content);
      }),
    );
  }

  // Assets (static files plus browser copies of shared libs)
  const assetsOut = path.join(outDir, "assets");
  await mkdir(assetsOut, { recursive: true });
  const assetCopies = [
    ...(await readdir(path.join(SITE_DIR, "assets"))).sort().map((name) => [path.join(SITE_DIR, "assets", name), name]),
    [path.join(SITE_DIR, "lib", "csv.mjs"), "csv.js"],
    [path.join(SITE_DIR, "lib", "search.mjs"), "search-core.js"],
  ];
  for (const [from, name] of assetCopies) {
    await copyFile(from, path.join(assetsOut, name));
    bytes += (await readFile(from)).length;
  }

  const htmlPages = [...files.keys()].filter((file) => file.endsWith(".html")).length;
  const summary = {
    outDir,
    baseUrl,
    buildTime,
    latestVersion: latest.version,
    releases: releases.length,
    controlPages: histories.size,
    currentControls: latest.controls.length,
    removedControls: [...histories.values()].filter((h) => !h.current).length,
    advisories: advisories.count,
    advisoriesStale: stale,
    htmlPages,
    files: files.size + assetCopies.length,
    bytes,
    durationMs: Math.round(performance.now() - started),
  };
  return summary;
}
