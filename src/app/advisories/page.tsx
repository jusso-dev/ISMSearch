import { AlertTriangle, ExternalLink, RadioTower, ShieldAlert } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { getLatestAdvisories, type AcscAdvisory } from "@/lib/acsc/advisories";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function severityTone(severity: AcscAdvisory["severity"]) {
  if (severity === "Critical") return "border-[oklch(0.76_0.1_31)] bg-[oklch(0.968_0.026_31)] text-[oklch(0.38_0.1_31)]";
  if (severity === "High") return "border-[oklch(0.78_0.11_78)] bg-[oklch(0.972_0.03_78)] text-[oklch(0.42_0.1_78)]";
  return "border-[var(--line)] bg-[var(--accent-soft)] text-[var(--accent-strong)]";
}

export default async function AdvisoriesPage() {
  let result: Awaited<ReturnType<typeof getLatestAdvisories>> | null = null;
  let error: string | null = null;

  try {
    result = await getLatestAdvisories(12);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to fetch ACSC advisories";
  }

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
          href={result?.sourceUrl ?? "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories"}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "secondary" }), "shrink-0")}
        >
          <ExternalLink size={16} />
          Open Cyber.gov.au
        </a>
      </header>

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-2 flex items-center gap-2 text-[var(--accent-strong)]">
            <RadioTower size={18} />
            <span className="text-xs font-bold uppercase">Fetched</span>
          </div>
          <p className="m-0 font-bold text-[var(--ink)]">
            {result ? new Date(result.fetchedAt).toLocaleString() : "Unavailable"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-2 flex items-center gap-2 text-[var(--accent-strong)]">
            <ShieldAlert size={18} />
            <span className="text-xs font-bold uppercase">Items</span>
          </div>
          <p className="m-0 font-bold text-[var(--ink)]">{result?.advisories.length ?? 0} shown</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-2 flex items-center gap-2 text-[var(--accent-strong)]">
            <AlertTriangle size={18} />
            <span className="text-xs font-bold uppercase">Critical or high</span>
          </div>
          <p className="m-0 font-bold text-[var(--ink)]">
            {result?.advisories.filter((item) => item.severity === "Critical" || item.severity === "High").length ?? 0}
          </p>
        </div>
      </section>

      {error ? (
        <section className="rounded-lg border border-[oklch(0.76_0.1_31)] bg-[oklch(0.968_0.026_31)] p-5 text-[oklch(0.38_0.1_31)]">
          <h2 className="m-0 text-lg font-bold">ACSC advisory fetch failed</h2>
          <p className="mb-0 mt-2">{error}</p>
        </section>
      ) : (
        <section className="grid gap-3">
          {result?.advisories.map((advisory) => (
            <article key={advisory.href} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-bold", severityTone(advisory.severity))}>
                  {advisory.severity ? `${advisory.severity} alert` : advisory.type}
                </span>
                <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] px-3 text-xs font-bold uppercase text-[var(--muted)]">
                  {advisory.date}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 max-sm:grid">
                <div>
                  <h2 className="m-0 text-lg font-bold text-[var(--ink)]">{advisory.title}</h2>
                  <p className="mt-2 max-w-[86ch] leading-relaxed text-[var(--muted)]">{advisory.summary}</p>
                  {advisory.audiences.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {advisory.audiences.map((audience) => (
                        <span
                          key={audience}
                          className="inline-flex min-h-7 items-center rounded-full border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] px-3 text-xs text-[var(--muted)]"
                        >
                          {audience}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <a
                  href={advisory.href}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                >
                  <ExternalLink size={14} />
                  Read
                </a>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
