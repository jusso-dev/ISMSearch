// Pure helpers for the ACSC alerts/advisories sync. No top-level side effects.

export const SOURCE_NAME = "ASD's ACSC alerts and advisories";
export const SOURCE_URL = "https://www.cyber.gov.au/alerts-and-advisories";
export const FEEDS = [
  { url: "https://www.cyber.gov.au/rss/alerts", type: "Alert" },
  { url: "https://www.cyber.gov.au/rss/advisories", type: "Advisory" },
];
export const ITEM_SOURCE = "Cyber.gov.au RSS";
export const MAX_ITEMS = 500;
export const SEVERITIES = ["Critical", "High", "Medium", "Low"];

const SITE_ORIGIN = "https://www.cyber.gov.au";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LEGACY_PATH_PREFIX = "/about-us/view-all-content/alerts-and-advisories/";

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  sbquo: "‚",
  bdquo: "„",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  shy: "",
  zwnj: "",
  zwj: "",
  eacute: "é",
};

function codePointToString(code) {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
  return String.fromCodePoint(code);
}

/** Single-pass entity decoder (so "&amp;lt;" becomes "&lt;", not "<"). */
export function decodeEntities(value) {
  return String(value ?? "").replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      return codePointToString(code);
    }
    const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Strip HTML tags, decode entities and collapse whitespace. */
