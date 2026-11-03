import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { readJsonIfExists, serializeJson, writeFileAtomic, writeJsonIfChanged } from "../scripts/lib/io.mjs";
import {
  buildCandidates,
  buildManifest,
  chooseManifest,
  compareVersions,
  extractVersionsFromCyberPage,
  extractVersionsFromRss,
  isUsableReleaseFile,
  manifestsEquivalent,
  normalizeCatalog,
  parseGithubTags,
  parseReleaseLimit,
  planDownloads,
  resolveVersion,
  sortVersionsDesc,
  validateRelease,
} from "../scripts/lib/ism.mjs";

const RSS_FEED = "https://www.cyber.gov.au/rss/news";

function summary(version, count = 1000) {
  return {
    version,
    release: version.slice(1),
    title: "Information security manual",
    sourceUrl: `https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/${version}/ISM_catalog.json`,
    count,
    syncedAt: "2026-05-11T05:33:44.662Z",
  };
}

function control(id, extra = {}) {
  return {
    id,
    title: `Control: ${id}`,
    props: [
      { name: "revision", value: "2" },
      { name: "updated", value: "Mar-25" },
      { name: "applicability", value: "NC" },
      { name: "applicability", value: "P" },
      { name: "essential-eight-applicability", value: "ML2" },
      { name: "sort-id", value: "0001" },
    ],
    parts: [{ name: "statement", prose: `Statement for ${id}.`, parts: [{ name: "guidance", prose: "Nested." }] }],
    ...extra,
  };
}

const TINY_CATALOG = {
  catalog: {
    metadata: { title: "Information security manual" },
    groups: [
      {
        title: "Guidelines for cyber security roles",
        groups: [
          {
            title: "Chief information security officer",
            controls: [control("ism-0714"), control("ism-1478", { title: "Named control" })],
          },
        ],
      },
    ],
  },
};

describe("compareVersions", () => {
  it("orders numerically rather than lexically", () => {
    assert.ok(compareVersions("v2026.09.4", "v2026.06.18") > 0);
    assert.ok(compareVersions("v2024.03.12", "v2024.03.5") > 0);
    assert.ok(compareVersions("v2022.12.1", "v2023.03.3") < 0);
    assert.equal(compareVersions("v2026.09.04", "v2026.09.4"), 0);
  });

  it("sorts newest first", () => {
    assert.deepEqual(sortVersionsDesc(["v2024.03.5", "v2026.09.4", "v2024.03.12"]), [
      "v2026.09.4",
      "v2024.03.12",
      "v2024.03.5",
    ]);
  });
});

describe("version discovery parsing", () => {
  it("only accepts tag names shaped like releases", () => {
    assert.deepEqual(parseGithubTags([{ name: "v2026.09.4" }, { name: "latest" }, { name: "v1.0" }, {}]), ["v2026.09.4"]);
    assert.deepEqual(parseGithubTags({ message: "API rate limit exceeded" }), []);
  });

  it("extracts versions from the cyber.gov.au OSCAL page", () => {
    const html = "<li>ISM OSCAL v2026.09.04</li><li>ISM OSCAL v2025.03.31</li><p>v2020.01.01</p>";
    assert.deepEqual(extractVersionsFromCyberPage(html), ["v2026.09.04", "v2025.03.31"]);
  });

  it("requires a standalone ISM word in the RSS feed", () => {
    const xml = [
      "<title>New mechanism released 2026.01.15</title>",
      "<title>ISM update v2026.06.18 published</title>",
      "<title>Phishing mechanisms 2025.12.01</title>",
    ].join("");
    assert.deepEqual(extractVersionsFromRss(xml), ["v2026.06.18"]);
  });

  it("maps zero-padded scraped versions onto existing tags", () => {
    const tags = new Set(["v2026.09.4", "v2025.03.31"]);
    assert.equal(resolveVersion("v2026.09.04", tags), "v2026.09.4");
    assert.equal(resolveVersion("v2025.03.31", tags), "v2025.03.31");
    assert.equal(resolveVersion("v2027.01.01", tags), "v2027.01.01");
  });

  it("marks tag-confirmed versions and de-duplicates scraped spellings", () => {
    const candidates = buildCandidates({
      tags: ["v2026.09.4", "v2026.06.18"],
      scraped: ["v2026.09.04", "v2026.06.18", "v2026.12.01"],
    });
    assert.deepEqual(candidates, [
      { version: "v2026.12.01", confirmed: false },
      { version: "v2026.09.4", confirmed: true },
      { version: "v2026.06.18", confirmed: true },
    ]);
  });
});

