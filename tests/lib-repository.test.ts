import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { IsmControl } from "../src/lib/ism/types";

type Repo = typeof import("../src/lib/ism/repository");

let dataDir = "";
let repo: Repo;

function control(version: string, id: string, overrides: Partial<IsmControl> = {}): IsmControl {
  const base: IsmControl = {
    objectID: `${version}_${id}`,
    id: id.toLowerCase(),
    controlId: id,
    version,
    release: version.slice(1),
    title: `${id} title`,
    chapter: "Guidelines for system hardening",
    section: "Operating system hardening",
    topic: "Hardening",
    path: ["Guidelines for system hardening", "Operating system hardening"],
    statement: `Statement for ${id}.`,
    body: `Statement for ${id}.`,
    text: "",
    revision: "1",
    updated: "Jan-24",
    applicability: ["NC", "OS", "P"],
    applicabilityLabels: [],
    essentialEight: [],
    sortId: null,
    ...overrides,
  };
  base.text = `${base.controlId}\n${base.title}\n${base.chapter} ${base.section}\n${base.statement}`;
  return base;
}

const V1 = "v2024.03.1";
const V2 = "v2024.06.1";
const V3 = "v2024.09.1";

async function writeRelease(version: string, controls: IsmControl[]) {
  await writeFile(
    path.join(dataDir, "releases", `${version}.json`),
    JSON.stringify({ version, release: version.slice(1), controls }),
  );
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "ism-repo-test-"));
  await mkdir(path.join(dataDir, "releases"));
  await writeFile(
    path.join(dataDir, "manifest.json"),
    JSON.stringify({
      generatedAt: "2024-10-01T00:00:00.000Z",
      source: "test",
      rssFeed: "",
      releases: [V3, V2, V1].map((version) => ({
        version,
        release: version.slice(1),
        title: "ISM",
        sourceUrl: "",
        count: 0,
        syncedAt: "",
      })),
    }),
  );

  await writeRelease(V1, [
    control(V1, "ISM-0001", { statement: "Use multi-factor authentication for remote access." }),
    control(V1, "ISM-0002"),
    control(V1, "ISM-0003"),
    control(V1, "ISM-1234", { statement: "Patch applications within two weeks." }),
  ]);
  await writeRelease(V2, [
    // title + section changed only (previously reported as unchanged)
    control(V2, "ISM-0001", {
      title: "Remote access MFA",
      section: "Authentication hardening",
      statement: "Use multi-factor authentication for remote access.",
    }),
    control(V2, "ISM-0002", { chapter: "Guidelines for networking", topic: "Network design" }),
    // ISM-0003 removed
    control(V2, "ISM-1234", { statement: "Patch applications within two weeks.", applicability: ["P", "OS", "NC"] }),
    control(V2, "ISM-2000", { essentialEight: ["ML2", "ML3"] }),
  ]);
  await writeRelease(V3, [
    control(V3, "ISM-0001", {
      title: "Remote access MFA",
      section: "Authentication hardening",
      statement: "Use phishing-resistant multi-factor authentication for remote access.",
    }),
    control(V3, "ISM-0002", { chapter: "Guidelines for networking", topic: "Network design" }),
    control(V3, "ISM-0003"), // reintroduced
    control(V3, "ISM-1234", { statement: "Patch applications within two weeks." }),
    control(V3, "ISM-2000", { essentialEight: ["ML1", "ML2"] }),
    control(V3, "ISM-0999", { statement: "Record the ISM-1234 exception and patch timeline." }),
  ]);

  process.env.ISM_DATA_DIR = dataDir; // must be set before the module is imported
  repo = await import(new URL("../src/lib/ism/repository.ts", import.meta.url).href);
});

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test("manifest helpers", async () => {
  assert.equal(await repo.getLatestVersion(), V3);
  assert.equal(await repo.hasRelease(V2), true);
  assert.equal(await repo.hasRelease("v1999.01.1"), false);
  assert.deepEqual(await repo.getControls("../../etc/passwd"), []);
});

test("compareVersions detects title, chapter, section and topic changes", async () => {
  const changes = await repo.compareVersions(V1, V2);
  const byId = new Map(changes.map((change) => [change.controlId, change]));
  assert.equal(byId.get("ISM-0001")?.status, "changed");
  assert.deepEqual(byId.get("ISM-0001")?.changedFields, ["title", "section"]);
  assert.deepEqual(byId.get("ISM-0002")?.changedFields, ["chapter", "topic"]);
  assert.equal(byId.get("ISM-0003")?.status, "removed");
  assert.equal(byId.get("ISM-2000")?.status, "added");
  // applicability order changes are not reported as changes
  assert.equal(byId.get("ISM-1234")?.status, "unchanged");

  const same = await repo.compareVersions(V2, V2);
  assert.ok(same.every((change) => change.status === "unchanged"));
});

