"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Download, FilterX, Loader2, Square } from "lucide-react";
import type { SearchResponse } from "@/lib/ism/types";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { controlHref, controlIdFromQuery, displayRelease } from "@/components/control-id";
import type { ErrorInfo } from "./api";
import { EXAMPLE_QUERIES, type AskResponse, type PolicyResponse, type SspMode, type SspResponse, type StreamStatus } from "./constants";
import { downloadPolicyDocx, downloadPolicyPdf, downloadSspCsv } from "./exports";
import { MarkdownPreview } from "./markdown";
import { ControlIdLink, ControlRow, ErrorNotice, SkeletonState } from "./ui";

export type ActiveFilter = { key: string; label: string };

export function SearchPanel({
  result,
  query,
  releaseLabel,
  busy,
  loadingMore,
  error,
  onRetry,
  loadMoreError,
  canLoadMore,
  onLoadMore,
  activeFilters,
  onClearFilters,
  onExampleQuery,
  exporting,
  exportError,
  onExport,
}: {
  result: SearchResponse | null;
  query: string;
  releaseLabel: string;
  busy: boolean;
  loadingMore: boolean;
  error: ErrorInfo | null;
  onRetry: () => void;
  loadMoreError: ErrorInfo | null;
  canLoadMore: boolean;
  onLoadMore: () => void;
  activeFilters: ActiveFilter[];
  onClearFilters: () => void;
  onExampleQuery: (query: string) => void;
  exporting: boolean;
  exportError: ErrorInfo | null;
  onExport: () => void;
}) {
  if (error) {
    // A failed search replaces stale results so they cannot be mistaken for the new query.
    return (
      <div className="p-4">
        <ErrorNotice title="Search failed" error={error} onRetry={onRetry} />
      </div>
    );
  }
  if (!result) {
    return <SkeletonState busy={busy} label={busy ? `Searching release ${releaseLabel}…` : "Run a search to populate controls."} />;
  }

  const queryLabel = result.query.trim() ? `“${result.query}”` : "all controls";
  const total = result.estimatedTotalHits;

  if (result.hits.length === 0) {
    return (
      <div className={cn("p-4 transition-opacity duration-200", busy && "opacity-60")} aria-busy={busy || undefined}>
        <ZeroResults
          query={query}
          queryLabel={queryLabel}
          releaseLabel={releaseLabel}
          activeFilters={activeFilters}
          onClearFilters={onClearFilters}
          onExampleQuery={onExampleQuery}
        />
      </div>
    );
  }

  return (
    <div className="p-4" aria-busy={busy || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 text-[var(--muted)]">
        <p className="m-0">
          Showing <strong className="tabular-nums text-[var(--ink)]">{result.hits.length}</strong> of{" "}
          <strong className="tabular-nums text-[var(--ink)]">{total}</strong> matches for <strong className="text-[var(--ink)]">{queryLabel}</strong>{" "}
          in {releaseLabel}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums">{busy && !loadingMore ? "Updating…" : `${result.processingTimeMs} ms`}</span>
          <Button type="button" variant="secondary" size="sm" onClick={onExport} disabled={exporting || busy}>
            {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Download size={14} aria-hidden />}
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
          {activeFilters.map((filter) => (
            <Chip key={filter.key} tone="accent">
              {filter.label}
            </Chip>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
            <FilterX size={14} aria-hidden />
            Clear filters
          </Button>
        </div>
      )}
      {exportError && <ErrorNotice className="mb-3" title="CSV export failed" error={exportError} onRetry={onExport} />}
      <div className={cn("grid gap-3 transition-opacity duration-200", busy && !loadingMore && "opacity-60")}>
        {result.hits.map((control, index) => (
          <ControlRow key={`${control.objectID}-${index}`} control={control} />
        ))}
      </div>
      {loadMoreError && (
        <ErrorNotice className="mt-3" title="Could not load more results" error={loadMoreError} onRetry={onLoadMore} />
      )}
      {canLoadMore && (
        <div className="mt-4 grid justify-items-center gap-2">
          <Button type="button" variant="secondary" onClick={onLoadMore} disabled={loadingMore || busy}>
            {loadingMore && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
          <span className="text-xs tabular-nums text-[var(--muted)]">
            Showing {result.hits.length} of {total}
          </span>
        </div>
      )}
    </div>
  );
}

function ZeroResults({
  query,
  queryLabel,
  releaseLabel,
  activeFilters,
  onClearFilters,
  onExampleQuery,
}: {
  query: string;
  queryLabel: string;
  releaseLabel: string;
  activeFilters: ActiveFilter[];
  onClearFilters: () => void;
  onExampleQuery: (query: string) => void;
}) {
  const controlId = controlIdFromQuery(query);

  return (
    <div className="mx-auto grid max-w-[64ch] gap-4 py-10 text-center">
      <div>
        <h3 className="m-0 text-lg font-bold">No controls match {queryLabel}</h3>
        <p className="mt-2 leading-relaxed text-[var(--muted)]">
          Nothing in release {releaseLabel} matched this query
          {activeFilters.length ? " with the active filters" : ""}. Try broader terms or remove a filter.
        </p>
      </div>
      {controlId && (
        <Link href={controlHref(controlId)} className={cn(buttonVariants({ variant: "default" }), "mx-auto w-fit")}>
          Open control {controlId}
          <ArrowRight size={16} aria-hidden />
        </Link>
      )}
      {activeFilters.length > 0 && (
        <div className="grid justify-items-center gap-2">
          <div className="flex flex-wrap justify-center gap-2" aria-label="Active filters">
            {activeFilters.map((filter) => (
              <Chip key={filter.key} tone="accent">
                {filter.label}
              </Chip>
            ))}
          </div>
          <Button type="button" variant="secondary" onClick={onClearFilters}>
            <FilterX size={16} aria-hidden />
            Clear filters
          </Button>
        </div>
      )}
      <div className="grid justify-items-center gap-2">
        <span className="text-xs font-bold text-[var(--muted)]">Try an example</span>
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_QUERIES.map((item) => (
            <Button key={item} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onExampleQuery(item)}>
              {item}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StreamControls({ status, onStop }: { status: StreamStatus; onStop: () => void }) {
  if (status !== "streaming") return null;
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onStop}>
      <Square size={12} aria-hidden />
      Stop
    </Button>
  );
}

export function AskPanel({
  result,
  status,
  error,
  onRetry,
  onStop,
}: {
  result: AskResponse | null;
  status: StreamStatus;
  error: ErrorInfo | null;
  onRetry: () => void;
  onStop: () => void;
}) {
  const streaming = status === "streaming";

  if (!result) {
    if (error) {
      return (
        <div className="p-4">
          <ErrorNotice title="Question failed" error={error} onRetry={onRetry} />
        </div>
      );
    }
    return (
      <SkeletonState
        busy={streaming}
        label={streaming ? "Retrieving controls and starting the Ollama stream…" : "Ask a question to retrieve controls and query Ollama."}
      />
    );
  }

  return (
    <div className="grid gap-4 p-4">
      <article
        className="rounded-lg border border-[var(--line)] bg-gradient-to-b from-[var(--panel)] to-[oklch(0.965_0.018_158)] p-4"
        aria-busy={streaming || undefined}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-[var(--accent-strong)]">
            {streaming ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Bot size={17} aria-hidden />}
            <span>{result.degraded ? "Retrieval fallback" : (result.model ?? "Ollama")}</span>
            <Chip>Release {displayRelease(result.retrieval.version)}</Chip>
            {status === "incomplete" && (
              <Chip tone="warn" strong>
                Incomplete
              </Chip>
            )}
          </div>
          <StreamControls status={status} onStop={onStop} />
        </div>
        <p className="m-0 text-sm text-[var(--muted)]">
          <span className="font-bold">Question:</span> {result.question}
        </p>
        <MarkdownPreview content={result.answer || (streaming ? "_Waiting for first token…_" : "")} />
      </article>
      {error && <ErrorNotice title="The answer stream did not finish" error={error} onRetry={onRetry} retryLabel="Ask again" />}
      <div>
        <h3 className="mb-3 text-base font-bold">Evidence controls</h3>
        {result.retrieval.hits.length === 0 ? (
          <p className="text-[var(--muted)]">No controls were retrieved for this question.</p>
        ) : (
          <div className="grid gap-3">
            {result.retrieval.hits.map((control, index) => (
              <ControlRow key={`${control.objectID}-${index}`} control={control} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SSP_PAGE = 25;

export function SspPanel({
  result,
  mode,
  busy,
  error,
  onRetry,
}: {
  result: SspResponse | null;
  mode: SspMode;
  busy: boolean;
  error: ErrorInfo | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="p-4">
        <ErrorNotice title="SSP generation failed" error={error} onRetry={onRetry} />
      </div>
    );
  }
  if (!result) {
    return (
      <SkeletonState
        busy={busy}
        label={busy ? "Mapping controls to the system boundary…" : "Describe the system boundary to generate an SSP CSV."}
      />
    );
  }
  // Keyed by generation time so the visible row count resets for each new plan.
  return <SspResult key={result.generatedAt} result={result} mode={mode} busy={busy} />;
}

function SspResult({ result, mode, busy }: { result: SspResponse; mode: SspMode; busy: boolean }) {
  const [visible, setVisible] = useState(SSP_PAGE);
  const rows = result.rows.slice(0, visible);

  return (
    <div className={cn("grid gap-4 p-4 transition-opacity duration-200", busy && "opacity-60")} aria-busy={busy || undefined}>
      <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col">
          <div>
            <span className="text-xs font-extrabold uppercase text-[var(--accent-strong)]">
              System Security Plan · {mode === "baseline" ? "Full baseline" : "Relevant to boundary"}
            </span>
            <h3 className="m-0 mt-1 text-lg font-bold">
              {result.rows.length} mapped controls · release {displayRelease(result.version)}
            </h3>
            <p className="mt-2 max-w-[75ch] leading-relaxed text-[var(--muted)]">{result.boundary}</p>
          </div>
          <Button type="button" onClick={() => downloadSspCsv(result)} disabled={!result.rows.length}>
            <Download size={16} aria-hidden />
            Download CSV
          </Button>
        </div>
      </article>
      {result.rows.length === 0 ? (
        <p className="text-[var(--muted)]">No controls matched this boundary and filter combination.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((row, index) => (
            <article key={`${row.controlId}-${index}`} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <ControlIdLink controlId={row.controlId} />
                  <h3 className="m-0 mt-0.5 text-base font-bold">{row.controlTitle}</h3>
                </div>
                <Chip>{row.implementationStatus}</Chip>
              </div>
              <p className="mb-3 leading-relaxed text-[var(--muted)]">{row.controlStatement}</p>
              <div className="flex flex-wrap gap-2">
                <Chip>{displayRelease(row.ismVersion)}</Chip>
                {row.classificationApplicability && <Chip>{row.classificationApplicability}</Chip>}
                {row.ismSection && <Chip>{row.ismSection}</Chip>}
              </div>
            </article>
          ))}
        </div>
      )}
      {result.rows.length > visible && (
        <div className="grid justify-items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setVisible((count) => count + SSP_PAGE)}>
            Show more rows
          </Button>
          <span className="text-xs tabular-nums text-[var(--muted)]">
            Previewing {rows.length} of {result.rows.length}; the CSV includes every row.
          </span>
        </div>
      )}
    </div>
  );
}

export function PolicyPanel({
  result,
  status,
  error,
  onRetry,
  onStop,
}: {
  result: PolicyResponse | null;
  status: StreamStatus;
  error: ErrorInfo | null;
  onRetry: () => void;
  onStop: () => void;
}) {
  const streaming = status === "streaming";

  if (!result) {
    if (error) {
      return (
        <div className="p-4">
          <ErrorNotice title="Policy generation failed" error={error} onRetry={onRetry} />
        </div>
      );
    }
    return (
      <SkeletonState
        busy={streaming}
        label={streaming ? "Ollama is drafting the policy…" : "Choose a policy type and organisation details to generate a policy draft."}
      />
    );
  }

  const exportable = status === "complete" && Boolean(result.content);

  return (
    <div className="grid gap-4 p-4">
      <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col">
          <div>
            <span className="text-xs font-extrabold uppercase text-[var(--accent-strong)]">
              {streaming ? "Streaming from Ollama" : result.degraded ? "Template fallback" : (result.model ?? "Ollama")}
            </span>
            <h3 className="m-0 mt-1 flex flex-wrap items-center gap-2 text-lg font-bold">
              {result.title}
              {status === "incomplete" && (
                <Chip tone="warn" strong>
                  Incomplete draft
                </Chip>
              )}
            </h3>
            <p className="mt-2 leading-relaxed text-[var(--muted)]">
              {result.orgName} | {result.orgSize} | {result.industry} | {result.jurisdiction}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StreamControls status={status} onStop={onStop} />
            <Button type="button" variant="secondary" onClick={() => void downloadPolicyDocx(result)} disabled={!exportable}>
              <Download size={16} aria-hidden />
              DOCX
            </Button>
            <Button type="button" onClick={() => void downloadPolicyPdf(result)} disabled={!exportable}>
              <Download size={16} aria-hidden />
              PDF
            </Button>
          </div>
        </div>
        {status === "incomplete" && (
          <p className="mb-0 mt-3 text-sm text-[var(--muted)]">
            Export is disabled because this draft did not finish. Generate it again to export DOCX or PDF.
          </p>
        )}
      </article>
      {error && <ErrorNotice title="The policy stream did not finish" error={error} onRetry={onRetry} retryLabel="Generate again" />}
      <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5" aria-busy={streaming || undefined}>
        <MarkdownPreview content={result.content || (streaming ? "_Waiting for first token…_" : "")} />
      </article>
    </div>
  );
}
