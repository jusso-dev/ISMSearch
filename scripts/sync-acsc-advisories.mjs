import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Meilisearch } from "meilisearch";

const PROJECT_ROOT = process.cwd();
const DATA_DIR = process.env.ACSC_DATA_DIR ?? path.join(PROJECT_ROOT, "data", "acsc");
const SOURCE_URL =
  process.env.ACSC_ADVISORIES_URL ??
  "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories?items_per_page=30&sort_by=field_du_value_1";

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function cleanText(value) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractFirst(block, pattern) {
  return block.match(pattern)?.[1] ?? "";
}

function extractAudiences(block) {
  const focusBlock = block.match(/<div class="focus-audience[\s\S]*?<\/div>/)?.[0] ?? "";
  return [...focusBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function severityFromClass(ratingClass) {
  if (ratingClass === "critical") return "Critical";
  if (ratingClass === "high") return "High";
  if (ratingClass === "medium") return "Medium";
  if (ratingClass === "low") return "Low";
  return null;
}

function absoluteHref(href) {
  const cleaned = href.replace(/^['"]|['"]$/g, "");
  return cleaned.startsWith("http") ? cleaned : `https://www.cyber.gov.au${cleaned}`;
}

function documentId(href) {
  return href
    .replace(/^https?:\/\/www\.cyber\.gov\.au\//, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 500);
}

function parseAdvisories(html) {
  return [
    ...html.matchAll(
      /<a class="[^"]*\bcard--alert\b[^"]*\brating--([a-z]+)\b[^"]*" href=("[^"]+"|'[^']+'|[^\s>]+)>([\s\S]*?)<\/a>/g,
    ),
  ]
    .map((match) => {
      const block = match[3];
      const href = absoluteHref(match[2]);
      const severity = severityFromClass(match[1]);
      return {
        objectID: documentId(href),
        title: cleanText(extractFirst(block, /<h3[^>]*>([\s\S]*?)<\/h3>/)),
        summary: cleanText(extractFirst(block, /<p class="my-0">([\s\S]*?)<\/p>/)),
        href,
        date: cleanText(extractFirst(block, /<div class="date[^"]*">([\s\S]*?)<\/div>/)),
        type: severity ? "Alert" : "Advisory",
        severity,
        audiences: extractAudiences(block),
        source: "Cyber.gov.au alerts and advisories",
      };
    })
    .filter((advisory) => advisory.title && advisory.href);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,*/*",
      "user-agent": "ISMSearch ACSC advisory sync",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function waitForTask(client, task) {
  if (!task) return;
  const uid = task.taskUid ?? task.uid;
  if (uid == null) return;
  const result = await client.tasks.waitForTask(uid);
  if (result.status === "failed") {
    throw new Error(result.error?.message ?? `Meilisearch task ${uid} failed`);
  }
}

async function indexAdvisories(advisories) {
  const host = process.env.MEILI_HOST ?? process.env.SEARCH_BASE_URL;
  const apiKey = process.env.MEILI_MASTER_KEY ?? process.env.API_KEY;
  if (!host) {
    console.log("Skipping ACSC advisory indexing because MEILI_HOST is not set.");
    return;
  }

  const client = new Meilisearch({ host, apiKey });
  const index = client.index("acsc-advisories");
  await client.createIndex("acsc-advisories", { primaryKey: "objectID" }).catch(() => undefined);
  await waitForTask(await index.updateSearchableAttributes(["title", "summary", "type", "severity", "audiences"]));
  await waitForTask(await index.updateFilterableAttributes(["type", "severity", "audiences", "date"]));
  await waitForTask(await index.updateSortableAttributes(["date"]));
  await waitForTask(await index.addDocuments(advisories, { primaryKey: "objectID" }));
}

const html = await fetchText(SOURCE_URL);
const advisories = parseAdvisories(html);
const snapshot = {
  sourceUrl: SOURCE_URL,
  fetchedAt: new Date().toISOString(),
  count: advisories.length,
  advisories,
};

await mkdir(DATA_DIR, { recursive: true });
await writeFile(path.join(DATA_DIR, "advisories.json"), JSON.stringify(snapshot, null, 2));
await indexAdvisories(advisories);
console.log(`Synced ${advisories.length} ACSC advisories from ${SOURCE_URL}.`);
