"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowRightLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Filter,
  GitCompare,
  Loader2,
  Search,
  ScrollText,
  Sparkles,
  SplitSquareHorizontal,
} from "lucide-react";
import type { CompareChange, IsmControl, IsmManifest, SearchResponse, SspRow } from "@/lib/ism/types";
import { cn } from "@/lib/utils";
import { toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldLabel, Input, Label, Select, Textarea } from "@/components/ui/field";

type AskResponse = {
  question: string;
  answer: string;
  model: string | null;
  retrieval: SearchResponse;
  degraded: boolean;
};

type CompareResponse = {
  from: string;
  to: string;
  total: number;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  changes: CompareChange[];
};

type SspResponse = {
  boundary: string;
  version: string;
  generatedAt: string;
  rows: SspRow[];
  retrieval: SearchResponse;
};

type PolicyResponse = {
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

const EXAMPLE_QUERIES = [
  "software security",
  "multi-factor authentication",
  "privileged access",
  "logging internet-facing services",
];

const APPLICABILITY = [
  { value: "NC", label: "OFFICIAL" },
  { value: "OS", label: "OFFICIAL: Sensitive" },
  { value: "P", label: "PROTECTED" },
  { value: "S", label: "SECRET" },
  { value: "TS", label: "TOP SECRET" },
];

const POLICY_TYPES = [
  { value: "acceptable_use", label: "Acceptable Use Policy" },
  { value: "email_use", label: "Acceptable Email Policy" },
  { value: "incident_response", label: "Incident Response Policy" },
  { value: "access_control", label: "Access Control Policy" },
  { value: "data_handling", label: "Data Handling Policy" },
  { value: "remote_work", label: "Remote Work Policy" },
  { value: "supplier_security", label: "Supplier Security Policy" },
  { value: "backup_recovery", label: "Backup and Recovery Policy" },
];

const DATA_TYPES = [
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

const WORK_MODES = ["Office", "Remote", "Hybrid", "Bring your own device", "Contractors", "Third-party access"];

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadSspCsv(result: SspResponse) {
  const csv = toCsv(result.rows, [
    { key: "systemBoundary", label: "System Boundary" },
    { key: "ismVersion", label: "ISM Version" },
    { key: "controlId", label: "Control ID" },
    { key: "controlTitle", label: "Control Title" },
    { key: "controlStatement", label: "Control Statement" },
    { key: "ismSection", label: "ISM Section" },
    { key: "classificationApplicability", label: "Classification Applicability" },
    { key: "implementationStatus", label: "Implementation Status" },
    { key: "implementationDescription", label: "Implementation Description" },
    { key: "evidenceRequired", label: "Evidence Required" },
    { key: "owner", label: "Owner" },
    { key: "notes", label: "Notes" },
  ]);
  downloadCsv(`ism-ssp-${result.version.replace(/^v/, "")}.csv`, csv);
}

function downloadDiffCsv(result: CompareResponse) {
  const rows = result.changes.map((change) => ({
    fromVersion: result.from,
    toVersion: result.to,
    status: change.status,
    controlId: change.controlId,
    changedFields: change.changedFields.join("; "),
    fromTitle: titleForControl(change.from),
    toTitle: titleForControl(change.to),
    fromStatement: change.from?.statement ?? "",
    toStatement: change.to?.statement ?? "",
    fromRevision: change.from?.revision ?? "",
    toRevision: change.to?.revision ?? "",
    fromUpdated: change.from?.updated ?? "",
    toUpdated: change.to?.updated ?? "",
    fromApplicability: change.from?.applicabilityLabels.map(displayClassification).join("; ") ?? "",
    toApplicability: change.to?.applicabilityLabels.map(displayClassification).join("; ") ?? "",
    fromSection: change.from?.section ?? "",
    toSection: change.to?.section ?? "",
  }));
  const csv = toCsv(rows, [
    { key: "fromVersion", label: "From Version" },
    { key: "toVersion", label: "To Version" },
    { key: "status", label: "Status" },
    { key: "controlId", label: "Control ID" },
    { key: "changedFields", label: "Changed Fields" },
    { key: "fromTitle", label: "From Title" },
    { key: "toTitle", label: "To Title" },
    { key: "fromStatement", label: "From Statement" },
    { key: "toStatement", label: "To Statement" },
    { key: "fromRevision", label: "From Revision" },
    { key: "toRevision", label: "To Revision" },
    { key: "fromUpdated", label: "From Updated" },
    { key: "toUpdated", label: "To Updated" },
    { key: "fromApplicability", label: "From Applicability" },
    { key: "toApplicability", label: "To Applicability" },
    { key: "fromSection", label: "From Section" },
    { key: "toSection", label: "To Section" },
  ]);
  downloadCsv(`ism-diff-${result.from.replace(/^v/, "")}-to-${result.to.replace(/^v/, "")}.csv`, csv);
}

function titleForControl(control?: IsmControl) {
  if (!control) return "";
  return control.title === control.controlId ? control.topic : control.title;
}

function displayClassification(label: string) {
  return label === "Non-classified" ? "OFFICIAL" : label;
}

type StreamEvent =
  | { type: "meta"; [key: string]: unknown }
  | { type: "token"; token: string }
  | { type: "done" };

async function readEventStream(response: Response, onEvent: (event: StreamEvent) => void) {
  if (!response.body) throw new Error("Response did not include a stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as StreamEvent);
    }
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-[var(--paper-2)] px-1 py-0.5 text-sm">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (!listItems.length || !listType) return;
    const items = listItems.map((item, index) => (
      <li key={`${elements.length}-${index}`}>{renderInlineMarkdown(item)}</li>
    ));
    elements.push(
      listType === "ol" ? (
        <ol key={`list-${elements.length}`} className="my-3 list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={`list-${elements.length}`} className="my-3 list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    );
    listItems = [];
    listType = null;
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={index} className="mb-2 mt-5 text-lg font-bold text-[var(--ink)]">
          {renderInlineMarkdown(trimmed.replace(/^##\s+/, ""))}
        </h3>,
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h2 key={index} className="mb-3 text-xl font-bold text-[var(--ink)]">
          {renderInlineMarkdown(trimmed.replace(/^#\s+/, ""))}
        </h2>,
      );
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(trimmed.replace(/^\d+\.\s+/, ""));
      return;
    }
    flushList();
    elements.push(
      <p key={index} className="my-3 leading-relaxed text-[var(--ink)]">
        {renderInlineMarkdown(trimmed)}
      </p>,
    );
  });

  flushList();

  return <div>{elements}</div>;
}

async function downloadPolicyDocx(result: PolicyResponse) {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
  const lines = result.content.split(/\n+/).filter(Boolean);
  const children = lines.map((line) => {
    if (line.startsWith("# ")) {
      return new Paragraph({ text: line.replace(/^#\s+/, ""), heading: HeadingLevel.TITLE });
    }
    if (line.startsWith("## ")) {
      return new Paragraph({ text: line.replace(/^##\s+/, ""), heading: HeadingLevel.HEADING_1 });
    }
    if (/^\d+\.\s+/.test(line) || /^-\s+/.test(line)) {
      return new Paragraph({ text: line, bullet: line.startsWith("- ") ? { level: 0 } : undefined });
    }
    return new Paragraph({ children: [new TextRun(line)] });
  });
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(`${slugify(result.orgName)}-${slugify(result.title)}.docx`, blob);
}

async function downloadPolicyPdf(result: PolicyResponse) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const maxWidth = 500;
  let y = margin;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(result.title, margin, y);
  y += 22;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`${result.orgName} | Generated ${new Date(result.generatedAt).toLocaleDateString()}`, margin, y);
  y += 24;
  pdf.setFontSize(11);
  for (const line of markdownToPlainText(result.content).split("\n")) {
    const wrapped = pdf.splitTextToSize(line || " ", maxWidth) as string[];
    if (y + wrapped.length * 14 > 780) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(wrapped, margin, y);
    y += wrapped.length * 14 + 6;
  }
  pdf.save(`${slugify(result.orgName)}-${slugify(result.title)}.pdf`);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function IsmWorkbench({ manifest }: { manifest: IsmManifest }) {
  const releases = manifest.releases;
  const latestVersion = releases[0]?.version ?? "";
  const previousVersion = releases[1]?.version ?? latestVersion;
  const [query, setQuery] = useState("software security");
  const [question, setQuestion] = useState("what control would talk about software security");
  const [version, setVersion] = useState(latestVersion);
  const [compareFrom, setCompareFrom] = useState(previousVersion);
  const [compareTo, setCompareTo] = useState(latestVersion);
  const [selectedClassifications, setSelectedClassifications] = useState<string[]>([]);
  const [systemBoundary, setSystemBoundary] = useState(
    "A public-facing web application hosted in cloud infrastructure with administrator access, user authentication, CI/CD deployment, application logging and a managed database.",
  );
  const [policyType, setPolicyType] = useState("acceptable_use");
  const [orgName, setOrgName] = useState("Example Organisation");
  const [orgSize, setOrgSize] = useState("51-200");
  const [industry, setIndustry] = useState("Technology");
  const [jurisdiction, setJurisdiction] = useState("Australia");
  const [criticalSystems, setCriticalSystems] = useState("Cloud applications, identity provider, endpoints, email, source code repositories and production databases.");
  const [contactRole, setContactRole] = useState("Security Manager");
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([
    "Customer personal information",
    "Authentication secrets",
    "Operational logs",
  ]);
  const [selectedWorkModes, setSelectedWorkModes] = useState<string[]>(["Hybrid", "Remote", "Contractors"]);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [sspResult, setSspResult] = useState<SspResponse | null>(null);
  const [policyResult, setPolicyResult] = useState<PolicyResponse | null>(null);
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"search" | "ask" | "ssp" | "policy" | "compare">("search");
  const [streamingTask, setStreamingTask] = useState<"ask" | "policy" | null>(null);
  const [isPending, startTransition] = useTransition();

  const canUseData = releases.length > 0;
  const selectedRelease = useMemo(
    () => releases.find((release) => release.version === version),
    [releases, version],
  );

  useEffect(() => {
    if (!canUseData) return;
    void runSearch();
    void runCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseData]);

  async function runSearch(nextQuery = query) {
    if (!canUseData) return;
    const params = new URLSearchParams({ q: nextQuery, version, limit: "12" });
    selectedClassifications.forEach((classification) => params.append("applicability", classification));
    const response = await fetch(`/api/search?${params.toString()}`);
    setSearchResult((await response.json()) as SearchResponse);
  }

  async function runAsk() {
    if (!canUseData) return;
    setStreamingTask("ask");
    setAskResult(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, version, applicability: selectedClassifications }),
      });
      await readEventStream(response, (event) => {
        if (event.type === "meta") {
          const meta = event as AskResponse & { type: "meta" };
          setAskResult({
            question: meta.question,
            answer: "",
            model: meta.model,
            retrieval: meta.retrieval,
            degraded: meta.degraded,
          });
        }
        if (event.type === "token") {
          setAskResult((current) => current ? { ...current, answer: current.answer + event.token } : current);
        }
      });
    } finally {
      setStreamingTask(null);
    }
  }

  async function runSsp() {
    if (!canUseData) return;
    const response = await fetch("/api/ssp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        boundary: systemBoundary,
        version,
        applicability: selectedClassifications,
        limit: 35,
      }),
    });
    setSspResult((await response.json()) as SspResponse);
  }

  async function runPolicy() {
    setStreamingTask("policy");
    setPolicyResult(null);
    try {
      const response = await fetch("/api/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policyType,
          orgName,
          orgSize,
          industry,
          jurisdiction,
          dataTypes: selectedDataTypes,
          workModes: selectedWorkModes,
          criticalSystems,
          contactRole,
        }),
      });
      await readEventStream(response, (event) => {
        if (event.type === "meta") {
          const meta = event as PolicyResponse & { type: "meta" };
          setPolicyResult({
            policyType: meta.policyType,
            title: meta.title,
            orgName: meta.orgName,
            orgSize: meta.orgSize,
            industry: meta.industry,
            jurisdiction: meta.jurisdiction,
            dataTypes: meta.dataTypes,
            workModes: meta.workModes,
            criticalSystems: meta.criticalSystems,
            contactRole: meta.contactRole,
            content: "",
            model: meta.model,
            degraded: meta.degraded,
            generatedAt: meta.generatedAt,
          });
        }
        if (event.type === "token") {
          setPolicyResult((current) => current ? { ...current, content: current.content + event.token } : current);
        }
      });
    } finally {
      setStreamingTask(null);
    }
  }

  async function runCompare() {
    if (!canUseData || !compareFrom || !compareTo) return;
    const params = new URLSearchParams({ from: compareFrom, to: compareTo });
    const response = await fetch(`/api/compare?${params.toString()}`);
    const nextResult = (await response.json()) as CompareResponse;
    setCompareResult(nextResult);
    setSelectedControlId((current) => {
      if (current && nextResult.changes.some((change) => change.controlId === current)) return current;
      return nextResult.changes[0]?.controlId ?? null;
    });
  }

  function toggleClassification(value: string) {
    setSelectedClassifications((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function clearClassifications() {
    setSelectedClassifications([]);
  }

  function toggleDataType(value: string) {
    setSelectedDataTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function toggleWorkMode(value: string) {
    setSelectedWorkModes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(310px,380px)_1fr]">
      <nav
        aria-label="Workbench shortcuts"
        className="sticky top-0 z-20 -mx-2 flex gap-2 overflow-x-auto border-y border-[var(--line)] bg-[oklch(0.975_0.007_92_/_0.96)] px-2 py-2 backdrop-blur lg:hidden"
      >
        {[
          ["#workbench-actions", "Actions"],
          ["#workbench-results", "Results"],
          ["#classification-filters", "Classifications"],
          ["#version-compare", "Compare"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-semibold text-[var(--muted)]"
          >
            {label}
          </a>
        ))}
      </nav>

      <aside id="workbench-actions" className="grid scroll-mt-16 gap-4 lg:sticky lg:top-5" aria-label="Search controls">
        <RailSection icon={<Search size={17} />} title="Search">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(() => void runSearch());
            }}
            className="grid gap-3"
          >
            <Label>
              <FieldLabel>Search terms</FieldLabel>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="software security" />
            </Label>
            <Label>
              <FieldLabel>Release</FieldLabel>
              <Select value={version} onChange={(event) => setVersion(event.target.value)}>
                {releases.map((release) => (
                  <option key={release.version} value={release.version}>
                    {release.release}
                  </option>
                ))}
              </Select>
            </Label>
            <div id="classification-filters" className="grid gap-1.5">
              <FieldLabel>Classification filters</FieldLabel>
              <ClassificationPicker
                selected={selectedClassifications}
                onToggle={toggleClassification}
                onClear={clearClassifications}
              />
            </div>
            <Button type="submit" disabled={!canUseData || isPending}>
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search controls
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Example queries">
            {EXAMPLE_QUERIES.map((item) => (
              <Button
                key={item}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setQuery(item);
                  startTransition(() => void runSearch(item));
                }}
              >
                {item}
              </Button>
            ))}
          </div>
        </RailSection>

        <RailSection icon={<FileText size={17} />} title="System Security Plan">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setActiveTab("ssp");
              startTransition(() => void runSsp());
            }}
            className="grid gap-3"
          >
            <Label>
              <FieldLabel>System boundary</FieldLabel>
              <Textarea value={systemBoundary} onChange={(event) => setSystemBoundary(event.target.value)} rows={5} />
            </Label>
            <Button variant="secondary" type="submit" disabled={!canUseData || isPending}>
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              Generate SSP CSV
            </Button>
          </form>
        </RailSection>

        <RailSection icon={<Bot size={17} />} title="Ask Ollama">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setActiveTab("ask");
              startTransition(() => void runAsk());
            }}
            className="grid gap-3"
          >
            <Label>
              <FieldLabel>Natural-language question</FieldLabel>
              <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} />
            </Label>
            <Button variant="secondary" type="submit" disabled={!canUseData || isPending}>
              {streamingTask === "ask" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Ask with retrieved controls
            </Button>
          </form>
        </RailSection>

        <RailSection icon={<ScrollText size={17} />} title="Policy Generator">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setActiveTab("policy");
              startTransition(() => void runPolicy());
            }}
            className="grid gap-3"
          >
            <Label>
              <FieldLabel>Policy type</FieldLabel>
              <Select value={policyType} onChange={(event) => setPolicyType(event.target.value)}>
                {POLICY_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Label>
                <FieldLabel>Organisation</FieldLabel>
                <Input value={orgName} onChange={(event) => setOrgName(event.target.value)} />
              </Label>
              <Label>
                <FieldLabel>Size</FieldLabel>
                <Select value={orgSize} onChange={(event) => setOrgSize(event.target.value)}>
                  {["1-10", "11-50", "51-200", "201-1000", "1000+"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Label>
                <FieldLabel>Industry</FieldLabel>
                <Input value={industry} onChange={(event) => setIndustry(event.target.value)} />
              </Label>
              <Label>
                <FieldLabel>Jurisdiction</FieldLabel>
                <Input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} />
              </Label>
            </div>
            <div className="grid gap-1.5">
              <FieldLabel>Data types</FieldLabel>
              <OptionPicker options={DATA_TYPES} selected={selectedDataTypes} onToggle={toggleDataType} />
            </div>
            <div className="grid gap-1.5">
              <FieldLabel>Work modes</FieldLabel>
              <OptionPicker options={WORK_MODES} selected={selectedWorkModes} onToggle={toggleWorkMode} />
            </div>
            <Label>
              <FieldLabel>Critical systems</FieldLabel>
              <Textarea value={criticalSystems} onChange={(event) => setCriticalSystems(event.target.value)} rows={3} />
            </Label>
            <Label>
              <FieldLabel>Security contact role</FieldLabel>
              <Input value={contactRole} onChange={(event) => setContactRole(event.target.value)} />
            </Label>
            <Button variant="secondary" type="submit" disabled={isPending || !orgName.trim()}>
              {streamingTask === "policy" ? <Loader2 size={16} className="animate-spin" /> : <ScrollText size={16} />}
              Generate policy
            </Button>
          </form>
        </RailSection>

        <RailSection icon={<GitCompare size={17} />} title="Compare">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setActiveTab("compare");
              startTransition(() => void runCompare());
            }}
            id="version-compare"
            className="grid grid-cols-[1fr_42px_1fr] items-end gap-2 max-sm:grid-cols-1"
          >
            <Label>
              <FieldLabel>From</FieldLabel>
              <Select value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)}>
                {releases.map((release) => (
                  <option key={release.version} value={release.version}>
                    {release.release}
                  </option>
                ))}
              </Select>
            </Label>
            <Button
              variant="secondary"
              size="icon"
              type="button"
              aria-label="Swap comparison versions"
              onClick={() => {
                setCompareFrom(compareTo);
                setCompareTo(compareFrom);
              }}
            >
              <ArrowRightLeft size={16} />
            </Button>
            <Label>
              <FieldLabel>To</FieldLabel>
              <Select value={compareTo} onChange={(event) => setCompareTo(event.target.value)}>
                {releases.map((release) => (
                  <option key={release.version} value={release.version}>
                    {release.release}
                  </option>
                ))}
              </Select>
            </Label>
            <Button className="col-span-full" variant="secondary" type="submit" disabled={!canUseData || isPending}>
              Compare releases
            </Button>
          </form>
        </RailSection>
      </aside>

      <section
        id="workbench-results"
        className="min-h-[calc(100vh-112px)] scroll-mt-16 overflow-hidden rounded-lg border border-[var(--line)] bg-[oklch(0.989_0.006_92_/_0.92)] shadow-[0_18px_50px_oklch(0.32_0.02_138_/_0.12)] max-lg:min-h-[560px]"
        aria-label="Results"
      >
        {!canUseData ? (
          <EmptyDataState />
        ) : (
          <>
            <div className="grid border-b border-[var(--line)] bg-[var(--paper-2)] md:grid-cols-4">
              <StatusItem icon={<Database size={16} />} label="Index" value={searchResult?.source ?? "local"} />
              <StatusItem icon={<BookOpen size={16} />} label="Release" value={selectedRelease?.release ?? "none"} />
              <StatusItem icon={<Filter size={16} />} label="Controls" value={String(selectedRelease?.count ?? 0)} />
              <StatusItem
                icon={<CheckCircle2 size={16} />}
                label="Synced"
                value={selectedRelease?.syncedAt ? new Date(selectedRelease.syncedAt).toLocaleDateString() : "pending"}
              />
            </div>

            <nav className="flex gap-1 overflow-x-auto px-4 pt-3" aria-label="Result views">
              {[
                ["search", "Search results"],
                ["ask", "Ollama answer"],
                ["ssp", "SSP CSV"],
                ["policy", "Policies"],
                ["compare", "Version compare"],
              ].map(([tab, label]) => (
                <Button
                  key={tab}
                  type="button"
                  variant={activeTab === tab ? "secondary" : "ghost"}
                  className="rounded-b-none"
                  onClick={() => setActiveTab(tab as "search" | "ask" | "ssp" | "policy" | "compare")}
                >
                  {label}
                </Button>
              ))}
            </nav>

            {activeTab === "search" && <SearchResults result={searchResult} />}
            {activeTab === "ask" && <AskPanel result={askResult} streaming={streamingTask === "ask"} />}
            {activeTab === "ssp" && <SspPanel result={sspResult} />}
            {activeTab === "policy" && <PolicyPanel result={policyResult} streaming={streamingTask === "policy"} />}
            {activeTab === "compare" && (
              <ComparePanel
                result={compareResult}
                selectedControlId={selectedControlId}
                onSelectControl={setSelectedControlId}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function RailSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center gap-2 text-[var(--accent-strong)]">
          {icon}
          <h2 className="m-0 text-base font-bold text-[var(--ink)]">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ClassificationPicker({
  selected,
  onToggle,
  onClear,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.55)] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--muted)]">{selected.length ? `${selected.length} selected` : "All classifications"}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          All
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {APPLICABILITY.map((item) => {
          const active = selected.includes(item.value);
          return (
            <Button
              key={item.value}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => onToggle(item.value)}
              aria-pressed={active}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function OptionPicker({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-md border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.55)] p-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Button
            key={option}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => onToggle(option)}
            aria-pressed={active}
          >
            {option}
          </Button>
        );
      })}
    </div>
  );
}

function StatusItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-r border-[var(--line)] px-4 py-3 text-[var(--muted)] last:border-r-0">
      {icon}
      <span>{label}</span>
      <strong className="ml-auto truncate text-sm text-[var(--ink)]">{value}</strong>
    </div>
  );
}

function SearchResults({ result }: { result: SearchResponse | null }) {
  if (!result) return <SkeletonState label="Run a search to populate controls." />;
  const queryLabel = result.query.trim() ? `"${result.query}"` : "this release";

  return (
    <div className="p-4">
      <div className="flex justify-between gap-4 pb-3 text-[var(--muted)] max-sm:flex-col">
        <p className="m-0">
          Showing {result.hits.length} of {result.estimatedTotalHits} matches for <strong>{queryLabel}</strong>
        </p>
        <span>{result.processingTimeMs} ms</span>
      </div>
      <div className="grid gap-3">
        {result.hits.map((control) => (
          <ControlRow key={control.objectID} control={control} />
        ))}
      </div>
    </div>
  );
}

function AskPanel({ result, streaming }: { result: AskResponse | null; streaming: boolean }) {
  if (!result) return <SkeletonState label={streaming ? "Ollama is starting the response stream." : "Ask a question to retrieve controls and query Ollama."} />;

  return (
    <div className="grid gap-4 p-4">
      <article className="rounded-lg border border-[var(--line)] bg-gradient-to-b from-[var(--panel)] to-[oklch(0.965_0.018_158)] p-4">
        <div className="mb-3 flex items-center gap-2 font-bold text-[var(--accent-strong)]">
          {streaming ? <Loader2 size={17} className="animate-spin" /> : <Bot size={17} />}
          <span>{result.degraded ? "Retrieval fallback" : result.model}</span>
        </div>
        <MarkdownPreview content={result.answer || (streaming ? "_Waiting for first token..._" : "")} />
      </article>
      <div>
        <h3 className="mb-3 text-base font-bold">Evidence controls</h3>
        <div className="grid gap-3">
          {result.retrieval.hits.map((control) => (
            <ControlRow key={control.objectID} control={control} compact />
          ))}
        </div>
      </div>
    </div>
  );
}

