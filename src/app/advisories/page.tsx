import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ExternalLink, RadioTower, ShieldAlert } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { advisoryDate, formatFetchedAt, SeverityChip, StaleChip } from "@/components/advisories/advisory-meta";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ACSC_ADVISORIES_URL, getLatestAdvisories, safeAdvisoryHref, type AcscAdvisory } from "@/lib/acsc/advisories";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ACSC alerts and advisories | ISM Search Workbench",
};

const PAGE_LIMIT = 30;

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "alert", label: "Alerts" },
  { value: "advisory", label: "Advisories" },
] as const;

const SEVERITY_FILTERS = [
  { value: "", label: "Any severity" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number]["value"];
type SeverityFilter = (typeof SEVERITY_FILTERS)[number]["value"];

function firstParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.toLowerCase() ?? "";
}

function pick<T extends string>(value: string, allowed: readonly { value: T }[]): T {
  return (allowed.find((item) => item.value === value)?.value ?? "") as T;
}

function filterHref(type: TypeFilter, severity: SeverityFilter) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (severity) params.set("severity", severity);
  const query = params.toString();
  return query ? `/advisories?${query}` : "/advisories";
}

function matches(advisory: AcscAdvisory, type: TypeFilter, severity: SeverityFilter) {
  if (type && advisory.type.toLowerCase() !== type) return false;
  if (severity && advisory.severity?.toLowerCase() !== severity) return false;
  return true;
}

