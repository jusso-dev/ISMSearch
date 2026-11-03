import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto w-[min(1180px,calc(100%-32px))] py-6 max-sm:w-[calc(100%-20px)] max-sm:py-4">
      <SiteHeader />
      <section className="grid min-h-[50vh] place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
        <div className="max-w-[60ch]">
          <SearchX size={28} className="mx-auto mb-3 text-[var(--accent-strong)]" aria-hidden />
          <p className="m-0 text-xs font-bold uppercase text-[var(--muted)]">404 · Not found</p>
          <h1 className="mb-2 mt-1 text-2xl font-bold text-[var(--ink)]">This page or control does not exist</h1>
          <p className="m-0 leading-relaxed text-[var(--muted)]">
            If you followed a control link, the identifier may be mistyped or the control is not in any synced ISM release.
            Search the workbench by keyword or control number instead.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/" className={buttonVariants({ variant: "default" })}>
              <ArrowLeft size={16} aria-hidden />
              Back to workbench
            </Link>
            <Link href="/advisories" className={buttonVariants({ variant: "outline" })}>
              View advisories
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