test("getControl is case-insensitive and version aware", async () => {
  assert.equal((await repo.getControl("ism-0001"))?.version, V3);
  assert.equal((await repo.getControl("ISM-0003", V2)), null);
  assert.equal((await repo.getControl("ism-0003", V1))?.controlId, "ISM-0003");
});

test("getControlHistory reports introduced/changed/removed/reintroduced oldest to newest", async () => {
  const history = await repo.getControlHistory("ism-0003");
  assert.ok(history);
  assert.equal(history.controlId, "ISM-0003");
  assert.equal(history.firstSeen, V1);
  assert.equal(history.lastSeen, V3);
  assert.equal(history.latestVersion, V3);
  assert.equal(history.latest?.version, V3);
  assert.deepEqual(
    history.entries.map((entry) => [entry.version, entry.status]),
    [
      [V1, "introduced"],
      [V2, "removed"],
      [V3, "reintroduced"],
    ],
  );
  assert.equal(history.entries[1].control, null);

  const mfa = await repo.getControlHistory("ISM-0001");
  assert.deepEqual(
    mfa?.entries.map((entry) => [entry.version, entry.status, entry.changedFields]),
    [
      [V1, "introduced", []],
      [V2, "changed", ["title", "section"]],
      [V3, "changed", ["statement"]],
    ],
  );

  // Unchanged releases are omitted.
  const patched = await repo.getControlHistory("ISM-1234");
  assert.deepEqual(patched?.entries.map((entry) => entry.status), ["introduced"]);

  assert.equal(await repo.getControlHistory("ISM-4040"), null);
});

test("getFacets lists chapters in document order and Essential Eight levels", async () => {
  const facets = await repo.getFacets(V3);
  assert.equal(facets.version, V3);
  assert.deepEqual(facets.chapters, ["Guidelines for system hardening", "Guidelines for networking"]);
  assert.deepEqual(facets.essentialEight, ["ML1", "ML2"]);
  assert.deepEqual((await repo.getFacets(V1)).essentialEight, []);
});

test("localSearch boosts exact control id matches", async () => {
  const controls = await repo.getControls(V3);
  assert.equal(repo.localSearch(controls, "1234", 5).hits[0].controlId, "ISM-1234");
  assert.equal(repo.localSearch(controls, "ism-1234", 5).hits[0].controlId, "ISM-1234");
  assert.equal(repo.localSearch(controls, "ISM-1234", 5).hits[0].controlId, "ISM-1234");
  // ISM-0999 mentions ISM-1234 in its text but must rank below the control itself.
  const hits = repo.localSearch(controls, "ISM-1234", 5).hits.map((hit) => hit.controlId);
  assert.deepEqual(hits.slice(0, 2), ["ISM-1234", "ISM-0999"]);
});

test("localSearch ignores stopwords, supports offset and returns all for empty query", async () => {
  const controls = await repo.getControls(V3);
  const result = repo.localSearch(controls, "what is the phishing-resistant authentication", 10);
  assert.equal(result.estimatedTotalHits, 1);
  assert.equal(result.hits[0].controlId, "ISM-0001");

  const all = repo.localSearch(controls, "", 2, 0);
  assert.equal(all.estimatedTotalHits, controls.length);
  const page2 = repo.localSearch(controls, "", 2, 2);
  assert.equal(page2.hits.length, 2);
  assert.notEqual(page2.hits[0].controlId, all.hits[0].controlId);
});

test("keywordQuery strips stopwords/punctuation and keeps at most 10 informative terms", () => {
  assert.equal(repo.keywordQuery("What are the controls for MFA on privileged accounts?"), "controls mfa privileged accounts");
  assert.equal(repo.keywordQuery("-- ?? !!"), "");
  assert.equal(repo.keywordQuery("the and of"), "the and of");
  const long = repo.keywordQuery(
    "Our system processes PROTECTED data in a public cloud tenancy with privileged administrators, " +
      "remote access via VPN, email gateways, web proxies, ISM-1234 patching and centralised logging.",
  );
  const terms = long.split(" ");
  assert.ok(terms.length <= 10, long);
  assert.ok(terms.includes("ism-1234"), long);
  assert.equal(new Set(terms).size, terms.length);
  assert.equal(repo.keywordQuery("alpha beta gamma", 2).split(" ").length, 2);
});

test("release snapshots are cached by mtime and reloaded when the file changes", async () => {
  const first = await repo.getControls(V1);
  assert.equal(await repo.getControls(V1), first, "same array instance while unchanged");

  await writeRelease(V1, [control(V1, "ISM-0001"), control(V1, "ISM-7777")]);
  const future = new Date(Date.now() + 60_000);
  await utimes(path.join(dataDir, "releases", `${V1}.json`), future, future);

  const reloaded = await repo.getControls(V1);
  assert.notEqual(reloaded, first);
  assert.deepEqual(reloaded.map((item) => item.controlId), ["ISM-0001", "ISM-7777"]);
});
