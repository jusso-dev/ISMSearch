// URL helpers. Internal links are always relative so the site works under a
// GitHub Pages subpath (/ISMSearch/) and from a local static server.
import { isValidControlId } from "./controls.mjs";

export const DEFAULT_BASE_URL = "https://jusso-dev.github.io/ISMSearch/";

export function normaliseBaseUrl(value) {
  const url = new URL(value || DEFAULT_BASE_URL);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`SITE_BASE_URL must be http(s): ${value}`);
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

export function basePath(baseUrl) {
  return new URL(baseUrl).pathname;
}

// Depth of an output file relative to the site root, e.g.
// "controls/ISM-1234/index.html" -> 2.
export function depthOf(filePath) {
  return filePath.split("/").length - 1;
}

export function rootPrefix(depth) {
  return depth === 0 ? "" : "../".repeat(depth);
}

// Relative link from a page at `depth` to a root-relative target.
export function rel(depth, target = "") {
  const out = rootPrefix(depth) + target;
  return out === "" ? "./" : out;
}

export function absoluteUrl(baseUrl, target = "") {
  return new URL(target, baseUrl).href;
}

export function controlPath(controlId) {
  if (!isValidControlId(controlId)) throw new Error(`Unsafe control id: ${controlId}`);
  return `controls/${controlId}/`;
}

export function releasePath(version) {
  if (!isSafeVersion(version)) throw new Error(`Unsafe version: ${version}`);
  return `releases/${version}/`;
}

export function isSafeVersion(version) {
  return typeof version === "string" && /^v?\d+(?:\.\d+)*$/.test(version);
}

export function slugify(text) {
  return (
    String(text ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "section"
  );
}

export function officialSourceUrl(version) {
  return `https://github.com/AustralianCyberSecurityCentre/ism-oscal/blob/${encodeURIComponent(version)}/ISM_catalog.json`;
}

// Canonicalise loose control references: "1234", "ism-1234", "ISM-PRINCIPLE-GOV-03".
export function canonicalControlId(input) {
  const text = String(input ?? "").trim();
  const numeric = /^(?:ism[-_ ]?)?(\d{1,4})$/i.exec(text);
  if (numeric) return `ISM-${numeric[1].padStart(4, "0")}`;
  const upper = text.toUpperCase();
  return isValidControlId(upper) ? upper : null;
}
