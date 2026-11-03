// GitHub Pages serves 404.html for unknown paths. Redirect loose control
// references (/controls/1234, /controls/ism-1234, /control/ISM-1234,
// ?control=1234) to the canonical controls/ISM-1234/ page.
(function () {
  "use strict";
  var script = document.currentScript;
  var base = (script && script.getAttribute("data-base")) || "/";
  if (base.charAt(base.length - 1) !== "/") base += "/";
  var status = document.getElementById("redirect-status");

  function canonical(value) {
    var text = String(value || "").trim();
    var numeric = /^(?:ism[-_ ]?)?(\d{1,4})$/i.exec(text);
    if (numeric) return "ISM-" + ("0000" + numeric[1]).slice(-4);
    var upper = text.toUpperCase();
    return /^ISM-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(upper) && upper.length <= 64 ? upper : null;
  }

  var path = window.location.pathname;
  var match = /\/controls?\/([^/]+)\/?$/i.exec(path);
  var id = null;
  if (match) {
    try {
      id = canonical(decodeURIComponent(match[1]));
    } catch (error) {
      id = null;
    }
  }
  if (!id) {
    var param = new URLSearchParams(window.location.search).get("control");
    if (param) id = canonical(param);
  }
  if (!id) return;

  var target = base + "controls/" + id + "/";
  if (target === path || target === path + "/") {
    if (status) status.textContent = "Control " + id + " isn't in any ISM release tracked by this site. Check the number, or search for it.";
    return;
  }
  if (status) status.textContent = "Redirecting to " + id + "…";
  window.location.replace(target);
})();
