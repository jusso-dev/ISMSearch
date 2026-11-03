import { Meilisearch } from "meilisearch";
import type { IsmControl, SearchResponse } from "@/lib/ism/types";
import { getControls, getFacets, getLatestVersion, keywordQuery, localSearch, normalizeApplicability } from "@/lib/ism/repository";
import { cleanApplicability, cleanEssentialEight } from "@/lib/validation";

export { keywordQuery };

const MEILI_HOST = process.env.MEILI_HOST ?? process.env.SEARCH_BASE_URL;
// Prefer a search-only key; the master key is a fallback for simple local setups.
const MEILI_KEY = process.env.MEILI_SEARCH_KEY || process.env.MEILI_MASTER_KEY || process.env.API_KEY;
const MEILI_INDEX = "ism-controls";

let client: Meilisearch | null = null;

function meiliClient() {
  if (!MEILI_HOST) return null;
  client ??= new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_KEY, timeout: 5_000 });
  return client;
}

/** Escapes a value for use inside a double-quoted Meilisearch filter string. */
export function escapeFilterValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function quoted(value: string) {
  return `"${escapeFilterValue(value)}"`;
}

export type SearchControlsInput = {
  query: string;
  version?: string | null;
  limit?: number;
  offset?: number;
  applicability?: string[] | null;
  chapter?: string | null;
  essentialEight?: ("ML1" | "ML2" | "ML3")[] | string[] | null;
};

/**
 * Searches controls in a release, using Meilisearch when configured and falling back
 * to the on-disk snapshot when Meilisearch is unavailable, has not indexed the
 * release, or returns no hits. Filters: applicability (any of), chapter (exact; must
 * be one of the release's chapters, otherwise nothing matches) and Essential Eight
 * maturity level (any of).
 */
export async function searchControls({
  query,
  version,
  limit = 12,
  offset = 0,
  applicability,
  chapter,
  essentialEight,
}: SearchControlsInput): Promise<SearchResponse> {
  const selectedVersion = version ?? (await getLatestVersion()) ?? "";
  const started = Date.now();
  const applicabilityFilters = cleanApplicability(applicability);
  const essentialEightFilters = cleanEssentialEight(essentialEight);
  const requestedChapter = chapter?.trim() || null;

  const base = { query, version: selectedVersion, offset, limit };

  // Only chapters that exist in the release may reach the Meilisearch filter.
  let chapterFilter: string | null = null;
  if (requestedChapter) {
    const facets = await getFacets(selectedVersion || null);
    if (!facets.chapters.includes(requestedChapter)) {
      return { ...base, estimatedTotalHits: 0, processingTimeMs: Date.now() - started, hits: [], source: "local" };
    }
    chapterFilter = requestedChapter;
  }

  const meili = meiliClient();
  if (meili && selectedVersion) {
    try {
      const filters = [`version = ${quoted(selectedVersion)}`];
      if (applicabilityFilters.length) {
        // Older releases index controls that apply everywhere under the legacy "ALL" code.
        const values = [...applicabilityFilters, "ALL"];
        filters.push(`(${values.map((value) => `applicability = ${quoted(value)}`).join(" OR ")})`);
      }
      if (chapterFilter) filters.push(`chapter = ${quoted(chapterFilter)}`);
      if (essentialEightFilters.length) {
        filters.push(`(${essentialEightFilters.map((value) => `essentialEight = ${quoted(value)}`).join(" OR ")})`);
      }
      const result = await meili.index(MEILI_INDEX).search<IsmControl>(query, {
        limit,
        offset,
        filter: filters.join(" AND "),
      });
      const total = result.estimatedTotalHits ?? result.hits.length;

      // Zero total hits means either a genuine miss (local substring search may still
      // find something) or the release has not been indexed yet: use the snapshot.
      if (total > 0) {
        return {
          ...base,
          estimatedTotalHits: total,
          processingTimeMs: result.processingTimeMs,
          hits: result.hits.map(normalizeApplicability),
          source: "meilisearch",
        };
      }
    } catch {
      // Fall back to disk snapshots so the UI remains usable before indexing.
    }
  }

  const controls = await getControls(selectedVersion || null);
  const filtered = controls.filter(
    (control) =>
      (!applicabilityFilters.length || applicabilityFilters.some((value) => control.applicability.includes(value))) &&
      (!chapterFilter || control.chapter === chapterFilter) &&
      (!essentialEightFilters.length || essentialEightFilters.some((value) => control.essentialEight.includes(value))),
  );
  const result = localSearch(filtered, query, limit, offset);

  return {
    ...base,
    estimatedTotalHits: result.estimatedTotalHits,
    processingTimeMs: Date.now() - started,
    hits: result.hits,
    source: "local",
  };
}
