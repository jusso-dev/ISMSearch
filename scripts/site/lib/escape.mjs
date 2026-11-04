// HTML escaping helpers and a tiny auto-escaping tagged template.
// Every value interpolated through `html` is escaped unless it is already SafeHtml.

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (char) => HTML_ESCAPES[char]);
}

// Attribute values are always emitted double-quoted; escaping the same set
// (plus `=` for defence in depth against unquoted contexts) is sufficient.
export function escapeAttr(value) {
  return escapeHtml(value).replace(/=/g, "&#61;");
}

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export function raw(value) {
  return new SafeHtml(String(value ?? ""));
}

function renderValue(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join("");
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    out += renderValue(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

// JSON for embedding inside <script type="application/json">. `<` is escaped so
// `</script>` and `<!--` can never terminate or alter the script element.
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function escapeXml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    // Strip characters that are illegal in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Only cyber.gov.au https URLs are ever rendered as links from advisory data.
export function safeAdvisoryHref(href) {
  if (typeof href !== "string" || href.trim() === "") return null;
  let url;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "cyber.gov.au" && !host.endsWith(".cyber.gov.au")) return null;
  return url.href;
}
