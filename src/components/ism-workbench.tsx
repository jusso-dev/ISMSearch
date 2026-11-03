"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Filter,
  GitCompare,
  Loader2,
  ScrollText,
  Search,
  Sparkles,
  Square,
} from "lucide-react";
import type { IsmManifest, SearchResponse } from "@/lib/ism/types";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Label, Select, Textarea } from "@/components/ui/field";
import { CopyLinkButton } from "@/components/copy-button";
import {
  fetchJson,
  isAbortError,
  postEventStream,
  RequestSlot,
  toErrorInfo,
  type ErrorInfo,
  type StreamEvent,
} from "@/components/workbench/api";
import { ComparePanel } from "@/components/workbench/compare";
import {
  APPLICABILITY,
  applicabilityLabel,
  DATA_TYPES,
  ESSENTIAL_EIGHT,
  EXAMPLE_QUERIES,
  EXPORT_MAX_ROWS,
  EXPORT_PAGE_SIZE,
  LIMITS,
  ORG_SIZES,
  POLICY_TYPES,
  SEARCH_MAX_OFFSET,
  SEARCH_PAGE_SIZE,
  SSP_SEARCH_LIMIT,
  WORK_MODES,
  type AskResponse,
  type CompareResponse,
  type FacetsResponse,
  type PolicyResponse,
  type ResultTab,
  type SspMode,
  type SspResponse,
  type StreamStatus,
} from "@/components/workbench/constants";
import { downloadSearchCsv } from "@/components/workbench/exports";
import { AskPanel, PolicyPanel, SearchPanel, SspPanel, type ActiveFilter } from "@/components/workbench/panels";
import { ResultTabList, ResultTabPanel } from "@/components/workbench/result-tabs";
import { EmptyDataState, FilterGroup, RailSection, StatusItem, TogglePicker } from "@/components/workbench/ui";
import { serialiseWorkbenchState, type WorkbenchUrlState } from "@/components/workbench/url-state";

type SearchInput = {
  q: string;
  version: string;
  classifications: string[];
  chapter: string;
  essentialEight: string[];
};

type AskBody = { question: string; version: string; applicability: string[] };

type PolicyBody = {
  policyType: string;
  orgName: string;
  orgSize: string;
  industry: string;
  jurisdiction: string;
  dataTypes: string[];
  workModes: string[];
  criticalSystems: string;
  contactRole: string;
};

const SYNC_DATE = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "UTC" });

function searchUrl(input: SearchInput, offset: number, limit: number) {
  const params = new URLSearchParams({ q: input.q, version: input.version, limit: String(limit), offset: String(offset) });
  input.classifications.forEach((code) => params.append("applicability", code));
  if (input.chapter) params.set("chapter", input.chapter);
  input.essentialEight.forEach((level) => params.append("essentialEight", level));
  return `/api/search?${params.toString()}`;
}

function isSearchResponse(value: unknown): value is SearchResponse {
  return Boolean(value) && Array.isArray((value as SearchResponse).hits) && typeof (value as SearchResponse).estimatedTotalHits === "number";
}

function isCompareResponse(value: unknown): value is CompareResponse {
  return Boolean(value) && Array.isArray((value as CompareResponse).changes);
}

function isSspResponse(value: unknown): value is SspResponse {
  return Boolean(value) && Array.isArray((value as SspResponse).rows);
}

function isFacetsResponse(value: unknown): value is FacetsResponse {
  return Boolean(value) && Array.isArray((value as FacetsResponse).chapters);
}

