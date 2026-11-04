import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("ISM sync reports discovery and confirmed download failures while preserving releases", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ism-sync-failures-"));
  try {
    const dataDir = path.join(dir, "data");
    await mkdir(path.join(dataDir, "releases"), { recursive: true });
    const releasePath = path.join(dataDir, "releases", "v2026.01.1.json");
    const original = JSON.stringify({ version: "v2026.01.1", count: 1, controls: [{ controlId: "ISM-1" }] });
    await writeFile(releasePath, original);
    const mockPath = path.join(dir, "mock.mjs");
    await writeFile(mockPath, `globalThis.fetch = async (url) => {
      if (String(url).includes('api.github.com')) {
        if (process.env.SCENARIO === 'discovery') return new Response('', { status: 404 });
        const names = process.env.SCENARIO === 'download' ? ['v2026.01.1', 'v2026.02.1'] : ['v2026.01.1'];
        return Response.json(names.map(name => ({ name })));
      }
      if (String(url).includes('raw.githubusercontent.com')) return new Response('', { status: 404 });
      return new Response('');
    };`);
    for (const scenario of ["discovery", "download", "success"]) {
      const result = spawnSync(process.execPath, ["--import", mockPath, "scripts/sync-ism.mjs"], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH, ISM_DATA_DIR: dataDir, SCENARIO: scenario },
        encoding: "utf8",
      });
      assert.equal(result.status, scenario === "success" ? 0 : 1, result.stderr);
      assert.equal(await readFile(releasePath, "utf8"), original);
      const manifest = JSON.parse(await readFile(path.join(dataDir, "manifest.json"), "utf8"));
      assert.deepEqual(manifest.releases.map((release) => release.version), ["v2026.01.1"]);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
