import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAdvisorySnapshot,
  decodeEntities,
  htmlToText,
  listingUrl,
  mergeAdvisories,
  migrateAdvisory,
  parseCyberUrl,
  parseDate,
  parseDetailSeverity,
  parseListingCards,
  parseMaxPage,
  parseRssItems,
  rssItemToAdvisory,
} from "../scripts/lib/acsc.mjs";

const NOW = "2026-11-03T10:00:00.000Z";
const EARLIER = "2026-05-11T05:33:56.000Z";

const ALERTS_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0" xml:base="https://www.cyber.gov.au/">
  <channel>
    <title>ASD's ACSC - Alerts RSS</title>
    <item>
      <title>Critical vulnerabilities in PHP &amp; friends</title>
      <link>https://www.cyber.gov.au/alert/critical-vulnerabilities-in-php</link>
      <description><![CDATA[<p>A security release for <strong>two</strong> PHP vulnerabilities &ndash; patch now.</p>]]></description>
      <pubDate>Wed, 21 Oct 2026 14:01:26 +1100</pubDate>
      <guid isPermaLink="true">https://www.cyber.gov.au/alert/critical-vulnerabilities-in-php</guid>
    </item>
    <item>
      <title><![CDATA[Organisations&rsquo; AI services]]></title>
      <link>https://www.cyber.gov.au/alert/organisations-ai-services?ref=rss&amp;x=1</link>
      <description>&lt;p&gt;Don&#8217;t wait &#x2014; act.&lt;/p&gt;</description>
      <pubDate>Thu, 01 Oct 2026 23:39:24 +1000</pubDate>
    </item>
    <item>
      <title>Phishing</title>
      <link>https://www.cyber.gov.au@evil.example/alert/phish</link>
      <pubDate>Thu, 01 Oct 2026 10:39:24 +1000</pubDate>
    </item>
    <item>
      <title>Script</title>
      <link>javascript:alert(1)</link>
    </item>
  </channel>
