import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Meilisearch } from "meilisearch";

const PROJECT_ROOT = process.cwd();
const DATA_DIR = process.env.ISM_DATA_DIR ?? path.join(PROJECT_ROOT, "data", "ism");
const RELEASE_COUNT = process.env.ISM_RELEASE_COUNT ?? "all";
const GITHUB_REPO = "AustralianCyberSecurityCentre/ism-oscal";
const GITHUB_RAW = `https://raw.githubusercontent.com/${GITHUB_REPO}`;
const CYBER_OSCAL_PAGE =
  "https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/ism/ism-oscal-releases";
const CYBER_NEWS_RSS = process.env.CYBER_RSS_URL ?? "https://www.cyber.gov.au/rss/news";
const FALLBACK_RELEASES = [
  "v2026.03.24",
  "v2025.12.9",
  "v2025.10.8",
  "v2025.09.15",
  "v2025.09.10",
  "v2025.07.16",
  "v2025.03.31",
  "v2024.12.19",
];

const APPLICABILITY_LABELS = {
  NC: "OFFICIAL",
  OS: "OFFICIAL: Sensitive",
  P: "PROTECTED",
  S: "SECRET",
  TS: "TOP SECRET",
};

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "ISMSearch local sync",
      accept: "application/json,text/html,application/rss+xml,*/*",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function discoverFromCyberPage() {
  const html = await fetchText(CYBER_OSCAL_PAGE);
  return [...html.matchAll(/ISM OSCAL v(\d{4}\.\d{2}\.\d{1,2})/g)].map(
    (match) => `v${match[1]}`,
  );
}

async function discoverFromGithubTags() {
  const tags = [];
  for (let page = 1; page <= 20; page += 1) {
    const text = await fetchText(
      `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=100&page=${page}`,
      {
        headers: { accept: "application/vnd.github+json" },
      },
    );
    const pageTags = JSON.parse(text);
    if (!Array.isArray(pageTags) || pageTags.length === 0) break;
    tags.push(...pageTags);
  }

  return tags.map((tag) => tag.name).filter((name) => /^v\d{4}\.\d{2}\.\d{1,2}$/.test(name));
}

async function discoverFromRss() {
  const xml = await fetchText(CYBER_NEWS_RSS);
  return [...xml.matchAll(/ISM[^<]*v?(\d{4}\.\d{2}\.\d{1,2})/gi)].map(
    (match) => `v${match[1]}`,
  );
}

async function discoverReleases() {
  const discovered = [];
  for (const discoverer of [discoverFromGithubTags, discoverFromCyberPage, discoverFromRss]) {
    try {
      discovered.push(...(await discoverer()));
    } catch (error) {
      console.warn(error.message);
    }
  }

  const releases = [...new Set([...discovered, ...FALLBACK_RELEASES])].sort(compareVersions).reverse();
  if (RELEASE_COUNT === "all") return releases;

  const count = Number(RELEASE_COUNT);
  return Number.isFinite(count) && count > 0 ? releases.slice(0, count) : releases;
}

