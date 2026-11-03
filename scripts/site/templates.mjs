// HTML templates for the static ISM site. All data passes through the
// auto-escaping `html` tagged template; only SafeHtml fragments built here are
// emitted unescaped.
import { html, raw } from "./lib/escape.mjs";
import { CLASSIFICATIONS, ESSENTIAL_EIGHT, classificationLabel } from "./lib/controls.mjs";
import { SEVERITIES, TYPES } from "./lib/advisories.mjs";
import { formatDate, formatDateTime } from "./lib/dates.mjs";
import { controlPath, officialSourceUrl, rel, releasePath } from "./lib/url.mjs";

export const REPO_URL = "https://github.com/jusso-dev/ISMSearch";
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";

const NAV = [
  { key: "search", label: "Search", target: "" },
  { key: "controls", label: "Browse controls", target: "controls/" },
  { key: "releases", label: "Releases", target: "releases/" },
  { key: "advisories", label: "Advisories", target: "advisories/" },
  { key: "about", label: "About", target: "about/" },
];

const FIELD_LABELS = {
  title: "Title",
  statement: "Statement",
  chapter: "Chapter",
  section: "Section",
  topic: "Topic",
  revision: "Revision",
  updated: "Updated",
  applicability: "Applicability",
  essentialEight: "Essential Eight",
};

export function fieldLabel(field) {
  return FIELD_LABELS[field] ?? field;
}

// Locale-independent thousands separators keep output deterministic.
const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const num = (n) => (typeof n === "number" ? group(n) : "–");
const plural = (n, word, many = `${word}s`) => `${group(n)} ${n === 1 ? word : many}`;

// ---------------------------------------------------------------- layout

