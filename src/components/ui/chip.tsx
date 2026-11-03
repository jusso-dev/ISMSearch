import * as React from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] text-[var(--muted)]",
  accent: "border-[oklch(0.8_0.06_158)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  warn: "border-[oklch(0.78_0.11_78)] bg-[oklch(0.972_0.03_78)] text-[oklch(0.42_0.1_78)]",
  danger: "border-[oklch(0.76_0.1_31)] bg-[oklch(0.968_0.026_31)] text-[oklch(0.4_0.12_31)]",
} as const;

export type ChipTone = keyof typeof TONES;

export function Chip({
  children,
  tone = "neutral",
  strong = false,
  className,
}: {
  children: React.ReactNode;
  tone?: ChipTone;
  strong?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-xs",
        strong && "font-bold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
