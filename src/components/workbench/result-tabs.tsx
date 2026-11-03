"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { RESULT_TABS, type ResultTab } from "./constants";

export const tabId = (key: ResultTab) => `result-tab-${key}`;
export const panelId = (key: ResultTab) => `result-panel-${key}`;

/**
 * WAI-ARIA tabs with automatic activation and roving tabindex
 * (Left/Right wrap, Home/End jump).
 */
export function ResultTabList({
  active,
  onChange,
  busy,
  trailing,
}: {
  active: ResultTab;
  onChange: (tab: ResultTab) => void;
  busy: Partial<Record<ResultTab, boolean>>;
  trailing?: ReactNode;
}) {
  const refs = useRef<Partial<Record<ResultTab, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = RESULT_TABS.findIndex((tab) => tab.key === active);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % RESULT_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + RESULT_TABS.length) % RESULT_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = RESULT_TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const key = RESULT_TABS[next].key;
    onChange(key);
    refs.current[key]?.focus();
  }

  return (
    <div className="flex items-end justify-between gap-2 border-b border-[var(--line)] px-4 pt-3 max-md:flex-col max-md:items-stretch">
      <div role="tablist" aria-label="Result views" className="flex gap-1 overflow-x-auto">
        {RESULT_TABS.map((tab) => {
          const selected = active === tab.key;
          return (
            <button
              key={tab.key}
              ref={(node) => {
                refs.current[tab.key] = node;
              }}
              type="button"
              role="tab"
              id={tabId(tab.key)}
              aria-selected={selected}
              aria-controls={panelId(tab.key)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.key)}
              onKeyDown={onKeyDown}
              className={cn(
                buttonVariants({ variant: selected ? "secondary" : "ghost" }),
                "relative shrink-0 rounded-b-none",
                selected && "border-b-transparent text-[var(--ink)] shadow-[inset_0_-2px_0_var(--accent)]",
              )}
            >
              {tab.label}
              {busy[tab.key] && (
                <span className="size-1.5 rounded-full bg-[var(--accent)] motion-safe:animate-pulse" aria-label="(working)" role="img" />
              )}
            </button>
          );
        })}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2 pb-2">{trailing}</div>}
    </div>
  );
}

export function ResultTabPanel({ tab, active, children }: { tab: ResultTab; active: ResultTab; children: ReactNode }) {
  return (
    <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} hidden={tab !== active} tabIndex={0} className="focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[oklch(0.72_0.12_158_/_0.45)]">
      {children}
    </div>
  );
}
