import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const script = await readFile(new URL("../scripts/site/assets/not-found.js", import.meta.url), "utf8");

function redirect(base, pathname, search = "") {
  let target;
  const status = { textContent: "" };
  runInNewContext(script, {
    document: { currentScript: { getAttribute: () => base }, getElementById: () => status },
    window: { location: { pathname, search, replace: (value) => { target = value; } } },
    URLSearchParams,
  });
  return { target, status: status.textContent };
}

test("404 redirects remain within the configured site base", () => {
  assert.equal(redirect("/", "//evil.example/controls/1234").target, "/controls/ISM-1234/");
  assert.equal(redirect("/ISMSearch/", "/ISMSearch/control/1234").target, "/ISMSearch/controls/ISM-1234/");
  assert.equal(redirect("/ISMSearch/", "/ISMSearch/missing", "?control=1234").target, "/ISMSearch/controls/ISM-1234/");
  assert.match(redirect("/", "/controls/ISM-1234/").status, /isn't in any ISM release/);
});
