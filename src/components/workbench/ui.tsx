import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Database, RotateCcw } from "lucide-react";
import type { IsmControl } from "@/lib/ism/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { controlDisplayTitle, controlHref, displayClassification } from "@/components/control-id";
import type { ErrorInfo } from "./api";

export function RailSection({
  icon,
  title,
  id,
  children,
}: {
  icon: ReactNode;
  title: string;
  id?: string;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <Card>
      <CardContent>
        <section aria-labelledby={headingId} id={id} className="scroll-mt-16">
          <div className="mb-3 flex items-center gap-2 text-[var(--accent-strong)]">
            {icon}
            <h2 id={headingId} className="m-0 text-base font-bold text-[var(--ink)]">
              {title}
            </h2>
          </div>
          {children}
        </section>
      </CardContent>
    </Card>
  );
}

/** Accessible, retryable error message for a panel. */
export function ErrorNotice({
  title,
  error,
  onRetry,
  retryLabel = "Retry",
  className,
}: {
  title: string;
  error: ErrorInfo;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-[oklch(0.76_0.1_31)] bg-[oklch(0.968_0.026_31)] p-4 text-[oklch(0.36_0.1_31)]",
        className,
      )}
    >
      <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="m-0 font-bold">{title}</p>
        <p className="m-0 mt-1 leading-relaxed">{error.message}</p>
        {error.details.length > 0 && (
          <ul className="mb-0 mt-2 list-disc space-y-0.5 pl-5 text-sm">
            {error.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
      {onRetry && (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry} className="shrink-0">
          <RotateCcw size={14} aria-hidden />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function TogglePicker({
  options,
  selected,
  onToggle,
  label,
}: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((item) => {
        const active = selected.includes(item.value);
        return (
          <Button
            key={item.value}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => onToggle(item.value)}
            aria-pressed={active}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

export function FilterGroup({
  label,
  summary,
  onClear,
  clearDisabled,
  children,
}: {
  label: string;
  summary: string;
  onClear: () => void;
  clearDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.55)] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--muted)]">
          <span className="font-bold">{label}</span> · {summary}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={clearDisabled} aria-label={`Show all: ${label}`}>
          All
        </Button>
      </div>
      {children}
    </div>
  );
}

export function StatusItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-r border-[var(--line)] px-4 py-3 text-[var(--muted)] last:border-r-0">
      {icon}
      <span>{label}</span>
      <strong className="ml-auto truncate text-sm text-[var(--ink)]">{value}</strong>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: number; tone: "added" | "changed" | "removed" | "quiet" }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
      <span className="block text-xs font-bold text-[var(--muted)]">{label}</span>
      <strong
        className={cn(
          "mt-1 block text-2xl font-bold tabular-nums",
          tone === "added" && "text-[var(--accent-strong)]",
          tone === "changed" && "text-[oklch(0.48_0.11_78)]",
          tone === "removed" && "text-[oklch(0.5_0.15_31)]",
        )}
      >
        {value}
      </strong>
    </div>
  );
}

export function SkeletonState({ label, busy = false }: { label: string; busy?: boolean }) {
  return (
    <div className="grid min-h-[420px] place-items-center p-10 text-center" aria-busy={busy || undefined}>
      <div>
        <div
          className={cn(
            "mx-auto mb-4 size-14 rounded-lg border border-[var(--line)] bg-[var(--paper-2)]",
            busy && "animate-pulse",
          )}
          aria-hidden
        />
        <p className="text-[var(--muted)]">{label}</p>
      </div>
    </div>
  );
}

export function EmptyDataState() {
  return (
    <div className="grid min-h-[420px] place-items-center p-10 text-center text-[var(--accent-strong)]">
      <div>
        <Database size={28} className="mx-auto mb-3" aria-hidden />
        <h2 className="mb-2 text-xl font-bold">No ISM snapshots synced yet</h2>
        <p className="mx-auto max-w-[58ch] leading-relaxed text-[var(--muted)]">
          Run the local sync command, then restart or refresh the app. The sync downloads official ASD OSCAL releases,
          writes local snapshots and indexes Meilisearch when it is available.
        </p>
        <code className="mt-3 inline-flex rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[var(--ink)]">
          pnpm sync:ism
        </code>
      </div>
    </div>
  );
}

export function ControlIdLink({ controlId, className }: { controlId: string; className?: string }) {
  return (
    <Link
      href={controlHref(controlId)}
      className={cn(
        "rounded-sm text-xs font-extrabold uppercase tabular-nums text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[oklch(0.72_0.12_158_/_0.45)]",
        className,
      )}
    >
      {controlId}
    </Link>
  );
}

export function ControlRow({ control, compact = false }: { control: IsmControl; compact?: boolean }) {
  const title = controlDisplayTitle(control);

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-2 flex items-start justify-between gap-4 max-sm:flex-col">
        <div>
          <ControlIdLink controlId={control.controlId} />
          <h3 className="m-0 mt-0.5 text-base font-bold leading-snug">{title}</h3>
        </div>
        <Chip>{control.release}</Chip>
      </div>
      <p className={cn("leading-relaxed text-[var(--muted)]", compact ? "mb-0" : "mb-3")}>{control.statement || control.body}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        <span>{control.chapter}</span>
        <span>{control.topic}</span>
        {control.revision && <span>Rev {control.revision}</span>}
        {control.updated && <span>Updated {control.updated}</span>}
      </div>
      {!compact && (control.applicabilityLabels.length > 0 || control.essentialEight.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {control.applicabilityLabels.map((label) => (
            <Chip key={label}>{displayClassification(label)}</Chip>
          ))}
          {control.essentialEight.map((item) => (
            <Chip key={item} tone="accent">
              Essential Eight {item}
            </Chip>
          ))}
        </div>
      )}
    </article>
  );
}

export function FieldList({ fields, className }: { fields: string[]; className?: string }) {
  if (!fields.length) return null;
  return (
    <div className={cn("flex flex-wrap content-start justify-end gap-1.5", className)} aria-label="Changed fields">
      {fields.map((field) => (
        <Chip key={field}>{field}</Chip>
      ))}
    </div>
  );
}
