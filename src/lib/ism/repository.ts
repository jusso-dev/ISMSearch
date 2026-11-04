// NOTE: this module is intentionally a "leaf": it only has type-only imports from
// sibling modules and Node built-in value imports, so it can be loaded directly by
// `node --test` (native TypeScript type stripping cannot resolve the `@/` alias or
// extensionless relative imports).
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  CompareChange,
  ControlHistory,
  ControlHistoryEntry,
  IsmControl,
  IsmFacets,
  IsmManifest,
} from "./types";

const DATA_DIR = process.env.ISM_DATA_DIR ?? path.join(process.cwd(), "data", "ism");
const VERSION_PATTERN = /^v\d{4}\.\d{2}\.\d{1,2}$/;

const EMPTY_MANIFEST: IsmManifest = {
  generatedAt: "",
  source: "AustralianCyberSecurityCentre/ism-oscal",
  rssFeed: "https://www.cyber.gov.au/rss/news",
  releases: [],
};

// ---------------------------------------------------------------------------
// File cache
// ---------------------------------------------------------------------------

type CachedFile = { mtimeMs: number; size: number; value: Promise<unknown> };

const fileCache = new Map<string, CachedFile>();

/**
 * Reads and parses a JSON file, caching the parsed value keyed by path + mtime + size.
 * Each call costs one `stat`; the multi-MB release snapshots are only re-read and
 * re-parsed when the file actually changes on disk. Concurrent callers share the
 * same in-flight parse. Returned values are shared: callers must treat them as read-only.
 */
async function readJsonCached<T>(filePath: string): Promise<T> {
  const info = await stat(filePath);
  const cached = fileCache.get(filePath);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return cached.value as Promise<T>;
  }

  const value = readFile(filePath, "utf8").then((raw) => JSON.parse(raw) as T);
  fileCache.set(filePath, { mtimeMs: info.mtimeMs, size: info.size, value });
  value.catch(() => {
    if (fileCache.get(filePath)?.value === value) fileCache.delete(filePath);
  });
  return value;
}

// ---------------------------------------------------------------------------
// Manifest / releases
// ---------------------------------------------------------------------------

export async function getManifest(): Promise<IsmManifest> {
  try {
    const manifest = await readJsonCached<IsmManifest>(path.join(DATA_DIR, "manifest.json"));
    return Array.isArray(manifest?.releases) ? manifest : EMPTY_MANIFEST;
  } catch {
    return EMPTY_MANIFEST;
  }
}

export async function getLatestVersion(): Promise<string | null> {
  const manifest = await getManifest();
  return manifest.releases[0]?.version ?? null;
}

export async function hasRelease(version: string): Promise<boolean> {
  const manifest = await getManifest();
  return manifest.releases.some((release) => release.version === version);
}

/**
 * Returns the controls of a release (latest when omitted). The returned array is
 * shared with the cache: do not mutate it.
 */
export async function getControls(version?: string | null): Promise<IsmControl[]> {
  const manifest = await getManifest();
  const selectedVersion = version ?? manifest.releases[0]?.version;
  // Defence in depth: the version becomes part of a file path.
  if (!selectedVersion || !VERSION_PATTERN.test(selectedVersion)) return [];

  try {
    const snapshot = await readJsonCached<{ controls?: IsmControl[] }>(
      path.join(DATA_DIR, "releases", `${selectedVersion}.json`),
    );
    return Array.isArray(snapshot?.controls) ? normalizedControls(snapshot.controls) : [];
  } catch {
    return [];
  }
}

// Releases before v2024.12.19 mark controls that apply to every classification with
// the single code "ALL". Expand it so filters, comparisons and history treat it the
// same as the explicit NC/OS/P/S/TS list used by later releases.
const ALL_APPLICABILITY = ["NC", "OS", "P", "S", "TS"];
const APPLICABILITY_LABELS: Record<string, string> = {
  NC: "OFFICIAL",
  OS: "OFFICIAL: Sensitive",
  P: "PROTECTED",
  S: "SECRET",
  TS: "TOP SECRET",
};

export function normalizeApplicability(control: IsmControl): IsmControl {
  if (!control.applicability?.includes("ALL")) return control;
  const applicability = [
    ...new Set(control.applicability.flatMap((value) => (value === "ALL" ? ALL_APPLICABILITY : [value]))),
  ];
  return {
    ...control,
    applicability,
    applicabilityLabels: applicability.map((value) => APPLICABILITY_LABELS[value] ?? value),
  };
}

const normalizedCache = new WeakMap<IsmControl[], IsmControl[]>();

function normalizedControls(controls: IsmControl[]) {
  let normalized = normalizedCache.get(controls);
  if (!normalized) {
    normalized = controls.map(normalizeApplicability);
    normalizedCache.set(controls, normalized);
  }
  return normalized;
}

