// Sync ASD's ACSC alerts and advisories into data/acsc/advisories.json (and optionally
// Meilisearch).
//
// Primary source: the official RSS feeds (/rss/alerts and /rss/advisories). Severity and
// audiences are best-effort enrichment scraped from the HTML listing; enrichment failures
// never fail the sync. New items are merged into the existing archive (keyed by slug,
// capped at 500). The snapshot records the last successful refresh of both feeds.
//
// Environment:
//   ACSC_DATA_DIR          output directory (default ./data/acsc)
//   ACSC_ENRICH            "0" to skip HTML listing enrichment
//   ACSC_ENRICH_MAX_PAGES  cap on enrichment requests (listing + alert pages, default 15)
//   MEILI_HOST             when set, index advisories into Meilisearch (MEILI_MASTER_KEY)
import path from "node:path";
import {
  FEEDS,
  buildAdvisorySnapshot,
  listingUrl,
  mergeAdvisories,
  parseDetailSeverity,
  parseListingCards,
  parseMaxPage,
  parseRssItems,
  rssItemToAdvisory,
  slugOf,
} from "./lib/acsc.mjs";
import { fetchText, sleep } from "./lib/http.mjs";
import { readJsonIfExists, serializeJson, writeFileAtomic } from "./lib/io.mjs";
import { errorMessage, fail, warn } from "./lib/log.mjs";

const PROJECT_ROOT = process.cwd();
const DATA_DIR = process.env.ACSC_DATA_DIR ?? path.join(PROJECT_ROOT, "data", "acsc");
const OUTPUT_PATH = path.join(DATA_DIR, "advisories.json");
const ENRICH = process.env.ACSC_ENRICH !== "0";
const MAX_ENRICH_PAGES = Math.max(0, Number(process.env.ACSC_ENRICH_MAX_PAGES ?? 15) || 0);
const REQUEST_DELAY_MS = 1_000;
// cyber.gov.au's WAF tarpits user agents containing "http"/"github", so the project is
// identified by its repository slug rather than a URL.
const USER_AGENT = process.env.SYNC_USER_AGENT ?? "ISMSearch advisory sync (jusso-dev/ISMSearch)";

async function fetchFeeds(now) {
  const items = [];
  let succeeded = 0;
  for (const feed of FEEDS) {
    try {
      const xml = await fetchText(feed.url, {
        headers: { "user-agent": USER_AGENT, accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.1" },
      });
      const parsed = parseRssItems(xml);
      const advisories = parsed.map((item) => rssItemToAdvisory(item, feed.type, { now })).filter(Boolean);
      if (parsed.length !== advisories.length) {
        warn(`${feed.url}: dropped ${parsed.length - advisories.length} item(s) with missing or off-site links`);
      }
      if (advisories.length === 0) throw new Error("feed contained no usable items");
      console.log(`Fetched ${advisories.length} ${feed.type.toLowerCase()} item(s) from ${feed.url}`);
      items.push(...advisories);
      succeeded += 1;
    } catch (error) {
      warn(`Feed ${feed.url} failed: ${errorMessage(error)}`);
    }
  }
  return { items, succeeded };
}

/**
 * Rate-limited fetcher for best-effort HTML enrichment. Shares one request budget across
 * the listing pages and alert detail pages.
 */
function createPoliteFetcher(maxRequests) {
  let used = 0;
  return {
    get remaining() {
      return maxRequests - used;
    },
    get used() {
      return used;
    },
    async get(url) {
      if (used >= maxRequests) throw new Error("enrichment request budget exhausted");
      if (used > 0) await sleep(REQUEST_DELAY_MS);
      used += 1;
      return fetchText(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, timeoutMs: 30_000, retries: 1 });
    },
  };
}

/**
 * Audiences (and canonical type) from the HTML listing. Page 0 is always read; later pages
 * only while some current feed item still has no audiences. Never throws.
 */
async function fetchListingEnrichment(fetcher, enrichment, wanted) {
  try {
    let maxPage = 0;
    for (let page = 0; page <= maxPage && fetcher.remaining > 0; page += 1) {
      const html = await fetcher.get(listingUrl({ page }));
      if (page === 0) maxPage = parseMaxPage(html);
      const cards = parseListingCards(html);
      for (const card of cards) {
        const current = enrichment.get(card.slug) ?? {};
        enrichment.set(card.slug, {
          ...current,
          type: card.type ?? current.type,
          audiences: card.audiences.length ? card.audiences : current.audiences,
        });
        wanted.delete(card.slug);
      }
      if (cards.length === 0 || wanted.size === 0) break;
    }
  } catch (error) {
    warn(`Listing enrichment incomplete: ${errorMessage(error)}`);
  }
}

/**
 * Severity from alert detail pages, for alerts whose severity is still unknown. (The
 * listing's alert-status facet URLs are blocked for automated clients with HTTP 403.)
 */
