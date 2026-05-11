import Link from "next/link";
import { AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { IsmWorkbench } from "@/components/ism-workbench";
import { buttonVariants } from "@/components/ui/button";
import { getLatestAdvisories, type AcscAdvisoryResult } from "@/lib/acsc/advisories";
import { getManifest } from "@/lib/ism/repository";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [manifest, advisoryResult] = await Promise.all([
    getManifest(),
    getLatestAdvisories(3).catch(() => null as AcscAdvisoryResult | null),
  ]);

  return (
    <main id="main-content" className="mx-auto w-[min(1520px,calc(100%-32px))] py-6 max-sm:w-[calc(100%-20px)] max-sm:py-3">
      <header className="flex items-center justify-between gap-6 pb-6 max-sm:grid">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--accent-strong)] shadow-[0_8px_22px_oklch(0.32_0.02_138_/_0.08)]">
            <ShieldCheck size={18} />
          </span>
          <div>
            <p className="mb-0.5 text-xs font-bold uppercase text-[var(--muted)]">Local ISM intelligence</p>
            <h1 className="m-0 text-2xl font-bold leading-tight text-[var(--ink)]">ISM Search Workbench</h1>
          </div>
        </div>
        <div className="grid justify-items-end gap-2 text-sm text-[var(--muted)] max-sm:justify-items-start">
          <AppNav active="home" />
          <div className="flex flex-wrap justify-end gap-2 max-sm:justify-start">
          <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] px-3">
            {manifest.releases.length ? `${manifest.releases.length} synced releases` : "No synced releases"}
          </span>
          <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] px-3">
            {manifest.source}
          </span>
          </div>
        </div>
      </header>

      <AdvisoryStrip result={advisoryResult} />
      <IsmWorkbench manifest={manifest} />
    </main>
  );
}

function AdvisoryStrip({ result }: { result: AcscAdvisoryResult | null }) {
  if (!result || result.advisories.length === 0) {
    return (
      <section className="mb-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-center justify-between gap-4 max-sm:grid">
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-[var(--muted)]">ACSC advisories</p>
            <h2 className="m-0 text-base font-bold text-[var(--ink)]">Latest advisory feed unavailable</h2>
          </div>
          <Link href="/advisories" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit")}>
            View page
          </Link>
        </div>
      </section>
    );
  }

  const leading = result.advisories[0];
  const urgentCount = result.advisories.filter((item) => item.severity === "Critical" || item.severity === "High").length;

  return (
    <section className="mb-5 rounded-lg border border-[var(--line)] bg-[oklch(0.986_0.006_92_/_0.92)] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)]">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--accent-strong)]">
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase text-[var(--muted)]">Latest ACSC advisory</p>
            <h2 className="m-0 text-base font-bold text-[var(--ink)]">{leading.title}</h2>
            <p className="mt-1 max-w-[92ch] truncate text-sm text-[var(--muted)]">{leading.summary}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 max-lg:justify-start">
          <span className="inline-flex min-h-8 items-center rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 text-xs font-bold uppercase text-[var(--muted)]">
            {urgentCount} critical or high
          </span>
          <a
            href={leading.href}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ExternalLink size={14} />
            Read latest
          </a>
          <Link href="/advisories" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            View all
          </Link>
        </div>
      </div>
    </section>
  );
}
