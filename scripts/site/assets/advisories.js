// Type/severity filter chips for the advisories archive. URL state:
// ?type=Alert&severity=Critical,High. Without JS every advisory is shown.
(function () {
  "use strict";
  var container = document.getElementById("advisory-filters");
  if (!container) return;
  var items = Array.prototype.slice.call(document.querySelectorAll(".advisory-item"));
  var chips = Array.prototype.slice.call(container.querySelectorAll(".filter-chip"));
  var status = document.getElementById("advisory-status");
  var clear = document.getElementById("clear-advisory-filters");
  var allowed = { type: {}, severity: {} };
  chips.forEach(function (chip) {
    allowed[chip.dataset.filter][chip.dataset.value] = true;
  });

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    var state = { type: [], severity: [] };
    ["type", "severity"].forEach(function (key) {
      (params.get(key) || "").split(",").forEach(function (value) {
        if (allowed[key][value] && state[key].indexOf(value) === -1) state[key].push(value);
      });
    });
    return state;
  }

  function currentState() {
    var state = { type: [], severity: [] };
    chips.forEach(function (chip) {
      if (chip.getAttribute("aria-pressed") === "true") state[chip.dataset.filter].push(chip.dataset.value);
    });
    return state;
  }

  function toSearch(state) {
    var params = new URLSearchParams();
    if (state.type.length) params.set("type", state.type.join(","));
    if (state.severity.length) params.set("severity", state.severity.join(","));
    var text = params.toString();
    return text ? "?" + text : "";
  }

  function apply(state) {
    chips.forEach(function (chip) {
      var on = state[chip.dataset.filter].indexOf(chip.dataset.value) !== -1;
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var visible = 0;
    items.forEach(function (item) {
      var show =
        (!state.type.length || state.type.indexOf(item.dataset.type) !== -1) &&
        (!state.severity.length || state.severity.indexOf(item.dataset.severity) !== -1);
      item.hidden = !show;
      if (show) visible += 1;
    });
    status.textContent =
      state.type.length || state.severity.length
        ? "Showing " + visible + " of " + items.length + " advisories."
        : "Showing all " + items.length + " advisories.";
  }

  function push(state) {
    var next = window.location.pathname + toSearch(state);
    if (next !== window.location.pathname + window.location.search) window.history.pushState(null, "", next);
    apply(state);
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
      push(currentState());
    });
  });
  clear.addEventListener("click", function () {
    push({ type: [], severity: [] });
  });
  window.addEventListener("popstate", function () {
    apply(readUrl());
  });

  container.hidden = false;
  apply(readUrl());
})();
