// Sync ISM OSCAL releases into data/ism (and optionally Meilisearch).
//
// Release files are snapshots of immutable git tags, so a release already on disk is
// never re-downloaded (set ISM_FORCE_RESYNC=1 to override). The manifest is always the
// union of every usable release file on disk, so it never shrinks because discovery
// failed or ISM_RELEASE_COUNT is set. ISM_RELEASE_COUNT ("all" by default) only caps how
// many *new* releases are downloaded in a single run, newest first.
//
// Environment:
//   ISM_DATA_DIR        output directory (default ./data/ism)
//   ISM_RELEASE_COUNT   "all" or a positive integer cap on new downloads
//   ISM_FORCE_RESYNC    "1" to re-download releases that already exist
//   ISM_STRICT          "0" to downgrade validation failures of GitHub-tagged releases to warnings
//   GITHUB_TOKEN        optional, raises the GitHub API rate limit for tag discovery
//   MEILI_HOST          when set, index all releases into Meilisearch (MEILI_MASTER_KEY)
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fetchText } from "./lib/http.mjs";
import { readJsonIfExists, writeFileAtomic, serializeJson } from "./lib/io.mjs";
import {
  GITHUB_REPO,
  buildCandidates,
  buildManifest,
  chooseManifest,
  extractVersionsFromCyberPage,
  extractVersionsFromRss,
  isUsableReleaseFile,
  normalizeCatalog,
  parseGithubTags,
  parseReleaseLimit,
  planDownloads,
  releaseSummary,
  sortVersionsDesc,
  sourceUrlFor,
  validateRelease,
} from "./lib/ism.mjs";
import { errorMessage, fail, warn } from "./lib/log.mjs";

const PROJECT_ROOT = process.cwd();
const DATA_DIR = process.env.ISM_DATA_DIR ?? path.join(PROJECT_ROOT, "data", "ism");
const RELEASES_DIR = path.join(DATA_DIR, "releases");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const RELEASE_LIMIT = parseReleaseLimit(process.env.ISM_RELEASE_COUNT ?? "all");
const FORCE = process.env.ISM_FORCE_RESYNC === "1";
const STRICT = process.env.ISM_STRICT !== "0";
const CYBER_OSCAL_PAGE = "https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/ism/ism-oscal-releases";
const CYBER_NEWS_RSS = process.env.CYBER_RSS_URL ?? "https://www.cyber.gov.au/rss/news";
// cyber.gov.au's WAF tarpits user agents containing "http"/"github", so keep this plain.
const USER_AGENT = process.env.SYNC_USER_AGENT ?? "ISMSearch ISM sync (jusso-dev/ISMSearch)";

const baseHeaders = { "user-agent": USER_AGENT };

