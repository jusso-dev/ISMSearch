import { Meilisearch } from "meilisearch";
import type { IsmControl, SearchResponse } from "@/lib/ism/types";
import { getControls, getLatestVersion, localSearch } from "@/lib/ism/repository";
import { cleanApplicability } from "@/lib/validation";

const MEILI_HOST = process.env.MEILI_HOST ?? process.env.SEARCH_BASE_URL;
const MEILI_KEY = process.env.MEILI_MASTER_KEY ?? process.env.API_KEY;

export async function searchControls({
  query,
  version,
  limit = 12,
  applicability,
}: {
  query: string;
  version?: string | null;
  limit?: number;
  applicability?: string[] | null;
}): Promise<SearchResponse> {
  const selectedVersion = version ?? (await getLatestVersion()) ?? "";
  const started = Date.now();
  const applicabilityFilters = cleanApplicability(applicability);

  if (MEILI_HOST) {
    try {
      const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_KEY });
      const filters = [`version = "${selectedVersion}"`];
      if (applicabilityFilters.length) {
        filters.push(`(${applicabilityFilters.map((value) => `applicability = "${value}"`).join(" OR ")})`);
      }
      const result = await client.index("ism-controls").search<IsmControl>(query, {
        limit,
        filter: filters.join(" AND "),
      });

      return {
        query,
        version: selectedVersion,
        estimatedTotalHits: result.estimatedTotalHits ?? result.hits.length,
        processingTimeMs: result.processingTimeMs,
        hits: result.hits,
        source: "meilisearch",
      };
    } catch {
      // Fall back to disk snapshots so the UI remains usable before indexing.
    }
  }

  const controls = await getControls(selectedVersion);
  const filtered = applicabilityFilters.length
    ? controls.filter((control) => applicabilityFilters.some((value) => control.applicability.includes(value)))
    : controls;
  const result = localSearch(filtered, query, limit);

  return {
    query,
    version: selectedVersion,
    estimatedTotalHits: result.estimatedTotalHits,
    processingTimeMs: Date.now() - started,
    hits: result.hits,
    source: "local",
  };
}
