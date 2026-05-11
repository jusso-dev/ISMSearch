import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ISM Search Workbench",
  description: "Local-first search, comparison and natural-language analysis for ASD ISM controls.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[var(--panel)] focus:px-4 focus:py-2 focus:font-bold focus:text-[var(--accent-strong)] focus:shadow-lg"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
