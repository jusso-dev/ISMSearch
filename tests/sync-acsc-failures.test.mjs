import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("ACSC partial refresh retains fetched items but reports failure and preserves freshness", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "acsc-sync-failures-"));
  try {
    const mock = path.join(dir, "mock.mjs");
    await writeFile(mock, `globalThis.fetch = async (url) => {
      const alert = String(url).endsWith('/alerts');
      if (process.env.SCENARIO === 'none') return new Response('', { status: 404 });
      if (!alert && process.env.SCENARIO === 'partial') return new Response('', { status: 404 });
      const slug = alert && process.env.SCENARIO === 'partial' ? 'new-alert' : alert ? 'alert' : 'advisory';
      return new Response('<rss><channel><item><title>' + slug + '</title><link>https://www.cyber.gov.au/' + slug + '</link><pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item></channel></rss>');
    };`);
    const run = (scenario) => spawnSync(process.execPath, ["--import", mock, "scripts/sync-acsc-advisories.mjs"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, ACSC_DATA_DIR: dir, ACSC_ENRICH: "0", SCENARIO: scenario },
      encoding: "utf8",
    });
    const first = run("complete");
    assert.equal(first.status, 0, first.stderr);
    const before = JSON.parse(await readFile(path.join(dir, "advisories.json"), "utf8"));
    const partial = run("partial");
    assert.equal(partial.status, 1, partial.stderr);
    const after = JSON.parse(await readFile(path.join(dir, "advisories.json"), "utf8"));
    assert.equal(after.fetchedAt, before.fetchedAt);
    assert.equal(after.advisories.length, 3);
    assert.ok(after.advisories.some((item) => item.title === "new-alert"));
    const beforeFailure = await readFile(path.join(dir, "advisories.json"), "utf8");
    const none = run("none");
    assert.equal(none.status, 1, none.stderr);
    assert.equal(await readFile(path.join(dir, "advisories.json"), "utf8"), beforeFailure);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
