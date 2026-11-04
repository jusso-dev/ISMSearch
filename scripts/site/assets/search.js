// Client-side search over the latest ISM release. Progressive enhancement:
// the #search-app container stays hidden (and a <noscript> note shows) without JS.
import { parseState, prepareIndex, queryControlId, search, stateToSearch } from "./search-core.js";
import { toCsv } from "./csv.js";

const PAGE_SIZE = 50;
const CLASS_LABELS = { NC: "OFFICIAL", OS: "OFFICIAL: Sensitive", P: "PROTECTED", S: "SECRET", TS: "TOP SECRET", ALL: "All classifications" };

const app = document.getElementById("search-app");

function redirectControlParam() {
  const value = new URLSearchParams(window.location.search).get("control");
  const id = value ? queryControlId(value) : null;
  if (!id) return false;
  window.location.replace(new URL(`controls/${encodeURIComponent(id)}/`, document.baseURI).href);
  return true;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function chipList(values, label, className, format) {
  const list = el("ul", "chips");
  list.setAttribute("aria-label", label);
  for (const value of values) list.append(el("li", `chip ${className}`, format(value)));
  return list;
}

function renderResult(control, exactId) {
  const item = el("li", "result");
  const head = el("p", "control-head");
  const link = el("a", "control-id", control.id);
  link.href = `controls/${encodeURIComponent(control.id)}/`;
  head.append(link, " ", el("span", "control-title", control.title));
  if (exactId && control.id === exactId) head.append(" ", el("span", "badge status-current", "Exact match"));
  item.append(head);
  item.append(el("p", "muted small", control.section ? `${control.chapter} › ${control.section}` : control.chapter));
  item.append(el("p", "statement", control.statement));
  const chips = el("div", "chip-row");
  if (control.applicability.length) {
    const all = ["NC", "OS", "P", "S", "TS"].every((code) => control.applicability.includes(code));
    const codes = all ? ["ALL"] : control.applicability;
    chips.append(chipList(codes, "Classification applicability", "chip-class", (c) => CLASS_LABELS[c] ?? c));
  }
  if (control.e8.length) chips.append(chipList(control.e8, "Essential Eight maturity levels", "chip-e8", (l) => `Essential Eight ${l}`));
  item.append(chips);
  const meta = [control.revision ? `Revision ${control.revision}` : null, control.updated ? `Updated ${control.updated}` : null].filter(Boolean);
  if (meta.length) item.append(el("p", "muted small", meta.join(" · ")));
  return item;
}

async function init() {
  if (redirectControlParam()) return;
  app.hidden = false;
  const form = document.getElementById("search-form");
  const q = document.getElementById("q");
  const chapter = document.getElementById("chapter");
  const status = document.getElementById("results-status");
  const list = document.getElementById("results");
  const showMore = document.getElementById("show-more");
  const download = document.getElementById("download-csv");
  const reset = document.getElementById("reset-filters");
  const boxes = (name) => [...form.querySelectorAll(`input[name="${name}"]`)];
  const chapters = new Set([...chapter.options].map((option) => option.value));

  let index = [];
  let results = [];
  let shown = 0;
  let version = app.dataset.version ?? "";

  const readForm = () => ({
    q: q.value.trim().slice(0, 200),
    classes: boxes("class").filter((b) => b.checked).map((b) => b.value),
    e8: boxes("e8").filter((b) => b.checked).map((b) => b.value),
    chapter: chapter.value,
  });

  const writeForm = (state) => {
    q.value = state.q;
    for (const box of boxes("class")) box.checked = state.classes.includes(box.value);
    for (const box of boxes("e8")) box.checked = state.e8.includes(box.value);
    chapter.value = chapters.has(state.chapter) ? state.chapter : "";
  };

  const updateUrl = (mode) => {
    const next = `${window.location.pathname}${stateToSearch(readForm())}`;
    if (next === `${window.location.pathname}${window.location.search}`) return;
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", next);
  };

  const appendPage = (exactId) => {
    const fragment = document.createDocumentFragment();
    for (const control of results.slice(shown, shown + PAGE_SIZE)) fragment.append(renderResult(control, exactId));
    list.append(fragment);
    shown = Math.min(results.length, shown + PAGE_SIZE);
    showMore.hidden = shown >= results.length;
    if (!showMore.hidden) showMore.textContent = `Show more (${results.length - shown} remaining)`;
  };

  const render = () => {
    const state = readForm();
    const exactId = queryControlId(state.q);
    results = search(index, state);
    shown = 0;
    list.replaceChildren();
    appendPage(exactId);
    const filtered = state.q || state.classes.length || state.e8.length || state.chapter;
    status.textContent = filtered
      ? `${results.length.toLocaleString()} of ${index.length.toLocaleString()} controls in ${version} match.`
      : `Showing all ${index.length.toLocaleString()} controls in ${version}.`;
    if (exactId && !results.some((c) => c.id === exactId)) status.textContent += ` ${exactId} is not in ${version}.`;
    download.disabled = results.length === 0;
  };

  let timer = 0;
  q.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      updateUrl("replace");
      render();
    }, 150);
  });
  form.addEventListener("change", (event) => {
    if (event.target === q) return;
    updateUrl("push");
    render();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(timer);
    updateUrl("push");
    render();
  });
  reset.addEventListener("click", () => {
    writeForm({ q: "", classes: [], e8: [], chapter: "" });
    updateUrl("push");
    render();
    q.focus();
  });
  window.addEventListener("popstate", () => {
    writeForm(parseState(window.location.search));
    render();
  });
  showMore.addEventListener("click", () => {
    const firstNew = shown;
    appendPage(queryControlId(readForm().q));
    list.children[firstNew]?.querySelector("a")?.focus();
  });
  download.addEventListener("click", () => {
    const rows = results.map((c) => [
      c.id,
      c.title,
      c.chapter,
      c.section,
      c.statement,
      c.applicability.map((code) => CLASS_LABELS[code] ?? code),
      c.e8,
      c.revision ?? "",
      c.updated ?? "",
    ]);
    const csv = toCsv(
      ["Control ID", "Title", "Chapter", "Section", "Statement", "Applicability", "Essential Eight", "Revision", "Updated"],
      rows,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ism-${version}-search-results.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  try {
    const response = await fetch(new URL(app.dataset.controls, document.baseURI), { credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    version = data.version ?? version;
    index = prepareIndex(Array.isArray(data.controls) ? data.controls : []);
  } catch {
    status.textContent = "Could not load the control data. Use Browse controls instead.";
    return;
  }
  writeForm(parseState(window.location.search));
  render();
}

if (app) init();
