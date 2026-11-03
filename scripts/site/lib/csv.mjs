// CSV helpers shared by the build (changes.csv) and the browser (copied to
// assets/csv.js). Must stay dependency-free and browser-compatible.

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

// Neutralise spreadsheet formula injection, then quote per RFC 4180.
export function csvCell(value) {
  let text;
  if (value === null || value === undefined) text = "";
  else if (Array.isArray(value)) text = value.join("; ");
  else text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header, rows) {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // BOM so spreadsheet tools detect UTF-8.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