export function htmlToText(html) {
  const withoutTags = String(html ?? "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/** Return the inner text of an XML element, unwrapping CDATA sections verbatim. */
function xmlElementInner(block, tag) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${tag}>)`, "i"));
  if (!match || match[1] == null) return "";
  const raw = match[1];
  // CDATA content is literal; everything outside it is XML-escaped.
  let out = "";
  let lastIndex = 0;
  for (const cdata of raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    out += decodeEntities(raw.slice(lastIndex, cdata.index)) + cdata[1];
    lastIndex = cdata.index + cdata[0].length;
  }
  out += decodeEntities(raw.slice(lastIndex));
  return out;
}

/** Minimal RSS 2.0 item parser. Text fields are returned as plain text. */
export function parseRssItems(xml) {
  return [...String(xml ?? "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    return {
      title: htmlToText(xmlElementInner(block, "title")),
      link: xmlElementInner(block, "link").trim(),
      description: htmlToText(xmlElementInner(block, "description")),
      pubDate: xmlElementInner(block, "pubDate").trim(),
      guid: xmlElementInner(block, "guid").trim(),
    };
  });
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function fromParts(day, monthIndex, year) {
  const d = Number(day);
  const y = Number(year);
  if (!(monthIndex >= 0) || !Number.isInteger(d) || d < 1 || d > 31 || !Number.isInteger(y)) return null;
  return { published: `${y}-${pad2(monthIndex + 1)}-${pad2(d)}`, date: `${pad2(d)} ${MONTHS[monthIndex]} ${y}` };
}

function monthIndexOf(name) {
  return MONTHS.findIndex((month) => month.toLowerCase() === String(name).slice(0, 3).toLowerCase());
}

/**
 * Parse "Fri, 23 Oct 2026 16:11:47 +1100" or "07 May 2026" into
 * { published: "2026-10-23", date: "23 Oct 2026" }, using the calendar date as written
 * (i.e. in the publisher's own timezone). Returns null when unparseable.
 */
export function parseDate(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (match) {
    const parsed = fromParts(match[1], monthIndexOf(match[2]), match[3]);
    if (parsed) return parsed;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return fromParts(iso[3], Number(iso[2]) - 1, iso[1]);
  return null;
}

/**
 * Accept only https URLs on cyber.gov.au (or a subdomain). Relative URLs are resolved
 * against https://www.cyber.gov.au/. Entities are decoded first. Returns a URL or null.
 */
export function parseCyberUrl(href) {
  const raw = decodeEntities(String(href ?? "")).trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw, `${SITE_ORIGIN}/`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || (url.port && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  if (host !== "cyber.gov.au" && !host.endsWith(".cyber.gov.au")) return null;
  return url;
}

/** Final path segment of an advisory URL, restricted to a safe slug alphabet. */
export function slugFromUrl(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  let last = segments.at(-1) ?? "";
  try {
    last = decodeURIComponent(last);
  } catch {
    return null;
  }
  const slug = last.toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,250}$/.test(slug) ? slug : null;
}

/**
 * Stable key for an advisory URL: the page slug, or "node-<id>" for unaliased Drupal
 * /node/<id> links (the RSS feed occasionally emits those).
 */
export function keyFromUrl(url) {
  const node = url.pathname.match(/^\/node\/(\d{1,10})\/?$/);
  if (node) return `node-${node[1]}`;
  return slugFromUrl(url);
}

/** "Alert" for /alert/..., "Advisory" for /advisory/..., otherwise null. */
export function typeFromPath(pathname) {
  if (/^\/alerts?\//i.test(pathname)) return "Alert";
  if (/^\/advisor(y|ies)\//i.test(pathname)) return "Advisory";
  return null;
}

export function canonicalHref(type, slug) {
  const node = slug.match(/^node-(\d+)$/);
  if (node) return `${SITE_ORIGIN}/node/${node[1]}`;
  return `${SITE_ORIGIN}/${type === "Alert" ? "alert" : "advisory"}/${slug}`;
}

export function objectIdFor(type, slug) {
  return `${type === "Alert" ? "alert" : "advisory"}_${slug}`;
}

function normalizeSeverity(value) {
  if (typeof value !== "string") return null;
  return SEVERITIES.find((severity) => severity.toLowerCase() === value.trim().toLowerCase()) ?? null;
}

// Labels used by the pre-2026 site design, mapped to the current listing vocabulary.
const AUDIENCE_ALIASES = {
  "individuals & families": "Individuals and families",
  "small & medium businesses": "Small and medium business",
  "small and medium businesses": "Small and medium business",
  "organisations & critical infrastructure": "Large organisations and critical infrastructure",
  "large organisations & critical infrastructure": "Large organisations and critical infrastructure",
};

export function normalizeAudiences(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item) => typeof item === "string")
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((item) => AUDIENCE_ALIASES[item.toLowerCase()] ?? item),
    ),
  ];
}

/** Build an advisory record (fixed key order so output is byte-stable). */
export function makeAdvisory({ type, slug, title, summary, published, date, firstSeenAt, severity, audiences }) {
  return {
    objectID: objectIdFor(type, slug),
    title,
    summary: summary ?? "",
    href: canonicalHref(type, slug),
    published: published ?? null,
    date: date ?? "",
    firstSeenAt,
    type,
    severity: normalizeSeverity(severity),
    audiences: normalizeAudiences(audiences),
    source: ITEM_SOURCE,
  };
}

/** Convert a parsed RSS item into a partial advisory, or null if it is unusable. */
export function rssItemToAdvisory(item, feedType, { now }) {
  const url = parseCyberUrl(item.link) ?? parseCyberUrl(item.guid);
  if (!url || !item.title) return null;
  const slug = keyFromUrl(url);
  if (!slug) return null;
  const dates = parseDate(item.pubDate);
  return makeAdvisory({
    type: feedType,
    slug,
    title: item.title,
    summary: item.description,
    published: dates?.published ?? null,
    date: dates?.date ?? "",
    firstSeenAt: now,
    severity: null,
    audiences: [],
  });
}

/** Slug for a stored advisory (new or legacy format), or null. */
export function slugOf(advisory) {
  const url = parseCyberUrl(advisory?.href);
  return url ? keyFromUrl(url) : null;
}

/**
 * Upgrade a stored advisory to the current schema. Handles legacy entries whose href was
 * https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/<slug>.
 * `fallbackFirstSeenAt` is used when the record predates firstSeenAt (old fetchedAt).
 */
export function migrateAdvisory(advisory, { fallbackFirstSeenAt }) {
  if (!advisory || typeof advisory !== "object" || typeof advisory.title !== "string" || !advisory.title) return null;
  const url = parseCyberUrl(advisory.href);
  if (!url) return null;
  const slug = keyFromUrl(url);
  if (!slug) return null;
  const pathType = typeFromPath(url.pathname);
  const type = pathType ?? (advisory.type === "Alert" || advisory.type === "Advisory" ? advisory.type : "Advisory");
  const dates =
    (typeof advisory.published === "string" && parseDate(advisory.published)) || parseDate(advisory.date) || null;
  return makeAdvisory({
    type,
    slug,
    title: advisory.title,
    summary: typeof advisory.summary === "string" ? advisory.summary : "",
    published: dates?.published ?? null,
    date: dates?.date ?? (typeof advisory.date === "string" ? advisory.date : ""),
    firstSeenAt: typeof advisory.firstSeenAt === "string" ? advisory.firstSeenAt : fallbackFirstSeenAt,
    severity: advisory.severity,
    audiences: advisory.audiences,
  });
}

export function isLegacyHref(href) {
  const url = parseCyberUrl(href);
  return Boolean(url && url.pathname.startsWith(LEGACY_PATH_PREFIX));
}

function earliest(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

export function compareAdvisories(a, b) {
  const pa = a.published ?? "";
  const pb = b.published ?? "";
  if (pa !== pb) return pa < pb ? 1 : -1; // newest first; null sorts last
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.objectID < b.objectID ? -1 : a.objectID > b.objectID ? 1 : 0;
}

/**
 * Merge the stored archive with this run's RSS items and optional enrichment.
 *
 * - Records are keyed by slug, so legacy entries and new RSS items for the same page
 *   collapse into one.
 * - firstSeenAt is preserved (earliest wins); new items get `now`.
 * - RSS supplies title/summary/type/dates for items in the feed.
 * - enrichment: Map<slug, { severity?, audiences?, type? }>; when absent or partial,
 *   previously known severity/audiences are kept.
 */
export function mergeAdvisories(existing, incoming, { now, enrichment = new Map(), limit = MAX_ITEMS, fallbackFirstSeenAt = now } = {}) {
  const bySlug = new Map();

  const upsertStored = (record) => {
    const slug = slugOf(record);
    if (!slug) return;
    const current = bySlug.get(slug);
    if (!current) {
      bySlug.set(slug, record);
      return;
    }
    // Duplicate in the archive (e.g. legacy + new). Prefer the newer-schema record's fields.
    const preferred = isLegacyHref(current.href) && !isLegacyHref(record.href) ? record : current;
    const other = preferred === record ? current : record;
    bySlug.set(
      slug,
      makeAdvisory({
        ...preferred,
        slug,
        firstSeenAt: earliest(preferred.firstSeenAt, other.firstSeenAt),
        severity: preferred.severity ?? other.severity,
        audiences: preferred.audiences?.length ? preferred.audiences : other.audiences,
      }),
    );
  };

  for (const record of existing ?? []) {
    const migrated = migrateAdvisory(record, { fallbackFirstSeenAt });
    if (migrated) upsertStored(migrated);
  }

  const fromFeed = new Set();
  for (const item of incoming ?? []) {
    const slug = slugOf(item);
    if (!slug) continue;
    fromFeed.add(slug);
    const current = bySlug.get(slug);
    bySlug.set(
      slug,
      makeAdvisory({
        type: item.type,
        slug,
        title: item.title || current?.title,
        summary: item.summary || current?.summary || "",
        published: item.published ?? current?.published ?? null,
        date: item.date || current?.date || "",
        firstSeenAt: current?.firstSeenAt ?? item.firstSeenAt ?? now,
        severity: item.severity ?? current?.severity ?? null,
        audiences: item.audiences?.length ? item.audiences : (current?.audiences ?? []),
      }),
    );
  }

  for (const [slug, extra] of enrichment) {
    const current = bySlug.get(slug);
    if (!current) continue;
    // The feed type is authoritative for items seen this run; the listing URL fixes legacy types.
    const type = !fromFeed.has(slug) && extra.type ? extra.type : current.type;
    bySlug.set(
      slug,
      makeAdvisory({
        ...current,
        type,
        slug,
        severity: normalizeSeverity(extra.severity) ?? current.severity,
        audiences: normalizeAudiences(extra.audiences).length ? extra.audiences : current.audiences,
      }),
    );
  }

  // Drop unaliased /node/<id> duplicates of an item that also has a proper slug.
  const titled = new Set(
    [...bySlug.entries()].filter(([slug]) => !slug.startsWith("node-")).map(([, r]) => `${r.type}\u0000${r.title}`),
  );
  for (const [slug, record] of bySlug) {
    if (slug.startsWith("node-") && titled.has(`${record.type}\u0000${record.title}`)) bySlug.delete(slug);
  }

  return [...bySlug.values()].sort(compareAdvisories).slice(0, limit);
}

/**
 * fetchedAt records the last complete refresh, including successful runs that find
 * no changes. A partial refresh can add items but must not claim all feeds are fresh.
 */
export function buildAdvisorySnapshot(advisories, previous, { now, complete = true }) {
  const unchanged =
    previous && Array.isArray(previous.advisories) && JSON.stringify(previous.advisories) === JSON.stringify(advisories);
  return {
    snapshot: {
      source: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
      feeds: FEEDS.map((feed) => feed.url),
      fetchedAt: complete ? now : (typeof previous?.fetchedAt === "string" ? previous.fetchedAt : ""),
      count: advisories.length,
      advisories,
    },
    changed: !unchanged,
  };
}

// ---- HTML listing enrichment (best effort) ----

/** Cards on https://www.cyber.gov.au/alerts-and-advisories listing pages. */
export function parseListingCards(html) {
  const text = String(html ?? "");
  const anchors = [...text.matchAll(/<a\b([^>]*\bclass="[^"]*\bcard-search--linked\b[^"]*"[^>]*)>/g)];
  return anchors
    .map((anchor, index) => {
      const attrs = anchor[1];
      const href = attrs.match(/\bhref="([^"]*)"/)?.[1];
      const url = parseCyberUrl(href);
      if (!url) return null;
      const slug = keyFromUrl(url);
      if (!slug) return null;
      const end = anchors[index + 1]?.index ?? text.length;
      const block = text.slice(anchor.index, end);
      const audienceStart = block.search(/\baudience-region\b/);
      const audienceBlock = audienceStart >= 0 ? block.slice(audienceStart) : "";
      const audiences = [
        ...new Set(
          [...audienceBlock.matchAll(/<span class="cga-pill__text">([\s\S]*?)<\/span>/g)]
            .map((match) => htmlToText(match[1]))
            .filter((label) => label && !/^\+\s*\d+\s+tags?$/i.test(label)),
        ),
      ];
      return { slug, type: typeFromPath(url.pathname), audiences };
    })
    .filter(Boolean);
}

/** Severity shown on an alert detail page ("alert-status--critical" / "Alert Status: Critical"). */
export function parseDetailSeverity(html) {
  const text = String(html ?? "");
  const byClass = text.match(/\balert-status--(critical|high|medium|low)\b/i)?.[1];
  const byLabel = text.match(/Alert\s+Status:\s*(Critical|High|Medium|Low)\b/i)?.[1];
  return normalizeSeverity(byClass ?? byLabel ?? null);
}

/** Highest page index linked from the pager (0-based), or 0. */
export function parseMaxPage(html) {
  const pages = [...String(html ?? "").matchAll(/[?&](?:amp;)?page=(\d+)/g)].map((match) => Number(match[1]));
  return pages.length ? Math.max(...pages) : 0;
}

export function listingUrl({ page = 0 } = {}) {
  const params = new URLSearchParams({ sort_by: "field_du_value_1" });
  if (page > 0) params.set("page", String(page));
  return `${SOURCE_URL}?${params.toString()}`;
}