function SspPanel({ result }: { result: SspResponse | null }) {
  if (!result) return <SkeletonState label="Describe the system boundary to generate an SSP CSV." />;

  return (
    <div className="grid gap-4 p-4">
      <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col">
          <div>
            <span className="text-xs font-extrabold uppercase text-[var(--accent-strong)]">System Security Plan</span>
            <h3 className="m-0 mt-1 text-lg font-bold">{result.rows.length} mapped controls</h3>
            <p className="mt-2 max-w-[75ch] leading-relaxed text-[var(--muted)]">{result.boundary}</p>
          </div>
          <Button type="button" onClick={() => downloadSspCsv(result)}>
            <Download size={16} />
            Download CSV
          </Button>
        </div>
      </article>
      <div className="grid gap-3">
        {result.rows.slice(0, 12).map((row) => (
          <article key={row.controlId} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-extrabold uppercase text-[var(--accent-strong)]">{row.controlId}</span>
                <h3 className="m-0 mt-0.5 text-base font-bold">{row.controlTitle}</h3>
              </div>
              <Chip>{row.implementationStatus}</Chip>
            </div>
            <p className="mb-3 leading-relaxed text-[var(--muted)]">{row.controlStatement}</p>
            <div className="flex flex-wrap gap-2">
              <Chip>{row.ismVersion.replace(/^v/, "")}</Chip>
              <Chip>{row.classificationApplicability}</Chip>
              <Chip>{row.ismSection}</Chip>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PolicyPanel({ result, streaming }: { result: PolicyResponse | null; streaming: boolean }) {
  if (!result) return <SkeletonState label={streaming ? "Ollama is drafting the policy." : "Choose a policy type and organisation details to generate a policy draft."} />;

  return (
    <div className="grid gap-4 p-4">
      <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col">
          <div>
            <span className="text-xs font-extrabold uppercase text-[var(--accent-strong)]">
              {streaming ? "Streaming from Ollama" : result.degraded ? "Template fallback" : result.model}
            </span>
            <h3 className="m-0 mt-1 text-lg font-bold">{result.title}</h3>
            <p className="mt-2 leading-relaxed text-[var(--muted)]">
              {result.orgName} | {result.orgSize} | {result.industry} | {result.jurisdiction}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => void downloadPolicyDocx(result)} disabled={streaming || !result.content}>
              <Download size={16} />
              DOCX
            </Button>
            <Button type="button" onClick={() => void downloadPolicyPdf(result)} disabled={streaming || !result.content}>
              <Download size={16} />
              PDF
            </Button>
          </div>
        </div>
      </article>
      <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <MarkdownPreview content={result.content || (streaming ? "_Waiting for first token..._" : "")} />
      </article>
    </div>
  );
}

function ComparePanel({
  result,
  selectedControlId,
  onSelectControl,
}: {
  result: CompareResponse | null;
  selectedControlId: string | null;
  onSelectControl: (controlId: string) => void;
}) {
  if (!result) return <SkeletonState label="Compare two synced ISM releases." />;

  const selectedChange = result.changes.find((change) => change.controlId === selectedControlId) ?? result.changes[0];

  return (
    <div className="p-4">
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <Stat label="Added" value={result.added} tone="added" />
        <Stat label="Changed" value={result.changed} tone="changed" />
        <Stat label="Removed" value={result.removed} tone="removed" />
        <Stat label="Unchanged" value={result.unchanged} tone="quiet" />
      </div>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 max-sm:flex-col max-sm:items-stretch">
        <p className="m-0 text-sm text-[var(--muted)]">
          Diffing <strong>{result.from.replace(/^v/, "")}</strong> to <strong>{result.to.replace(/^v/, "")}</strong>
        </p>
        <Button type="button" variant="secondary" onClick={() => downloadDiffCsv(result)} disabled={!result.changes.length}>
          <Download size={16} />
          Download diff CSV
        </Button>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(280px,34%)_1fr]">
        <div className="max-h-[calc(100vh-318px)] overflow-auto pr-1 max-sm:max-h-96">
          <div className="mb-3 flex items-center gap-2 text-[var(--accent-strong)]">
            <SplitSquareHorizontal size={16} />
            <h3 className="m-0 text-base font-bold text-[var(--ink)]">Changed controls</h3>
          </div>
          {result.changes.length === 0 ? (
            <p className="text-[var(--muted)]">No changed controls between these releases.</p>
          ) : (
            <div className="grid gap-2">
              {result.changes.map((change) => (
                <button
                  key={change.controlId}
                  type="button"
                  className={cn(
                    "grid w-full grid-cols-[1fr_auto] gap-4 rounded-lg border border-[var(--line)] p-4 text-left transition-colors",
                    change.status === "added" && "bg-[oklch(0.963_0.027_158)]",
                    change.status === "changed" && "bg-[oklch(0.967_0.033_78)]",
                    change.status === "removed" && "bg-[oklch(0.965_0.027_31)]",
                    selectedChange?.controlId === change.controlId && "border-[var(--accent)]",
                  )}
                  onClick={() => onSelectControl(change.controlId)}
                >
                  <div>
                    <span className="text-xs font-extrabold uppercase text-[var(--accent-strong)]">
                      {change.status}
                    </span>
                    <h3 className="mb-2 mt-0.5 text-base font-bold">{change.controlId}</h3>
                    <p className="m-0 line-clamp-3 leading-relaxed text-[var(--muted)]">
                      {change.to?.statement ?? change.from?.statement}
                    </p>
                  </div>
                  <FieldList fields={change.changedFields} />
                </button>
              ))}
            </div>
          )}
        </div>
        <DiffViewer change={selectedChange} fromVersion={result.from} toVersion={result.to} />
      </div>
    </div>
  );
}

function DiffViewer({ change, fromVersion, toVersion }: { change?: CompareChange; fromVersion: string; toVersion: string }) {
  if (!change) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center text-[var(--accent-strong)]">
        <div>
          <SplitSquareHorizontal size={24} className="mx-auto mb-3" />
          <h3 className="mb-2 text-lg font-bold">Select a changed control</h3>
          <p className="mx-auto max-w-[48ch] leading-relaxed text-[var(--muted)]">
            Controls with additions, removals or text changes appear here as a side-by-side release diff.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--paper-2)] p-4 max-sm:flex-col">
        <div>
          <span className="text-xs font-extrabold uppercase text-[var(--accent-strong)]">{change.status}</span>
          <h3 className="m-0 mt-0.5 text-lg font-bold">{change.controlId}</h3>
        </div>
        <FieldList fields={change.changedFields} />
      </div>
      <div className="grid md:grid-cols-2">
        <DiffColumn label="From" version={fromVersion} control={change.from} compareAgainst={change.to} side="from" />
        <DiffColumn label="To" version={toVersion} control={change.to} compareAgainst={change.from} side="to" />
      </div>
    </div>
  );
}

