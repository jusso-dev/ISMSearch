import Link from "next/link";
import { AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { IsmWorkbench } from "@/components/ism-workbench";
import { advisoryDate, formatFetchedAt, SeverityChip, StaleChip } from "@/components/advisories/advisory-meta";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { parseWorkbenchParams, type RawSearchParams } from "@/components/workbench/url-state";
import { getLatestAdvisories, safeAdvisoryHref, type AcscAdvisoryResult } from "@/lib/acsc/advisories";
import { getFacets, getManifest } from "@/lib/ism/repository";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [manifest, advisoryResult, rawParams] = await Promise.all([
    getManifest(),
    getLatestAdvisories(3).catch(() => null),
    searchParams,
  ]);
  const versions = manifest.releases.map((release) => release.version);
  // Resolve the version first so the chapter can be validated against that release's facets.
  const provisional = parseWorkbenchParams(rawParams, { versions });
  const facets = provisional.version ? await getFacets(provisional.version).catch(() => null) : null;
  const initialState = parseWorkbenchParams(rawParams, { versions, chapters: facets?.chapters ?? undefined });

  return (
    <main id="main-content" className="mx-auto w-[min(1520px,calc(100%-32px))] py-6 max-sm:w-[calc(100%-20px)] max-sm:py-3">
      <header className="flex items-center justify-between gap-6 pb-6 max-sm:grid">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--accent-strong)] shadow-[0_8px_22px_oklch(0.32_0.02_138_/_0.08)]">
            <ShieldCheck size={18} aria-hidden />
          </span>
          <div>
            <p className="mb-0.5 text-xs font-bold uppercase text-[var(--muted)]">Local ISM intelligence</p>
            <h1 className="m-0 text-2xl font-bold leading-tight text-[var(--ink)]">ISM Search Workbench</h1>
          </div>
        </div>
        <div className="grid justify-items-end gap-2 text-sm text-[var(--muted)] max-sm:justify-items-start">
          <AppNav active="home" />
          <div className="flex flex-wrap justify-end gap-2 max-sm:justify-start">
            <Chip className="px-3 text-sm">
              {manifest.releases.length ? `${manifest.releases.length} synced releases` : "No synced releases"}
            </Chip>
            <Chip className="px-3 text-sm">{manifest.source}</Chip>
          </div>
        </div>
      </header>

      <AdvisoryStrip result={advisoryResult} />
      <IsmWorkbench manifest={manifest} initialState={initialState} initialChapters={facets?.chapters ?? null} />
    </main>
  );
}

function AdvisoryStrip({ result }: { result: AcscAdvisoryResult | null }) {
  if (!result || result.advisories.length === 0) {
    return (
      <section aria-labelledby="advisory-strip-heading" className="mb-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-center justify-between gap-4 max-sm:grid">
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-[var(--muted)]">ACSC advisories</p>
            <h2 id="advisory-strip-heading" className="m-0 text-base font-bold text-[var(--ink)]">
              {result ? "The advisory snapshot is empty" : "No advisory snapshot yet"}
            </h2>
            <p className="mb-0 mt-1 text-sm text-[var(--muted)]">
              Run <code className="rounded bg-[var(--paper-2)] px-1 py-0.5 text-[var(--ink)]">pnpm sync:acsc</code> to
              fetch the latest alerts and advisories from Cyber.gov.au.
            </p>
          </div>
          <Link href="/advisories" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit")}>
            View page
          </Link>
        </div>
      </section>
    );
  }

  const leading = result.advisories[0];
  const leadingHref = safeAdvisoryHref(leading.href);
  const urgentCount = result.advisories.filter((item) => item.severity === "Critical" || item.severity === "High").length;

  return (
    <section
      aria-labelledby="advisory-strip-heading"
      className="mb-5 rounded-lg border border-[var(--line)] bg-[oklch(0.986_0.006_92_/_0.92)] p-4"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,560px)]">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--accent-strong)]">
            <AlertTriangle size={17} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase text-[var(--muted)]">
              <span>Latest ACSC advisory</span>
              <span aria-hidden>·</span>
              <time dateTime={leading.published ?? undefined} className="normal-case">
                Published {advisoryDate(leading)}
              </time>
            </p>
            <h2 id="advisory-strip-heading" className="m-0 text-base font-bold text-[var(--ink)]">
              {leading.title}
            </h2>
            <p className="mt-1 max-w-[92ch] truncate text-sm text-[var(--muted)]">{leading.summary}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 max-lg:justify-start">
          <SeverityChip advisory={leading} />
          <Chip strong>
            {urgentCount} of {result.advisories.length} recent critical or high
          </Chip>
          <StaleChip fetchedAt={result.fetchedAt} />
          <span className="w-full text-right text-xs text-[var(--muted)] max-lg:text-left">
            Last updated {formatFetchedAt(result.fetchedAt)}
          </span>
          {leadingHref && (
            <a
              href={leadingHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <ExternalLink size={14} aria-hidden />
              Read latest<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <Link href="/advisories" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            View all {result.total}
          </Link>
        </div>
      </div>
    </section>
  );
}
