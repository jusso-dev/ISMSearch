import assert from "node:assert/strict";
import { test } from "node:test";

const { csvEscape, toCsv }: typeof import("../src/lib/csv") = await import(
  new URL("../src/lib/csv.ts", import.meta.url).href
);

test("csvEscape leaves plain values alone", () => {
  assert.equal(csvEscape("hello"), "hello");
  assert.equal(csvEscape(42), "42");
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
});

test("csvEscape quotes commas, quotes and newlines", () => {
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape("line1\nline2"), '"line1\nline2"');
  assert.equal(csvEscape("line1\r\nline2"), '"line1\r\nline2"');
});

test("csvEscape neutralises spreadsheet formula injection", () => {
  assert.equal(csvEscape("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(csvEscape("+61"), "'+61");
  assert.equal(csvEscape("-1"), "'-1");
  assert.equal(csvEscape("@cmd"), "'@cmd");
  assert.equal(csvEscape("\tx"), "'\tx");
  assert.equal(csvEscape('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
});

test("toCsv renders a header row and escaped rows", () => {
  const csv = toCsv(
    [
      { id: "ISM-1", text: "a, b" },
      { id: "ISM-2", text: "=bad" },
    ],
    [
      { key: "id", label: "Control" },
      { key: "text", label: "Text" },
    ],
  );
  assert.equal(csv, 'Control,Text\nISM-1,"a, b"\nISM-2,\'=bad');
});