const controlIndexCache = new WeakMap<IsmControl[], Map<string, IsmControl>>();

function controlIndex(controls: IsmControl[]) {
  let index = controlIndexCache.get(controls);
  if (!index) {
    index = new Map(controls.map((control) => [control.controlId.toUpperCase(), control]));
    controlIndexCache.set(controls, index);
  }
  return index;
}

export function normalizeControlId(controlId: string) {
  return controlId.trim().toUpperCase();
}

/** Case-insensitive control lookup ("ism-1234" finds "ISM-1234"). */
export async function getControl(controlId: string, version?: string | null): Promise<IsmControl | null> {
  const controls = await getControls(version);
  return controlIndex(controls).get(normalizeControlId(controlId)) ?? null;
}

const facetsCache = new WeakMap<IsmControl[], { chapters: string[]; essentialEight: string[] }>();

export async function getFacets(version?: string | null): Promise<IsmFacets> {
  const selectedVersion = version ?? (await getLatestVersion()) ?? "";
  const controls = await getControls(selectedVersion || null);
  let facets = facetsCache.get(controls);
  if (!facets) {
    const chapters: string[] = [];
    const seenChapters = new Set<string>();
    const levels = new Set<string>();
    for (const control of controls) {
      if (control.chapter && !seenChapters.has(control.chapter)) {
        seenChapters.add(control.chapter);
        chapters.push(control.chapter);
      }
      for (const level of control.essentialEight ?? []) levels.add(level);
    }
    facets = { chapters, essentialEight: [...levels].sort() };
    facetsCache.set(controls, facets);
  }
  return { version: selectedVersion, chapters: [...facets.chapters], essentialEight: [...facets.essentialEight] };
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

export const COMPARE_FIELDS = [
  "statement",
  "title",
  "chapter",
  "section",
  "topic",
  "revision",
  "updated",
  "applicability",
  "essentialEight",
] as const satisfies readonly (keyof IsmControl)[];

function comparable(value: unknown) {
  // Array order is not meaningful for applicability / essentialEight.
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  return JSON.stringify(value ?? null);
}

export function changedFieldsBetween(from: IsmControl, to: IsmControl): string[] {
  return COMPARE_FIELDS.filter((field) => comparable(from[field]) !== comparable(to[field]));
}

/**
 * Compares two releases. Comparing a release with itself is allowed and yields every
 * control as "unchanged".
 */
export async function compareVersions(fromVersion: string, toVersion: string): Promise<CompareChange[]> {
  const [fromControls, toControls] = await Promise.all([getControls(fromVersion), getControls(toVersion)]);
  const fromById = new Map(fromControls.map((control) => [control.controlId, control]));
  const toById = new Map(toControls.map((control) => [control.controlId, control]));
  const ids = [...new Set([...fromById.keys(), ...toById.keys()])].sort();

  return ids.map((controlId): CompareChange => {
    const from = fromById.get(controlId);
    const to = toById.get(controlId);
    if (!from && to) return { controlId, status: "added", to, changedFields: ["control"] };
    if (from && !to) return { controlId, status: "removed", from, changedFields: ["control"] };

    const changedFields = changedFieldsBetween(from as IsmControl, to as IsmControl);
    return {
      controlId,
      status: changedFields.length > 0 ? "changed" : "unchanged",
      from,
      to,
      changedFields,
    };
  });
}

/**
 * Full history of a control across every release in the manifest, oldest to newest.
 * Only releases where something happened are included. Returns null when the
 * control never appears in any release.
 */
export async function getControlHistory(controlId: string): Promise<ControlHistory | null> {
  const id = normalizeControlId(controlId);
  const manifest = await getManifest();
  const releases = [...manifest.releases].reverse(); // manifest is newest-first
  const snapshots = await Promise.all(releases.map((release) => getControls(release.version)));

  const entries: ControlHistoryEntry[] = [];
  let previous: IsmControl | null = null;
  let everSeen = false;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;

  for (const [index, release] of releases.entries()) {
    const current = controlIndex(snapshots[index]).get(id) ?? null;
    if (current) {
      lastSeen = release.version;
      if (!everSeen) {
        firstSeen = release.version;
        entries.push({ version: release.version, release: release.release, status: "introduced", changedFields: [], control: current });
      } else if (!previous) {
        entries.push({
          version: release.version,
          release: release.release,
          status: "reintroduced",
          changedFields: [],
          control: current,
        });
      } else {
        const changedFields = changedFieldsBetween(previous, current);
        if (changedFields.length > 0) {
          entries.push({ version: release.version, release: release.release, status: "changed", changedFields, control: current });
        }
      }
      everSeen = true;
    } else if (previous) {
      entries.push({ version: release.version, release: release.release, status: "removed", changedFields: [], control: null });
    }
    previous = current;
  }

  if (!everSeen) return null;

  const latestVersion = manifest.releases[0]?.version ?? null;
  const latest = snapshots.length ? (controlIndex(snapshots[snapshots.length - 1]).get(id) ?? null) : null;
  const canonicalId = latest?.controlId ?? [...entries].reverse().find((entry) => entry.control)?.control?.controlId ?? id;

  return { controlId: canonicalId, latest, latestVersion, firstSeen, lastSeen, entries };
}

// ---------------------------------------------------------------------------
// Text helpers / local search
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are aren't as at be because been before being below " +
    "between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each " +
    "few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how " +
    "i if in into is isn't it it's its itself just let's me more most must mustn't my myself no nor not of off on " +
    "once only or other ought our ours ourselves out over own same shall shan't she should shouldn't so some such " +
    "than that that's the their theirs them themselves then there there's these they this those through to too " +
    "under until up upon very was wasn't we were weren't what what's when where which while who whom why will " +
    "with won't would wouldn't you your yours yourself yourselves also may might us via etc e.g i.e please tell " +
    "explain describe give show list"
  ).split(/\s+/),
);

