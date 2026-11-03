import type { AcscAdvisory } from "@/lib/acsc/advisories";
import { Chip, type ChipTone } from "@/components/ui/chip";

export const ADVISORY_STALE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

const PUBLISHED_FORMAT = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const FETCHED_FORMAT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
  timeZoneName: "short",
});

/** Formats the ISO `published` date (YYYY-MM-DD), falling back to the display date. */
export function advisoryDate(advisory: Pick<AcscAdvisory, "published" | "date">) {
  if (advisory.published && /^\d{4}-\d{2}-\d{2}$/.test(advisory.published)) {
    const parsed = new Date(`${advisory.published}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return PUBLISHED_FORMAT.format(parsed);
  }
  return advisory.date || "Date not published";
}

export function formatFetchedAt(fetchedAt: string) {
  const parsed = new Date(fetchedAt);
  return Number.isNaN(parsed.getTime()) ? "Unknown" : FETCHED_FORMAT.format(parsed);
}

/** True when the snapshot is older than the staleness window (or the timestamp is unreadable). */
export function isSnapshotStale(fetchedAt: string, now = Date.now()) {
  const parsed = new Date(fetchedAt).getTime();
  return Number.isNaN(parsed) || now - parsed > ADVISORY_STALE_DAYS * DAY_MS;
}

export function severityTone(severity: AcscAdvisory["severity"]): ChipTone {
  if (severity === "Critical") return "danger";
  if (severity === "High") return "warn";
  return "accent";
}

export function SeverityChip({ advisory }: { advisory: Pick<AcscAdvisory, "severity" | "type"> }) {
  return (
    <Chip tone={severityTone(advisory.severity)} strong>
      {advisory.severity ? `${advisory.severity} ${advisory.type.toLowerCase()}` : advisory.type}
    </Chip>
  );
}

export function StaleChip({ fetchedAt }: { fetchedAt: string }) {
  if (!isSnapshotStale(fetchedAt)) return null;
  return (
    <Chip tone="warn" strong>
      Stale · refresh overdue or unknown
    </Chip>
  );
}
