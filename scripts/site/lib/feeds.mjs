// RSS 2.0, JSON Feed 1.1 and sitemap generation.
import { escapeXml } from "./escape.mjs";
import { rfc822, toDate } from "./dates.mjs";

export function rssFeed({ title, link, selfUrl, description, lastBuildDate, items }) {
  const itemXml = items.map((item) => {
    const parts = [`      <title>${escapeXml(item.title)}</title>`];
    if (item.link) parts.push(`      <link>${escapeXml(item.link)}</link>`);
    parts.push(`      <guid isPermaLink="${item.isPermaLink ? "true" : "false"}">${escapeXml(item.guid)}</guid>`);
    const pub = rfc822(item.pubDate);
    if (pub) parts.push(`      <pubDate>${pub}</pubDate>`);
    for (const category of item.categories ?? []) parts.push(`      <category>${escapeXml(category)}</category>`);
    if (item.description) parts.push(`      <description>${escapeXml(item.description)}</description>`);
    return `    <item>\n${parts.join("\n")}\n    </item>`;
  });
  const built = rfc822(lastBuildDate);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(link)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    "    <language>en-au</language>",
    built ? `    <lastBuildDate>${built}</lastBuildDate>` : null,
    `    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>`,
    ...itemXml,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function jsonFeed({ title, homePageUrl, feedUrl, description, items }) {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title,
    home_page_url: homePageUrl,
    feed_url: feedUrl,
    description,
    language: "en-AU",
    items: items.map((item) => {
      const out = { id: item.id };
      if (item.url) out.url = item.url;
      out.title = item.title;
      out.summary = item.summary;
      out.content_text = item.contentText ?? item.summary;
      const date = toDate(item.datePublished);
      if (date) out.date_published = date.toISOString();
      if (item.tags?.length) out.tags = item.tags;
      return out;
    }),
  };
}

export function sitemap(urls) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}
