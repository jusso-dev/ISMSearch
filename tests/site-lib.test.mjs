import assert from "node:assert/strict";
import { test } from "node:test";

import { escapeAttr, escapeHtml, html, jsonForScript, raw, safeAdvisoryHref } from "../scripts/site/lib/escape.mjs";
import { csvCell, toCsv } from "../scripts/site/lib/csv.mjs";
import { wordDiff } from "../scripts/site/lib/diff.mjs";
import { isStale, normaliseAdvisoryFeed } from "../scripts/site/lib/advisories.mjs";
import { canonicalControlId, controlPath, rel } from "../scripts/site/lib/url.mjs";
import { parseDisplayDate, rfc822 } from "../scripts/site/lib/dates.mjs";
import { parseState, prepareIndex, queryControlId, search, stateToSearch } from "../scripts/site/lib/search.mjs";
import { compareVersions, displayTitle } from "../scripts/site/lib/controls.mjs";

test("escapeHtml / escapeAttr neutralise markup", () => {
  const payload = `"><script>alert('x')</script>&`;
  const escaped = escapeHtml(payload);
  assert.equal(escaped, "&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;");
  assert.ok(!/[<>"']/.test(escapeAttr(payload)));
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(0), "0");
});

test("html tagged template escapes interpolations but not raw()", () => {
  const evil = `"><img src=x onerror=alert(1)>`;
  const out = String(html`<a title="${evil}">${evil}</a>${raw("<b>ok</b>")}${[evil, html`<i>${evil}</i>`]}`);
  assert.ok(!out.includes("<img"));
  assert.ok(out.includes("<b>ok</b>"));
  assert.ok(out.includes("<i>&quot;&gt;&lt;img"));
});

test("advisory href allowlist", () => {
  assert.equal(safeAdvisoryHref("https://www.cyber.gov.au/about-us/x"), "https://www.cyber.gov.au/about-us/x");
  assert.equal(safeAdvisoryHref("https://cyber.gov.au/x"), "https://cyber.gov.au/x");
  assert.equal(safeAdvisoryHref("https://www.cyber.gov.au@evil.example/"), null);
  assert.equal(safeAdvisoryHref("javascript:alert(1)"), null);
  assert.equal(safeAdvisoryHref("http://www.cyber.gov.au/x"), null);
  assert.equal(safeAdvisoryHref("https://evilcyber.gov.au/x"), null);
  assert.equal(safeAdvisoryHref("https://cyber.gov.au.evil.example/x"), null);
  assert.equal(safeAdvisoryHref("https://user:pw@www.cyber.gov.au/x"), null);
  assert.equal(safeAdvisoryHref("/relative"), null);
  assert.equal(safeAdvisoryHref(undefined), null);
});

test("CSV cells neutralise formula injection and quote", () => {
  assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
  assert.equal(csvCell("+1"), `"'+1"`);
  assert.equal(csvCell("-2"), `"'-2"`);
  assert.equal(csvCell("@cmd"), `"'@cmd"`);
  assert.equal(csvCell("\tx"), `"'\tx"`);
  assert.equal(csvCell("\rx"), `"'\rx"`);
  assert.equal(csvCell('say "hi", ok'), `"say ""hi"", ok"`);
  assert.equal(csvCell(null), `""`);
  assert.equal(csvCell(["a", "b"]), `"a; b"`);
  const csv = toCsv(["A", "B"], [["=1", "line\nbreak"]]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv, `﻿"A","B"\r\n"'=1","line\nbreak"\r\n`);
});

test("wordDiff produces eq/del/ins ops", () => {
  const ops = wordDiff("Multi-factor authentication is used for users", "Phishing-resistant multi-factor authentication is used for all users");
  const rebuilt = (types) => ops.filter((op) => types.includes(op.type)).map((op) => op.text).join(" ");
  assert.equal(rebuilt(["eq", "del"]), "Multi-factor authentication is used for users");
  assert.equal(rebuilt(["eq", "ins"]), "Phishing-resistant multi-factor authentication is used for all users");
  assert.deepEqual(
    ops.map((op) => op.type),
    ["del", "ins", "eq", "ins", "eq"],
  );
  assert.deepEqual(wordDiff("same text", "same text"), [{ type: "eq", text: "same text" }]);
  assert.deepEqual(wordDiff("", "new"), [{ type: "ins", text: "new" }]);
});

test("wordDiff falls back (null) when too complex", () => {
  const a = Array.from({ length: 600 }, (_, i) => `a${i}`).join(" ");
  const b = Array.from({ length: 600 }, (_, i) => `b${i}`).join(" ");
  assert.equal(wordDiff(a, b), null);
  // Common prefix/suffix are trimmed before the cap is applied.
  const long = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(" ");
  assert.ok(Array.isArray(wordDiff(`${long} x`, `${long} y`)));
});

test("jsonForScript escapes < and line separators", () => {
  const out = jsonForScript({ t: "</script><!--   & >" });
  assert.ok(!out.includes("<"));
  assert.ok(!out.includes(" "));
  assert.deepEqual(JSON.parse(out), { t: "</script><!--   & >" });
});

test("advisory normalisation supports new and legacy shapes", () => {
  const feed = normaliseAdvisoryFeed({
    fetchedAt: "2026-11-01T00:00:00Z",
    advisories: [
      { objectID: "old", title: "Legacy", summary: "s", href: "https://www.cyber.gov.au/a", date: "07 May 2026", type: "Advisory", severity: null, audiences: ["Government"] },
      { objectID: "new", title: "New", href: "javascript:alert(1)", published: "2026-10-23", date: "23 Oct 2026", type: "Alert", severity: "Critical", audiences: [], firstSeenAt: "2026-10-23T01:00:00Z" },
      { objectID: "new", title: "Duplicate" },
    ],
  });
  assert.equal(feed.count, 2);
  assert.deepEqual(feed.advisories.map((a) => a.objectID), ["new", "old"]);
  assert.equal(feed.advisories[1].published, "2026-05-07");
  assert.equal(feed.advisories[0].safeHref, null);
  assert.deepEqual(feed.feeds, []);
  assert.equal(isStale("2026-10-01T00:00:00Z", "2026-11-03T00:00:00Z"), true);
  assert.equal(isStale("2026-11-01T00:00:00Z", "2026-11-03T00:00:00Z"), false);
  assert.equal(isStale(null, "2026-11-03T00:00:00Z"), true);
});

test("url helpers are relative and validate ids", () => {
  assert.equal(rel(0, ""), "./");
  assert.equal(rel(0, "controls/"), "controls/");
  assert.equal(rel(2, "assets/site.css"), "../../assets/site.css");
  assert.equal(controlPath("ISM-1234"), "controls/ISM-1234/");
  assert.throws(() => controlPath("../../etc"));
  assert.equal(canonicalControlId("1234"), "ISM-1234");
  assert.equal(canonicalControlId("ism-42"), "ISM-0042");
  assert.equal(canonicalControlId("ism-principle-gov-03"), "ISM-PRINCIPLE-GOV-03");
  assert.equal(canonicalControlId("<script>"), null);
});

test("dates and versions", () => {
  assert.equal(parseDisplayDate("07 May 2026"), "2026-05-07");
  assert.equal(parseDisplayDate("31 Feb 2026"), null);
  assert.equal(rfc822("2026-05-07"), "Thu, 07 May 2026 00:00:00 GMT");
  assert.ok(compareVersions("v2024.03.12", "v2024.03.5") > 0);
  assert.ok(compareVersions("v2025.12.9", "v2026.03.24") < 0);
  assert.equal(displayTitle({ controlId: "ISM-1", title: "ISM-1", topic: "Topic" }), "Topic");
  assert.equal(displayTitle({ controlId: "ISM-1", title: "Real title", topic: "Topic" }), "Real title");
});

test("search core ranks exact control ids and filters", () => {
  const controls = [
    { id: "ISM-0001", title: "Email filtering", chapter: "Email", section: "Gateways", statement: "Email content filtering is used.", applicability: ["NC", "OS", "P", "S", "TS"], e8: [] },
    { id: "ISM-1234", title: "Email content filtering", chapter: "Email", section: "Gateways", statement: "Email content filtering is implemented.", applicability: ["S", "TS"], e8: ["ML2"] },
    { id: "ISM-0500", title: "Patching", chapter: "System management", section: "Patching", statement: "Patches are applied within 48 hours.", applicability: ["NC", "OS", "P"], e8: ["ML1", "ML2"] },
  ];
  const index = prepareIndex(controls);
  const empty = { q: "", classes: [], e8: [], chapter: "" };
  assert.equal(search(index, empty).length, 3);
  assert.equal(search(index, { ...empty, q: "1234" })[0].id, "ISM-1234");
  assert.equal(search(index, { ...empty, q: "ISM-1234" })[0].id, "ISM-1234");
  assert.equal(queryControlId("ism 1234"), "ISM-1234");
  assert.deepEqual(search(index, { ...empty, q: "the email filtering" }).map((c) => c.id).sort(), ["ISM-0001", "ISM-1234"]);
  assert.deepEqual(search(index, { ...empty, q: "patch" }).map((c) => c.id), ["ISM-0500"]);
  assert.deepEqual(search(index, { ...empty, classes: ["P"] }).map((c) => c.id), ["ISM-0001", "ISM-0500"]);
  assert.deepEqual(search(index, { ...empty, e8: ["ML2"] }).map((c) => c.id), ["ISM-1234", "ISM-0500"]);
  assert.deepEqual(search(index, { ...empty, chapter: "System management" }).map((c) => c.id), ["ISM-0500"]);

  const state = parseState("?q=mfa&class=S,P,BOGUS&e8=ml2&chapter=Email");
  assert.deepEqual(state, { q: "mfa", classes: ["P", "S"], e8: ["ML2"], chapter: "Email" });
  assert.equal(stateToSearch(state), "?q=mfa&class=P%2CS&e8=ML2&chapter=Email");
  assert.deepEqual(parseState(stateToSearch(state)), state);
  assert.equal(stateToSearch(empty), "");
});
