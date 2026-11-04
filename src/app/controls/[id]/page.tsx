import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, History, Search } from "lucide-react";
import type { ControlHistory, ControlHistoryEntry, IsmControl } from "@/lib/ism/types";
import { getControlHistory, getManifest } from "@/lib/ism/repository";
import { cn } from "@/lib/utils";
import { CopyLinkButton } from "@/components/copy-button";
import {
  controlDisplayTitle,
  controlHref,
  displayClassification,
  displayRelease,
  normaliseControlId,
  oscalSourceUrl,
} from "@/components/control-id";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { WordDiff } from "@/components/word-diff";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const loadHistory = cache((controlId: string) => getControlHistory(controlId));

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The control as most recently published (latest release, or the last release before removal). */
function displayControl(history: ControlHistory): IsmControl | null {
  return history.latest ?? [...history.entries].reverse().find((entry) => entry.control)?.control ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const controlId = normaliseControlId(decode(id));
  const history = controlId ? await loadHistory(controlId) : null;
  const control = history ? displayControl(history) : null;
  if (!history || !control) return { title: "Control not found | ISM Search Workbench" };
  return {
    title: `${history.controlId} · ${controlDisplayTitle(control)} | ISM Search Workbench`,
    description: control.statement.slice(0, 200),
  };
}

const STATUS_LABEL: Record<ControlHistoryEntry["status"], string> = {
  introduced: "Introduced",
  changed: "Changed",
  unchanged: "Unchanged",
  removed: "Removed",
  reintroduced: "Reintroduced",
};

const STATUS_TONE: Record<ControlHistoryEntry["status"], ChipTone> = {
  introduced: "accent",
  changed: "warn",
  unchanged: "neutral",
  removed: "danger",
  reintroduced: "accent",
};

const FIELD_LABEL: Record<string, string> = {
  statement: "Statement",
  title: "Title",
  chapter: "Chapter",
  section: "Section",
  topic: "Topic",
  revision: "Revision",
  updated: "Updated",
  applicability: "Applicability",
  essentialEight: "Essential Eight",
};

function fieldValue(control: IsmControl | null | undefined, field: string): string {
  if (!control) return "";
  switch (field) {
    case "applicability":
      return control.applicabilityLabels.map(displayClassification).join(", ") || "None listed";
    case "essentialEight":
      return control.essentialEight.join(", ") || "None listed";
    case "title":
      return control.title;
    case "chapter":
      return control.chapter;
    case "section":
      return control.section;
    case "topic":
      return control.topic;
    case "revision":
      return control.revision ?? "Not set";
    case "updated":
      return control.updated ?? "Not set";
    case "statement":
      return control.statement;
    default:
      return "";
  }
}