describe("planDownloads", () => {
  const candidates = [
    { version: "v2026.09.4", confirmed: true },
    { version: "v2026.06.18", confirmed: true },
    { version: "v2026.03.24", confirmed: true },
  ];

  it("skips releases already on disk", () => {
    assert.deepEqual(
      planDownloads(candidates, ["v2026.03.24"]).map((c) => c.version),
      ["v2026.09.4", "v2026.06.18"],
    );
  });

  it("re-downloads everything when forced and honours the limit", () => {
    assert.equal(planDownloads(candidates, ["v2026.03.24"], { force: true }).length, 3);
    assert.deepEqual(
      planDownloads(candidates, [], { limit: 1 }).map((c) => c.version),
      ["v2026.09.4"],
    );
  });

  it("parses ISM_RELEASE_COUNT", () => {
    assert.equal(parseReleaseLimit("all"), null);
    assert.equal(parseReleaseLimit(undefined), null);
    assert.equal(parseReleaseLimit("3"), 3);
    assert.equal(parseReleaseLimit("-1"), null);
    assert.equal(parseReleaseLimit("abc"), null);
  });
});

describe("normalizeCatalog", () => {
  it("flattens a tiny OSCAL catalog", () => {
    const snapshot = normalizeCatalog("v2026.09.4", TINY_CATALOG, { syncedAt: "2026-11-03T00:00:00.000Z" });
    assert.equal(snapshot.count, 2);
    assert.equal(snapshot.release, "2026.09.4");
    assert.equal(snapshot.syncedAt, "2026-11-03T00:00:00.000Z");
    assert.equal(
      snapshot.sourceUrl,
      "https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/v2026.09.4/ISM_catalog.json",
    );
    const [first, second] = snapshot.controls;
    assert.equal(first.objectID, "v2026_09_4_ism-0714");
    assert.equal(first.controlId, "ISM-0714");
    assert.equal(first.title, "ISM-0714");
    assert.equal(second.title, "Named control");
    assert.equal(first.chapter, "Guidelines for cyber security roles");
    assert.equal(first.section, "Chief information security officer");
    assert.equal(first.statement, "Statement for ism-0714.");
    assert.equal(first.body, "Statement for ism-0714.\n\nNested.");
    assert.deepEqual(first.applicabilityLabels, ["OFFICIAL", "PROTECTED"]);
    assert.deepEqual(first.essentialEight, ["ML2"]);
    assert.equal(first.revision, "2");
  });

  it("rejects catalogs without a root or with id-less controls", () => {
    assert.throws(() => normalizeCatalog("v2026.09.4", { nope: true }));
    assert.throws(() => normalizeCatalog("v2026.09.4", { catalog: { controls: [{ title: "x" }] } }));
  });
});

describe("validateRelease", () => {
  it("requires at least 500 controls", () => {
    const snapshot = normalizeCatalog("v2026.09.4", TINY_CATALOG);
    assert.match(validateRelease(snapshot).join(), /only 2 controls/);
    assert.deepEqual(validateRelease(snapshot, { minControls: 2 }), []);
  });

  it("requires controlId and version on every control", () => {
    const snapshot = normalizeCatalog("v2026.09.4", TINY_CATALOG);
    snapshot.controls[1].controlId = "";
    assert.match(validateRelease(snapshot, { minControls: 1 }).join(), /missing controlId or version/);
  });

  it("treats files with zero controls as unusable", () => {
    assert.equal(isUsableReleaseFile({ version: "v2026.09.4", count: 0, controls: [] }), false);
    assert.equal(isUsableReleaseFile({ version: "v2026.09.4", count: 1, controls: [{}] }), true);
    assert.equal(isUsableReleaseFile(null), false);
  });
});

