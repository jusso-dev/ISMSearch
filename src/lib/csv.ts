export function csvEscape(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv<T extends object>(rows: T[], headers: { key: keyof T; label: string }[]) {
  return [
    headers.map((header) => csvEscape(header.label)).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header.key])).join(",")),
  ].join("\n");
}