function compareVersions(a, b) {
  const left = a.replace(/^v/, "").split(".").map(Number);
  const right = b.replace(/^v/, "").split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function propValues(node, name) {
  return (node.props ?? []).filter((prop) => prop.name === name).map((prop) => prop.value);
}

function firstProp(node, name) {
  return propValues(node, name)[0] ?? null;
}

function flattenParts(parts = []) {
  return parts.flatMap((part) => [
    {
      name: part.name,
      prose: part.prose ?? "",
    },
    ...flattenParts(part.parts ?? []),
  ]);
}

function cleanControlTitle(control) {
  const controlId = control.id.toUpperCase();
  if (!control.title || /^Control:\s*ism-\d+/i.test(control.title)) {
    return controlId;
  }
  return control.title;
}

function documentId(version, controlId) {
  return `${version}_${controlId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeControl(control, pathParts, version) {
  const proseParts = flattenParts(control.parts ?? []);
  const statement = proseParts.find((part) => part.name === "statement")?.prose ?? "";
  const body = proseParts.map((part) => part.prose).filter(Boolean).join("\n\n");
  const applicability = propValues(control, "applicability");
  const essentialEight = propValues(control, "essential-eight-applicability");
  const controlId = control.id.toUpperCase();

  return {
    objectID: documentId(version, control.id),
    id: control.id,
    controlId,
    version,
    release: version.replace(/^v/, ""),
    title: cleanControlTitle(control),
    chapter: pathParts[0] ?? "ISM",
    section: pathParts.slice(1).join(" / ") || pathParts[0] || "ISM",
    topic: pathParts.at(-1) ?? "ISM",
    path: pathParts,
    statement,
    body,
    text: [controlId, cleanControlTitle(control), pathParts.join(" "), body].filter(Boolean).join("\n"),
    revision: firstProp(control, "revision"),
    updated: firstProp(control, "updated"),
    applicability,
    applicabilityLabels: applicability.map((value) => APPLICABILITY_LABELS[value] ?? value),
    essentialEight,
    sortId: firstProp(control, "sort-id"),
  };
}

function normalizeCatalog(version, rawCatalog) {
  const controls = [];

  function walk(node, pathParts = []) {
    const nextPath = node.title ? [...pathParts, node.title] : pathParts;
    for (const control of node.controls ?? []) {
      controls.push(normalizeControl(control, nextPath, version));
    }
    for (const group of node.groups ?? []) {
      walk(group, nextPath);
    }
  }

  walk(rawCatalog.catalog);

  return {
    version,
    release: version.replace(/^v/, ""),
    title: rawCatalog.catalog?.metadata?.title ?? "Information security manual",
    sourceUrl: `${GITHUB_RAW}/${version}/ISM_catalog.json`,
    syncedAt: new Date().toISOString(),
    count: controls.length,
    controls,
  };
}

async function downloadCatalog(version) {
  const text = await fetchText(`${GITHUB_RAW}/${version}/ISM_catalog.json`);
  return normalizeCatalog(version, JSON.parse(text));
}

async function writeSnapshot(snapshot) {
  await mkdir(path.join(DATA_DIR, "releases"), { recursive: true });
  await writeFile(
    path.join(DATA_DIR, "releases", `${snapshot.version}.json`),
    JSON.stringify(snapshot, null, 2),
  );
}

async function indexSnapshots(snapshots) {
  const host = process.env.MEILI_HOST ?? process.env.SEARCH_BASE_URL;
  const apiKey = process.env.MEILI_MASTER_KEY ?? process.env.API_KEY;
  if (!host) {
    console.log("Skipping Meilisearch indexing because MEILI_HOST is not set.");
    return;
  }

  const client = new Meilisearch({ host, apiKey });
  const index = client.index("ism-controls");
  const documents = snapshots.flatMap((snapshot) => snapshot.controls);
  const waitForTask = async (task) => {
    if (!task) return;
    const uid = task.taskUid ?? task.uid;
    if (uid == null) return;
    const result = await client.tasks.waitForTask(uid);
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

  for (let indexOffset = 0; indexOffset < documents.length; indexOffset += 1000) {
    await waitForTask(await index.addDocuments(documents.slice(indexOffset, indexOffset + 1000), { primaryKey: "objectID" }));
  }

  console.log(`Indexed ${documents.length} controls into Meilisearch at ${host}.`);
}

const releases = await discoverReleases();
console.log(`Syncing ISM releases: ${releases.join(", ")}`);

const snapshots = [];
for (const release of releases) {
  const snapshot = await downloadCatalog(release);
  await writeSnapshot(snapshot);
  snapshots.push(snapshot);
  console.log(`Wrote ${snapshot.version} with ${snapshot.count} controls.`);
}

await writeFile(
  path.join(DATA_DIR, "manifest.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "AustralianCyberSecurityCentre/ism-oscal",
      rssFeed: CYBER_NEWS_RSS,
      releases: snapshots.map(({ version, release, title, sourceUrl, count, syncedAt }) => ({
        version,
        release,
        title,
        sourceUrl,
        count,
        syncedAt,
      })),
    },
    null,
    2,
  ),
);

await indexSnapshots(snapshots);
