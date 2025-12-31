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
    const radius = 8;
    const holePaths = rects
      .map((rect) => {
        const x = Math.max(0, rect.left);
        const y = Math.max(0, rect.top);
        const w = Math.max(0, Math.min(vw, rect.right) - x);
        const h = Math.max(0, Math.min(vh, rect.bottom) - y);
        if (w <= 0 || h <= 0) return "";
        const r = Math.min(radius, Math.floor(w / 2), Math.floor(h / 2));
        const x2 = x + w;
        const y2 = y + h;
        return [
          `M${x + r} ${y}`,
          `H${x2 - r}`,
          `A${r} ${r} 0 0 1 ${x2} ${y + r}`,
          `V${y2 - r}`,
          `A${r} ${r} 0 0 1 ${x2 - r} ${y2}`,
          `H${x + r}`,
          `A${r} ${r} 0 0 1 ${x} ${y2 - r}`,
          `V${y + r}`,
          `A${r} ${r} 0 0 1 ${x + r} ${y}`,
          "Z"
        ].join(" ");
      })
      .filter(Boolean)
      .join(" ");
    const clipPath = `M0 0H${vw}V${vh}H0Z ${holePaths}`.trim();

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" class="wm-mask-svg">
  <defs>
    <clipPath id="wm-clip" clipPathUnits="userSpaceOnUse">
      <path d="${clipPath}" clip-rule="evenodd" />
    </clipPath>
  </defs>
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
    root.innerHTML = `${buildMaskSvg(rects, size)}<div class="wm-blocker"></div>`;
    const blocker = root.querySelector(".wm-blocker");
    if (blocker) {
      blocker.style.clipPath = "url(#wm-clip)";
      blocker.style.webkitClipPath = "url(#wm-clip)";
      const level = Number.isFinite(rule.frostedLevel) ? rule.frostedLevel : 10;
      const blur = Math.max(0, Math.min(20, level));
      const saturate = 1 + blur / 40;
      const color = "rgba(0, 0, 0, 0)";
      blocker.style.background = color;
      blocker.style.backdropFilter = `blur(${blur}px) saturate(${saturate.toFixed(2)})`;
      blocker.style.webkitBackdropFilter = `blur(${blur}px) saturate(${saturate.toFixed(2)})`;
    }
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
