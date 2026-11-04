"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

async function writeClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for plain-http LAN deployments where the async clipboard API is unavailable.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Copy failed");
}

/**
 * Copies a URL (default: the current page URL, read at click time so that
 * history.replaceState updates are included).
 */
export function CopyLinkButton({
  value,
  label = "Copy link",
  variant = "outline",
  size = "sm",
  className,
}: {
  value?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      const href = value ? new URL(value, window.location.origin).toString() : window.location.href;
      await writeClipboard(href);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => void copy()}>
        {state === "copied" ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Link copied to clipboard" : state === "failed" ? "Could not copy the link" : ""}
      </span>
    </>
  );
}
