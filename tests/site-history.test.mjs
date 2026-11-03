import assert from "node:assert/strict";
import { test } from "node:test";

import { normaliseControl, changedFields } from "../scripts/site/lib/controls.mjs";
import { computeHistories, computeReleaseDiffs, releaseDiff } from "../scripts/site/lib/history.mjs";

function release(version, controls) {
  const meta = { version, release: version.slice(1) };
  return { ...meta, controls: controls.map((c) => normaliseControl(c, meta)) };
}

const base = (id, overrides = {}) => ({
  controlId: id,
  title: id,
  chapter: "Guidelines for email",
  section: "Email gateways",
  topic: "Email gateways",
  statement: `Statement for ${id}.`,
  revision: "1",
  updated: "Jan-24",
  applicability: ["NC", "OS", "P", "S", "TS"],
  essentialEight: [],
  ...overrides,
});

// v1: A, B, C   v2: A (changed), C       v3: A, B (back), D
const releases = [
  release("v2024.01.1", [base("ISM-0001"), base("ISM-0002"), base("ISM-0003")]),
  release("v2024.06.1", [base("ISM-0001", { statement: "Changed statement for ISM-0001.", revision: "2" }), base("ISM-0003")]),
  release("v2025.01.1", [
    base("ISM-0001", { statement: "Changed statement for ISM-0001.", revision: "2" }),
    base("ISM-0002", { essentialEight: ["ML2"] }),
    base("ISM-0004"),
  ]),
];

test("history: introduced / changed / removed / reintroduced", () => {
  const histories = computeHistories(releases);
  assert.deepEqual([...histories.keys()], ["ISM-0001", "ISM-0002", "ISM-0003", "ISM-0004"]);

  const a = histories.get("ISM-0001");
  assert.equal(a.current, true);
  assert.deepEqual(a.entries.map((e) => e.type), ["introduced", "changed"]);
  assert.equal(a.entries[0].baseline, true);
  assert.deepEqual(a.entries[1].fields, ["statement", "revision"]);
  assert.equal(a.entries[1].previousVersion, "v2024.01.1");
  assert.equal(a.entries[1].changes.revision.after, "2");

  const b = histories.get("ISM-0002");
  assert.deepEqual(b.entries.map((e) => [e.type, e.version]), [
    ["introduced", "v2024.01.1"],
    ["removed", "v2024.06.1"],
    ["reintroduced", "v2025.01.1"],
  ]);
  assert.deepEqual(b.entries[2].fields, ["essentialEight"]);
  assert.equal(b.presentIn, 2);

  const c = histories.get("ISM-0003");
  assert.equal(c.current, false);
  assert.equal(c.removedIn, "v2025.01.1");
  assert.equal(c.lastSeen, "v2024.06.1");

  const d = histories.get("ISM-0004");
  assert.deepEqual(d.entries, [{ type: "introduced", version: "v2025.01.1", baseline: false }]);
});

test("release diff counts", () => {
  const diffs = computeReleaseDiffs(releases);
  assert.equal(diffs.get("v2024.01.1"), null);
  assert.deepEqual(diffs.get("v2024.06.1").counts, { added: 0, changed: 1, removed: 1 });
  const last = diffs.get("v2025.01.1");
  assert.deepEqual(last.counts, { added: 2, changed: 0, removed: 1 });
  assert.deepEqual(last.added.map((x) => [x.controlId, x.reintroduced]), [["ISM-0002", true], ["ISM-0004", false]]);
  assert.deepEqual(last.removed.map((x) => x.controlId), ["ISM-0003"]);
  assert.deepEqual(releaseDiff(releases[0], releases[2]).counts, { added: 1, changed: 2, removed: 1 });
});

test("legacy ALL applicability equals the full classification set", () => {
  const meta = { version: "v1" };
  const legacy = normaliseControl(base("ISM-0001", { applicability: ["ALL"] }), meta);
  const modern = normaliseControl(base("ISM-0001"), meta);
  assert.deepEqual(changedFields(legacy, modern), []);
  const narrowed = normaliseControl(base("ISM-0001", { applicability: ["S", "TS"] }), meta);
  assert.deepEqual(changedFields(modern, narrowed), ["applicability"]);
});