export function isStopword(token: string) {
  return STOPWORDS.has(token.toLowerCase());
}

/** Lower-cased word tokens; keeps internal hyphens/apostrophes (e.g. "multi-factor", "ism-1234"). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}'’-]+/u)
    .map((token) => token.replace(/’/g, "'").replace(/^['-]+|['-]+$/g, ""))
    .filter((token) => token.length > 0 && /[\p{L}\p{N}]/u.test(token));
}

/**
 * Builds a compact keyword query from free text: drops stopwords and punctuation-only
 * tokens, de-duplicates, and keeps at most `maxTerms` of the most informative terms
 * (Meilisearch only considers the first 10 query words). Terms keep their original order.
 * Falls back to the raw tokens when every token is a stopword.
 */
export function keywordQuery(text: string, maxTerms = 10): string {
  const tokens = tokenize(text);
  const unique = [...new Set(tokens)];
  const informative = unique.filter((token) => !STOPWORDS.has(token));
  const candidates = informative.length > 0 ? informative : unique;
  if (candidates.length <= maxTerms) return candidates.join(" ");

  const weight = (token: string) => token.length + (/\d/.test(token) ? 6 : 0) + (token.includes("-") ? 2 : 0);
  const keep = new Set(
    candidates
      .map((token, index) => ({ token, index, score: weight(token) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxTerms)
      .map(({ token }) => token),
  );
  return candidates.filter((token) => keep.has(token)).join(" ");
}

/** Candidate control IDs referenced by a query ("1234", "ism-1234", "ISM-PRINCIPLE-GOV-01"). */
function controlIdCandidates(query: string, tokens: string[]) {
  const candidates = new Set<string>();
  const add = (raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(value) || !/\d/.test(value)) return;
    candidates.add(value.startsWith("ISM-") ? value : `ISM-${value}`);
  };
  add(query);
  tokens.forEach(add);
  return candidates;
}

const haystackCache = new WeakMap<IsmControl, { text: string; title: string }>();

function haystackFor(control: IsmControl) {
  let cached = haystackCache.get(control);
  if (!cached) {
    cached = { text: (control.text ?? "").toLowerCase(), title: (control.title ?? "").toLowerCase() };
    haystackCache.set(control, cached);
  }
  return cached;
}

/**
 * Simple in-process relevance search used when Meilisearch is unavailable.
 * Scoring: +1 per informative term found in the control text, +0.5 when also in
 * the title, +3 for the exact phrase, +1000 for an exact control ID match on the
 * whole query (+100 when the ID appears as one of several terms).
 */
export function localSearch(controls: IsmControl[], query: string, limit: number, offset = 0) {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");
  const rawTokens = tokenize(normalizedQuery);
  const informative = rawTokens.filter((token) => !STOPWORDS.has(token));
  const terms = [...new Set(informative.length > 0 ? informative : rawTokens)];
  const wholeQueryId = controlIdCandidates(normalizedQuery, []);
  const tokenIds = controlIdCandidates("", rawTokens);

  const scored = controls
    .map((control) => {
      const haystack = haystackFor(control);
      let score = 0;
      for (const term of terms) {
        if (haystack.text.includes(term)) {
          score += 1;
          if (haystack.title.includes(term)) score += 0.5;
        }
      }
      if (normalizedQuery && terms.length > 0 && haystack.text.includes(normalizedQuery)) score += 3;
      const id = control.controlId.toUpperCase();
      if (wholeQueryId.has(id)) score += 1000;
      else if (tokenIds.has(id)) score += 100;
      return { control, score };
    })
    .filter(({ score }) => score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score || a.control.controlId.localeCompare(b.control.controlId));

  const start = Math.max(0, offset);
  return {
    estimatedTotalHits: scored.length,
    hits: scored.slice(start, start + limit).map(({ control }) => control),
  };
}
