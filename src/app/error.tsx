"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="mx-auto w-[min(1180px,calc(100%-32px))] py-6 max-sm:w-[calc(100%-20px)] max-sm:py-4">
      <SiteHeader />
      <section
        role="alert"
        className="grid min-h-[50vh] place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center"
      >
        <div className="max-w-[60ch]">
          <AlertCircle size={28} className="mx-auto mb-3 text-[var(--coral)]" aria-hidden />
          <p className="m-0 text-xs font-bold uppercase text-[var(--muted)]">Unexpected error</p>
          <h1 className="mb-2 mt-1 text-2xl font-bold text-[var(--ink)]">Something went wrong loading this view</h1>
          <p className="m-0 leading-relaxed text-[var(--muted)]">
            The local data or a backing service may be temporarily unavailable. Try again, or check the Health page for
            Meilisearch, Ollama and Redis status.
          </p>
          {error.digest && (
            <p className="mb-0 mt-3 text-xs text-[var(--muted)]">
              Reference <code className="rounded bg-[var(--paper-2)] px-1 py-0.5 text-[var(--ink)]">{error.digest}</code>
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => retry()}>
              <RotateCcw size={16} aria-hidden />
              Try again
            </Button>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft size={16} aria-hidden />
              Back to workbench
            </Link>
            <Link href="/health" className={buttonVariants({ variant: "outline" })}>
              Health
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
