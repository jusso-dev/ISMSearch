import { APPLICABILITY, ESSENTIAL_EIGHT, LIMITS, RESULT_TABS, type ResultTab } from "./constants";

/**
 * Shareable workbench state. Parsed on the server from searchParams (page.tsx)
 * and mirrored back into the URL by the client with history.replaceState.
 */
export type WorkbenchUrlState = {
  q: string;
  version: string;
  classifications: string[];
  chapter: string;
  essentialEight: string[];
  tab: ResultTab;
  from: string;
  to: string;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_QUERY = "software security";

const APPLICABILITY_CODES = APPLICABILITY.map((item) => item.value as string);
const E8_CODES = ESSENTIAL_EIGHT.map((item) => item.value as string);
const TAB_KEYS = RESULT_TABS.map((item) => item.key as string);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Accepts both repeated params (?class=P&class=S) and comma lists (?class=P,S). */
function list(value: string | string[] | undefined, allowed: string[]) {
  const values = (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((item) => item.split(","))
    .map((item) => item.trim().toUpperCase());
  return allowed.filter((code) => values.includes(code));
}

export function parseWorkbenchParams(
  raw: RawSearchParams,
  options: { versions: string[]; chapters?: string[] },
): WorkbenchUrlState {
  const { versions } = options;
  const latest = versions[0] ?? "";
  const previous = versions[1] ?? latest;
  const pickVersion = (value: string | undefined, fallback: string) =>
    value && versions.includes(value) ? value : fallback;

  const q = first(raw.q);
  const chapter = first(raw.chapter)?.trim() ?? "";
  const tab = first(raw.tab) ?? "";

  return {
    q: q === undefined ? DEFAULT_QUERY : q.slice(0, LIMITS.query),
    version: pickVersion(first(raw.version), latest),
    classifications: list(raw.class, APPLICABILITY_CODES),
    chapter: chapter && chapter.length <= 200 && (!options.chapters || options.chapters.includes(chapter)) ? chapter : "",
    essentialEight: list(raw.e8, E8_CODES),
    tab: (TAB_KEYS.includes(tab) ? tab : "search") as ResultTab,
    from: pickVersion(first(raw.from), previous),
    to: pickVersion(first(raw.to), latest),
  };
}

/** Builds the query string for the current view; defaults are omitted to keep links short. */
export function serialiseWorkbenchState(state: WorkbenchUrlState, versions: string[]) {
  const latest = versions[0] ?? "";
  const previous = versions[1] ?? latest;
  const params = new URLSearchParams();
  // Always present (even empty) so an intentionally blank query does not fall back to the default.
  params.set("q", state.q);
  if (state.version) params.set("version", state.version);
  if (state.classifications.length) params.set("class", state.classifications.join(","));
  if (state.chapter) params.set("chapter", state.chapter);
  if (state.essentialEight.length) params.set("e8", state.essentialEight.join(","));
  if (state.tab !== "search") params.set("tab", state.tab);
  if (state.from && state.from !== previous) params.set("from", state.from);
  if (state.to && state.to !== latest) params.set("to", state.to);
  return params.toString();
}
