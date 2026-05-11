import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CompareChange, IsmControl, IsmManifest } from "./types";

const DATA_DIR = process.env.ISM_DATA_DIR ?? path.join(process.cwd(), "data", "ism");

const EMPTY_MANIFEST: IsmManifest = {
  generatedAt: "",
  source: "AustralianCyberSecurityCentre/ism-oscal",
  rssFeed: "https://www.cyber.gov.au/rss/news",
  releases: [],
};

export async function getManifest(): Promise<IsmManifest> {
  try {
    const raw = await readFile(path.join(DATA_DIR, "manifest.json"), "utf8");
    return JSON.parse(raw) as IsmManifest;
  } catch {
    return EMPTY_MANIFEST;
  }
}

export async function getLatestVersion(): Promise<string | null> {
  const manifest = await getManifest();
  return manifest.releases[0]?.version ?? null;
}

export async function getControls(version?: string | null): Promise<IsmControl[]> {
  const manifest = await getManifest();
  const selectedVersion = version ?? manifest.releases[0]?.version;
  if (!selectedVersion) return [];

  try {
    const raw = await readFile(path.join(DATA_DIR, "releases", `${selectedVersion}.json`), "utf8");
    return (JSON.parse(raw) as { controls: IsmControl[] }).controls;
  } catch {
    return [];
  }
}

export function localSearch(controls: IsmControl[], query: string, limit: number) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  const scored = controls
    .map((control) => {
      const haystack = control.text.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      const exactBoost = haystack.includes(query.toLowerCase()) ? 3 : 0;
      return { control, score: score + exactBoost };
    })
    .filter(({ score }) => score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score || a.control.controlId.localeCompare(b.control.controlId));

  return {
    estimatedTotalHits: scored.length,
    hits: scored.slice(0, limit).map(({ control }) => control),
  };
}

export async function compareVersions(fromVersion: string, toVersion: string): Promise<CompareChange[]> {
  const [fromControls, toControls] = await Promise.all([getControls(fromVersion), getControls(toVersion)]);
  const fromById = new Map(fromControls.map((control) => [control.controlId, control]));
  const toById = new Map(toControls.map((control) => [control.controlId, control]));
  const ids = [...new Set([...fromById.keys(), ...toById.keys()])].sort();

  return ids.map((controlId) => {
    const from = fromById.get(controlId);
    const to = toById.get(controlId);
    if (!from && to) return { controlId, status: "added", to, changedFields: ["control"] };
    if (from && !to) return { controlId, status: "removed", from, changedFields: ["control"] };

    const changedFields = ["statement", "revision", "updated", "applicability", "essentialEight"]
      .filter((field) => JSON.stringify(from?.[field as keyof IsmControl]) !== JSON.stringify(to?.[field as keyof IsmControl]));

    return {
      controlId,
      status: changedFields.length > 0 ? "changed" : "unchanged",
      from,
      to,
      changedFields,
    };
  });
}
