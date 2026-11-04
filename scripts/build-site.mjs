#!/usr/bin/env node
// Build the static ISM Search site for GitHub Pages.
//   node scripts/build-site.mjs [--check]
// Env: SITE_BASE_URL, SITE_OUT_DIR (default site-dist), SITE_DATA_DIR (default data),
//      BUILD_TIME (default now).
import { buildSite } from "./site/build.mjs";
import { checkLinks } from "./site/check-links.mjs";

const formatBytes = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);

try {
  const summary = await buildSite({
    dataDir: process.env.SITE_DATA_DIR || "data",
    outDir: process.env.SITE_OUT_DIR || "site-dist",
    baseUrl: process.env.SITE_BASE_URL || undefined,
    buildTime: process.env.BUILD_TIME || undefined,
    log: (message) => console.log(message),
  });
  console.log(
    [
      `Built ISM Search site in ${summary.durationMs} ms -> ${summary.outDir}`,
      `  base URL:     ${summary.baseUrl}`,
      `  built at:     ${summary.buildTime}`,
      `  ISM:          ${summary.latestVersion} (${summary.releases} releases, ${summary.currentControls} current controls, ${summary.removedControls} removed)`,
      `  advisories:   ${summary.advisories}${summary.advisoriesStale ? " (STALE: older than 14 days)" : ""}`,
      `  HTML pages:   ${summary.htmlPages} (${summary.controlPages} control pages)`,
      `  files:        ${summary.files}`,
      `  total size:   ${formatBytes(summary.bytes)}`,
    ].join("\n"),
  );
  if (process.argv.includes("--check")) {
    const result = await checkLinks(summary.outDir);
    console.log(`Link check: ${result.checked} links across ${result.pages} pages, ${result.broken.length} broken.`);
    for (const item of result.broken.slice(0, 50)) console.error(`  ${item.page}: ${item.href} (${item.reason})`);
    if (result.broken.length) process.exitCode = 1;
  }
} catch (error) {
  console.error(`build-site failed: ${error.stack ?? error}`);
  process.exitCode = 1;
}
