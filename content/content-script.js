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

  function addBlock(root, rect, className) {
    const block = document.createElement("div");
    block.className = className;
    block.style.left = `${rect.left}px`;
    block.style.top = `${rect.top}px`;
    block.style.width = `${rect.width}px`;
    block.style.height = `${rect.height}px`;
    root.appendChild(block);
  }

  function addMaskForElement(root, el, className) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    addBlock(root, rect, className);
  }

  function addDimWithHole(root, holeRect) {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const topRect = { left: 0, top: 0, width: vw, height: Math.max(0, holeRect.top) };
    const bottomRect = {
      left: 0,
      top: Math.max(0, holeRect.bottom),
      width: vw,
      height: Math.max(0, vh - holeRect.bottom)
    };
    const leftRect = {
      left: 0,
      top: Math.max(0, holeRect.top),
      width: Math.max(0, holeRect.left),
      height: Math.max(0, holeRect.height)
    };
    const rightRect = {
      left: Math.max(0, holeRect.right),
      top: Math.max(0, holeRect.top),
      width: Math.max(0, vw - holeRect.right),
      height: Math.max(0, holeRect.height)
    };

    addBlock(root, topRect, "wm-dim-block");
    addBlock(root, bottomRect, "wm-dim-block");
    addBlock(root, leftRect, "wm-dim-block");
    addBlock(root, rightRect, "wm-dim-block");
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

    const contentEl = rule.contentSelector
      ? document.querySelector(rule.contentSelector)
      : null;

    updateTitle(rule);
    updateIcon(rule);

    if (contentEl) {
      const rect = contentEl.getBoundingClientRect();
      addDimWithHole(root, rect);
    } else {
      const full = {
        left: 0,
        top: 0,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight
      };
      addBlock(root, full, "wm-dim-block");
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
