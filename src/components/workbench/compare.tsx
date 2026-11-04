import { Download, ExternalLink, SplitSquareHorizontal } from "lucide-react";
import Link from "next/link";
import type { CompareChange, IsmControl } from "@/lib/ism/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { controlDisplayTitle, controlHref, displayClassification, displayRelease } from "@/components/control-id";
import type { ErrorInfo } from "./api";
import type { CompareResponse } from "./constants";
import { downloadDiffCsv } from "./exports";
import { ControlIdLink, ErrorNotice, FieldList, SkeletonState, Stat } from "./ui";

const STATUS_TONE = {
  added: "accent",
  changed: "warn",
  removed: "danger",
  unchanged: "neutral",
} as const;

export function ComparePanel({
  result,
  busy,
  error,
  onRetry,
  selectedControlId,
  onSelectControl,
}: {
  result: CompareResponse | null;
  busy: boolean;
  error: ErrorInfo | null;
  onRetry: () => void;
  selectedControlId: string | null;
  onSelectControl: (controlId: string) => void;
}) {
  if (error) {
    return (
      <div className="p-4">
        <ErrorNotice title="Release comparison failed" error={error} onRetry={onRetry} />
      </div>
    );
  }
  if (!result) return <SkeletonState busy={busy} label={busy ? "Comparing releases…" : "Compare two synced ISM releases."} />;

  const selectedChange = result.changes.find((change) => change.controlId === selectedControlId) ?? result.changes[0];

  return (
    <div className={cn("p-4 transition-opacity duration-200", busy && "opacity-60")} aria-busy={busy || undefined}>
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <Stat label="Added" value={result.added} tone="added" />
        <Stat label="Changed" value={result.changed} tone="changed" />
        <Stat label="Removed" value={result.removed} tone="removed" />
        <Stat label="Unchanged" value={result.unchanged} tone="quiet" />
      </div>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 max-sm:flex-col max-sm:items-stretch">
        <p className="m-0 text-sm text-[var(--muted)]">
          Diffing <strong>{displayRelease(result.from)}</strong> to <strong>{displayRelease(result.to)}</strong>
        </p>
        <Button type="button" variant="secondary" onClick={() => downloadDiffCsv(result)} disabled={!result.changes.length}>
          <Download size={16} aria-hidden />
          Download diff CSV
        </Button>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(280px,34%)_1fr]">
        <div className="max-h-[calc(100vh-318px)] overflow-auto pr-1 max-sm:max-h-96">
          <div className="mb-3 flex items-center gap-2 text-[var(--accent-strong)]">
            <SplitSquareHorizontal size={16} aria-hidden />
            <h3 id="changed-controls-heading" className="m-0 text-base font-bold text-[var(--ink)]">
              Changed controls
            </h3>
          </div>
          {result.changes.length === 0 ? (
            <p className="text-[var(--muted)]">No changed controls between these releases.</p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0" aria-labelledby="changed-controls-heading">
              {result.changes.map((change) => {
                const selected = selectedChange?.controlId === change.controlId;
                return (
                  <li
                    key={change.controlId}
                    className={cn(
                      "relative rounded-lg border transition-colors duration-150",
                      change.status === "added" && "bg-[oklch(0.963_0.027_158)]",
                      change.status === "changed" && "bg-[oklch(0.967_0.033_78)]",
                      change.status === "removed" && "bg-[oklch(0.965_0.027_31)]",
                      selected
                        ? "border-[var(--accent)] shadow-[inset_3px_0_0_var(--accent)]"
                        : "border-[var(--line)]",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={selected}
                      className="grid w-full grid-cols-[1fr_auto] gap-4 rounded-lg p-4 pr-12 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[oklch(0.72_0.12_158_/_0.45)]"
                      onClick={() => onSelectControl(change.controlId)}
                    >
                      <div>
                        <span className="text-xs font-extrabold uppercase text-[var(--ink)]">
                          {change.status}
                          {selected && <span className="sr-only"> (selected)</span>}
                        </span>
                        <span className="mb-2 mt-0.5 block text-base font-bold tabular-nums">{change.controlId}</span>
                        <span className="line-clamp-3 block leading-relaxed text-[var(--muted)]">
                          {change.to?.statement ?? change.from?.statement}
                        </span>
                      </div>
                      <FieldList fields={change.changedFields} />
                    </button>
                    <Link
                      href={controlHref(change.controlId)}
                      aria-label={`Open ${change.controlId} history`}
                      title={`Open ${change.controlId} history`}
                      className="absolute right-2 top-2 grid size-8 place-items-center rounded-md text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[oklch(0.72_0.12_158_/_0.45)]"
                    >
                      <ExternalLink size={14} aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DiffViewer change={selectedChange} fromVersion={result.from} toVersion={result.to} />
      </div>
    </div>
  );
}

function DiffViewer({ change, fromVersion, toVersion }: { change?: CompareChange; fromVersion: string; toVersion: string }) {
  if (!change) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center text-[var(--accent-strong)]">
        <div>
          <SplitSquareHorizontal size={24} className="mx-auto mb-3" aria-hidden />
          <h3 className="mb-2 text-lg font-bold">Select a changed control</h3>
          <p className="mx-auto max-w-[48ch] leading-relaxed text-[var(--muted)]">
            Controls with additions, removals or text changes appear here as a side-by-side release diff.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={`Diff for ${change.controlId}`}
      className="min-w-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--paper-2)] p-4 max-sm:flex-col">
        <div>
          <Chip tone={STATUS_TONE[change.status]} strong>
            {change.status}
          </Chip>
          <h3 className="m-0 mt-1.5 text-lg font-bold">
            <ControlIdLink controlId={change.controlId} className="text-lg normal-case" />
          </h3>
        </div>
        <FieldList fields={change.changedFields} />
      </div>
      <div className="grid md:grid-cols-2">
        <DiffColumn label="From" version={fromVersion} control={change.from} compareAgainst={change.to} side="from" />
        <DiffColumn label="To" version={toVersion} control={change.to} compareAgainst={change.from} side="to" />
      </div>
    </section>
  );
}

function location(control?: IsmControl) {
  if (!control) return undefined;
  return [control.chapter, control.section].filter(Boolean).join(" › ");
}

function DiffColumn({
  label,
  version,
  control,
  compareAgainst,
  side,
}: {
  label: string;
  version: string;
  control?: IsmControl;
  compareAgainst?: IsmControl;
  side: "from" | "to";
}) {
  return (
    <article
      className={cn(
        "min-w-0 p-4 md:border-r md:border-[var(--line)] md:last:border-r-0",
        side === "from" ? "bg-[oklch(0.975_0.012_31)]" : "bg-[oklch(0.975_0.014_158)]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold text-[var(--muted)]">
        <span>{label}</span>
        <strong className="text-[var(--ink)]">{displayRelease(version)}</strong>
      </div>
      {control ? (
        <>
          <DiffField
            label="Title"
            value={controlDisplayTitle(control)}
            compareValue={compareAgainst ? controlDisplayTitle(compareAgainst) : undefined}
            side={side}
            heading
          />
          <DiffField label="Statement" value={control.statement} compareValue={compareAgainst?.statement} side={side} prose />
          <DiffField label="Location" value={location(control)} compareValue={location(compareAgainst)} side={side} />
          <DiffField label="Topic" value={control.topic} compareValue={compareAgainst?.topic} side={side} />
          <DiffField label="Revision" value={control.revision} compareValue={compareAgainst?.revision} side={side} />
          <DiffField label="Updated" value={control.updated} compareValue={compareAgainst?.updated} side={side} />
          <DiffField
            label="Applicability"
            value={control.applicabilityLabels.map(displayClassification).join(", ")}
            compareValue={compareAgainst?.applicabilityLabels.map(displayClassification).join(", ")}
            side={side}
          />
          <DiffField
            label="Essential Eight"
            value={control.essentialEight.join(", ") || "None listed"}
            compareValue={compareAgainst ? compareAgainst.essentialEight.join(", ") || "None listed" : undefined}
            side={side}
          />
        </>
      ) : (
        <p className="grid min-h-44 place-items-center rounded-lg border border-dashed border-[var(--line-strong)] text-center text-[var(--muted)]">
          This control does not exist in this release.
        </p>
      )}
    </article>
  );
}

function DiffField({
  label,
  value,
  compareValue,
  side,
  prose = false,
  heading = false,
}: {
  label: string;
  value?: string | null;
  compareValue?: string | null;
  side: "from" | "to";
  prose?: boolean;
  heading?: boolean;
}) {
  // Only highlight when the other side exists; added/removed controls are not "changed" field by field.
  const changed = compareValue !== undefined && (value ?? "") !== (compareValue ?? "");

  return (
    <div className="border-t border-[oklch(0.86_0.012_92_/_0.72)] py-3 first:border-t-0 first:pt-0">
      <span className="mb-1 flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
        {label}
        {changed && <span className="font-extrabold uppercase text-[var(--ink)]">{side === "from" ? "· before" : "· after"}</span>}
      </span>
      <p
        className={cn(
          "m-0 leading-relaxed text-[var(--ink)]",
          heading && "text-base font-bold leading-snug",
          prose && "max-w-[72ch]",
          changed && "rounded-md p-2",
          changed && side === "from" && "bg-[oklch(0.925_0.045_31)] text-[oklch(0.37_0.09_31)]",
          changed && side === "to" && "bg-[oklch(0.925_0.05_158)] text-[oklch(0.32_0.09_158)]",
        )}
      >
        {value || "Not set"}
      </p>
    </div>
  );
}
