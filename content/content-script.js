(() => {
  const STORAGE_KEY = "sites";
  const HIDE_STYLE_ID = "wm-hide-style";

  function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function matchPattern(url, pattern) {
    if (!pattern || pattern.trim() === "") return false;
    const escaped = escapeRegex(pattern).replace(/\\\*/g, ".*");
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(url);
  }

  function pickRule(rules, url) {
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      if (matchPattern(url, rule.urlPattern)) return rule;
    }
    return null;
  }

  function createOverlayRoot() {
    const root = document.createElement("div");
    root.id = "wm-overlay-root";
    document.documentElement.appendChild(root);
    return root;
  }

  function ensureHideStyle() {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent = "html{visibility:hidden !important;}";
    document.documentElement.appendChild(style);
  }

  function removeHideStyle() {
    const style = document.getElementById(HIDE_STYLE_ID);
    if (style) style.remove();
  }

  function clearOverlay(root) {
    if (!root) return;
    root.innerHTML = "";
  }

  function parseContentSelectors(rule) {
    if (Array.isArray(rule.contentSelectors)) {
      return rule.contentSelectors.map((s) => s.trim()).filter(Boolean);
    }
    if (typeof rule.contentSelector === "string") {
      return rule.contentSelector
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  function collectVisibleRects(selectors) {
    const rects = [];
    selectors.forEach((selector) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      rects.push({
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        right: rect.right + window.scrollX,
        bottom: rect.bottom + window.scrollY
      });
    });
    return rects;
  }

  function buildMaskSvg(rects, size) {
    const vw = Math.max(1, size.width);
    const vh = Math.max(1, size.height);
    const holeRects = rects
      .map((rect) => {
        const x = Math.max(0, rect.left);
        const y = Math.max(0, rect.top);
        const w = Math.max(0, Math.min(vw, rect.right) - x);
        const h = Math.max(0, Math.min(vh, rect.bottom) - y);
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black" />`;
      })
      .join("");

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" class="wm-mask-svg">
  <defs>
    <mask id="wm-mask" maskUnits="userSpaceOnUse">
      <rect x="0" y="0" width="${vw}" height="${vh}" fill="white" />
      ${holeRects}
    </mask>
  </defs>
  <rect x="0" y="0" width="${vw}" height="${vh}" fill="#000" mask="url(#wm-mask)" />
</svg>
`.trim();
  }

  function updateTitle(rule) {
    if (!rule.titleMaskText || rule.titleMaskText.trim() === "") return;
    document.title = rule.titleMaskText.trim();
  }

  function updateIcon(rule) {
    if (!rule.iconUrl || rule.iconUrl.trim() === "") return;
    if (!document.head) return;
    const url = rule.iconUrl.trim();
    const links = document.querySelectorAll(
      "link[rel~=\"icon\"], link[rel~=\"shortcut\"], link[rel=\"shortcut icon\"]"
    );
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = url;
      document.head.appendChild(link);
      return;
    }
    links.forEach((link) => {
      link.href = url;
    });
  }

  function renderMask(rule) {
    const root = document.getElementById("wm-overlay-root") || createOverlayRoot();
    clearOverlay(root);

    updateTitle(rule);
    updateIcon(rule);

    const selectors = parseContentSelectors(rule);
    const rects = collectVisibleRects(selectors);
    const size = {
      width: Math.max(
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth
      ),
      height: Math.max(
        document.documentElement.scrollHeight,
        document.documentElement.clientHeight
      )
    };
    root.style.width = `${size.width}px`;
    root.style.height = `${size.height}px`;
    root.innerHTML = buildMaskSvg(rects, size);
  }

  function init() {
    ensureHideStyle();
    chrome.storage.sync.get([STORAGE_KEY], (data) => {
      const rules = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
      const rule = pickRule(rules, window.location.href);
      if (!rule) {
        removeHideStyle();
        return;
      }
      updateTitle(rule);
      updateIcon(rule);
      const apply = () => {
        renderMask(rule);
        removeHideStyle();
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", apply, { once: true });
      } else {
        apply();
      }
    });
  }

  init();
})();
