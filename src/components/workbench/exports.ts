import type { IsmControl } from "@/lib/ism/types";
import { toCsv } from "@/lib/csv";
import { controlDisplayTitle, displayClassification, displayRelease } from "@/components/control-id";
import type { CompareResponse, PolicyResponse, SspResponse } from "./constants";

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, csv: string) {
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleForControl(control?: IsmControl) {
  return control ? controlDisplayTitle(control) : "";
}

export function downloadSearchCsv(controls: IsmControl[], version: string, query: string, origin: string) {
  const rows = controls.map((control) => ({
    controlId: control.controlId,
    title: titleForControl(control),
    release: control.release,
    chapter: control.chapter,
    section: control.section,
    topic: control.topic,
    statement: control.statement || control.body,
    revision: control.revision ?? "",
    updated: control.updated ?? "",
    applicability: control.applicabilityLabels.map(displayClassification).join("; "),
    essentialEight: control.essentialEight.join("; "),
    link: `${origin}/controls/${control.controlId}`,
  }));
  const csv = toCsv(rows, [
    { key: "controlId", label: "Control ID" },
    { key: "title", label: "Title" },
    { key: "release", label: "ISM Release" },
    { key: "chapter", label: "Chapter" },
    { key: "section", label: "Section" },
    { key: "topic", label: "Topic" },
    { key: "statement", label: "Statement" },
    { key: "revision", label: "Revision" },
    { key: "updated", label: "Updated" },
    { key: "applicability", label: "Applicability" },
    { key: "essentialEight", label: "Essential Eight" },
    { key: "link", label: "Link" },
  ]);
  const suffix = slugify(query) || "all";
  downloadCsv(`ism-search-${displayRelease(version)}-${suffix.slice(0, 40)}.csv`, csv);
}

export function downloadSspCsv(result: SspResponse) {
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
  downloadCsv(`ism-ssp-${displayRelease(result.version)}.csv`, csv);
}

export function downloadDiffCsv(result: CompareResponse) {
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
  downloadCsv(`ism-diff-${displayRelease(result.from)}-to-${displayRelease(result.to)}.csv`, csv);
}

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export async function downloadPolicyDocx(result: PolicyResponse) {
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

export async function downloadPolicyPdf(result: PolicyResponse) {
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