function DiffColumn({
  label,
  version,
  control,
  compareAgainst,
  side,
}: {
  label: string;
  version: string;
  control?: IsmControl;
  compareAgainst?: IsmControl;
  side: "from" | "to";
}) {
  const title = control ? (control.title === control.controlId ? control.topic : control.title) : "Control not present";

  return (
    <article
      className={cn(
        "min-w-0 p-4 md:border-r md:border-[var(--line)] md:last:border-r-0",
        side === "from" ? "bg-[oklch(0.975_0.012_31)]" : "bg-[oklch(0.975_0.014_158)]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold text-[var(--muted)]">
        <span>{label}</span>
        <strong className="text-[var(--ink)]">{version.replace(/^v/, "")}</strong>
      </div>
      {control ? (
        <>
          <h4 className="mb-3 text-base font-bold leading-snug">{title}</h4>
          <DiffField label="Statement" value={control.statement} compareValue={compareAgainst?.statement} side={side} prose />
          <DiffField label="Revision" value={control.revision} compareValue={compareAgainst?.revision} side={side} />
          <DiffField label="Updated" value={control.updated} compareValue={compareAgainst?.updated} side={side} />
          <DiffField
            label="Applicability"
            value={control.applicabilityLabels.map(displayClassification).join(", ")}
            compareValue={compareAgainst?.applicabilityLabels.map(displayClassification).join(", ")}
            side={side}
          />
          <DiffField
            label="Essential Eight"
            value={control.essentialEight.join(", ") || "None listed"}
            compareValue={compareAgainst?.essentialEight.join(", ") || "None listed"}
            side={side}
          />
        </>
      ) : (
        <p className="grid min-h-44 place-items-center rounded-lg border border-dashed border-[var(--line-strong)] text-center text-[var(--muted)]">
          This control does not exist in this release.
        </p>
      )}
    </article>
  );
}

function DiffField({
  label,
  value,
  compareValue,
  side,
  prose = false,
}: {
  label: string;
  value?: string | null;
  compareValue?: string | null;
  side: "from" | "to";
  prose?: boolean;
}) {
  const changed = (value ?? "") !== (compareValue ?? "");

  return (
    <div className="border-t border-[oklch(0.86_0.012_92_/_0.72)] py-3">
      <span className="mb-1 block text-xs font-bold text-[var(--muted)]">{label}</span>
      <p
        className={cn(
          "m-0 leading-relaxed text-[var(--ink)]",
          prose && "max-w-[72ch]",
          changed && "rounded-md p-2",
          changed && side === "from" && "bg-[oklch(0.925_0.045_31)] text-[oklch(0.37_0.09_31)]",
          changed && side === "to" && "bg-[oklch(0.925_0.05_158)] text-[oklch(0.32_0.09_158)]",
        )}
      >
        {value || "Not set"}
      </p>
    </div>
  );
}

function ControlRow({ control, compact = false }: { control: IsmControl; compact?: boolean }) {
  const title = control.title === control.controlId ? control.topic : control.title;

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-2 flex items-start justify-between gap-4 max-sm:flex-col">
        <div>
          <span className="text-xs font-extrabold uppercase text-[var(--accent-strong)]">{control.controlId}</span>
          <h3 className="m-0 mt-0.5 text-base font-bold leading-snug">{title}</h3>
        </div>
        <Chip>{control.release}</Chip>
      </div>
      <p className={cn("leading-relaxed text-[var(--muted)]", compact ? "mb-0" : "mb-3")}>
        {control.statement || control.body}
      </p>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--subtle)]">
        <span>{control.chapter}</span>
        <span>{control.topic}</span>
        {control.revision && <span>Rev {control.revision}</span>}
        {control.updated && <span>Updated {control.updated}</span>}
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap gap-2">
          {control.applicabilityLabels.map((label) => (
            <Chip key={label}>{displayClassification(label)}</Chip>
          ))}
          {control.essentialEight.map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
        </div>
      )}
    </article>
  );
}