describe("manifest", () => {
  it("is the union of releases on disk, newest first, de-duplicated", () => {
    const manifest = buildManifest([summary("v2024.03.5"), summary("v2026.09.4"), summary("v2024.03.12"), summary("v2024.03.5")], {
      generatedAt: "2026-11-03T00:00:00.000Z",
      rssFeed: RSS_FEED,
    });
    assert.deepEqual(
      manifest.releases.map((r) => r.version),
      ["v2026.09.4", "v2024.03.12", "v2024.03.5"],
    );
    assert.deepEqual(Object.keys(manifest), ["generatedAt", "source", "rssFeed", "releases"]);
  });

  it("never shrinks when discovery returns fewer releases than are on disk", () => {
    // Discovery found nothing and the download limit is 1, but all disk releases remain listed.
    const onDisk = ["v2025.03.31", "v2025.07.16", "v2026.03.24"].map((v) => summary(v));
    const downloads = planDownloads(buildCandidates({ tags: [], scraped: [] }), onDisk.map((s) => s.version), { limit: 1 });
    assert.equal(downloads.length, 0);
    const manifest = buildManifest(onDisk, { generatedAt: "x", rssFeed: RSS_FEED });
    assert.equal(manifest.releases.length, 3);
  });

  it("keeps the previous generatedAt when only the timestamp would change", () => {
    const previous = buildManifest([summary("v2026.03.24")], { generatedAt: "2026-05-11T05:33:52.681Z", rssFeed: RSS_FEED });
    const next = buildManifest([summary("v2026.03.24")], { generatedAt: "2026-11-03T00:00:00.000Z", rssFeed: RSS_FEED });
    assert.ok(manifestsEquivalent(previous, next));
    const unchanged = chooseManifest(previous, next);
    assert.equal(unchanged.changed, false);
    assert.equal(unchanged.manifest.generatedAt, "2026-05-11T05:33:52.681Z");

    const grown = buildManifest([summary("v2026.03.24"), summary("v2026.09.4")], {
      generatedAt: "2026-11-03T00:00:00.000Z",
      rssFeed: RSS_FEED,
    });
    const changed = chooseManifest(previous, grown);
    assert.equal(changed.changed, true);
    assert.equal(changed.manifest.generatedAt, "2026-11-03T00:00:00.000Z");
  });
});

describe("byte-stable JSON writes", () => {
  it("serializes with two-space indent and a trailing newline", () => {
    assert.equal(serializeJson({ a: [1] }), '{\n  "a": [\n    1\n  ]\n}\n');
  });

  it("skips the write when bytes are identical and writes atomically otherwise", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ism-sync-test-"));
    try {
      const file = path.join(dir, "nested", "manifest.json");
      assert.equal(await writeJsonIfChanged(file, { a: 1 }), true);
      const before = await stat(file);
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(await writeJsonIfChanged(file, { a: 1 }), false);
      const after = await stat(file);
      assert.equal(after.mtimeMs, before.mtimeMs);
      assert.equal(await writeJsonIfChanged(file, { a: 2 }), true);
      assert.deepEqual(await readJsonIfExists(file), { a: 2 });

      await writeFileAtomic(path.join(dir, "x.json"), "hello\n");
      assert.equal(await readFile(path.join(dir, "x.json"), "utf8"), "hello\n");
      await writeFile(path.join(dir, "bad.json"), "{not json");
      assert.equal(await readJsonIfExists(path.join(dir, "bad.json")), null);
      assert.equal(await readJsonIfExists(path.join(dir, "missing.json")), null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
