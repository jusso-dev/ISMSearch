// Client-side search core. Shared by the browser (copied to
// assets/search-core.js) and tests. Must stay dependency-free.

export const STOPWORDS = new Set(
  "a an and are as at be by for from has have in into is ism it its of on or that the their this to was were will with".split(" "),
);

export const CLASS_CODES = ["NC", "OS", "P", "S", "TS"];
export const E8_LEVELS = ["ML1", "ML2", "ML3"];

export function tokenize(text) {
  const tokens = String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !STOPWORDS.has(token));
  return [...new Set(tokens)];
}

// "1234", "ism-1234", "ISM 1234", "ism-principle-gov-03" -> canonical id or null.
export function queryControlId(query) {
  const text = String(query ?? "").trim();
  const numeric = /^(?:ism[-_ ]?)?(\d{1,4})$/i.exec(text);
  if (numeric) return `ISM-${numeric[1].padStart(4, "0")}`;
  if (/^ism-[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(text)) return text.toUpperCase();
  return null;
}

export function prepareIndex(controls) {
  return controls.map((control, order) => ({
    control,
    order,
    id: control.id.toLowerCase(),
    title: ` ${tokenize(control.title).join(" ")} `,
    section: ` ${tokenize(`${control.section}`).join(" ")} `,
    chapter: ` ${tokenize(control.chapter).join(" ")} `,
    statement: ` ${tokenize(control.statement).join(" ")} `,
  }));
}

function fieldScore(haystack, token, weight) {
  if (haystack.includes(` ${token} `)) return weight * 2;
  if (haystack.includes(` ${token}`)) return weight; // prefix match
  return 0;
}

export function scoreEntry(entry, tokens, exactId) {
  let score = 0;
  if (exactId && entry.control.id === exactId) score += 1000;
  for (const token of tokens) {
    let tokenScore = 0;
    if (entry.id === token || entry.id.endsWith(`-${token}`)) tokenScore += 50;
    tokenScore += fieldScore(entry.title, token, 4);
    tokenScore += fieldScore(entry.section, token, 2);
    tokenScore += fieldScore(entry.chapter, token, 1);
    tokenScore += fieldScore(entry.statement, token, 2);
    if (tokenScore === 0) return exactId && entry.control.id === exactId ? score : 0;
    score += tokenScore;
  }
  return score;
}

function matchesFilters(control, state) {
  if (state.classes.length && !state.classes.some((code) => control.applicability.includes(code))) return false;
  if (state.e8.length && !state.e8.some((level) => control.e8.includes(level))) return false;
  if (state.chapter && control.chapter !== state.chapter) return false;
  return true;
}

export function search(index, state) {
  const exactId = queryControlId(state.q);
  const tokens = tokenize(state.q);
  const results = [];
  for (const entry of index) {
    if (!matchesFilters(entry.control, state)) continue;
    if (!tokens.length && !exactId) {
      results.push({ entry, score: 0 });
      continue;
    }
    const score = scoreEntry(entry, tokens, exactId);
    if (score > 0) results.push({ entry, score });
  }
  results.sort((a, b) => b.score - a.score || a.entry.order - b.entry.order);
  return results.map((result) => result.entry.control);
}

function listParam(params, name, allowed) {
  const values = params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toUpperCase());
  return allowed.filter((value) => values.includes(value));
}

export function parseState(search) {
  const params = new URLSearchParams(search);
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    classes: listParam(params, "class", CLASS_CODES),
    e8: listParam(params, "e8", E8_LEVELS),
    chapter: (params.get("chapter") ?? "").slice(0, 200),
  };
}

export function stateToSearch(state) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.classes.length) params.set("class", CLASS_CODES.filter((c) => state.classes.includes(c)).join(","));
  if (state.e8.length) params.set("e8", E8_LEVELS.filter((l) => state.e8.includes(l)).join(","));
  if (state.chapter) params.set("chapter", state.chapter);
  const text = params.toString();
  return text ? `?${text}` : "";
}