</rss>`;

function rssAdvisories(xml, type) {
  return parseRssItems(xml)
    .map((item) => rssItemToAdvisory(item, type, { now: NOW }))
    .filter(Boolean);
}

const LEGACY = {
  objectID: "about-us_view-all-content_alerts-and-advisories_active-exploitation-of-cpanel-whm-critical-vulnerability",
  title: "Active exploitation of cPanel/WHM critical vulnerability",
  summary: "Old summary.",
  href: "https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/active-exploitation-of-cpanel-whm-critical-vulnerability",
  date: "01 May 2026",
  type: "Alert",
  severity: "Critical",
  audiences: ["Small & medium businesses", "Government"],
  source: "Cyber.gov.au alerts and advisories",
};

describe("entities and text", () => {
  it("decodes numeric and named entities in a single pass", () => {
    assert.equal(decodeEntities("Don&#8217;t &rsquo;x&lsquo; &#x2014; &amp;lt; &nbsp;&hellip;"), "Don\u2019t \u2019x\u2018 \u2014 &lt;  \u2026");
    assert.equal(decodeEntities("&unknown; &#0;"), "&unknown; \uFFFD");
  });

  it("strips tags and collapses whitespace", () => {
    assert.equal(htmlToText("<p>Hello <b>world</b><br/>again</p>\n\n<script>x()</script>"), "Hello world again");
  });
});

describe("parseRssItems", () => {
  it("parses items with CDATA and entity-escaped HTML", () => {
    const items = parseRssItems(ALERTS_RSS);
    assert.equal(items.length, 4);
    assert.equal(items[0].title, "Critical vulnerabilities in PHP & friends");
    assert.equal(items[0].description, "A security release for two PHP vulnerabilities – patch now.");
    assert.equal(items[0].pubDate, "Wed, 21 Oct 2026 14:01:26 +1100");
    assert.equal(items[1].title, "Organisations’ AI services");
    assert.equal(items[1].description, "Don’t wait — act.");
    assert.equal(items[1].guid, "");
  });

  it("converts items into advisories and drops off-site links", () => {
    const advisories = rssAdvisories(ALERTS_RSS, "Alert");
    assert.equal(advisories.length, 2);
    assert.deepEqual(advisories[0], {
      objectID: "alert_critical-vulnerabilities-in-php",
      title: "Critical vulnerabilities in PHP & friends",
      summary: "A security release for two PHP vulnerabilities – patch now.",
      href: "https://www.cyber.gov.au/alert/critical-vulnerabilities-in-php",
      published: "2026-10-21",
      date: "21 Oct 2026",
      firstSeenAt: NOW,
      type: "Alert",
      severity: null,
      audiences: [],
      source: "Cyber.gov.au RSS",
    });
    // Query string stripped; calendar date taken as written (not shifted to UTC).
    assert.equal(advisories[1].href, "https://www.cyber.gov.au/alert/organisations-ai-services");
    assert.equal(advisories[1].published, "2026-10-01");
  });

  it("returns no items for an empty feed", () => {
    assert.deepEqual(parseRssItems('<rss><channel><title>x</title></channel></rss>'), []);
    assert.deepEqual(parseRssItems(""), []);
  });
});

describe("parseCyberUrl", () => {
  it("accepts https cyber.gov.au URLs (including relative and subdomains)", () => {
    assert.equal(parseCyberUrl("https://www.cyber.gov.au/alert/x")?.hostname, "www.cyber.gov.au");
    assert.equal(parseCyberUrl("/advisory/y?ref=search")?.pathname, "/advisory/y");
    assert.equal(parseCyberUrl("https://cyber.gov.au/alert/x")?.hostname, "cyber.gov.au");
    assert.equal(parseCyberUrl("https://assets.cyber.gov.au/a")?.hostname, "assets.cyber.gov.au");
    assert.equal(parseCyberUrl("https://www.cyber.gov.au/alert/a&amp;b")?.pathname, "/alert/a&b");
  });

  it("rejects other hosts, schemes and credential tricks", () => {
    for (const href of [
      "https://www.cyber.gov.au@evil.example/x",
      "javascript:alert(1)",
      "http://www.cyber.gov.au/alert/x",
      "https://evilcyber.gov.au/x",
      "https://www.cyber.gov.au.evil.example/x",
      "//evil.example/x",
      "data:text/html,hi",
      "https://user:pw@www.cyber.gov.au/x",
      "",
      null,
    ]) {
      assert.equal(parseCyberUrl(href), null, String(href));
    }
  });
});

describe("parseDate", () => {
  it("parses RSS and display dates", () => {
    assert.deepEqual(parseDate("Fri, 23 Oct 2026 16:11:47 +1100"), { published: "2026-10-23", date: "23 Oct 2026" });
    assert.deepEqual(parseDate("07 May 2026"), { published: "2026-05-07", date: "07 May 2026" });
    assert.deepEqual(parseDate("2026-01-08"), { published: "2026-01-08", date: "08 Jan 2026" });
    assert.equal(parseDate("soon"), null);
  });
});

describe("legacy migration", () => {
  it("migrates old-format entries to the new schema", () => {
    assert.deepEqual(migrateAdvisory(LEGACY, { fallbackFirstSeenAt: EARLIER }), {
      objectID: "alert_active-exploitation-of-cpanel-whm-critical-vulnerability",
      title: "Active exploitation of cPanel/WHM critical vulnerability",
      summary: "Old summary.",
      href: "https://www.cyber.gov.au/alert/active-exploitation-of-cpanel-whm-critical-vulnerability",
      published: "2026-05-01",
      date: "01 May 2026",
      firstSeenAt: EARLIER,
      type: "Alert",
      severity: "Critical",
      audiences: ["Small and medium business", "Government"],
      source: "Cyber.gov.au RSS",
    });
  });

  it("drops stored entries with unsafe hrefs", () => {
    assert.equal(migrateAdvisory({ ...LEGACY, href: "https://evil.example/x" }, { fallbackFirstSeenAt: EARLIER }), null);
  });
});

describe("mergeAdvisories", () => {
  it("dedupes legacy entries against new RSS items by slug, keeping firstSeenAt and severity", () => {
    const rss = rssAdvisories(
      `<rss><channel><item><title>Active exploitation of cPanel/WHM critical vulnerability (updated)</title>
        <link>https://www.cyber.gov.au/alert/active-exploitation-of-cpanel-whm-critical-vulnerability</link>
        <description>New summary.</description><pubDate>Fri, 01 May 2026 09:00:00 +1000</pubDate></item></channel></rss>`,
      "Alert",
    );
    const merged = mergeAdvisories([LEGACY], rss, { now: NOW, fallbackFirstSeenAt: EARLIER });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].title, "Active exploitation of cPanel/WHM critical vulnerability (updated)");
    assert.equal(merged[0].summary, "New summary.");
    assert.equal(merged[0].firstSeenAt, EARLIER);
    assert.equal(merged[0].severity, "Critical");
    assert.deepEqual(merged[0].audiences, ["Small and medium business", "Government"]);
  });

  it("collapses duplicate stored entries and applies enrichment", () => {
    const current = migrateAdvisory(LEGACY, { fallbackFirstSeenAt: NOW });
    const enrichment = new Map([
      ["active-exploitation-of-cpanel-whm-critical-vulnerability", { audiences: ["Government"], severity: "High" }],
      ["not-in-archive", { severity: "Low" }],
    ]);
    const merged = mergeAdvisories([LEGACY, current], [], { now: NOW, fallbackFirstSeenAt: EARLIER, enrichment });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].firstSeenAt, EARLIER);
    assert.equal(merged[0].severity, "High");
    assert.deepEqual(merged[0].audiences, ["Government"]);
  });

  it("keeps known severity/audiences when enrichment is missing and sorts newest first", () => {
    const older = { ...migrateAdvisory(LEGACY, { fallbackFirstSeenAt: EARLIER }) };
    const rss = rssAdvisories(ALERTS_RSS, "Alert");
    const merged = mergeAdvisories([older], rss, { now: NOW });
    assert.deepEqual(
      merged.map((a) => a.published),
      ["2026-10-21", "2026-10-01", "2026-05-01"],
    );
    assert.equal(merged[2].severity, "Critical");
    assert.equal(merged[0].firstSeenAt, NOW);
  });

  it("drops unaliased /node/ duplicates of a slugged item", () => {
    const xml = `<rss><channel>
      <item><title>Same title</title><link>https://www.cyber.gov.au/node/1215</link><pubDate>Wed, 02 Sep 2026 12:05:23 +1000</pubDate></item>
      <item><title>Same title</title><link>https://www.cyber.gov.au/alert/same-title</link><pubDate>Mon, 24 Aug 2026 12:05:23 +1000</pubDate></item>
      <item><title>Only node</title><link>https://www.cyber.gov.au/node/99</link><pubDate>Mon, 24 Aug 2026 12:05:23 +1000</pubDate></item>
    </channel></rss>`;
    const merged = mergeAdvisories([], rssAdvisories(xml, "Alert"), { now: NOW });
    assert.deepEqual(
      merged.map((a) => [a.objectID, a.href]),
      [
        ["alert_node-99", "https://www.cyber.gov.au/node/99"],
        ["alert_same-title", "https://www.cyber.gov.au/alert/same-title"],
      ],
    );
  });

  it("caps the archive size", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...LEGACY,
      title: `Item ${i}`,
      href: `https://www.cyber.gov.au/advisory/item-${i}`,
      date: `${String(i + 1).padStart(2, "0")} Jan 2026`,
    }));
    const merged = mergeAdvisories(many, [], { now: NOW, limit: 5 });
    assert.equal(merged.length, 5);
    assert.equal(merged[0].title, "Item 11");
  });
});

