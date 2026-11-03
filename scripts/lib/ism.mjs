// Pure helpers for the ISM OSCAL sync. No top-level side effects.

export const GITHUB_REPO = "AustralianCyberSecurityCentre/ism-oscal";
export const GITHUB_RAW = `https://raw.githubusercontent.com/${GITHUB_REPO}`;
export const MANIFEST_SOURCE = GITHUB_REPO;
export const MIN_CONTROLS = 500;

/** Tag names published by the ACSC look like v2026.09.4 or v2025.03.31. */
export const VERSION_PATTERN = /^v\d{4}\.\d{2}\.\d{1,2}$/;

const APPLICABILITY_LABELS = {
  NC: "OFFICIAL",
  OS: "OFFICIAL: Sensitive",
  P: "PROTECTED",
  S: "SECRET",
  TS: "TOP SECRET",
};

export function isVersion(value) {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

/** Numeric comparison of dotted versions (ascending). "v2026.09.04" equals "v2026.09.4". */
export function compareVersions(a, b) {
  const left = a.replace(/^v/, "").split(".").map(Number);
  const right = b.replace(/^v/, "").split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function sortVersionsDesc(versions) {
  return [...versions].sort((a, b) => compareVersions(b, a));
}

export function sourceUrlFor(version) {
  return `${GITHUB_RAW}/${version}/ISM_catalog.json`;
}

/** Tag names from a GitHub `GET /repos/:repo/tags` response page. */
export function parseGithubTags(json) {
  if (!Array.isArray(json)) return [];
  return json.map((tag) => tag?.name).filter(isVersion);
}

/** Versions listed as "ISM OSCAL vYYYY.MM.D" on the cyber.gov.au OSCAL releases page. */
export function extractVersionsFromCyberPage(html) {
  return [...String(html).matchAll(/ISM OSCAL v?(\d{4}\.\d{2}\.\d{1,2})\b/g)].map((match) => `v${match[1]}`);
}

/**
 * Versions mentioned alongside the standalone word "ISM" in an RSS feed.
 * Requires a word boundary so words such as "mechanism" do not match.
 */
export function extractVersionsFromRss(xml) {
  return [...String(xml).matchAll(/\bISM\b[^<]*?\bv?(\d{4}\.\d{2}\.\d{1,2})\b/g)].map((match) => `v${match[1]}`);
}

/**
 * Map a scraped version onto a known tag name. Exact matches win; otherwise a tag
 * that is numerically identical (e.g. v2026.09.04 -> v2026.09.4) is used.
 */
export function resolveVersion(candidate, knownTags) {
  const tags = [...knownTags];
  if (tags.includes(candidate)) return candidate;
  return tags.find((tag) => compareVersions(tag, candidate) === 0) ?? candidate;
}

/**
 * Merge discovered versions into a de-duplicated, newest-first candidate list.
 * Versions confirmed by GitHub tags are marked `confirmed: true`; versions only
 * seen on cyber.gov.au are kept but marked unconfirmed.
 */
export function buildCandidates({ tags = [], scraped = [] }) {
  const confirmed = new Set(tags.filter(isVersion));
  const all = new Map();
  for (const tag of confirmed) all.set(tag, { version: tag, confirmed: true });
  for (const raw of scraped) {
    const version = resolveVersion(raw, confirmed);
    if (!isVersion(version) || all.has(version)) continue;
    // Skip scraped spellings that are numerically equal to something already queued.
    if ([...all.keys()].some((known) => compareVersions(known, version) === 0)) continue;
    all.set(version, { version, confirmed: false });
  }
  return [...all.values()].sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Decide which candidates need downloading. Existing release files are immutable
 * snapshots of git tags and are skipped unless `force` is set. `limit` caps the
 * number of downloads (newest first); null/Infinity means no cap.
 */
export function planDownloads(candidates, existingVersions, { force = false, limit = null } = {}) {
  const existing = new Set(existingVersions);
  const pending = candidates.filter((candidate) => force || !existing.has(candidate.version));
  return Number.isFinite(limit) && limit >= 0 ? pending.slice(0, limit) : pending;
}

/** Parse ISM_RELEASE_COUNT: "all"/empty -> null (no cap), positive integer -> number. */
export function parseReleaseLimit(value) {
  if (value == null || value === "" || String(value).toLowerCase() === "all") return null;
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : null;
}

function propValues(node, name) {
  return (node.props ?? []).filter((prop) => prop.name === name).map((prop) => prop.value);
}

function firstProp(node, name) {
  return propValues(node, name)[0] ?? null;
}

function flattenParts(parts = []) {
  return parts.flatMap((part) => [{ name: part.name, prose: part.prose ?? "" }, ...flattenParts(part.parts ?? [])]);
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

export function normalizeControl(control, pathParts, version) {
  const proseParts = flattenParts(control.parts ?? []);
  const statement = proseParts.find((part) => part.name === "statement")?.prose ?? "";
  const body = proseParts
    .map((part) => part.prose)
    .filter(Boolean)
    .join("\n\n");
  const applicability = propValues(control, "applicability");
  const essentialEight = propValues(control, "essential-eight-applicability");
  const controlId = control.id.toUpperCase();
  const title = cleanControlTitle(control);

  return {
    objectID: documentId(version, control.id),
    id: control.id,
    controlId,
    version,
    release: version.replace(/^v/, ""),
    title,
    chapter: pathParts[0] ?? "ISM",
    section: pathParts.slice(1).join(" / ") || pathParts[0] || "ISM",
    topic: pathParts.at(-1) ?? "ISM",
    path: pathParts,
    statement,
    body,
    text: [controlId, title, pathParts.join(" "), body].filter(Boolean).join("\n"),
    revision: firstProp(control, "revision"),
    updated: firstProp(control, "updated"),
    applicability,
    applicabilityLabels: applicability.map((value) => APPLICABILITY_LABELS[value] ?? value),
    essentialEight,
    sortId: firstProp(control, "sort-id"),
  };
}

/** Flatten an OSCAL catalog into the release snapshot stored in data/ism/releases. */
export function normalizeCatalog(version, rawCatalog, { syncedAt = new Date().toISOString() } = {}) {
  if (!rawCatalog || typeof rawCatalog !== "object" || !rawCatalog.catalog) {
    throw new Error(`${version}: catalog JSON has no "catalog" root`);
  }
  const controls = [];

  function walk(node, pathParts = []) {
    const nextPath = node.title ? [...pathParts, node.title] : pathParts;
    for (const control of node.controls ?? []) {
      if (typeof control?.id !== "string" || !control.id) {
        throw new Error(`${version}: control without an id under "${nextPath.join(" / ")}"`);
      }
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
    sourceUrl: sourceUrlFor(version),
    syncedAt,
    count: controls.length,
    controls,
  };
}

/** Returns a list of problems; an empty list means the snapshot is acceptable. */
export function validateRelease(snapshot, { minControls = MIN_CONTROLS } = {}) {
  const problems = [];
  if (!snapshot || typeof snapshot !== "object") return ["snapshot is not an object"];
  if (!isVersion(snapshot.version)) problems.push(`invalid version ${JSON.stringify(snapshot.version)}`);
  const controls = Array.isArray(snapshot.controls) ? snapshot.controls : [];
  if (!Array.isArray(snapshot.controls)) problems.push("controls is not an array");
  if (snapshot.count !== controls.length) problems.push(`count ${snapshot.count} != controls.length ${controls.length}`);
  if (controls.length < minControls) problems.push(`only ${controls.length} controls (expected >= ${minControls})`);
  const missing = controls.filter((control) => !control?.controlId || !control?.version).length;
  if (missing > 0) problems.push(`${missing} controls missing controlId or version`);
  return problems;
}

/** A release file already on disk counts as usable when it parses and has controls. */
export function isUsableReleaseFile(snapshot) {
  return Boolean(
    snapshot &&
      isVersion(snapshot.version) &&
      Number.isInteger(snapshot.count) &&
      snapshot.count > 0 &&
      Array.isArray(snapshot.controls),
  );
}

export function releaseSummary({ version, release, title, sourceUrl, count, syncedAt }) {
  return { version, release, title, sourceUrl, count, syncedAt };
}

/**
 * Build the manifest from release summaries (normally every usable release file on
 * disk). Duplicates are collapsed and the list is ordered newest first.
 */
export function buildManifest(summaries, { generatedAt, rssFeed }) {
  const byVersion = new Map();
  for (const summary of summaries) byVersion.set(summary.version, releaseSummary(summary));
  const releases = [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
  return { generatedAt, source: MANIFEST_SOURCE, rssFeed, releases };
}

function withoutGeneratedAt(manifest) {
  if (!manifest || typeof manifest !== "object") return manifest;
  const { generatedAt: _ignored, ...rest } = manifest;
  return rest;
}

/** True when two manifests differ only (if at all) in generatedAt. */
export function manifestsEquivalent(a, b) {
  return JSON.stringify(withoutGeneratedAt(a)) === JSON.stringify(withoutGeneratedAt(b));
}

/**
 * Return the manifest that should be on disk: the previous one (unchanged, keeping its
 * generatedAt) when content is identical, otherwise `next`.
 */
export function chooseManifest(previous, next) {
  if (previous && manifestsEquivalent(previous, next)) {
    return { manifest: { ...next, generatedAt: previous.generatedAt }, changed: false };
  }
  return { manifest: next, changed: true };
}
