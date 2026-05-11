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

export type SearchResponse = {
  query: string;
  version: string;
  estimatedTotalHits: number;
  processingTimeMs: number;
  hits: IsmControl[];
  source: "meilisearch" | "local";
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
