import type { CompareChange, SearchResponse, SspRow } from "@/lib/ism/types";

export type AskResponse = {
  question: string;
  answer: string;
  model: string | null;
  retrieval: SearchResponse;
  degraded: boolean;
};

export type CompareResponse = {
  from: string;
  to: string;
  total: number;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  changes: CompareChange[];
};

export type SspMode = "search" | "baseline";

export type SspResponse = {
  boundary: string;
  version: string;
  generatedAt: string;
  rows: SspRow[];
  retrieval: SearchResponse;
};

export type PolicyResponse = {
  policyType: string;
  title: string;
  orgName: string;
  orgSize: string;
  industry: string;
  jurisdiction: string;
  dataTypes: string[];
  workModes: string[];
  criticalSystems: string;
  contactRole: string;
  content: string;
  model: string | null;
  degraded: boolean;
  generatedAt: string;
};

export type FacetsResponse = {
  version: string;
  chapters: string[];
  essentialEight: string[];
};

/** Lifecycle of a streamed (NDJSON) answer. */
export type StreamStatus = "idle" | "streaming" | "complete" | "incomplete";

export const RESULT_TABS = [
  { key: "search", label: "Search results" },
  { key: "ask", label: "Ollama answer" },
  { key: "ssp", label: "SSP CSV" },
  { key: "policy", label: "Policies" },
  { key: "compare", label: "Version compare" },
] as const;

export type ResultTab = (typeof RESULT_TABS)[number]["key"];

export const EXAMPLE_QUERIES = [
  "software security",
  "multi-factor authentication",
  "privileged access",
  "logging internet-facing services",
];

export const APPLICABILITY = [
  { value: "NC", label: "OFFICIAL" },
  { value: "OS", label: "OFFICIAL: Sensitive" },
  { value: "P", label: "PROTECTED" },
  { value: "S", label: "SECRET" },
  { value: "TS", label: "TOP SECRET" },
] as const;

export const ESSENTIAL_EIGHT = [
  { value: "ML1", label: "ML1" },
  { value: "ML2", label: "ML2" },
  { value: "ML3", label: "ML3" },
] as const;

export const POLICY_TYPES = [
  { value: "acceptable_use", label: "Acceptable Use Policy" },
  { value: "email_use", label: "Acceptable Email Policy" },
  { value: "incident_response", label: "Incident Response Policy" },
  { value: "access_control", label: "Access Control Policy" },
  { value: "data_handling", label: "Data Handling Policy" },
  { value: "remote_work", label: "Remote Work Policy" },
  { value: "supplier_security", label: "Supplier Security Policy" },
  { value: "backup_recovery", label: "Backup and Recovery Policy" },
];

export const ORG_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

export const DATA_TYPES = [
  "Customer personal information",
  "Employee records",
  "Payment data",
  "Health information",
  "Financial records",
  "Intellectual property",
  "Authentication secrets",
  "Government information",
  "Operational logs",
  "Source code",
];

export const WORK_MODES = ["Office", "Remote", "Hybrid", "Bring your own device", "Contractors", "Third-party access"];

/** Input limits mirrored from the API validation schemas. */
export const LIMITS = {
  query: 300,
  questionMin: 3,
  questionMax: 500,
  boundaryMin: 10,
  boundaryMax: 2000,
  orgNameMin: 2,
  orgNameMax: 120,
  industry: 80,
  jurisdiction: 80,
  criticalSystems: 1000,
  contactRole: 80,
} as const;

export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_MAX_OFFSET = 5000;
export const EXPORT_MAX_ROWS = 1000;
export const EXPORT_PAGE_SIZE = 100;
export const SSP_SEARCH_LIMIT = 50;

export function applicabilityLabel(code: string) {
  return APPLICABILITY.find((item) => item.value === code)?.label ?? code;
}
