import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3001";
const OUT_DIR = path.join(process.cwd(), "docs", "screenshots");

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
}

async function validateUi(page, label) {
  const unnamedControls = await page.locator("a, button").evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const text = node.textContent?.trim() ?? "";
        const aria = node.getAttribute("aria-label") ?? "";
        const title = node.getAttribute("title") ?? "";
        return !text && !aria && !title;
      })
      .map((node) => node.outerHTML.slice(0, 180)),
  );
  if (unnamedControls.length) {
    throw new Error(`${label} has links/buttons without accessible names:\n${unnamedControls.join("\n")}`);
  }

  const horizontalOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - window.innerWidth;
  });
  if (horizontalOverflow > 3) {
    throw new Error(`${label} has ${horizontalOverflow}px horizontal overflow`);
  }
}

async function save(page, name, options = {}) {
  await settle(page);
  await validateUi(page, name);
  const target = options.locator ?? page;
  await target.screenshot({
    path: path.join(OUT_DIR, name),
    fullPage: options.locator ? undefined : options.fullPage ?? true,
    animations: "disabled",
  });
  console.log(`Captured ${name}`);
}

async function clickButton(page, name, options = {}) {
  await page.getByRole("button", { name, exact: options.exact ?? true }).click({ timeout: options.timeout ?? 20_000 });
}

async function waitForText(page, text, timeout = 30_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1040 },
  deviceScaleFactor: 1,
});

page.setDefaultTimeout(25_000);

try {
  await page.goto(BASE_URL);
  await settle(page);

  await clickButton(page, "Search controls");
  await waitForText(page, "Showing");
  await save(page, "01-workbench-search-results.png");

  await page.getByRole("button", { name: "PROTECTED", exact: true }).click();
  await page.getByRole("button", { name: "SECRET", exact: true }).click();
  await clickButton(page, "Search controls");
  await waitForText(page, "2 selected");
  await save(page, "02-classification-filters.png");

  await clickButton(page, "Ask with retrieved controls");
  await waitForText(page, "Evidence controls", 60_000);
  await page.waitForTimeout(3_500);
  await save(page, "03-ollama-answer.png", { locator: page.locator('section[aria-label="Results"]') });

  await clickButton(page, "Generate SSP CSV");
  await waitForText(page, "mapped controls");
  await save(page, "04-ssp-csv-generator.png", { locator: page.locator('section[aria-label="Results"]') });

  await page.getByLabel("Policy type").selectOption("incident_response");
  await page.getByLabel("Organisation").fill("Northbridge Health");
  await page.getByRole("button", { name: "Health information", exact: true }).click();
  await page.getByRole("button", { name: "Government information", exact: true }).click();
  await clickButton(page, "Generate policy");
  await page
    .locator('section[aria-label="Results"]')
    .getByRole("heading", { name: /incident response policy/i })
    .waitFor({ timeout: 90_000 });
  await page.waitForTimeout(4_000);
  await save(page, "05-policy-generator.png", { locator: page.locator('section[aria-label="Results"]') });

  await clickButton(page, "Compare releases");
  await waitForText(page, "Diffing");
  await save(page, "06-version-diff-viewer.png", { locator: page.locator('section[aria-label="Results"]') });

  await page.goto(`${BASE_URL}/advisories`);
  await waitForText(page, "Latest alerts and advisories");
  await save(page, "07-acsc-advisories.png");

  await page.goto(`${BASE_URL}/jobs`);
  await waitForText(page, "Sync jobs");
  await save(page, "08-bullmq-jobs.png");

  await page.goto(`${BASE_URL}/health`);
  await waitForText(page, "ISM Search Health");
  await save(page, "09-health-dashboard.png");

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  mobile.setDefaultTimeout(25_000);

  await mobile.goto(BASE_URL);
  await waitForText(mobile, "Workbench");
  await save(mobile, "10-mobile-workbench-actions.png", { fullPage: false });

  await clickButton(mobile, "Search controls");
  await waitForText(mobile, "Showing");
  await mobile.locator("#workbench-results").scrollIntoViewIfNeeded();
  await save(mobile, "11-mobile-search-results.png", { fullPage: false });

  await mobile.goto(`${BASE_URL}/advisories`);
  await waitForText(mobile, "Latest alerts and advisories");
  await save(mobile, "12-mobile-advisories.png", { fullPage: false });

  await mobile.goto(`${BASE_URL}/jobs`);
  await waitForText(mobile, "Sync jobs");
  await save(mobile, "13-mobile-jobs.png", { fullPage: false });

  await mobile.goto(`${BASE_URL}/health`);
  await waitForText(mobile, "ISM Search Health");
  await save(mobile, "14-mobile-health.png", { fullPage: false });

  await mobile.close();
} finally {
  await browser.close();
}
