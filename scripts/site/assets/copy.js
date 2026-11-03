// Copy-to-clipboard buttons ([data-copy]); hidden unless the Clipboard API exists.
(function () {
  "use strict";
  if (!navigator.clipboard || !window.isSecureContext) return;
  var buttons = document.querySelectorAll("button[data-copy]");
  Array.prototype.forEach.call(buttons, function (button) {
    var label = button.textContent;
    button.hidden = false;
    button.addEventListener("click", function () {
      navigator.clipboard.writeText(button.getAttribute("data-copy")).then(
        function () {
          button.textContent = "Copied";
          window.setTimeout(function () {
            button.textContent = label;
          }, 1800);
        },
        function () {
          button.textContent = "Copy failed";
        },
      );
    });
  });
})();