function FieldList({ fields }: { fields: string[] }) {
  return (
    <div className="flex flex-wrap content-start justify-end gap-1.5">
      {fields.map((field) => (
        <Chip key={field}>{field}</Chip>
      ))}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] px-2.5 text-xs text-[var(--muted)]">
      {children}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
      <span className="block text-xs font-bold text-[var(--muted)]">{label}</span>
      <strong
        className={cn(
          "mt-1 block text-2xl font-bold tabular-nums",
          tone === "added" && "text-[var(--accent-strong)]",
          tone === "changed" && "text-[oklch(0.5_0.12_78)]",
          tone === "removed" && "text-[var(--coral)]",
        )}
      >
        {value}
      </strong>
    </div>
  );
}

function SkeletonState({ label }: { label: string }) {
  return (
    <div className="grid min-h-[420px] place-items-center p-10 text-center">
      <div>
        <div className="mx-auto mb-4 size-14 animate-pulse rounded-lg border border-[var(--line)] bg-[var(--paper-2)]" />
        <p className="text-[var(--muted)]">{label}</p>
      </div>
    </div>
  );
}

function EmptyDataState() {
  return (
    <div className="grid min-h-[420px] place-items-center p-10 text-center text-[var(--accent-strong)]">
      <div>
        <Database size={28} className="mx-auto mb-3" />
        <h2 className="mb-2 text-xl font-bold">No ISM snapshots synced yet</h2>
        <p className="mx-auto max-w-[58ch] leading-relaxed text-[var(--muted)]">
          Run the local sync command, then restart or refresh the app. The sync downloads official ASD OSCAL releases,
          writes local snapshots and indexes Meilisearch when it is available.
        </p>
        <code className="mt-3 inline-flex rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[var(--ink)]">
          npm run sync:ism
        </code>
      </div>
    </div>
  );
}