export default async function ControlPage({ params }: Props) {
  const { id: rawId } = await params;
  const requested = decode(rawId);
  const controlId = normaliseControlId(requested);
  if (!controlId) notFound();
  if (controlId !== requested) redirect(controlHref(controlId));

  const [history, manifest] = await Promise.all([loadHistory(controlId), getManifest()]);
  if (!history) notFound();
  const control = displayControl(history);
  if (!control) notFound();
  if (history.controlId !== controlId) redirect(controlHref(history.controlId));

  const releaseLabel = (version: string | null) =>
    version ? (manifest.releases.find((release) => release.version === version)?.release ?? displayRelease(version)) : "Unknown";
  const oldestSynced = manifest.releases[manifest.releases.length - 1]?.version ?? null;
  const lastEntry = history.entries[history.entries.length - 1];
  const removedEntry = !history.latest && lastEntry?.status === "removed" ? lastEntry : null;
  const sourceVersion = history.latest ? history.latestVersion : history.lastSeen;
  const title = controlDisplayTitle(control);
  const searchHref = `/?${new URLSearchParams({ q: control.topic || title, chapter: control.chapter })}`;
  const chapterHref = `/?${new URLSearchParams({ q: "", chapter: control.chapter })}`;
  const timeline = history.entries.map((entry, index) => ({
    entry,
    previous: history.entries
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.control)?.control ?? null,
  }));

  return (
    <main id="main-content" className="mx-auto w-[min(1180px,calc(100%-32px))] py-6 max-sm:w-[calc(100%-20px)] max-sm:py-4">
      <SiteHeader />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[var(--muted)]">
        <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0">
          <li>
            <Link href="/" className="underline-offset-2 hover:text-[var(--accent-strong)] hover:underline">
              Workbench
            </Link>
          </li>
          {control.chapter && (
            <li className="flex items-center gap-2">
              <span aria-hidden>›</span>
              <Link href={chapterHref} className="underline-offset-2 hover:text-[var(--accent-strong)] hover:underline">
                {control.chapter}
              </Link>
            </li>
          )}
          {control.section && (
            <li className="flex items-center gap-2">
              <span aria-hidden>›</span>
              <span>{control.section}</span>
            </li>
          )}
          <li className="flex items-center gap-2">
            <span aria-hidden>›</span>
            <span aria-current="page" className="font-bold tabular-nums text-[var(--ink)]">
              {history.controlId}
            </span>
          </li>
        </ol>
      </nav>

      <header className="mb-6 grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_8px_28px_oklch(0.32_0.02_138_/_0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold uppercase tabular-nums text-[var(--accent-strong)]">{history.controlId}</span>
              {removedEntry ? (
                <Chip tone="danger" strong>
                  Removed in {removedEntry.release}
                </Chip>
              ) : (
                <Chip tone="accent" strong>
                  Current in {releaseLabel(history.latestVersion)}
                </Chip>
              )}
            </p>
            <h1 className="m-0 mt-1 text-2xl font-bold leading-tight text-[var(--ink)]">{title}</h1>
            {control.topic && control.topic !== title && <p className="m-0 mt-1 text-[var(--muted)]">{control.topic}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyLinkButton label="Copy permalink" variant="secondary" />
            <Link href={searchHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Search size={14} aria-hidden />
              Related controls
            </Link>
            <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft size={14} aria-hidden />
              Back to workbench
            </Link>
          </div>
        </div>

        {removedEntry && (
          <p className="m-0 rounded-md border border-[oklch(0.76_0.1_31)] bg-[oklch(0.968_0.026_31)] p-3 text-sm text-[oklch(0.36_0.1_31)]">
            This control is not in the latest synced release ({releaseLabel(history.latestVersion)}). The text below is from{" "}
            {releaseLabel(history.lastSeen)}, the last release that included it.
          </p>
        )}

        <section aria-labelledby="statement-heading">
          <h2 id="statement-heading" className="mb-1.5 text-xs font-bold uppercase text-[var(--muted)]">
            Statement · {control.release}
          </h2>
          <p className="m-0 max-w-[80ch] text-lg leading-relaxed text-[var(--ink)]">{control.statement || control.body}</p>
        </section>

        <div className="flex flex-wrap gap-2" aria-label="Applicability and maturity">
          {control.applicabilityLabels.map((label) => (
            <Chip key={label}>{displayClassification(label)}</Chip>
          ))}
          {control.essentialEight.map((level) => (
            <Chip key={level} tone="accent">
              Essential Eight {level}
            </Chip>
          ))}
        </div>

        <dl className="m-0 grid gap-x-6 gap-y-3 border-t border-[var(--line)] pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Introduced in">
            {releaseLabel(history.firstSeen)}
            {history.firstSeen && history.firstSeen === oldestSynced && (
              <span className="block text-xs font-normal text-[var(--muted)]">Earliest synced release; may be older</span>
            )}
          </Fact>
          <Fact label="Last seen in">{releaseLabel(history.lastSeen)}</Fact>
          <Fact label="Revision">{control.revision ?? "Not set"}</Fact>
          <Fact label="Updated">{control.updated ?? "Not set"}</Fact>
        </dl>

        {sourceVersion && (
          <p className="m-0 text-sm text-[var(--muted)]">
            Source:{" "}
            <a
              href={oscalSourceUrl(sourceVersion)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[var(--accent-strong)] underline underline-offset-2"
            >
              Official ISM OSCAL catalogue {releaseLabel(sourceVersion)}
              <ExternalLink size={13} aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        )}
      </header>

      <section aria-labelledby="history-heading">
        <div className="mb-3 flex items-center gap-2 text-[var(--accent-strong)]">
          <History size={17} aria-hidden />
          <h2 id="history-heading" className="m-0 text-lg font-bold text-[var(--ink)]">
            Release history
          </h2>
          <span className="text-sm text-[var(--muted)]">
            {history.entries.length} {history.entries.length === 1 ? "event" : "events"} across {manifest.releases.length} synced
            releases · newest first
          </span>
        </div>
        <ol className="m-0 grid list-none gap-3 border-l-2 border-[var(--line)] p-0 pl-4">
          {[...timeline].reverse().map(({ entry, previous }) => (
            <TimelineEntry key={`${entry.version}-${entry.status}`} entry={entry} previous={previous} />
          ))}
        </ol>
      </section>
    </main>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold text-[var(--muted)]">{label}</dt>
      <dd className="m-0 mt-0.5 font-bold tabular-nums text-[var(--ink)]">{children}</dd>
    </div>
  );
}

function TimelineEntry({ entry, previous }: { entry: ControlHistoryEntry; previous: IsmControl | null }) {
  const otherFields = entry.changedFields.filter((field) => field !== "statement");
  const statementChange =
    entry.status === "changed" && entry.changedFields.includes("statement") && previous && entry.control
      ? { before: previous.statement, after: entry.control.statement }
      : null;

  return (
    <li className="relative rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <span
        aria-hidden
        className={cn(
          "absolute -left-[23px] top-5 size-3 rounded-full border-2 border-[var(--panel)]",
          entry.status === "removed" ? "bg-[var(--coral)]" : entry.status === "changed" ? "bg-[var(--amber)]" : "bg-[var(--accent)]",
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-base font-bold tabular-nums">{entry.release}</h3>
        <Chip tone={STATUS_TONE[entry.status]} strong>
          {STATUS_LABEL[entry.status]}
        </Chip>
        {entry.changedFields.map((field) => (
          <Chip key={field}>{FIELD_LABEL[field] ?? field}</Chip>
        ))}
        <a
          href={oscalSourceUrl(entry.version)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          OSCAL source
          <ExternalLink size={12} aria-hidden />
          <span className="sr-only"> for {entry.release} (opens in a new tab)</span>
        </a>
      </div>

      {entry.status === "removed" && (
        <p className="mb-0 mt-2 text-sm text-[var(--muted)]">Not present in this release.</p>
      )}

      {(entry.status === "introduced" || entry.status === "reintroduced") && entry.control && (
        <p className="mb-0 mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--muted)]">{entry.control.statement}</p>
      )}

      {statementChange && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold text-[var(--muted)]">
            Statement change <span className="font-normal">(removed text struck through, added text underlined)</span>
          </p>
          <WordDiff before={statementChange.before} after={statementChange.after} />
        </div>
      )}

      {entry.status === "changed" && otherFields.length > 0 && previous && (
        <dl className="mb-0 mt-3 grid gap-2 text-sm">
          {otherFields.map((field) => (
            <div key={field} className="grid gap-1 sm:grid-cols-[140px_1fr]">
              <dt className="text-xs font-bold text-[var(--muted)]">{FIELD_LABEL[field] ?? field}</dt>
              <dd className="m-0 flex flex-wrap items-baseline gap-x-2 text-[var(--ink)]">
                <span className="text-[oklch(0.4_0.1_31)] line-through decoration-[oklch(0.5_0.12_31)]">
                  <span className="sr-only">Before: </span>
                  {fieldValue(previous, field)}
                </span>
                <span aria-hidden className="text-[var(--muted)]">
                  →
                </span>
                <span className="font-semibold text-[oklch(0.34_0.09_158)]">
                  <span className="sr-only">After: </span>
                  {fieldValue(entry.control, field)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
