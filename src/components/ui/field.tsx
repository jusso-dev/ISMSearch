import * as React from "react";
import { cn } from "@/lib/utils";

const controlClass =
  "w-full rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2.5 text-[var(--ink)] transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[oklch(0.72_0.12_158_/_0.45)]";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("grid gap-1.5", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-xs font-bold text-[var(--muted)]", className)} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlClass, "resize-y leading-relaxed", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlClass, props.className)} />;
}