export default async function AdvisoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const type = pick<TypeFilter>(firstParam(params.type), TYPE_FILTERS);
  const severity = pick<SeverityFilter>(firstParam(params.severity), SEVERITY_FILTERS);

  // Read the whole snapshot so filtering happens before the display limit.
  const result = await getLatestAdvisories(Number.MAX_SAFE_INTEGER).catch(() => null);
  const all = result?.advisories ?? [];
  const filtered = all.filter((advisory) => matches(advisory, type, severity));
  const shown = filtered.slice(0, PAGE_LIMIT);
  const urgent = all.filter((item) => item.severity === "Critical" || item.severity === "High").length;
  const filtersActive = Boolean(type || severity);

  return (
    <main id="main-content" className="mx-auto w-[min(1180px,calc(100%-32px))] py-8 max-sm:w-[calc(100%-20px)] max-sm:py-4">
      <div className="mb-6">
        <AppNav active="advisories" />
      </div>
      <header className="mb-7 flex items-start justify-between gap-4 max-sm:grid">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-[var(--muted)]">Official ACSC source</p>
          <h1 className="m-0 text-3xl font-bold text-[var(--ink)]">Latest alerts and advisories</h1>
          <p className="mt-3 max-w-[72ch] leading-relaxed text-[var(--muted)]">
            Recent public cyber security alerts and advisories from Cyber.gov.au, surfaced beside the ISM search workflow
            so practitioners can move from current threat context to control review.
          </p>
        </div>
        <a
          href={safeAdvisoryHref(result?.sourceUrl) ?? ACSC_ADVISORIES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "secondary" }), "shrink-0")}
        >
          <ExternalLink size={16} aria-hidden />
          Open Cyber.gov.au<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </header>

      <section aria-label="Snapshot summary" className="mb-5 grid gap-3 md:grid-cols-3">
        <SummaryTile icon={<RadioTower size={18} aria-hidden />} label="Last updated">
          <span className="flex flex-wrap items-center gap-2">
            {result ? formatFetchedAt(result.fetchedAt) : "No snapshot"}
            {result && <StaleChip fetchedAt={result.fetchedAt} />}
          </span>
        </SummaryTile>
        <SummaryTile icon={<ShieldAlert size={18} aria-hidden />} label="Items">
          {result ? `${result.total} in snapshot` : "0"}
        </SummaryTile>
        <SummaryTile icon={<AlertTriangle size={18} aria-hidden />} label="Critical or high">
          {urgent}
        </SummaryTile>
      </section>

      {!result ? (
        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
          <h2 className="m-0 text-lg font-bold text-[var(--ink)]">No advisory snapshot yet</h2>
          <p className="mb-0 mt-2 leading-relaxed text-[var(--muted)]">
            The app reads a local snapshot and never fetches Cyber.gov.au at request time. Run{" "}
            <code className="rounded bg-[var(--paper-2)] px-1 py-0.5 text-[var(--ink)]">pnpm sync:acsc</code> (or let the
            jobs worker run it) to create one.
          </p>
        </section>
      ) : (
        <>
          <nav aria-label="Filter advisories" className="mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
            <FilterRow label="Type">
              {TYPE_FILTERS.map((item) => (
                <FilterLink key={item.value || "all"} href={filterHref(item.value, severity)} active={type === item.value}>
                  {item.label}
                </FilterLink>
              ))}
            </FilterRow>
            <FilterRow label="Severity">
              {SEVERITY_FILTERS.map((item) => (
                <FilterLink key={item.value || "any"} href={filterHref(type, item.value)} active={severity === item.value}>
                  {item.label}
                </FilterLink>
              ))}
            </FilterRow>
          </nav>

          <p className="mb-3 text-sm text-[var(--muted)]" aria-live="polite">
            Showing <strong className="tabular-nums text-[var(--ink)]">{shown.length}</strong> of{" "}
            <strong className="tabular-nums text-[var(--ink)]">{filtered.length}</strong>
            {filtersActive ? ` matching (${result.total} total)` : " advisories"}
            {filtered.length > PAGE_LIMIT && ` · the ${PAGE_LIMIT} most recent are listed`}
          </p>

          {shown.length === 0 ? (
            <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
              <h2 className="m-0 text-lg font-bold text-[var(--ink)]">No advisories match these filters</h2>
              <Link href="/advisories" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")}>
                Clear filters
              </Link>
            </section>
          ) : (
            <ol className="m-0 grid list-none gap-3 p-0">
              {shown.map((advisory, index) => (
                <AdvisoryItem key={advisory.objectID ?? `${advisory.href}-${index}`} advisory={advisory} />
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}

function SummaryTile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-2 flex items-center gap-2 text-[var(--accent-strong)]">
        {icon}
        <span className="text-xs font-bold uppercase">{label}</span>
      </div>
      <div className="m-0 font-bold text-[var(--ink)]">{children}</div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-xs font-bold text-[var(--muted)]">{label}</span>
      {children}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(buttonVariants({ variant: active ? "default" : "outline", size: "sm" }), "rounded-full")}
    >
      {children}
    </Link>
  );
}

function AdvisoryItem({ advisory }: { advisory: AcscAdvisory }) {
  const href = safeAdvisoryHref(advisory.href);
  return (
    <li className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <article>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SeverityChip advisory={advisory} />
          <Chip strong>
            <time dateTime={advisory.published ?? undefined}>{advisoryDate(advisory)}</time>
          </Chip>
        </div>
        <div className="flex items-start justify-between gap-4 max-sm:grid">
          <div>
            <h2 className="m-0 text-lg font-bold text-[var(--ink)]">{advisory.title}</h2>
            {advisory.summary && <p className="mt-2 max-w-[86ch] leading-relaxed text-[var(--muted)]">{advisory.summary}</p>}
            {advisory.audiences.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Audiences">
                {advisory.audiences.map((audience) => (
                  <Chip key={audience}>{audience}</Chip>
                ))}
              </div>
            )}
          </div>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
            >
              <ExternalLink size={14} aria-hidden />
              Read<span className="sr-only"> {advisory.title} on Cyber.gov.au (opens in a new tab)</span>
            </a>
          ) : (
            <span className="shrink-0 text-xs text-[var(--muted)]">Link unavailable</span>
          )}
        </div>
      </article>
    </li>
  );
}
