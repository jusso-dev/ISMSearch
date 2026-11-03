import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AppNav } from "@/components/app-nav";

/** Compact header for secondary pages (control detail, errors, not found). */
export function SiteHeader({ active }: { active?: "home" | "advisories" | "jobs" | "health" }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4 max-sm:grid">
      <Link
        href="/"
        className="flex w-fit items-center gap-3 rounded-md text-[var(--ink)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[oklch(0.72_0.12_158_/_0.45)]"
      >
        <span className="grid size-9 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--accent-strong)]">
          <ShieldCheck size={16} aria-hidden />
        </span>
        <span className="text-base font-bold">ISM Search Workbench</span>
      </Link>
      <AppNav active={active} />
    </header>
  );
}