export function layout(ctx, page) {
  const { depth } = page;
  const r = (target) => rel(depth, target);
  const scripts = (page.scripts ?? []).map((script) =>
    script.module
      ? html`<script type="module" src="${r(`assets/${script.src}`)}"></script>`
      : html`<script defer src="${r(`assets/${script.src}`)}"${script.dataBase ? html` data-base="${script.dataBase}"` : ""}></script>`,
  );
  const title = page.title ? `${page.title} · ISM Search` : "ISM Search";
  return html`<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
${page.baseHref ? html`<base href="${page.baseHref}">\n` : ""}<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${title}</title>
<meta name="description" content="${page.description ?? "Search and compare Australian Information Security Manual (ISM) controls and ACSC advisories."}">
${page.canonical ? html`<link rel="canonical" href="${page.canonical}">\n` : ""}<link rel="icon" href="${r("assets/favicon.svg")}" type="image/svg+xml">
<link rel="stylesheet" href="${r("assets/site.css")}">
<link rel="alternate" type="application/rss+xml" title="ACSC alerts and advisories" href="${r("advisories.xml")}">
<link rel="alternate" type="application/rss+xml" title="ISM releases" href="${r("releases.xml")}">
<link rel="alternate" type="application/feed+json" title="ACSC alerts and advisories (JSON Feed)" href="${r("advisories.json")}">
${scripts}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${r("")}"><span class="brand-mark" aria-hidden="true">ISM</span><span>ISM Search</span></a>
    <nav aria-label="Primary">
      <ul class="nav-list">
        ${NAV.map(
          (item) =>
            html`<li><a href="${r(item.target)}"${item.key === page.nav ? raw(' aria-current="page"') : ""}>${item.label}</a></li>`,
        )}
      </ul>
    </nav>
  </div>
</header>
<main id="main" class="wrap" tabindex="-1">
${page.body}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <p class="footer-disclaimer"><strong>Not an authoritative source.</strong> ISM Search is an independent project and is not affiliated with or endorsed by ASD or the ACSC. Always verify against official publications.</p>
    <p class="footer-meta">
      <span>Source: <a href="https://github.com/AustralianCyberSecurityCentre/ism-oscal" rel="noopener noreferrer">ASD ISM OSCAL</a></span>
      <span>ISM ${ctx.latestVersion ?? "–"} synced ${formatDateTime(ctx.ismGeneratedAt) ?? "unknown"}</span>
      <span>Advisories updated ${formatDateTime(ctx.advisoriesUpdatedAt) ?? "unknown"}</span>
      <span>Site built ${formatDateTime(ctx.buildTime)}</span>
      <span><a href="${REPO_URL}" rel="noopener noreferrer">GitHub repository</a></span>
    </p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- shared fragments

export function classificationChips(codes) {
  if (!codes?.length) return html`<span class="muted">No classification applicability listed</span>`;
  return html`<ul class="chips" aria-label="Classification applicability">${codes.map(
    (code) => html`<li class="chip chip-class">${classificationLabel(code)}</li>`,
  )}</ul>`;
}

// Compact form for dense lists: the common "applies to every classification"
// case collapses to one chip.
export function classificationSummary(codes) {
  const all = CLASSIFICATIONS.every((c) => codes?.includes(c.code));
  if (all || codes?.includes("ALL")) {
    return html`<ul class="chips" aria-label="Classification applicability"><li class="chip chip-class">All classifications</li></ul>`;
  }
  return classificationChips(codes);
}

export function e8Chips(levels) {
  if (!levels?.length) return "";
  return html`<ul class="chips" aria-label="Essential Eight maturity levels">${levels.map(
    (level) => html`<li class="chip chip-e8">Essential Eight ${level}</li>`,
  )}</ul>`;
}

function controlMeta(control) {
  const parts = [];
  if (control.revision) parts.push(`Revision ${control.revision}`);
  if (control.updated) parts.push(`Updated ${control.updated}`);
  return parts.join(" · ");
}

export function renderWordDiff(ops, before, after) {
  if (!ops) {
    return html`<div class="diff-fallback">
  <div><p class="diff-label">Before</p><p class="diff-block diff-before">${before}</p></div>
  <div><p class="diff-label">After</p><p class="diff-block diff-after">${after}</p></div>
</div>`;
  }
  const parts = ops.map((op) => {
    if (op.type === "del") return html`<del>${op.text}</del>`;
    if (op.type === "ins") return html`<ins>${op.text}</ins>`;
    return html`<span>${op.text}</span>`;
  });
  const joined = [];
  parts.forEach((part, i) => {
    if (i > 0) joined.push(" ");
    joined.push(part);
  });
  return html`<p class="diff">${joined}</p>`;
}

const DIFF_LEGEND = html`<p class="diff-legend muted">In statement diffs, <del>removed words</del> are struck through and <ins>added words</ins> are underlined.</p>`;

function formatFieldValue(field, value) {
  if (value === null || value === undefined || value === "") return "none";
  if (field === "applicability") return value.length ? value.map(classificationLabel).join(", ") : "none";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return String(value);
}

export function renderFieldChanges(entry, diffFor) {
  const rows = (entry.fields ?? []).map((field) => {
    const change = entry.changes[field];
    if (field === "statement") {
      return html`<div class="change-row"><dt>${fieldLabel(field)}</dt><dd>${renderWordDiff(
        diffFor(change.before, change.after),
        change.before,
        change.after,
      )}</dd></div>`;
    }
    return html`<div class="change-row"><dt>${fieldLabel(field)}</dt><dd><span class="before">${formatFieldValue(
      field,
      change.before,
    )}</span> <span aria-hidden="true">→</span><span class="visually-hidden"> changed to </span> <span class="after">${formatFieldValue(
      field,
      change.after,
    )}</span></dd></div>`;
  });
  if (!rows.length) return "";
  return html`<dl class="changes">${rows}</dl>`;
}

function severityBadge(advisory) {
  const label = advisory.severity ? `${advisory.severity} severity` : "Not rated";
  const key = advisory.severity ? advisory.severity.toLowerCase() : "none";
  return html`<span class="badge badge-severity severity-${key}">${label}</span>`;
}

function advisoryLink(advisory, extraClass = "") {
  if (advisory.safeHref) {
    return html`<a class="${extraClass}" href="${advisory.safeHref}" rel="noopener noreferrer" target="_blank">${advisory.title}<span class="visually-hidden"> (opens cyber.gov.au in a new tab)</span></a>`;
  }
  return html`<span class="${extraClass}">${advisory.title}</span>`;
}

function advisoryDate(advisory) {
  const text = advisory.published ? formatDate(advisory.published) : advisory.date;
  if (!text) return html`<span class="muted">Date unknown</span>`;
  return advisory.published ? html`<time datetime="${advisory.published}">${text}</time>` : html`<span>${text}</span>`;
}

// ---------------------------------------------------------------- home

export function homePage(ctx, data) {
  const { latest, latestDiff, advisories, chapters } = data;
  const depth = 0;
  const r = (target) => rel(depth, target);
  const advisoryStrip = advisories.advisories.slice(0, 3);
  const body = html`
<section class="hero" aria-labelledby="page-title">
  <h1 id="page-title">ISM Explorer</h1>
  <p class="lede">Search the latest Australian Information Security Manual controls, trace how each control changed across releases and keep recent ACSC alerts close by.</p>
  <p class="hero-meta">
    <span><a href="${r(releasePath(latest.version))}">ISM ${latest.version}</a></span>
    <span>${plural(latest.controls.length, "control")}</span>
    <span>Advisories updated ${formatDate(advisories.fetchedAt) ?? "unknown"}</span>
    <span>Site built ${formatDateTime(ctx.buildTime)}</span>
  </p>
</section>

<section class="search-section" aria-labelledby="search-title">
  <h2 id="search-title" class="visually-hidden">Search controls</h2>
  <noscript><p class="notice">Interactive search needs JavaScript. You can still <a href="${r("controls/")}">browse every control by chapter</a>.</p></noscript>
  <div id="search-app" class="workbench" data-controls="${r("data/latest-controls.json")}" data-version="${latest.version}" hidden>
    <form id="search-form" class="filters" role="search" action="${r("")}" method="get">
      <div class="field">
        <label for="q">Search ${latest.version}</label>
        <input id="q" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="e.g. privileged access, 1234, MFA">
        <p class="hint">Enter keywords or a control number such as 1234.</p>
      </div>
      <fieldset class="field">
        <legend>Classification</legend>
        ${CLASSIFICATIONS.map(
          (c) => html`<label class="check"><input type="checkbox" name="class" value="${c.code}"> ${c.label}</label>`,
        )}
      </fieldset>
      <fieldset class="field">
        <legend>Essential Eight</legend>
        ${ESSENTIAL_EIGHT.map(
          (level) => html`<label class="check"><input type="checkbox" name="e8" value="${level}"> ${level}</label>`,
        )}
      </fieldset>
      <div class="field">
        <label for="chapter">Chapter</label>
        <select id="chapter" name="chapter">
          <option value="">All chapters</option>
          ${chapters.map((chapter) => html`<option value="${chapter.name}">${chapter.name}</option>`)}
        </select>
      </div>
      <div class="filter-actions">
        <button type="button" id="reset-filters" class="button button-quiet">Clear filters</button>
      </div>
    </form>
    <div class="results-region">
      <div class="results-bar">
        <p id="results-status" class="results-status" role="status" aria-live="polite">Loading controls…</p>
        <button type="button" id="download-csv" class="button" disabled>Download results as CSV</button>
      </div>
      <ol id="results" class="result-list"></ol>
      <button type="button" id="show-more" class="button show-more" hidden>Show more</button>
    </div>
  </div>
</section>

<div class="home-grid">
  <section aria-labelledby="changes-title" class="panel">
    <h2 id="changes-title">What changed in ${latest.version}</h2>
    ${
      latestDiff
        ? html`<p>Compared with ${latestDiff.previousVersion}:</p>
    <ul class="stat-list">
      <li><span class="stat">${num(latestDiff.counts.added)}</span> added</li>
      <li><span class="stat">${num(latestDiff.counts.changed)}</span> changed</li>
      <li><span class="stat">${num(latestDiff.counts.removed)}</span> removed</li>
    </ul>`
        : html`<p>This is the first tracked release, so there is nothing to compare yet.</p>`
    }
    <p><a href="${r(releasePath(latest.version))}">See every change in ${latest.version}</a> · <a href="${r("releases/")}">All releases</a></p>
  </section>
  <section aria-labelledby="advisories-title" class="panel">
    <h2 id="advisories-title">Latest ACSC alerts and advisories</h2>
    ${
      advisoryStrip.length
        ? html`<ul class="advisory-strip">${advisoryStrip.map(
            (a) => html`<li>
        <p class="advisory-meta">${severityBadge(a)} <span class="badge">${a.type}</span> ${advisoryDate(a)}</p>
        ${advisoryLink(a, "advisory-title")}
      </li>`,
          )}</ul>`
        : html`<p class="muted">No advisories archived yet.</p>`
    }
    <p><a href="${r("advisories/")}">All archived advisories</a></p>
  </section>
</div>`;
  return layout(ctx, {
    depth,
    nav: "search",
    title: "ISM Explorer",
    canonical: ctx.abs(""),
    body,
    scripts: [{ src: "search.js", module: true }],
  });
}

// ---------------------------------------------------------------- browse

export function controlsIndexPage(ctx, data) {
  const { latest, chapters } = data;
  const depth = 1;
  const r = (target) => rel(depth, target);
  const body = html`
<h1>Browse controls</h1>
<p class="lede">All ${plural(latest.controls.length, "control")} in ISM ${latest.version}, grouped by chapter and section in catalogue order.</p>
<div class="browse-layout">
  <nav class="toc" aria-labelledby="toc-title">
    <h2 id="toc-title">Chapters</h2>
    <ol>
      ${chapters.map((chapter) => html`<li><a href="#${chapter.slug}">${chapter.name}</a> <span class="count">${num(chapter.count)}</span></li>`)}
    </ol>
  </nav>
  <div class="browse-content">
    ${chapters.map(
      (chapter) => html`<section class="chapter" aria-labelledby="${chapter.slug}">
      <h2 id="${chapter.slug}">${chapter.name}</h2>
      <ul class="section-nav" aria-label="Sections in ${chapter.name}">
        ${chapter.sections.map((section) => html`<li><a href="#${section.slug}">${section.name || "General"}</a></li>`)}
      </ul>
      ${chapter.sections.map(
        (section) => html`<section class="section-group" aria-labelledby="${section.slug}">
        <h3 id="${section.slug}">${section.name || "General"}</h3>
        <ul class="control-list">
          ${section.controls.map(
            (control) => html`<li class="control-item">
            <p class="control-head"><a class="control-id" href="${controlPath(control.controlId).slice("controls/".length)}">${control.controlId}</a> <span class="control-title">${control.displayTitle}</span></p>
            <p class="statement">${control.statement}</p>
            <div class="chip-row">${classificationSummary(control.applicability)}${e8Chips(control.essentialEight)}</div>
          </li>`,
          )}
        </ul>
      </section>`,
      )}
      <p class="back-top"><a href="#toc-title">Back to chapters</a></p>
    </section>`,
    )}
  </div>
</div>`;
  return layout(ctx, {
    depth,
    nav: "controls",
    title: "Browse controls",
    description: `All ISM ${latest.version} controls grouped by chapter and section.`,
    canonical: ctx.abs("controls/"),
    body,
  });
}

// ---------------------------------------------------------------- control

const ENTRY_LABELS = {
  introduced: "Introduced",
  changed: "Changed",
  removed: "Removed",
  reintroduced: "Reintroduced",
};

export function controlPage(ctx, data) {
  const { history, chapterSlugs, diffFor } = data;
  const control = history.latest;
  const depth = 2;
  const r = (target) => rel(depth, target);
  const id = history.controlId;
  const statusText = history.current
    ? `Current in ${history.latestVersion}`
    : `Removed in ${history.removedIn ?? "a later release"} — last seen ${history.lastSeen}`;
  const chapterSlug = history.current ? chapterSlugs.get(control.chapter) : null;
  const entries = [...history.entries].reverse();
  const apiHref = r(`api/controls/${id}.json`);
  const body = html`
<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol>
    <li><a href="${r("")}">Search</a></li>
    <li><a href="${r("controls/")}">Browse controls</a></li>
    <li>${chapterSlug ? html`<a href="${r(`controls/#${chapterSlug}`)}">${control.chapter}</a>` : control.chapter}</li>
    ${control.section ? html`<li>${control.section}</li>` : ""}
    <li aria-current="page">${id}</li>
  </ol>
</nav>
<article class="control-detail">
  <header class="control-header">
    <p class="control-kicker"><span class="control-id">${id}</span>
      <span class="badge ${history.current ? "status-current" : "status-removed"}">${statusText}</span></p>
    <h1>${control.displayTitle}</h1>
    <p class="muted">${control.chapter}${control.section ? ` › ${control.section}` : ""}</p>
  </header>
  ${history.current ? "" : html`<p class="notice notice-warn">This control is not in the latest release (${history.latestVersion}). The text below is from ${history.lastSeen}, the last release that contained it.</p>`}
  <section aria-labelledby="statement-title" class="panel">
    <h2 id="statement-title">Statement <span class="muted small">(${control.version})</span></h2>
    <p class="statement statement-large">${control.statement || "No statement text."}</p>
    <div class="chip-row">${classificationChips(control.applicability)}${e8Chips(control.essentialEight)}</div>
    <dl class="facts">
      <div><dt>Revision</dt><dd>${control.revision ?? "–"}</dd></div>
      <div><dt>Updated</dt><dd>${control.updated ?? "–"}</dd></div>
      <div><dt>First seen</dt><dd><a href="${r(releasePath(history.firstSeen))}">${history.firstSeen}</a></dd></div>
      <div><dt>Releases containing it</dt><dd>${num(history.presentIn)} of ${num(ctx.releaseCount)}</dd></div>
    </dl>
    <p class="actions">
      <a class="button" href="${officialSourceUrl(control.version)}" rel="noopener noreferrer">Official source (${control.version} OSCAL)</a>
      <a class="button button-quiet" href="${apiHref}">JSON</a>
      <button type="button" class="button button-quiet" data-copy="${id}" hidden>Copy control ID</button>
      <button type="button" class="button button-quiet" data-copy="${ctx.abs(controlPath(id))}" hidden>Copy link</button>
    </p>
  </section>
  <section aria-labelledby="history-title">
    <h2 id="history-title">History across ${plural(ctx.releaseCount, "tracked release")}</h2>
    ${entries.some((entry) => entry.fields?.includes("statement")) ? DIFF_LEGEND : ""}
    <ol class="timeline">
      ${entries.map(
        (entry) => html`<li class="timeline-item timeline-${entry.type}">
        <p class="timeline-head"><span class="badge badge-${entry.type}">${entry.type === "introduced" && entry.baseline ? "First tracked" : ENTRY_LABELS[entry.type]}</span>
          <a href="${r(releasePath(entry.version))}">${entry.version}</a>
          ${entry.previousVersion && entry.type !== "changed" ? html`<span class="muted small">${entry.type === "removed" ? `last seen ${entry.previousVersion}` : `previously seen ${entry.previousVersion}`}</span>` : ""}
          ${entry.type === "changed" ? html`<span class="muted small">vs ${entry.previousVersion}</span>` : ""}
        </p>
        ${entry.type === "introduced" && entry.baseline ? html`<p class="muted small">Present in the earliest release tracked by this site.</p>` : ""}
        ${entry.fields?.length ? html`<p class="small">Fields changed: ${entry.fields.map(fieldLabel).join(", ")}</p>` : ""}
        ${entry.fields?.length ? renderFieldChanges(entry, diffFor) : ""}
      </li>`,
      )}
    </ol>
  </section>
</article>`;
  return layout(ctx, {
    depth,
    nav: "controls",
    title: `${id} ${control.displayTitle}`,
    description: `${id}: ${control.statement.slice(0, 180)}`,
    canonical: ctx.abs(controlPath(id)),
    body,
    scripts: [{ src: "copy.js" }],
  });
}

// ---------------------------------------------------------------- releases

export function releasesIndexPage(ctx, data) {
  const { releases, diffs } = data;
  const depth = 1;
  const r = (target) => rel(depth, target);
  const rows = [...releases].reverse().map((release) => {
    const diff = diffs.get(release.version);
    return html`<tr>
      <th scope="row"><a href="${r(releasePath(release.version))}">${release.version}</a>${release.version === ctx.latestVersion ? html` <span class="badge status-current">Latest</span>` : ""}</th>
      <td>${release.releaseDate ? formatDate(release.releaseDate) : "–"}</td>
      <td class="num">${num(release.controls.length)}</td>
      <td class="num">${diff ? num(diff.counts.added) : "–"}</td>
      <td class="num">${diff ? num(diff.counts.changed) : "–"}</td>
      <td class="num">${diff ? num(diff.counts.removed) : "–"}</td>
    </tr>`;
  });
  const body = html`
<h1>ISM releases</h1>
<p class="lede">${plural(releases.length, "tracked release")} of the ISM OSCAL catalogue. Counts compare each release with the one before it.</p>
<p class="actions"><a class="button button-quiet" href="${r("releases.xml")}">RSS feed of releases</a> <a class="button button-quiet" href="${r("api/releases.json")}">JSON</a></p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Release table">
<table class="data-table">
  <thead><tr><th scope="col">Version</th><th scope="col">Release date</th><th scope="col" class="num">Controls</th><th scope="col" class="num">Added</th><th scope="col" class="num">Changed</th><th scope="col" class="num">Removed</th></tr></thead>
  <tbody>
    ${rows}
  </tbody>
</table>
</div>
<p class="muted small">Release dates are inferred from version numbers. The earliest release has no predecessor, so it shows no change counts.</p>`;
  return layout(ctx, {
    depth,
    nav: "releases",
    title: "ISM releases",
    canonical: ctx.abs("releases/"),
    body,
  });
}

function groupByChapter(items) {
  const groups = new Map();
  for (const item of items) {
    const chapter = item.control.chapter;
    if (!groups.has(chapter)) groups.set(chapter, []);
    groups.get(chapter).push(item);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function releasePage(ctx, data) {
  const { release, diff, previous, next, diffFor } = data;
  const depth = 2;
  const r = (target) => rel(depth, target);
  const controlLink = (item) =>
    html`<a class="control-id" href="${r(controlPath(item.controlId))}">${item.controlId}</a> <span class="control-title">${item.control.displayTitle}</span>`;

  const groupSection = (key, label, items, renderItem) => {
    if (!items.length) {
      return html`<section aria-labelledby="${key}-title"><h2 id="${key}-title">${label} <span class="count">0</span></h2><p class="muted">None.</p></section>`;
    }
    return html`<section aria-labelledby="${key}-title">
  <h2 id="${key}-title">${label} <span class="count">${num(items.length)}</span></h2>
  ${groupByChapter(items).map(
    ([chapter, chapterItems]) => html`<h3>${chapter} <span class="count">${num(chapterItems.length)}</span></h3>
  <ul class="change-list">${chapterItems.map((item) => html`<li class="change-item">${renderItem(item)}</li>`)}</ul>`,
  )}
</section>`;
  };

  const pager = html`<nav class="pager" aria-label="Adjacent releases">
  ${previous ? html`<a href="${r(releasePath(previous.version))}">← ${previous.version}</a>` : html`<span></span>`}
  <a href="${r("releases/")}">All releases</a>
  ${next ? html`<a href="${r(releasePath(next.version))}">${next.version} →</a>` : html`<span></span>`}
</nav>`;

  const content = diff
    ? html`
<ul class="stat-list">
  <li><a href="#added-title"><span class="stat">${num(diff.counts.added)}</span> added</a></li>
  <li><a href="#changed-title"><span class="stat">${num(diff.counts.changed)}</span> changed</a></li>
  <li><a href="#removed-title"><span class="stat">${num(diff.counts.removed)}</span> removed</a></li>
</ul>
<p class="actions">
  <a class="button" href="changes.csv" download>Download changes CSV</a>
  <a class="button button-quiet" href="${r(`api/releases/${release.version}/changes.json`)}">JSON</a>
  <a class="button button-quiet" href="${officialSourceUrl(release.version)}" rel="noopener noreferrer">Official source</a>
</p>
${diff.changed.some((item) => item.fields.includes("statement")) ? DIFF_LEGEND : ""}
${groupSection("added", "Added", diff.added, (item) => html`<p class="control-head">${controlLink(item)}${item.reintroduced ? html` <span class="badge badge-reintroduced">Reintroduced</span>` : ""}</p><p class="statement">${item.control.statement}</p>`)}
${groupSection(
  "changed",
  "Changed",
  diff.changed,
  (item) =>
    html`<p class="control-head">${controlLink(item)}</p><p class="small">Fields changed: ${item.fields.map(fieldLabel).join(", ")}</p>${renderFieldChanges(item, diffFor)}`,
)}
${groupSection("removed", "Removed", diff.removed, (item) => html`<p class="control-head">${controlLink(item)}</p><p class="statement">${item.control.statement}</p>`)}`
    : html`<p class="notice">This is the earliest tracked release, so there is no earlier release to compare with. It contains ${plural(release.controls.length, "control")}.</p>
<p class="actions"><a class="button button-quiet" href="${officialSourceUrl(release.version)}" rel="noopener noreferrer">Official source</a></p>`;

  const body = html`
<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="${r("releases/")}">Releases</a></li><li aria-current="page">${release.version}</li></ol></nav>
<h1>ISM ${release.version}</h1>
<p class="lede">${plural(release.controls.length, "control")}${release.releaseDate ? ` · released ${formatDate(release.releaseDate)}` : ""}${diff ? ` · compared with ${diff.previousVersion}` : ""}</p>
${content}
${pager}`;
  return layout(ctx, {
    depth,
    nav: "releases",
    title: `ISM ${release.version} changes`,
    description: diff
      ? `ISM ${release.version}: ${diff.counts.added} added, ${diff.counts.changed} changed, ${diff.counts.removed} removed controls vs ${diff.previousVersion}.`
      : `ISM ${release.version}, the earliest tracked release.`,
    canonical: ctx.abs(releasePath(release.version)),
    body,
  });
}

// ---------------------------------------------------------------- advisories

export function advisoriesPage(ctx, data) {
  const { advisories, stale } = data;
  const depth = 1;
  const r = (target) => rel(depth, target);
  const items = advisories.advisories;
  const severityOptions = [...SEVERITIES, "none"];
  const body = html`
<h1>ACSC alerts and advisories</h1>
<p class="lede">${plural(items.length, "archived item")} from Cyber.gov.au, newest first. Updated ${formatDateTime(advisories.fetchedAt) ?? "unknown"}.</p>
${stale ? html`<p class="notice notice-warn" role="note">This advisory archive may be out of date: its last complete refresh is unknown or was more than 14 days before this site was built. Check <a href="https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories" rel="noopener noreferrer" target="_blank">cyber.gov.au</a> for the latest alerts.</p>` : ""}
<p class="actions"><a class="button button-quiet" href="${r("advisories.xml")}">RSS feed</a> <a class="button button-quiet" href="${r("advisories.json")}">JSON Feed</a></p>
<div id="advisory-filters" class="filter-chips" hidden>
  <div class="chip-group" role="group" aria-labelledby="type-filter-label">
    <span id="type-filter-label" class="chip-group-label">Type</span>
    ${TYPES.map((type) => html`<button type="button" class="filter-chip" data-filter="type" data-value="${type}" aria-pressed="false">${type}</button>`)}
  </div>
  <div class="chip-group" role="group" aria-labelledby="severity-filter-label">
    <span id="severity-filter-label" class="chip-group-label">Severity</span>
    ${severityOptions.map(
      (severity) =>
        html`<button type="button" class="filter-chip" data-filter="severity" data-value="${severity}" aria-pressed="false">${severity === "none" ? "Not rated" : severity}</button>`,
    )}
  </div>
  <button type="button" id="clear-advisory-filters" class="button button-quiet">Show all</button>
  <p id="advisory-status" class="results-status" role="status" aria-live="polite"></p>
</div>
<ol class="advisory-list">
  ${items.map(
    (a) => html`<li class="advisory-item" data-type="${a.type}" data-severity="${a.severity ?? "none"}">
    <p class="advisory-meta">${severityBadge(a)} <span class="badge">${a.type}</span> ${advisoryDate(a)}</p>
    <h2 class="advisory-heading">${advisoryLink(a)}</h2>
    ${a.summary ? html`<p>${a.summary}</p>` : ""}
    ${a.audiences.length ? html`<p class="small muted">Audiences: ${a.audiences.join(", ")}</p>` : ""}
    ${a.safeHref ? "" : a.href ? html`<p class="small muted">Source link (not verified as cyber.gov.au): ${a.href}</p>` : ""}
  </li>`,
  )}
</ol>`;
  return layout(ctx, {
    depth,
    nav: "advisories",
    title: "ACSC alerts and advisories",
    canonical: ctx.abs("advisories/"),
    body,
    scripts: [{ src: "advisories.js" }],
  });
}

// ---------------------------------------------------------------- about

export function aboutPage(ctx, data) {
  const depth = 1;
  const r = (target) => rel(depth, target);
  const body = html`
<h1>About ISM Search</h1>
<div class="prose">
<p>ISM Search publishes a static, searchable copy of the Australian Signals Directorate's <cite>Information Security Manual</cite> (ISM), with per-control history across every tracked release and an archive of ACSC alerts and advisories.</p>
<p class="notice notice-warn"><strong>Disclaimer:</strong> this site is not an authoritative source and is not affiliated with or endorsed by ASD or the ACSC. Content is transformed automatically and may contain errors or lag behind official releases. Always verify against official publications on <a href="https://www.cyber.gov.au/" rel="noopener noreferrer">cyber.gov.au</a>.</p>

<h2>Data sources</h2>
<ul>
  <li><strong>ISM controls:</strong> the ASD ISM OSCAL catalogue published as tagged releases at <a href="https://github.com/AustralianCyberSecurityCentre/ism-oscal" rel="noopener noreferrer">AustralianCyberSecurityCentre/ism-oscal</a>. ${plural(ctx.releaseCount, "release")} are tracked, from ${data.oldestVersion} to ${ctx.latestVersion}.</li>
  <li><strong>Alerts and advisories:</strong> the Cyber.gov.au alerts and advisories listing and RSS feeds${data.advisoryFeeds.length ? ` (${data.advisoryFeeds.join(", ")})` : ""}.</li>
</ul>

<h2>Update cadence</h2>
<p>A nightly GitHub Action syncs the ISM OSCAL releases and Cyber.gov.au advisories, rebuilds this site and publishes it to GitHub Pages. Each page footer shows when the data was last synced and when the site was built.</p>

<h2>Static API</h2>
<p>Every file below is plain JSON served from this site, so you can use it from scripts without authentication. Paths are relative to the site root.</p>
<dl class="api-docs">
  <div><dt><a href="${r("api/status.json")}"><code>api/status.json</code></a></dt><dd>Latest version, counts and freshness timestamps.</dd></div>
  <div><dt><a href="${r("api/releases.json")}"><code>api/releases.json</code></a></dt><dd>All tracked releases with added, changed and removed counts.</dd></div>
  <div><dt><code>api/releases/&lt;version&gt;/changes.json</code></dt><dd>Changes in a release compared with its predecessor, e.g. <a href="${r(`api/releases/${ctx.latestVersion}/changes.json`)}"><code>${ctx.latestVersion}</code></a>.</dd></div>
  <div><dt><a href="${r("api/controls.json")}"><code>api/controls.json</code></a></dt><dd>Every control in the latest release.</dd></div>
  <div><dt><code>api/controls/&lt;ID&gt;.json</code></dt><dd>A control's latest text (or <code>null</code> if removed) and its full history, e.g. <a href="${r(`api/controls/${data.exampleControlId}.json`)}"><code>${data.exampleControlId}</code></a>.</dd></div>
  <div><dt><a href="${r("api/advisories.json")}"><code>api/advisories.json</code></a></dt><dd>Archived ACSC alerts and advisories.</dd></div>
  <div><dt><a href="${r("advisories.xml")}"><code>advisories.xml</code></a>, <a href="${r("advisories.json")}"><code>advisories.json</code></a>, <a href="${r("releases.xml")}"><code>releases.xml</code></a></dt><dd>RSS 2.0 and JSON Feed 1.1 feeds.</dd></div>
</dl>

<h2>Full workbench</h2>
<p>This site is the read-only public edition. The <a href="${REPO_URL}" rel="noopener noreferrer">ISM Search repository</a> also contains a local-first Docker workbench with Meilisearch search, natural-language answers over the controls with Ollama, release comparison, System Security Plan CSV generation and policy drafting. Run it with <code>docker compose up --build</code>.</p>
</div>`;
  return layout(ctx, {
    depth,
    nav: "about",
    title: "About",
    canonical: ctx.abs("about/"),
    body,
  });
}

// ---------------------------------------------------------------- 404

export function notFoundPage(ctx) {
  // GitHub Pages serves 404.html at arbitrary depths, so it uses <base> with
  // the site's base path; every link inside is relative to that base.
  const body = html`
<h1 id="not-found-title">Page not found</h1>
<p id="redirect-status" class="lede" role="status" aria-live="polite">We couldn't find that page. It may have moved, or the address may be mistyped.</p>
<ul class="link-list">
  <li><a href="./">Search ISM controls</a></li>
  <li><a href="controls/">Browse all controls by chapter</a></li>
  <li><a href="releases/">ISM releases</a></li>
</ul>
<p class="muted small">Looking for a control? Addresses like <code>controls/ISM-1234/</code> link straight to it.</p>`;
  return layout(ctx, {
    depth: 0,
    baseHref: ctx.basePath,
    nav: null,
    title: "Page not found",
    body,
    scripts: [{ src: "not-found.js", dataBase: ctx.basePath }],
  });
}