function emptyRetrieval(version: string): SearchResponse {
  return { query: "", version, estimatedTotalHits: 0, processingTimeMs: 0, hits: [], source: "local", offset: 0, limit: 0 };
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Keep toggle selections in a stable, canonical order (matches the option lists). */
function ordered(values: string[], options: readonly { value: string }[]) {
  return options.map((option) => option.value).filter((value) => values.includes(value));
}

export function IsmWorkbench({
  manifest,
  initialState,
  initialChapters,
}: {
  manifest: IsmManifest;
  initialState: WorkbenchUrlState;
  initialChapters?: string[] | null;
}) {
  const releases = manifest.releases;
  const versions = useMemo(() => releases.map((release) => release.version), [releases]);
  const canUseData = releases.length > 0;

  // Request slots: one in-flight request each; a new request aborts the previous one.
  const [slots] = useState(() => ({
    search: new RequestSlot(),
    exportCsv: new RequestSlot(),
    facets: new RequestSlot(),
    ask: new RequestSlot(),
    policy: new RequestSlot(),
    ssp: new RequestSlot(),
    compare: new RequestSlot(),
  }));

  // Search and filters
  const [query, setQuery] = useState(initialState.q);
  const [version, setVersion] = useState(initialState.version);
  const [classifications, setClassifications] = useState(initialState.classifications);
  const [chapter, setChapter] = useState(initialState.chapter);
  const [essentialEight, setEssentialEight] = useState(initialState.essentialEight);
  const [facets, setFacets] = useState<{ version: string; chapters: string[] | null; failed: boolean }>({
    version: initialState.version,
    chapters: initialChapters ?? null,
    failed: false,
  });
  const [pendingSearch, setPendingSearch] = useState<SearchInput>({
    q: initialState.q,
    version: initialState.version,
    classifications: initialState.classifications,
    chapter: initialState.chapter,
    essentialEight: initialState.essentialEight,
  });
  const [lastSearch, setLastSearch] = useState<SearchInput | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searchExhausted, setSearchExhausted] = useState(false);
  const [searchBusy, setSearchBusy] = useState<"idle" | "search" | "more">(canUseData ? "search" : "idle");
  const [searchError, setSearchError] = useState<ErrorInfo | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<ErrorInfo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<ErrorInfo | null>(null);

  // Ask
  const [question, setQuestion] = useState("what control would talk about software security");
  const [askBody, setAskBody] = useState<AskBody | null>(null);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [askStatus, setAskStatus] = useState<StreamStatus>("idle");
  const [askError, setAskError] = useState<ErrorInfo | null>(null);

  // SSP
  const [systemBoundary, setSystemBoundary] = useState(
    "A public-facing web application hosted in cloud infrastructure with administrator access, user authentication, CI/CD deployment, application logging and a managed database.",
  );
  const [sspMode, setSspMode] = useState<SspMode>("search");
  const [sspResult, setSspResult] = useState<{ response: SspResponse; mode: SspMode } | null>(null);
  const [sspBusy, setSspBusy] = useState(false);
  const [sspError, setSspError] = useState<ErrorInfo | null>(null);

  // Policy
  const [policyType, setPolicyType] = useState("acceptable_use");
  const [orgName, setOrgName] = useState("Example Organisation");
  const [orgSize, setOrgSize] = useState("51-200");
  const [industry, setIndustry] = useState("Technology");
  const [jurisdiction, setJurisdiction] = useState("Australia");
  const [criticalSystems, setCriticalSystems] = useState(
    "Cloud applications, identity provider, endpoints, email, source code repositories and production databases.",
  );
  const [contactRole, setContactRole] = useState("Security Manager");
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([
    "Customer personal information",
    "Authentication secrets",
    "Operational logs",
  ]);
  const [selectedWorkModes, setSelectedWorkModes] = useState<string[]>(["Hybrid", "Remote", "Contractors"]);
  const [policyBody, setPolicyBody] = useState<PolicyBody | null>(null);
  const [policyResult, setPolicyResult] = useState<PolicyResponse | null>(null);
  const [policyStatus, setPolicyStatus] = useState<StreamStatus>("idle");
  const [policyError, setPolicyError] = useState<ErrorInfo | null>(null);

  // Compare
  const [compareFrom, setCompareFrom] = useState(initialState.from);
  const [compareTo, setCompareTo] = useState(initialState.to);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [compareBusy, setCompareBusy] = useState(canUseData && Boolean(initialState.from && initialState.to));
  const [compareError, setCompareError] = useState<ErrorInfo | null>(null);
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ResultTab>(initialState.tab);
  const [announcement, setAnnouncement] = useState("");

  const selectedRelease = useMemo(() => releases.find((release) => release.version === version), [releases, version]);
  const releaseLabel = selectedRelease?.release ?? version.replace(/^v/, "");
  const chapterOptions = facets.version === version ? facets.chapters : null;

  // ---------------------------------------------------------------- search

  function runSearch(input: SearchInput) {
    if (!canUseData) return;
    const controller = slots.search.begin();
    setPendingSearch(input);
    setSearchBusy("search");
    setSearchError(null);
    setLoadMoreError(null);
    setExportError(null);
    void executeSearch(input, controller);
  }

  /** Async half of a search: only sets state after the request settles. */
  async function executeSearch(input: SearchInput, controller: AbortController) {
    try {
      const result = await fetchJson<SearchResponse>(searchUrl(input, 0, SEARCH_PAGE_SIZE), {
        signal: controller.signal,
        guard: isSearchResponse,
      });
      if (!slots.search.isCurrent(controller)) return;
      setSearchResult(result);
      setLastSearch(input);
      setSearchExhausted(result.hits.length < SEARCH_PAGE_SIZE);
      const release = releases.find((item) => item.version === input.version)?.release ?? input.version;
      setAnnouncement(
        result.estimatedTotalHits === 0
          ? `No controls found in release ${release}.`
          : `${result.estimatedTotalHits} controls found in release ${release}. Showing ${result.hits.length}.`,
      );
    } catch (error) {
      if (isAbortError(error) || !slots.search.isCurrent(controller)) return;
      const info = toErrorInfo(error);
      setSearchError(info);
      setAnnouncement(`Search failed. ${info.message}`);
    } finally {
      if (slots.search.isCurrent(controller)) {
        slots.search.finish(controller);
        setSearchBusy("idle");
      }
    }
  }

  async function loadMore() {
    if (!lastSearch || !searchResult) return;
    const input = lastSearch;
    const offset = searchResult.hits.length;
    if (offset > SEARCH_MAX_OFFSET) return;
    const controller = slots.search.begin();
    setSearchBusy("more");
    setLoadMoreError(null);
    try {
      const page = await fetchJson<SearchResponse>(searchUrl(input, offset, SEARCH_PAGE_SIZE), {
        signal: controller.signal,
        guard: isSearchResponse,
      });
      if (!slots.search.isCurrent(controller)) return;
      setSearchResult((current) => {
        if (!current) return current;
        const seen = new Set(current.hits.map((hit) => hit.objectID));
        const hits = [...current.hits, ...page.hits.filter((hit) => !seen.has(hit.objectID))];
        return { ...current, hits, estimatedTotalHits: page.estimatedTotalHits, processingTimeMs: page.processingTimeMs };
      });
      setSearchExhausted(page.hits.length < SEARCH_PAGE_SIZE);
      setAnnouncement(`Loaded ${page.hits.length} more controls. Showing ${offset + page.hits.length} of ${page.estimatedTotalHits}.`);
    } catch (error) {
      if (isAbortError(error) || !slots.search.isCurrent(controller)) return;
      setLoadMoreError(toErrorInfo(error));
    } finally {
      if (slots.search.isCurrent(controller)) {
        slots.search.finish(controller);
        setSearchBusy("idle");
      }
    }
  }

  async function exportSearchCsv() {
    if (!lastSearch) return;
    const input = lastSearch;
    const controller = slots.exportCsv.begin();
    setExporting(true);
    setExportError(null);
    try {
      const rows: SearchResponse["hits"] = [];
      const seen = new Set<string>();
      let total = Number.POSITIVE_INFINITY;
      while (rows.length < EXPORT_MAX_ROWS && rows.length < total) {
        const limit = Math.min(EXPORT_PAGE_SIZE, EXPORT_MAX_ROWS - rows.length);
        const page = await fetchJson<SearchResponse>(searchUrl(input, rows.length, limit), {
          signal: controller.signal,
          guard: isSearchResponse,
        });
        total = page.estimatedTotalHits;
        const fresh = page.hits.filter((hit) => !seen.has(hit.objectID));
        fresh.forEach((hit) => seen.add(hit.objectID));
        rows.push(...fresh);
        if (page.hits.length < limit || fresh.length === 0) break;
      }
      if (!slots.exportCsv.isCurrent(controller)) return;
      downloadSearchCsv(rows, input.version, input.q, window.location.origin);
      setAnnouncement(
        `Exported ${rows.length} controls to CSV${total > EXPORT_MAX_ROWS ? ` (limited to the first ${EXPORT_MAX_ROWS})` : ""}.`,
      );
    } catch (error) {
      if (isAbortError(error) || !slots.exportCsv.isCurrent(controller)) return;
      setExportError(toErrorInfo(error));
    } finally {
      if (slots.exportCsv.isCurrent(controller)) {
        slots.exportCsv.finish(controller);
        setExporting(false);
      }
    }
  }

  function loadFacets(nextVersion: string) {
    const controller = slots.facets.begin();
    // Promise callbacks (not try/catch) so state is only ever set once the request settles.
    void fetchJson<FacetsResponse>(`/api/facets?${new URLSearchParams({ version: nextVersion })}`, {
      signal: controller.signal,
      guard: isFacetsResponse,
    })
      .then(
        (result) => {
          if (slots.facets.isCurrent(controller)) setFacets({ version: nextVersion, chapters: result.chapters, failed: false });
        },
        (error: unknown) => {
          if (isAbortError(error) || !slots.facets.isCurrent(controller)) return;
          setFacets({ version: nextVersion, chapters: null, failed: true });
        },
      )
      .finally(() => slots.facets.finish(controller));
  }

  function currentInput(overrides: Partial<SearchInput> = {}): SearchInput {
    return { q: query, version, classifications, chapter, essentialEight, ...overrides };
  }

  /** Filters re-run the search immediately; results always reflect the selected release. */
  function applyFilters(overrides: Partial<SearchInput>) {
    const input = currentInput(overrides);
    setVersion(input.version);
    setClassifications(input.classifications);
    setChapter(input.chapter);
    setEssentialEight(input.essentialEight);
    runSearch(input);
  }

  function changeVersion(nextVersion: string) {
    loadFacets(nextVersion);
    applyFilters({ version: nextVersion });
  }

  function clearFilters() {
    applyFilters({ classifications: [], chapter: "", essentialEight: [] });
  }

  function searchFor(nextQuery: string) {
    setQuery(nextQuery);
    setActiveTab("search");
    runSearch(currentInput({ q: nextQuery }));
  }

  // ---------------------------------------------------------------- ask

  async function runAsk(body: AskBody) {
    if (!canUseData) return;
    const controller = slots.ask.begin();
    setAskBody(body);
    setAskResult(null);
    setAskError(null);
    setAskStatus("streaming");
    setActiveTab("ask");
    let streamError: string | null = null;
    try {
      const completed = await postEventStream(
        "/api/ask",
        body,
        (event: StreamEvent) => {
          if (!slots.ask.isCurrent(controller)) return;
          if (event.type === "meta") {
            const meta = event as Partial<AskResponse> & { type: "meta" };
            setAskResult({
              question: typeof meta.question === "string" ? meta.question : body.question,
              answer: "",
              model: meta.model ?? null,
              retrieval: meta.retrieval && Array.isArray(meta.retrieval.hits) ? meta.retrieval : emptyRetrieval(body.version),
              degraded: Boolean(meta.degraded),
            });
          } else if (event.type === "token") {
            setAskResult((current) => (current ? { ...current, answer: current.answer + event.token } : current));
          } else if (event.type === "error") {
            streamError = event.message || "The model stopped with an error.";
          }
        },
        controller.signal,
      );
      if (!slots.ask.isCurrent(controller)) return;
      if (streamError || !completed) {
        const message = streamError ?? "The response stream ended before the answer was complete.";
        setAskError({ message, details: [] });
        setAskStatus("incomplete");
        setAnnouncement(`Answer incomplete. ${message}`);
      } else {
        setAskStatus("complete");
        setAnnouncement("Answer complete.");
      }
    } catch (error) {
      if (isAbortError(error) || !slots.ask.isCurrent(controller)) return;
      const info = toErrorInfo(error);
      setAskError(info);
      setAskStatus("incomplete");
      setAnnouncement(`Question failed. ${info.message}`);
    } finally {
      slots.ask.finish(controller);
    }
  }

  function stopAsk() {
    slots.ask.abort();
    setAskStatus("incomplete");
    setAskError({ message: "Stopped before the answer finished.", details: [] });
    setAnnouncement("Answer stopped.");
  }

  // ---------------------------------------------------------------- policy

  async function runPolicy(body: PolicyBody) {
    const controller = slots.policy.begin();
    setPolicyBody(body);
    setPolicyResult(null);
    setPolicyError(null);
    setPolicyStatus("streaming");
    setActiveTab("policy");
    let streamError: string | null = null;
    try {
      const completed = await postEventStream(
        "/api/policy",
        body,
        (event: StreamEvent) => {
          if (!slots.policy.isCurrent(controller)) return;
          if (event.type === "meta") {
            const meta = event as Partial<PolicyResponse> & { type: "meta" };
            setPolicyResult({
              policyType: meta.policyType ?? body.policyType,
              title: meta.title ?? POLICY_TYPES.find((item) => item.value === body.policyType)?.label ?? "Policy",
              orgName: meta.orgName ?? body.orgName,
              orgSize: meta.orgSize ?? body.orgSize,
              industry: meta.industry ?? body.industry,
              jurisdiction: meta.jurisdiction ?? body.jurisdiction,
              dataTypes: meta.dataTypes ?? body.dataTypes,
              workModes: meta.workModes ?? body.workModes,
              criticalSystems: meta.criticalSystems ?? body.criticalSystems,
              contactRole: meta.contactRole ?? body.contactRole,
              content: "",
              model: meta.model ?? null,
              degraded: Boolean(meta.degraded),
              generatedAt: meta.generatedAt ?? new Date().toISOString(),
            });
          } else if (event.type === "token") {
            setPolicyResult((current) => (current ? { ...current, content: current.content + event.token } : current));
          } else if (event.type === "error") {
            streamError = event.message || "The model stopped with an error.";
          }
        },
        controller.signal,
      );
      if (!slots.policy.isCurrent(controller)) return;
      if (streamError || !completed) {
        const message = streamError ?? "The response stream ended before the policy was complete.";
        setPolicyError({ message, details: [] });
        setPolicyStatus("incomplete");
        setAnnouncement(`Policy draft incomplete. ${message}`);
      } else {
        setPolicyStatus("complete");
        setAnnouncement("Policy draft complete. DOCX and PDF export are available.");
      }
    } catch (error) {
      if (isAbortError(error) || !slots.policy.isCurrent(controller)) return;
      const info = toErrorInfo(error);
      setPolicyError(info);
      setPolicyStatus("incomplete");
      setAnnouncement(`Policy generation failed. ${info.message}`);
    } finally {
      slots.policy.finish(controller);
    }
  }

  function stopPolicy() {
    slots.policy.abort();
    setPolicyStatus("incomplete");
    setPolicyError({ message: "Stopped before the draft finished.", details: [] });
    setAnnouncement("Policy generation stopped.");
  }

  // ---------------------------------------------------------------- ssp

  async function runSsp() {
    if (!canUseData) return;
    const controller = slots.ssp.begin();
    const mode = sspMode;
    setSspBusy(true);
    setSspError(null);
    setActiveTab("ssp");
    try {
      const response = await fetchJson<SspResponse>("/api/ssp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boundary: systemBoundary.trim(),
          version,
          applicability: classifications,
          ...(chapter ? { chapter } : {}),
          ...(essentialEight.length ? { essentialEight } : {}),
          mode,
          ...(mode === "search" ? { limit: SSP_SEARCH_LIMIT } : {}),
        }),
        signal: controller.signal,
        guard: isSspResponse,
      });
      if (!slots.ssp.isCurrent(controller)) return;
      setSspResult({ response, mode });
      setAnnouncement(`System Security Plan generated with ${response.rows.length} controls.`);
    } catch (error) {
      if (isAbortError(error) || !slots.ssp.isCurrent(controller)) return;
      const info = toErrorInfo(error);
      setSspError(info);
      setAnnouncement(`SSP generation failed. ${info.message}`);
    } finally {
      if (slots.ssp.isCurrent(controller)) {
        slots.ssp.finish(controller);
        setSspBusy(false);
      }
    }
  }

  // ---------------------------------------------------------------- compare

  function runCompare(from: string, to: string) {
    if (!canUseData || !from || !to) return;
    const controller = slots.compare.begin();
    setCompareBusy(true);
    setCompareError(null);
    void executeCompare(from, to, controller);
  }

  async function executeCompare(from: string, to: string, controller: AbortController) {
    try {
      const result = await fetchJson<CompareResponse>(`/api/compare?${new URLSearchParams({ from, to })}`, {
        signal: controller.signal,
        guard: isCompareResponse,
      });
      if (!slots.compare.isCurrent(controller)) return;
      setCompareResult(result);
      setSelectedControlId((current) =>
        current && result.changes.some((change) => change.controlId === current) ? current : (result.changes[0]?.controlId ?? null),
      );
      setAnnouncement(
        `Compared ${from.replace(/^v/, "")} to ${to.replace(/^v/, "")}: ${result.added} added, ${result.changed} changed, ${result.removed} removed.`,
      );
    } catch (error) {
      if (isAbortError(error) || !slots.compare.isCurrent(controller)) return;
      const info = toErrorInfo(error);
      setCompareError(info);
      setAnnouncement(`Release comparison failed. ${info.message}`);
    } finally {
      if (slots.compare.isCurrent(controller)) {
        slots.compare.finish(controller);
        setCompareBusy(false);
      }
    }
  }

  // ---------------------------------------------------------------- effects

  // Initial load; abort everything on unmount.
  useEffect(() => {
    if (canUseData) {
      // Initial state already marks search/compare as busy, so only the async halves run here.
      void executeSearch(pendingSearch, slots.search.begin());
      if (initialState.from && initialState.to) {
        void executeCompare(initialState.from, initialState.to, slots.compare.begin());
      }
      if (!initialChapters) loadFacets(initialState.version);
    }
    return () => Object.values(slots).forEach((slot) => slot.abort());
    // Mount-only: later runs are triggered by user events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the current view into the URL (no navigation) so it can be shared.
  useEffect(() => {
    if (!canUseData) return;
    const queryString = serialiseWorkbenchState(
      {
        q: pendingSearch.q,
        version,
        classifications,
        chapter,
        essentialEight,
        tab: activeTab,
        from: compareFrom,
        to: compareTo,
      },
      versions,
    );
    const next = `${window.location.pathname}?${queryString}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [canUseData, pendingSearch.q, version, classifications, chapter, essentialEight, activeTab, compareFrom, compareTo, versions]);

  // ---------------------------------------------------------------- render helpers

  const visibleSearch = searchResult && lastSearch?.version === version ? searchResult : null;
  const activeFilters: ActiveFilter[] = lastSearch
    ? [
        ...lastSearch.classifications.map((code) => ({ key: `class-${code}`, label: applicabilityLabel(code) })),
        ...(lastSearch.chapter ? [{ key: "chapter", label: `Chapter: ${lastSearch.chapter}` }] : []),
        ...lastSearch.essentialEight.map((level) => ({ key: `e8-${level}`, label: `Essential Eight ${level}` })),
      ]
    : [];
  const canLoadMore =
    Boolean(visibleSearch) &&
    !searchExhausted &&
    (visibleSearch?.hits.length ?? 0) < (visibleSearch?.estimatedTotalHits ?? 0) &&
    (visibleSearch?.hits.length ?? 0) <= SEARCH_MAX_OFFSET;
  const hasFilters = classifications.length > 0 || Boolean(chapter) || essentialEight.length > 0;
  const askStreaming = askStatus === "streaming";
  const policyStreaming = policyStatus === "streaming";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(310px,380px)_1fr]">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <nav
        aria-label="Workbench shortcuts"
        className="sticky top-0 z-20 -mx-2 flex gap-2 overflow-x-auto border-y border-[var(--line)] bg-[oklch(0.975_0.007_92_/_0.96)] px-2 py-2 backdrop-blur lg:hidden"
      >
        {[
          ["#workbench-actions", "Actions"],
          ["#workbench-results", "Results"],
          ["#classification-filters", "Filters"],
          ["#version-compare", "Compare"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-semibold text-[var(--muted)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[oklch(0.72_0.12_158_/_0.45)]"
          >
            {label}
          </a>
        ))}
      </nav>

      <aside id="workbench-actions" className="grid scroll-mt-16 gap-4 lg:sticky lg:top-5" aria-label="Workbench tools">
        <RailSection icon={<Search size={17} aria-hidden />} title="Search" id="search-tools">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setActiveTab("search");
              runSearch(currentInput());
            }}
            className="grid gap-3"
          >
            <Label>
              <FieldLabel>Search terms</FieldLabel>
              <Input
                type="search"
                value={query}
                maxLength={LIMITS.query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="software security or ISM-1546"
              />
            </Label>
            <Label>
              <FieldLabel>Release</FieldLabel>
              <Select value={version} onChange={(event) => changeVersion(event.target.value)} disabled={!canUseData}>
                {releases.map((release) => (
                  <option key={release.version} value={release.version}>
                    {release.release}
                  </option>
                ))}
              </Select>
            </Label>
            <div id="classification-filters" className="grid scroll-mt-16 gap-2">
              <FilterGroup
                label="Classification"
                summary={classifications.length ? `${classifications.length} selected` : "All classifications"}
                onClear={() => applyFilters({ classifications: [] })}
                clearDisabled={!classifications.length}
              >
                <TogglePicker
                  label="Classification filters"
                  options={APPLICABILITY}
                  selected={classifications}
                  onToggle={(value) => applyFilters({ classifications: ordered(toggle(classifications, value), APPLICABILITY) })}
                />
              </FilterGroup>
              <FilterGroup
                label="Essential Eight"
                summary={essentialEight.length ? essentialEight.join(", ") : "Any maturity level"}
                onClear={() => applyFilters({ essentialEight: [] })}
                clearDisabled={!essentialEight.length}
              >
                <TogglePicker
                  label="Essential Eight maturity levels"
                  options={ESSENTIAL_EIGHT}
                  selected={essentialEight}
                  onToggle={(value) => applyFilters({ essentialEight: ordered(toggle(essentialEight, value), ESSENTIAL_EIGHT) })}
                />
              </FilterGroup>
              <Label>
                <FieldLabel>Chapter</FieldLabel>
                <Select value={chapter} onChange={(event) => applyFilters({ chapter: event.target.value })} disabled={!canUseData}>
                  <option value="">All chapters</option>
                  {chapter && !(chapterOptions ?? []).includes(chapter) && (
                    <option value={chapter}>
                      {chapter}
                      {chapterOptions ? " (not in this release)" : ""}
                    </option>
                  )}
                  {(chapterOptions ?? []).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                {facets.failed && facets.version === version && (
                  <span className="text-xs text-[var(--muted)]">Chapter list unavailable for this release.</span>
                )}
              </Label>
            </div>
            <Button type="submit" disabled={!canUseData || searchBusy !== "idle"}>
              {searchBusy === "search" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />}
              {searchBusy === "search" ? "Searching…" : "Search controls"}
            </Button>
            {hasFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="justify-self-start">
                Clear all filters
              </Button>
            )}
          </form>
          <div className="mt-3 grid gap-1.5">
            <span className="text-xs font-bold text-[var(--muted)]">Example queries</span>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={!canUseData}
                  onClick={() => searchFor(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
        </RailSection>

        <RailSection icon={<FileText size={17} aria-hidden />} title="System Security Plan" id="ssp-tools">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runSsp();
            }}
            className="grid gap-3"
          >
            <Label>
              <FieldLabel>System boundary</FieldLabel>
              <Textarea
                value={systemBoundary}
                onChange={(event) => setSystemBoundary(event.target.value)}
                rows={5}
                required
                minLength={LIMITS.boundaryMin}
                maxLength={LIMITS.boundaryMax}
                aria-describedby="ssp-boundary-hint"
              />
              <span id="ssp-boundary-hint" className="text-xs text-[var(--muted)]">
                {LIMITS.boundaryMin}–{LIMITS.boundaryMax} characters · {systemBoundary.length} used
              </span>
            </Label>
            <fieldset className="m-0 grid gap-1.5 border-0 p-0">
              <legend className="mb-1.5 p-0 text-xs font-bold text-[var(--muted)]">Controls to include</legend>
              {(
                [
                  ["search", "Relevant to boundary", `Top ${SSP_SEARCH_LIMIT} controls matched to the description`],
                  ["baseline", "Full baseline", "Every control matching the release and filters"],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] p-2 text-sm transition-colors duration-150 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-[oklch(0.72_0.12_158_/_0.45)]"
                >
                  <input
                    type="radio"
                    name="ssp-mode"
                    value={value}
                    checked={sspMode === value}
                    onChange={() => setSspMode(value)}
                    className="mt-1 accent-[var(--accent)] focus-visible:outline-none"
                  />
                  <span>
                    <span className="block font-semibold text-[var(--ink)]">{label}</span>
                    <span className="block text-xs text-[var(--muted)]">{hint}</span>
                  </span>
                </label>
              ))}
              <span className="text-xs text-[var(--muted)]">Uses the release and filters selected under Search.</span>
            </fieldset>
            <Button variant="secondary" type="submit" disabled={!canUseData || sspBusy}>
              {sspBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <FileText size={16} aria-hidden />}
              {sspBusy ? "Generating…" : "Generate SSP CSV"}
            </Button>
          </form>
        </RailSection>

        <RailSection icon={<Bot size={17} aria-hidden />} title="Ask Ollama" id="ask-tools">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAsk({ question: question.trim(), version, applicability: classifications });
            }}
            className="grid gap-3"
          >
            <Label>
              <FieldLabel>Natural-language question</FieldLabel>
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={4}
                required
                minLength={LIMITS.questionMin}
                maxLength={LIMITS.questionMax}
                aria-describedby="ask-hint"
              />
              <span id="ask-hint" className="text-xs text-[var(--muted)]">
                Uses the selected release and classification filters · {question.length}/{LIMITS.questionMax}
              </span>
            </Label>
            <div className="flex gap-2">
              <Button variant="secondary" type="submit" disabled={!canUseData || askStreaming} className="flex-1">
                {askStreaming ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
                {askStreaming ? "Answering…" : "Ask with retrieved controls"}
              </Button>
              {askStreaming && (
                <Button type="button" variant="outline" onClick={stopAsk} aria-label="Stop answer">
                  <Square size={12} aria-hidden />
                  Stop
                </Button>
              )}
            </div>
          </form>
        </RailSection>

        <RailSection icon={<ScrollText size={17} aria-hidden />} title="Policy Generator" id="policy-tools">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runPolicy({
                policyType,
                orgName: orgName.trim(),
                orgSize,
                industry: industry.trim(),
                jurisdiction: jurisdiction.trim(),
                dataTypes: selectedDataTypes,
                workModes: selectedWorkModes,
                criticalSystems: criticalSystems.trim(),
                contactRole: contactRole.trim(),
              });
            }}
            className="grid gap-3"
          >
            <Label>
              <FieldLabel>Policy type</FieldLabel>
              <Select value={policyType} onChange={(event) => setPolicyType(event.target.value)}>
                {POLICY_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Label>
                <FieldLabel>Organisation</FieldLabel>
                <Input
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  required
                  minLength={LIMITS.orgNameMin}
                  maxLength={LIMITS.orgNameMax}
                />
              </Label>
              <Label>
                <FieldLabel>Size</FieldLabel>
                <Select value={orgSize} onChange={(event) => setOrgSize(event.target.value)}>
                  {ORG_SIZES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Label>
                <FieldLabel>Industry</FieldLabel>
                <Input value={industry} onChange={(event) => setIndustry(event.target.value)} maxLength={LIMITS.industry} />
              </Label>
              <Label>
                <FieldLabel>Jurisdiction</FieldLabel>
                <Input
                  value={jurisdiction}
                  onChange={(event) => setJurisdiction(event.target.value)}
                  maxLength={LIMITS.jurisdiction}
                />
              </Label>
            </div>
            <div className="grid gap-1.5">
              <FieldLabel id="policy-data-types">Data types</FieldLabel>
              <div className="rounded-md border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.55)] p-2">
                <TogglePicker
                  label="Data types"
                  options={DATA_TYPES.map((item) => ({ value: item, label: item }))}
                  selected={selectedDataTypes}
                  onToggle={(value) => setSelectedDataTypes((current) => toggle(current, value))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <FieldLabel>Work modes</FieldLabel>
              <div className="rounded-md border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.55)] p-2">
                <TogglePicker
                  label="Work modes"
                  options={WORK_MODES.map((item) => ({ value: item, label: item }))}
                  selected={selectedWorkModes}
                  onToggle={(value) => setSelectedWorkModes((current) => toggle(current, value))}
                />
              </div>
            </div>
            <Label>
              <FieldLabel>Critical systems</FieldLabel>
              <Textarea
                value={criticalSystems}
                onChange={(event) => setCriticalSystems(event.target.value)}
                rows={3}
                maxLength={LIMITS.criticalSystems}
              />
            </Label>
            <Label>
              <FieldLabel>Security contact role</FieldLabel>
              <Input value={contactRole} onChange={(event) => setContactRole(event.target.value)} maxLength={LIMITS.contactRole} />
            </Label>
            <div className="flex gap-2">
              <Button variant="secondary" type="submit" disabled={policyStreaming} className="flex-1">
                {policyStreaming ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ScrollText size={16} aria-hidden />}
                {policyStreaming ? "Drafting…" : "Generate policy"}
              </Button>
              {policyStreaming && (
                <Button type="button" variant="outline" onClick={stopPolicy} aria-label="Stop policy generation">
                  <Square size={12} aria-hidden />
                  Stop
                </Button>
              )}
            </div>
          </form>
        </RailSection>

        <RailSection icon={<GitCompare size={17} aria-hidden />} title="Compare" id="compare-tools">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setActiveTab("compare");
              runCompare(compareFrom, compareTo);
            }}
            id="version-compare"
            className="grid scroll-mt-16 grid-cols-[1fr_42px_1fr] items-end gap-2 max-sm:grid-cols-1"
          >
            <Label>
              <FieldLabel>From</FieldLabel>
              <Select value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)} disabled={!canUseData}>
                {releases.map((release) => (
                  <option key={release.version} value={release.version}>
                    {release.release}
                  </option>
                ))}
              </Select>
            </Label>
            <Button
              variant="secondary"
              size="icon"
              type="button"
              aria-label="Swap comparison versions"
              onClick={() => {
                setCompareFrom(compareTo);
                setCompareTo(compareFrom);
              }}
            >
              <ArrowRightLeft size={16} aria-hidden />
            </Button>
            <Label>
              <FieldLabel>To</FieldLabel>
              <Select value={compareTo} onChange={(event) => setCompareTo(event.target.value)} disabled={!canUseData}>
                {releases.map((release) => (
                  <option key={release.version} value={release.version}>
                    {release.release}
                  </option>
                ))}
              </Select>
            </Label>
            <Button className="col-span-full" variant="secondary" type="submit" disabled={!canUseData || compareBusy}>
              {compareBusy && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {compareBusy ? "Comparing…" : "Compare releases"}
            </Button>
          </form>
        </RailSection>
      </aside>

      <section
        id="workbench-results"
        className="min-h-[calc(100vh-112px)] scroll-mt-16 overflow-hidden rounded-lg border border-[var(--line)] bg-[oklch(0.989_0.006_92_/_0.92)] shadow-[0_18px_50px_oklch(0.32_0.02_138_/_0.12)] max-lg:min-h-[560px]"
        aria-label="Results"
      >
        {!canUseData ? (
          <EmptyDataState />
        ) : (
          <>
            <div className="grid border-b border-[var(--line)] bg-[var(--paper-2)] md:grid-cols-4">
              <StatusItem icon={<Database size={16} aria-hidden />} label="Index" value={searchResult?.source ?? "local"} />
              <StatusItem icon={<BookOpen size={16} aria-hidden />} label="Release" value={selectedRelease?.release ?? "none"} />
              <StatusItem icon={<Filter size={16} aria-hidden />} label="Controls" value={String(selectedRelease?.count ?? 0)} />
              <StatusItem
                icon={<CheckCircle2 size={16} aria-hidden />}
                label="Synced"
                value={selectedRelease?.syncedAt ? SYNC_DATE.format(new Date(selectedRelease.syncedAt)) : "pending"}
              />
            </div>

            <ResultTabList
              active={activeTab}
              onChange={setActiveTab}
              busy={{
                search: searchBusy !== "idle",
                ask: askStreaming,
                ssp: sspBusy,
                policy: policyStreaming,
                compare: compareBusy,
              }}
              trailing={<CopyLinkButton label="Copy link to view" />}
            />

            <ResultTabPanel tab="search" active={activeTab}>
              <SearchPanel
                result={visibleSearch}
                query={lastSearch?.q ?? pendingSearch.q}
                releaseLabel={releaseLabel}
                busy={searchBusy !== "idle"}
                loadingMore={searchBusy === "more"}
                error={searchError}
                onRetry={() => runSearch(pendingSearch)}
                loadMoreError={loadMoreError}
                canLoadMore={canLoadMore}
                onLoadMore={() => void loadMore()}
                activeFilters={activeFilters}
                onClearFilters={clearFilters}
                onExampleQuery={searchFor}
                exporting={exporting}
                exportError={exportError}
                onExport={() => void exportSearchCsv()}
              />
            </ResultTabPanel>
            <ResultTabPanel tab="ask" active={activeTab}>
              <AskPanel
                result={askResult}
                status={askStatus}
                error={askError}
                onRetry={() => askBody && void runAsk(askBody)}
                onStop={stopAsk}
              />
            </ResultTabPanel>
            <ResultTabPanel tab="ssp" active={activeTab}>
              <SspPanel
                result={sspResult?.response ?? null}
                mode={sspResult?.mode ?? sspMode}
                busy={sspBusy}
                error={sspError}
                onRetry={() => void runSsp()}
              />
            </ResultTabPanel>
            <ResultTabPanel tab="policy" active={activeTab}>
              <PolicyPanel
                result={policyResult}
                status={policyStatus}
                error={policyError}
                onRetry={() => policyBody && void runPolicy(policyBody)}
                onStop={stopPolicy}
              />
            </ResultTabPanel>
            <ResultTabPanel tab="compare" active={activeTab}>
              <ComparePanel
                result={compareResult}
                busy={compareBusy}
                error={compareError}
                onRetry={() => runCompare(compareFrom, compareTo)}
                selectedControlId={selectedControlId}
                onSelectControl={setSelectedControlId}
              />
            </ResultTabPanel>
          </>
        )}
      </section>
    </div>
  );
}