async function discoverGithubTags() {
  const headers = {
    ...baseHeaders,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const tags = [];
  for (let page = 1; page <= 20; page += 1) {
    const text = await fetchText(`https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=100&page=${page}`, {
      headers,
    });
    const json = JSON.parse(text);
    if (!Array.isArray(json)) throw new Error("GitHub tags API returned a non-array response");
    tags.push(...parseGithubTags(json));
    if (json.length < 100) break;
  }
  return tags;
}

async function discoverScraped() {
  const versions = [];
  const sources = [
    [CYBER_OSCAL_PAGE, extractVersionsFromCyberPage, "text/html"],
    [CYBER_NEWS_RSS, extractVersionsFromRss, "application/rss+xml,application/xml"],
  ];
  for (const [url, extract, accept] of sources) {
    try {
      versions.push(...extract(await fetchText(url, { headers: { ...baseHeaders, accept } })));
    } catch (error) {
      warn(`ISM discovery via ${url} failed: ${errorMessage(error)}`);
    }
  }
  return versions;
}

async function listReleaseFiles() {
  try {
    return (await readdir(RELEASES_DIR)).filter((name) => /^v[\d.]+\.json$/.test(name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

/** Load every usable release on disk. Returns Map<version, summary>. */
async function loadExistingSummaries() {
  const summaries = new Map();
  for (const file of await listReleaseFiles()) {
    const snapshot = await readJsonIfExists(path.join(RELEASES_DIR, file));
    if (isUsableReleaseFile(snapshot) && `${snapshot.version}.json` === file) {
      summaries.set(snapshot.version, releaseSummary(snapshot));
    } else {
      warn(`Ignoring unusable release file ${file}`);
    }
  }
  return summaries;
}

async function fetchCatalogText(version) {
  return fetchText(sourceUrlFor(version), {
    headers: { ...baseHeaders, accept: "application/json" },
    timeoutMs: 120_000,
  });
}

/** Parse and normalise a downloaded catalog; returns { snapshot } or { problems }. */
function buildSnapshot(version, text, previous) {
  let snapshot;
  try {
    // Preserve the original syncedAt when force re-syncing an existing release.
    snapshot = normalizeCatalog(version, JSON.parse(text), { syncedAt: previous?.syncedAt ?? new Date().toISOString() });
  } catch (error) {
    return { problems: [errorMessage(error)] };
  }
  const problems = validateRelease(snapshot);
  return problems.length > 0 ? { problems } : { snapshot };
}

async function indexAllReleases(versions) {
  const host = process.env.MEILI_HOST;
  if (!host) {
    console.log("Skipping Meilisearch indexing because MEILI_HOST is not set.");
    return;
  }

  const { Meilisearch } = await import("meilisearch");
  const client = new Meilisearch({ host, apiKey: process.env.MEILI_MASTER_KEY });
  const index = client.index("ism-controls");
  const waitForTask = async (task) => {
    const uid = task?.taskUid ?? task?.uid;
    if (uid == null) return;
    const result = await client.tasks.waitForTask(uid, { timeout: 600_000, interval: 250 });
    if (result.status === "failed") {
      throw new Error(result.error?.message ?? `Meilisearch task ${uid} failed`);
    }
  };

  await client.createIndex("ism-controls", { primaryKey: "objectID" }).catch(() => undefined);
  await waitForTask(
    await index.updateSearchableAttributes(["controlId", "title", "statement", "body", "chapter", "section", "topic"]),
  );
  await waitForTask(
    await index.updateFilterableAttributes([
      "version",
      "release",
      "chapter",
      "applicability",
      "essentialEight",
      "revision",
      "updated",
    ]),
  );
  await waitForTask(await index.updateSortableAttributes(["controlId", "updated", "release"]));

  let total = 0;
  for (const version of versions) {
    const snapshot = await readJsonIfExists(path.join(RELEASES_DIR, `${version}.json`));
    if (!isUsableReleaseFile(snapshot)) continue;
    for (let offset = 0; offset < snapshot.controls.length; offset += 1000) {
      await waitForTask(
        await index.addDocuments(snapshot.controls.slice(offset, offset + 1000), { primaryKey: "objectID" }),
      );
    }
    total += snapshot.controls.length;
  }
  console.log(`Indexed ${total} controls from ${versions.length} releases into Meilisearch at ${host}.`);
}

async function main() {
  const existing = await loadExistingSummaries();

  let tags = [];
  let discoveryFailed = false;
  try {
    tags = await discoverGithubTags();
    if (tags.length === 0) throw new Error("GitHub returned no ISM release tags");
  } catch (error) {
    warn(`GitHub tag discovery failed: ${errorMessage(error)}`);
    discoveryFailed = true;
  }
  const scraped = await discoverScraped();
  const candidates = buildCandidates({ tags, scraped });
  const downloads = planDownloads(candidates, existing.keys(), { force: FORCE, limit: RELEASE_LIMIT });

  console.log(
    `Discovered ${candidates.length} ISM releases (${tags.length} GitHub tags); ${existing.size} on disk; ` +
      `${downloads.length} to download${downloads.length ? `: ${downloads.map((c) => c.version).join(", ")}` : ""}.`,
  );

  let corrupt = 0;
  let failedDownloads = 0;
  for (const { version, confirmed } of downloads) {
    let text;
    try {
      text = await fetchCatalogText(version);
    } catch (error) {
      // Unconfirmed scraped candidates may not be actual tags, but a failed confirmed
      // download means this run cannot claim the archive is current.
      warn(`Skipping ${version}${confirmed ? "" : " (not a GitHub tag)"}: ${errorMessage(error)}`);
      if (confirmed) failedDownloads += 1;
      continue;
    }

    const { snapshot, problems } = buildSnapshot(version, text, existing.get(version));
    if (!snapshot) {
      const message = `Rejected ${version}${confirmed ? "" : " (not a GitHub tag)"}: ${problems.join("; ")}`;
      if (confirmed && STRICT) {
        fail(message);
        corrupt += 1;
      } else {
        warn(message);
      }
      continue;
    }

    await writeFileAtomic(path.join(RELEASES_DIR, `${version}.json`), serializeJson(snapshot));
    existing.set(version, releaseSummary(snapshot));
    console.log(`Wrote ${snapshot.version} with ${snapshot.count} controls.`);
  }

  if (existing.size === 0) {
    fail("No usable ISM releases on disk; refusing to write an empty manifest.");
    process.exitCode = 1;
    return;
  }

  const previous = await readJsonIfExists(MANIFEST_PATH);
  const { manifest, changed } = chooseManifest(
    previous,
    buildManifest(existing.values(), { generatedAt: new Date().toISOString(), rssFeed: CYBER_NEWS_RSS }),
  );
  if (changed) {
    await writeFileAtomic(MANIFEST_PATH, serializeJson(manifest));
    console.log(`Wrote manifest with ${manifest.releases.length} releases (latest ${manifest.releases[0].version}).`);
  } else {
    console.log(`Manifest unchanged (${manifest.releases.length} releases, latest ${manifest.releases[0].version}).`);
  }

  await indexAllReleases(sortVersionsDesc(existing.keys()));

  if (corrupt > 0) {
    fail(`${corrupt} GitHub-tagged release(s) failed validation; see errors above.`);
    process.exitCode = 1;
  }
  if (discoveryFailed || failedDownloads > 0) {
    fail("ISM sync incomplete: release discovery or a confirmed download failed.");
    process.exitCode = 1;
  }
}

await main();
