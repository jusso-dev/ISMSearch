export type IsmControl = {
  objectID: string;
  id: string;
  controlId: string;
  version: string;
  release: string;
  title: string;
  chapter: string;
  section: string;
  topic: string;
  path: string[];
  statement: string;
  body: string;
  text: string;
  revision: string | null;
  updated: string | null;
  applicability: string[];
  applicabilityLabels: string[];
  essentialEight: string[];
  sortId: string | null;
};

export type IsmRelease = {
  version: string;
  release: string;
  title: string;
  sourceUrl: string;
  count: number;
  syncedAt: string;
};

export type IsmManifest = {
  generatedAt: string;
  source: string;
  rssFeed: string;
  releases: IsmRelease[];
};

export type EssentialEightLevel = "ML1" | "ML2" | "ML3";

export type SearchResponse = {
  query: string;
  version: string;
  estimatedTotalHits: number;
  processingTimeMs: number;
  hits: IsmControl[];
  source: "meilisearch" | "local";
  /** Zero-based offset of the first hit in `hits`. */
  offset: number;
  /** Page size that was requested. */
  limit: number;
};

export type IsmFacets = {
  version: string;
  /** Chapters present in the release, in catalogue (document) order. */
  chapters: string[];
  /** Essential Eight maturity levels present in the release, sorted (ML1, ML2, ML3). */
  essentialEight: string[];
};

export type ControlHistoryEntry = {
  /** Release version key, e.g. "v2025.12.9". */
  version: string;
  /** Human release label, e.g. "2025.12.9". */
  release: string;
  status: "introduced" | "changed" | "unchanged" | "removed" | "reintroduced";
  /** Fields that differ from the previous release containing the control (empty for introduced/removed). */
  changedFields: string[];
  /** The control as published in this release; null when the control was removed in this release. */
  control: IsmControl | null;
};

export type ControlHistory = {
  controlId: string;
  /** The control in the latest manifest release, or null if it is not present there (removed). */
  latest: IsmControl | null;
  /** The latest release version in the manifest (the release `latest` was looked up in). */
  latestVersion: string | null;
  /** Version key of the first release containing the control. */
  firstSeen: string | null;
  /** Version key of the most recent release containing the control. */
  lastSeen: string | null;
  /** Oldest to newest; only releases where something happened (introduced, changed, removed, reintroduced). */
  entries: ControlHistoryEntry[];
};

export type CompareChange = {
  controlId: string;
  status: "added" | "removed" | "changed" | "unchanged";
  from?: IsmControl;
  to?: IsmControl;
  changedFields: string[];
};

export type SspRow = {
  systemBoundary: string;
  ismVersion: string;
  controlId: string;
  controlTitle: string;
  controlStatement: string;
  ismSection: string;
  classificationApplicability: string;
  implementationStatus: "Not assessed" | "Planned" | "Implemented" | "Not applicable";
  implementationDescription: string;
  evidenceRequired: string;
  owner: string;
  notes: string;
};