describe("buildAdvisorySnapshot", () => {
  it("records complete refreshes and preserves freshness on partial refreshes", () => {
    const advisories = rssAdvisories(ALERTS_RSS, "Alert");
    const first = buildAdvisorySnapshot(advisories, null, { now: EARLIER });
    assert.equal(first.changed, true);
    assert.equal(first.snapshot.fetchedAt, EARLIER);
    assert.equal(first.snapshot.count, 2);
    assert.deepEqual(Object.keys(first.snapshot), ["source", "sourceUrl", "feeds", "fetchedAt", "count", "advisories"]);

    const again = buildAdvisorySnapshot(structuredClone(advisories), first.snapshot, { now: NOW });
    assert.equal(again.changed, false);
    assert.equal(again.snapshot.fetchedAt, NOW);

    const partial = buildAdvisorySnapshot(advisories.slice(1), first.snapshot, { now: NOW, complete: false });
    assert.equal(partial.changed, true);
    assert.equal(partial.snapshot.fetchedAt, EARLIER);
    assert.equal(buildAdvisorySnapshot(advisories, null, { now: NOW, complete: false }).snapshot.fetchedAt, "");

    const changed = buildAdvisorySnapshot(advisories.slice(1), first.snapshot, { now: NOW });
    assert.equal(changed.changed, true);
    assert.equal(changed.snapshot.fetchedAt, NOW);
  });
});

describe("HTML listing enrichment", () => {
  const card = (href, audiences) => `
    <a href="${href}" data-component-id="cybergovau:card-search" class="card-search card-search--linked">
      <span class="cga-pill__text"><div>Alert</div></span>
      <div data-label="Audience" class="audience-region">
        ${audiences.map((a) => `<div class="cga-pill"><span class="cga-pill__text">${a}</span></div>`).join("")}
        <div class="cga-pill"><span class="cga-pill__text">
          +1 tag
        </span></div>
      </div>
    </a>`;

  it("parses cards, audiences and pager", () => {
    const html = `${card("/alert/one?ref=search", ["Government", "Small and medium business", "Government"])}
      ${card("https://evil.example/alert/two", ["Government"])}
      ${card("/advisory/three?ref=search", [])}
      <a href="?sort_by=field_du_value_1&amp;page=5">last</a>`;
    assert.deepEqual(parseListingCards(html), [
      { slug: "one", type: "Alert", audiences: ["Government", "Small and medium business"] },
      { slug: "three", type: "Advisory", audiences: [] },
    ]);
    assert.equal(parseMaxPage(html), 5);
    assert.equal(listingUrl({ page: 2 }), "https://www.cyber.gov.au/alerts-and-advisories?sort_by=field_du_value_1&page=2");
  });

  it("reads severity from an alert detail page", () => {
    assert.equal(parseDetailSeverity('<div class="alert-status alert-status--critical">'), "Critical");
    assert.equal(parseDetailSeverity("<span>Alert Status: High</span>"), "High");
    assert.equal(parseDetailSeverity("<p>No rating</p>"), null);
  });
});
