// Normalise ACSC advisories (current schema and legacy shape without
// published/firstSeenAt/feeds).
import { safeAdvisoryHref } from "./escape.mjs";
import { daysBetween, isoDate, parseDisplayDate, formatDate } from "./dates.mjs";

export const SEVERITIES = ["Critical", "High", "Medium", "Low"];
export const TYPES = ["Alert", "Advisory"];
export const STALE_AFTER_DAYS = 14;

const str = (value) => (typeof value === "string" && value.trim() !== "" ? value.replace(/\s+/g, " ").trim() : null);

export function normaliseAdvisory(raw) {
  const published =
    (typeof raw.published === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.published) ? isoDate(raw.published) : null) ??
    parseDisplayDate(raw.date);
  const severity = SEVERITIES.includes(raw.severity) ? raw.severity : null;
  const type = TYPES.includes(raw.type) ? raw.type : severity ? "Alert" : "Advisory";
  const href = str(raw.href);
  return {
    objectID: str(raw.objectID) ?? href ?? str(raw.title) ?? "unknown",
    title: str(raw.title) ?? "Untitled advisory",
    summary: str(raw.summary) ?? "",
    href,
    safeHref: safeAdvisoryHref(href),
    published,
    date: str(raw.date) ?? (published ? formatDate(published) : null),
    firstSeenAt: str(raw.firstSeenAt),
    type,
    severity,
    audiences: Array.isArray(raw.audiences) ? raw.audiences.map(str).filter(Boolean) : [],
    source: str(raw.source),
  };
}

function sortKey(advisory) {
  return advisory.published ?? isoDate(advisory.firstSeenAt) ?? "0000-00-00";
}

export function normaliseAdvisoryFeed(raw) {
  const list = Array.isArray(raw?.advisories) ? raw.advisories : [];
  const seen = new Set();
  const advisories = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const advisory = normaliseAdvisory(item);
    if (seen.has(advisory.objectID)) continue;
    seen.add(advisory.objectID);
    advisories.push(advisory);
  }
  advisories.sort(
    (a, b) =>
      sortKey(b).localeCompare(sortKey(a)) ||
      String(b.firstSeenAt ?? "").localeCompare(String(a.firstSeenAt ?? "")) ||
      a.title.localeCompare(b.title) ||
      a.objectID.localeCompare(b.objectID),
  );
  return {
    source: str(raw?.source) ?? "Cyber.gov.au alerts and advisories",
    sourceUrl: str(raw?.sourceUrl),
    feeds: Array.isArray(raw?.feeds) ? raw.feeds.map(str).filter(Boolean) : [],
    fetchedAt: str(raw?.fetchedAt),
    count: advisories.length,
    advisories,
  };
}

export function isStale(fetchedAt, buildTime, days = STALE_AFTER_DAYS) {
  const diff = daysBetween(fetchedAt, buildTime);
  return diff === null ? true : diff > days;
}

export function apiAdvisory(advisory) {
  return {
    objectID: advisory.objectID,
    title: advisory.title,
    summary: advisory.summary,
    href: advisory.safeHref,
    published: advisory.published,
    date: advisory.date,
    firstSeenAt: advisory.firstSeenAt,
    type: advisory.type,
    severity: advisory.severity,
    audiences: advisory.audiences,
    source: advisory.source,
  };
}
