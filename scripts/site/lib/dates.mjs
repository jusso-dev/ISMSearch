// Deterministic UTC date formatting (no locale dependence).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n) => String(n).padStart(2, "0");

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return null;
  return `${formatDate(date)}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function isoDate(value) {
  return toDate(value)?.toISOString().slice(0, 10) ?? null;
}

export function rfc822(value) {
  const d = toDate(value);
  if (!d) return null;
  return `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`;
}

// "07 May 2026" -> "2026-05-07"
export function parseDisplayDate(text) {
  const match = /^\s*(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})\s*$/.exec(String(text ?? ""));
  if (!match) return null;
  const month = MONTHS.findIndex((m) => m.toLowerCase() === match[2].toLowerCase());
  if (month < 0) return null;
  const iso = `${match[3]}-${pad(month + 1)}-${pad(Number(match[1]))}`;
  return isoDate(iso) === iso ? iso : null;
}

export function daysBetween(earlier, later) {
  const a = toDate(earlier);
  const b = toDate(later);
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 86_400_000;
}
