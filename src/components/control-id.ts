/**
 * Control identifier helpers shared by the workbench (client) and the control
 * detail page (server). Pure functions only.
 */

/** Matches queries such as "1234", "ISM-1234" or " ism-0042 " typed into search. */
export const CONTROL_ID_QUERY = /^\s*(?:ISM-)?(\d{1,5})\s*$/i;

const VALID_CONTROL_ID = /^ISM-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

/**
 * Normalise user-supplied control identifiers to the canonical catalogue form.
 * "1234" / "ism-1234" / "ISM-42" → "ISM-1234" / "ISM-1234" / "ISM-0042".
 * Non-numeric identifiers such as "ism-principle-gov-01" are upper-cased.
 * Returns null when the value cannot be a control identifier.
 */
export function normaliseControlId(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  if (!value || value.length > 64) return null;
  const numeric = value.match(/^(?:ISM-)?(\d{1,5})$/);
  if (numeric) return `ISM-${numeric[1].padStart(4, "0")}`;
  return VALID_CONTROL_ID.test(value) ? value : null;
}

/** If a free-text query looks like a numeric control id, return the canonical id. */
export function controlIdFromQuery(query: string): string | null {
  const match = query.match(CONTROL_ID_QUERY);
  return match ? normaliseControlId(match[1]) : null;
}

export function controlHref(controlId: string) {
  return `/controls/${encodeURIComponent(controlId)}`;
}

export function oscalSourceUrl(version: string) {
  return `https://github.com/AustralianCyberSecurityCentre/ism-oscal/blob/${encodeURIComponent(version)}/ISM_catalog.json`;
}

export function controlDisplayTitle(control: { title: string; controlId: string; topic: string }) {
  return control.title && control.title !== control.controlId ? control.title : control.topic;
}

export function displayClassification(label: string) {
  return label === "Non-classified" ? "OFFICIAL" : label;
}

export function displayRelease(version: string) {
  return version.replace(/^v/, "");
}
