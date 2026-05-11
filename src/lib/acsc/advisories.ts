export type AcscAdvisory = {
  title: string;
  summary: string;
  href: string;
  date: string;
  type: "Advisory" | "Alert";
  severity: "Critical" | "High" | "Medium" | "Low" | null;
  audiences: string[];
};

export type AcscAdvisoryResult = {
  sourceUrl: string;
  fetchedAt: string;
  advisories: AcscAdvisory[];
};

const CYBER_BASE_URL = "https://www.cyber.gov.au";
export const ACSC_ADVISORIES_URL =
  "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories";
const DATA_DIR = process.env.ACSC_DATA_DIR ?? path.join(process.cwd(), "data", "acsc");

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function cleanText(value: string) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function absoluteHref(href: string) {
  const cleaned = href.replace(/^['"]|['"]$/g, "");
  return cleaned.startsWith("http") ? cleaned : `${CYBER_BASE_URL}${cleaned}`;
}

function extractFirst(block: string, pattern: RegExp) {
  return block.match(pattern)?.[1] ?? "";
}

function extractAudiences(block: string) {
  const focusBlock = block.match(/<div class="focus-audience[\s\S]*?<\/div>/)?.[0] ?? "";
  return [...focusBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function severityFromClass(ratingClass: string): AcscAdvisory["severity"] {
  if (ratingClass === "critical") return "Critical";
  if (ratingClass === "high") return "High";
  if (ratingClass === "medium") return "Medium";
  if (ratingClass === "low") return "Low";
  return null;
}

export function parseAcscAdvisories(html: string): AcscAdvisory[] {
  const cards = [
    ...html.matchAll(
      /<a class="[^"]*\bcard--alert\b[^"]*\brating--([a-z]+)\b[^"]*" href=("[^"]+"|'[^']+'|[^\s>]+)>([\s\S]*?)<\/a>/g,
    ),
  ];

  return cards
    .map((match) => {
      const ratingClass = match[1];
      const block = match[3];
      const severity = severityFromClass(ratingClass);
      const type: AcscAdvisory["type"] = severity ? "Alert" : "Advisory";

      return {
        title: cleanText(extractFirst(block, /<h3[^>]*>([\s\S]*?)<\/h3>/)),
        summary: cleanText(extractFirst(block, /<p class="my-0">([\s\S]*?)<\/p>/)),
        href: absoluteHref(match[2]),
        date: cleanText(extractFirst(block, /<div class="date[^"]*">([\s\S]*?)<\/div>/)),
        type,
        severity,
        audiences: extractAudiences(block),
      };
    })
    .filter((advisory) => advisory.title && advisory.href);
}

export async function getLatestAdvisories(limit = 6): Promise<AcscAdvisoryResult> {
  const persisted = await getPersistedAdvisories(limit);
  if (persisted) return persisted;

  const response = await fetch(ACSC_ADVISORIES_URL, {
    cache: "no-store",
    headers: {
      accept: "text/html,*/*",
      "user-agent": "ISMSearch ACSC advisory fetcher",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ACSC advisories: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  return {
    sourceUrl: ACSC_ADVISORIES_URL,
    fetchedAt: new Date().toISOString(),
    advisories: parseAcscAdvisories(html).slice(0, limit),
  };
}

async function getPersistedAdvisories(limit: number): Promise<AcscAdvisoryResult | null> {
  try {
    const raw = await readFile(path.join(DATA_DIR, "advisories.json"), "utf8");
    const snapshot = JSON.parse(raw) as AcscAdvisoryResult;
    return {
      ...snapshot,
      advisories: snapshot.advisories.slice(0, limit),
    };
  } catch {
    return null;
  }
}
import { readFile } from "node:fs/promises";
import path from "node:path";
