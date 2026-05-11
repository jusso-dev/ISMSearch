import { AlertTriangle, Clock, DatabaseZap, Play, RefreshCw } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getJobsSnapshot, type JobSummary, type QueueSummary } from "@/lib/jobs/queues";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatDate(value?: number) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString();
}

function statusTone(status: string) {
  if (status === "completed") return "border-[oklch(0.75_0.08_158)] bg-[oklch(0.965_0.025_158)] text-[oklch(0.32_0.09_158)]";
  if (status === "active") return "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  if (status === "failed") return "border-[oklch(0.76_0.1_31)] bg-[oklch(0.968_0.026_31)] text-[oklch(0.38_0.1_31)]";
  return "border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] text-[var(--muted)]";
}

function progressText(progress: unknown) {
  if (typeof progress === "string") return progress;
  if (typeof progress === "number") return `${progress}%`;
  if (progress && typeof progress === "object") return JSON.stringify(progress);
  return "Queued";
}

export default async function JobsPage() {
  let queues: QueueSummary[] = [];
  let error: string | null = null;

  try {
    queues = await getJobsSnapshot();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load BullMQ jobs";
  }

  const activeCount = queues.reduce((sum, queue) => sum + (queue.counts.active ?? 0), 0);
  const failedCount = queues.reduce((sum, queue) => sum + (queue.counts.failed ?? 0), 0);
  const delayedCount = queues.reduce((sum, queue) => sum + (queue.counts.delayed ?? 0), 0);

  return (
    <main id="main-content" className="mx-auto w-[min(1180px,calc(100%-32px))] py-8 max-sm:w-[calc(100%-20px)] max-sm:py-4">
      <div className="mb-6">
        <AppNav active="jobs" />
      </div>
      <header className="mb-7 flex items-start justify-between gap-4 max-sm:grid">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-[var(--muted)]">BullMQ operations</p>
          <h1 className="m-0 text-3xl font-bold text-[var(--ink)]">Sync jobs</h1>
          <p className="mt-3 max-w-[72ch] leading-relaxed text-[var(--muted)]">
            Queue status for ISM control discovery, Meilisearch upserts and ACSC advisory refreshes. Workers run scheduled
            jobs and manual refreshes through Redis-backed BullMQ queues.
          </p>
        </div>
      </header>

      <section aria-label="Queue summary" className="mb-5 grid gap-3 md:grid-cols-3">
        <SummaryCard icon={<RefreshCw size={18} />} label="Active" value={String(activeCount)} />
        <SummaryCard icon={<Clock size={18} />} label="Scheduled" value={String(delayedCount)} />
        <SummaryCard icon={<AlertTriangle size={18} />} label="Failed" value={String(failedCount)} />
      </section>

      {error ? (
        <section className="rounded-lg border border-[oklch(0.76_0.1_31)] bg-[oklch(0.968_0.026_31)] p-5 text-[oklch(0.38_0.1_31)]">
          <h2 className="m-0 text-lg font-bold">BullMQ is not reachable</h2>
          <p className="mb-0 mt-2">{error}</p>
        </section>
      ) : (
        <section className="grid gap-4">
          {queues.map((queue) => (
            <QueuePanel key={queue.key} queue={queue} />
          ))}
        </section>
      )}
    </main>
  );
}

function QueuePanel({ queue }: { queue: QueueSummary }) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="mb-4 flex items-start justify-between gap-4 max-sm:grid">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--accent-strong)]">
            <DatabaseZap size={18} />
            <h2 className="m-0 text-lg font-bold text-[var(--ink)]">{queue.label}</h2>
          </div>
          <p className="m-0 max-w-[82ch] leading-relaxed text-[var(--muted)]">{queue.description}</p>
        </div>
        <form action="/api/jobs" method="post">
          <input type="hidden" name="queue" value={queue.key} />
          <Button type="submit" size="sm">
            <Play size={14} />
            Run now
          </Button>
        </form>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(queue.counts).map(([key, value]) => (
          <span
            key={key}
            className="inline-flex min-h-7 items-center rounded-full border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] px-3 text-xs text-[var(--muted)]"
          >
            {key}: <strong className="ml-1 text-[var(--ink)]">{value}</strong>
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)]" role="table" aria-label={`${queue.label} recent jobs`}>
        <div className="grid grid-cols-[120px_1fr_170px_170px] gap-3 border-b border-[var(--line)] bg-[oklch(0.972_0.008_92)] px-3 py-2 text-xs font-bold uppercase text-[var(--muted)] max-lg:hidden">
          <span>Status</span>
          <span>Job</span>
          <span>Started</span>
          <span>Finished</span>
        </div>
        {queue.jobs.length === 0 ? (
          <p className="m-0 p-4 text-[var(--muted)]">No jobs have been recorded yet.</p>
        ) : (
          queue.jobs.map((job) => <JobRow key={`${queue.key}-${job.id}`} job={job} />)
        )}
      </div>
    </article>
  );
}

function JobRow({ job }: { job: JobSummary }) {
  return (
    <div className="grid grid-cols-[120px_1fr_170px_170px] gap-3 border-b border-[var(--line)] px-3 py-3 last:border-b-0 max-lg:grid-cols-1" role="row">
      <span className={cn("inline-flex min-h-7 w-fit items-center rounded-full border px-3 text-xs font-bold", statusTone(job.status))}>
        {job.status}
      </span>
      <div className="min-w-0">
        <p className="m-0 font-semibold text-[var(--ink)]">
          {job.name} <span className="text-[var(--subtle)]">#{job.id}</span>
        </p>
        <p className="mt-1 max-w-[86ch] truncate text-sm text-[var(--muted)]">{progressText(job.progress)}</p>
        {job.failedReason && <p className="mt-1 text-sm text-[oklch(0.38_0.1_31)]">{job.failedReason}</p>}
      </div>
      <span className="text-sm text-[var(--muted)]">
        <span className="hidden font-bold text-[var(--ink)] max-lg:inline">Started: </span>
        {formatDate(job.processedOn)}
      </span>
      <span className="text-sm text-[var(--muted)]">
        <span className="hidden font-bold text-[var(--ink)] max-lg:inline">Finished: </span>
        {formatDate(job.finishedOn)}
      </span>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-2 flex items-center gap-2 text-[var(--accent-strong)]">
        {icon}
        <span className="text-xs font-bold uppercase">{label}</span>
      </div>
      <p className="m-0 font-bold text-[var(--ink)]">{value}</p>
    </div>
  );
}
