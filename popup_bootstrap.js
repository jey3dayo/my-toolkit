(function () {
  var SCRIPT_SRC = "dist/popup.js";

  function showBuildError() {
    var existing = document.getElementById("mbu-build-error");
    if (existing) return;

    var banner = document.createElement("div");
    banner.id = "mbu-build-error";
    banner.textContent =
      "拡張機能のスクリプトを読み込めませんでした。`pnpm install && pnpm run build` を実行してから、chrome://extensions でこの拡張機能を再読み込みしてください。";
    banner.style.cssText =
      "position: fixed;" +
      "left: 12px;" +
      "right: 12px;" +
      "bottom: 12px;" +
      "z-index: 2147483647;" +
      "padding: 10px 12px;" +
      "border-radius: 12px;" +
      "background: rgba(229,57,53,0.92);" +
      "color: #fff;" +
      "font-size: 12px;" +
      "font-weight: 700;" +
      "box-shadow: 0 10px 24px rgba(0,0,0,0.3);";

    document.body.appendChild(banner);
  }

  var script = document.createElement("script");
  script.async = false;
  script.src = SCRIPT_SRC;
  script.addEventListener("error", showBuildError);
  document.body.appendChild(script);
})();
