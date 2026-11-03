// Control normalisation, ordering and comparison helpers.

export const CLASSIFICATIONS = [
  { code: "NC", label: "OFFICIAL" },
  { code: "OS", label: "OFFICIAL: Sensitive" },
  { code: "P", label: "PROTECTED" },
  { code: "S", label: "SECRET" },
  { code: "TS", label: "TOP SECRET" },
];

const LEGACY_LABELS = {
  ALL: "All classifications",
  O: "OFFICIAL (legacy)",
};

export const ESSENTIAL_EIGHT = ["ML1", "ML2", "ML3"];

export const COMPARED_FIELDS = [
  "title",
  "statement",
  "chapter",
  "section",
  "topic",
  "revision",
  "updated",
  "applicability",
  "essentialEight",
];

const CONTROL_ID_PATTERN = /^ISM-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function isValidControlId(id) {
  return typeof id === "string" && id.length <= 64 && CONTROL_ID_PATTERN.test(id);
}

export function classificationLabel(code) {
  return CLASSIFICATIONS.find((c) => c.code === code)?.label ?? LEGACY_LABELS[code] ?? String(code);
}

// "v2025.12.9" -> [2025, 12, 9]
export function versionParts(version) {
  return String(version)
    .replace(/^v/i, "")
    .split(/[.\-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

export function compareVersions(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return String(a).localeCompare(String(b));
}

// Release "2025.12.9" -> "2025-12-09" when it is a plausible date, else null.
export function releaseDate(version) {
  const [y, m, d] = versionParts(version);
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
}

// Numeric controls first (ISM-0001..), then principles etc. alphabetically.
export function compareControlIds(a, b) {
  const na = /^ISM-(\d+)$/.exec(a);
  const nb = /^ISM-(\d+)$/.exec(b);
  if (na && nb) return Number(na[1]) - Number(nb[1]) || a.localeCompare(b);
  if (na) return 1;
  if (nb) return -1;
  return a.localeCompare(b);
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean);
}

export function displayTitle(control) {
  const title = cleanString(control.title);
  if (!title || title.toUpperCase() === String(control.controlId).toUpperCase()) {
    return cleanString(control.topic) ?? cleanString(control.section) ?? control.controlId;
  }
  return title;
}

// Canonical internal representation (drops duplicated text/body fields).
export function normaliseControl(raw, release) {
  const controlId = cleanString(raw.controlId)?.toUpperCase() ?? null;
  const control = {
    controlId,
    version: release.version,
    release: release.release ?? null,
    title: cleanString(raw.title) ?? controlId,
    chapter: cleanString(raw.chapter) ?? "Uncategorised",
    section: cleanString(raw.section) ?? "",
    topic: cleanString(raw.topic) ?? "",
    path: cleanList(raw.path),
    statement: cleanString(raw.statement ?? raw.body) ?? "",
    revision: cleanString(raw.revision),
    updated: cleanString(raw.updated),
    applicability: cleanList(raw.applicability),
    essentialEight: cleanList(raw.essentialEight),
    sortId: cleanString(raw.sortId) ?? "",
  };
  control.displayTitle = displayTitle(control);
  return control;
}

// Older releases use "ALL" before OFFICIAL (NC) existed; treat as the full set
// so the scheme change does not register as ~850 applicability edits.
export function comparableApplicability(codes) {
  if (codes.includes("ALL")) return CLASSIFICATIONS.map((c) => c.code).join(",");
  const order = ["NC", "O", "OS", "P", "S", "TS"];
  return [...codes]
    .sort((x, y) => (order.indexOf(x) === -1 ? 99 : order.indexOf(x)) - (order.indexOf(y) === -1 ? 99 : order.indexOf(y)) || x.localeCompare(y))
    .join(",");
}

function comparable(control, field) {
  const value = control[field];
  if (field === "applicability") return comparableApplicability(value);
  if (Array.isArray(value)) return [...value].sort().join(",");
  return value ?? "";
}

export function changedFields(before, after) {
  return COMPARED_FIELDS.filter((field) => comparable(before, field) !== comparable(after, field));
}

export function fieldChanges(before, after, fields = changedFields(before, after)) {
  const changes = {};
  for (const field of fields) changes[field] = { before: before[field] ?? null, after: after[field] ?? null };
  return changes;
}

// Shape used by the client-side search (data/latest-controls.json).
export function slimControl(control) {
  return {
    id: control.controlId,
    title: control.displayTitle,
    chapter: control.chapter,
    section: control.section,
    statement: control.statement,
    applicability: control.applicability,
    e8: control.essentialEight,
    revision: control.revision,
    updated: control.updated,
  };
}

// Public API shape for a control.
export function apiControl(control) {
  return {
    controlId: control.controlId,
    version: control.version,
    title: control.title,
    displayTitle: control.displayTitle,
    chapter: control.chapter,
    section: control.section,
    topic: control.topic,
    path: control.path,
    statement: control.statement,
    revision: control.revision,
    updated: control.updated,
    applicability: control.applicability,
    applicabilityLabels: control.applicability.map(classificationLabel),
    essentialEight: control.essentialEight,
  };
}