async function fetchSeverityEnrichment(fetcher, enrichment, alerts) {
  let found = 0;
  for (const alert of alerts) {
    if (fetcher.remaining <= 0) break;
    try {
      const severity = parseDetailSeverity(await fetcher.get(alert.href));
      if (severity) {
        enrichment.set(alert.slug, { ...(enrichment.get(alert.slug) ?? {}), severity });
        found += 1;
      }
    } catch (error) {
      warn(`Severity lookup for ${alert.href} failed: ${errorMessage(error)}`);
    }
  }
  return found;
}

async function indexAdvisories(advisories) {
  const host = process.env.MEILI_HOST;
  if (!host) {
    console.log("Skipping ACSC advisory indexing because MEILI_HOST is not set.");
    return;
  }

  const { Meilisearch } = await import("meilisearch");
  const client = new Meilisearch({ host, apiKey: process.env.MEILI_MASTER_KEY });
  const index = client.index("acsc-advisories");
  const waitForTask = async (task) => {
    const uid = task?.taskUid ?? task?.uid;
    if (uid == null) return;
    const result = await client.tasks.waitForTask(uid, { timeout: 600_000, interval: 250 });
    if (result.status === "failed") {
      throw new Error(result.error?.message ?? `Meilisearch task ${uid} failed`);
    }
  };

  await client.createIndex("acsc-advisories", { primaryKey: "objectID" }).catch(() => undefined);
  await waitForTask(await index.updateSearchableAttributes(["title", "summary", "type", "severity", "audiences"]));
  await waitForTask(await index.updateFilterableAttributes(["type", "severity", "audiences", "published"]));
  await waitForTask(await index.updateSortableAttributes(["published"]));
  await waitForTask(await index.addDocuments(advisories, { primaryKey: "objectID" }));

  // Remove documents that are no longer in the archive (e.g. legacy objectIDs).
  const keep = new Set(advisories.map((advisory) => advisory.objectID));
  const stale = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await index.getDocuments({ fields: ["objectID"], limit: 1000, offset });
    stale.push(...page.results.map((doc) => doc.objectID).filter((id) => !keep.has(id)));
    if (page.results.length < 1000) break;
  }
  if (stale.length > 0) await waitForTask(await index.deleteDocuments(stale));
  console.log(`Indexed ${advisories.length} advisories into Meilisearch at ${host} (removed ${stale.length} stale).`);
}

async function main() {
  const now = new Date().toISOString();
  const { items, succeeded } = await fetchFeeds(now);
  if (succeeded === 0 || items.length === 0) {
    fail("No ACSC RSS items fetched (all feeds failed or were empty); leaving advisories.json untouched.");
    process.exitCode = 1;
    return;
  }

  const previous = await readJsonIfExists(OUTPUT_PATH);
  const mergeOptions = {
    now,
    fallbackFirstSeenAt: typeof previous?.fetchedAt === "string" ? previous.fetchedAt : now,
  };
  const enrichment = new Map();

  if (ENRICH && MAX_ENRICH_PAGES > 0) {
    const fetcher = createPoliteFetcher(MAX_ENRICH_PAGES);
    const draft = mergeAdvisories(previous?.advisories ?? [], items, mergeOptions);
    const feedSlugs = new Set(items.map(slugOf));
    const missingAudiences = new Set(
      draft.filter((a) => feedSlugs.has(slugOf(a)) && a.audiences.length === 0).map(slugOf),
    );
    await fetchListingEnrichment(fetcher, enrichment, missingAudiences);

    // Alerts in the current feed without a known severity, newest first.
    const needSeverity = draft
      .filter((a) => a.type === "Alert" && a.severity == null && feedSlugs.has(slugOf(a)))
      .map((a) => ({ slug: slugOf(a), href: a.href }));
    const found = await fetchSeverityEnrichment(fetcher, enrichment, needSeverity);
    console.log(
      `Enrichment: ${enrichment.size} item(s) from ${fetcher.used} request(s); ` +
        `severity found for ${found}/${needSeverity.length} alert(s).`,
    );
  }

  const advisories = mergeAdvisories(previous?.advisories ?? [], items, { ...mergeOptions, enrichment });
  const complete = succeeded === FEEDS.length;
  const { snapshot, changed } = buildAdvisorySnapshot(advisories, previous, { now, complete });

  const serialized = serializeJson(snapshot);
  const wrote = changed || JSON.stringify(previous) !== JSON.stringify(snapshot);
  if (wrote) await writeFileAtomic(OUTPUT_PATH, serialized);

  await indexAdvisories(advisories);
  console.log(
    `Synced ${advisories.length} ACSC advisories (${items.length} from RSS); ` +
      `${wrote ? `wrote ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}` : "no changes"}.`,
  );
  if (!complete) {
    fail("ACSC sync incomplete: one or more feeds failed; merged items were retained.");
    process.exitCode = 1;
  }
}

await main();
