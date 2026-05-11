import Link from "next/link";
import { Activity, AlertTriangle, BriefcaseBusiness, HeartPulse } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavKey = "home" | "advisories" | "jobs" | "health";

const NAV_ITEMS: { key: NavKey; href: string; label: string; icon: React.ReactNode }[] = [
  { key: "home", href: "/", label: "Workbench", icon: <BriefcaseBusiness size={14} /> },
  { key: "advisories", href: "/advisories", label: "Advisories", icon: <AlertTriangle size={14} /> },
  { key: "jobs", href: "/jobs", label: "Jobs", icon: <Activity size={14} /> },
  { key: "health", href: "/health", label: "Health", icon: <HeartPulse size={14} /> },
];

export function AppNav({ active }: { active: NavKey }) {
  return (
    <nav aria-label="Primary" className="flex flex-wrap justify-end gap-2 max-sm:justify-start">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: active === item.key ? "secondary" : "outline", size: "sm" }),
            "shrink-0",
          )}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
