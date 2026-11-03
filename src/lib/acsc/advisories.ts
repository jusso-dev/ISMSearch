// Snapshot-only reader for ACSC alerts and advisories.
//
// cyber.gov.au was redesigned and the old HTML scraper no longer works; the snapshot
// at `${ACSC_DATA_DIR}/advisories.json` is now produced by scripts/sync-acsc-advisories.mjs
// (run by the BullMQ worker). The web app never fetches cyber.gov.au itself.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type AcscAdvisory = {
  objectID?: string;
  title: string;
  summary: string;
  /** Always a safe https://*.cyber.gov.au URL (falls back to the listing page). */
  href: string;
  /** ISO date (YYYY-MM-DD) when known. */
  published?: string | null;
  /** Display date as published by cyber.gov.au, e.g. "07 May 2026". */
  date: string;
  /** ISO timestamp when the sync first saw this item. */
  firstSeenAt?: string;
  type: "Advisory" | "Alert";
  severity: "Critical" | "High" | "Medium" | "Low" | null;
  audiences: string[];
  source?: string;
};

export type AcscAdvisoryResult = {
  sourceUrl: string;
  fetchedAt: string;
  advisories: AcscAdvisory[];
  /** Number of advisories in the snapshot (before `limit`). */
  total: number;
};

export const ACSC_ADVISORIES_URL = "https://www.cyber.gov.au/alerts-and-advisories";

const DATA_DIR = process.env.ACSC_DATA_DIR ?? path.join(process.cwd(), "data", "acsc");
const SNAPSHOT_PATH = path.join(DATA_DIR, "advisories.json");

/** Returns the URL if it is an https link on cyber.gov.au (or a subdomain), otherwise null. */
export function safeAdvisoryHref(href: unknown): string | null {
  if (typeof href !== "string" || !href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host !== "cyber.gov.au" && !host.endsWith(".cyber.gov.au")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parses "07 May 2026" (legacy display dates) into "2026-05-07". */
function isoFromDisplayDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizePublished(value: unknown, date: string): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return isoFromDisplayDate(date);
}

const SEVERITIES = new Set(["Critical", "High", "Medium", "Low"]);

function normalizeAdvisory(raw: unknown): AcscAdvisory | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!title) return null;
  const date = typeof item.date === "string" ? item.date : "";
  const severity = typeof item.severity === "string" && SEVERITIES.has(item.severity)
    ? (item.severity as AcscAdvisory["severity"])
    : null;

  return {
    objectID: typeof item.objectID === "string" ? item.objectID : undefined,
    title,
    summary: typeof item.summary === "string" ? item.summary : "",
    href: safeAdvisoryHref(item.href) ?? ACSC_ADVISORIES_URL,
    published: normalizePublished(item.published, date),
    date,
    firstSeenAt: typeof item.firstSeenAt === "string" ? item.firstSeenAt : undefined,
    type: item.type === "Alert" ? "Alert" : "Advisory",
    severity,
    audiences: Array.isArray(item.audiences) ? item.audiences.filter((value): value is string => typeof value === "string") : [],
    source: typeof item.source === "string" ? item.source : undefined,
  };
}

type Snapshot = { sourceUrl: string; fetchedAt: string; advisories: AcscAdvisory[] };

let cache: { mtimeMs: number; size: number; snapshot: Snapshot } | null = null;

async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const info = await stat(SNAPSHOT_PATH);
    if (cache && cache.mtimeMs === info.mtimeMs && cache.size === info.size) return cache.snapshot;

    const parsed = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as Record<string, unknown>;
    if (!parsed || !Array.isArray(parsed.advisories)) return null;

    const advisories = parsed.advisories
      .map(normalizeAdvisory)
      .filter((advisory): advisory is AcscAdvisory => advisory !== null)
      .map((advisory, index) => ({ advisory, index }))
      // Newest first; undated items sink to the end; ties keep snapshot order.
      .sort((a, b) => (b.advisory.published ?? "").localeCompare(a.advisory.published ?? "") || a.index - b.index)
      .map(({ advisory }) => advisory);

    const snapshot: Snapshot = {
      sourceUrl: safeAdvisoryHref(parsed.sourceUrl) ?? ACSC_ADVISORIES_URL,
      fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : "",
      advisories,
    };
    cache = { mtimeMs: info.mtimeMs, size: info.size, snapshot };
    return snapshot;
  } catch {
    return null;
  }
}

/** Latest advisories from the persisted snapshot, or null when no snapshot exists. */
export async function getLatestAdvisories(limit = 6): Promise<AcscAdvisoryResult | null> {
  const snapshot = await readSnapshot();
  if (!snapshot) return null;
  return {
    sourceUrl: snapshot.sourceUrl,
    fetchedAt: snapshot.fetchedAt,
    advisories: snapshot.advisories.slice(0, Math.max(0, limit)),
    total: snapshot.advisories.length,
  };
}
