(() => {
  const STORAGE_KEY = "sites";
  const HIDE_STYLE_ID = "wm-hide-style";

  function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseRegexPattern(pattern) {
    if (pattern.startsWith("/") && pattern.length > 2) {
      const last = pattern.lastIndexOf("/");
      if (last > 0) {
        return {
          source: pattern.slice(1, last),
          flags: pattern.slice(last + 1)
        };
      }
    }
    return null;
  }

  function parseSubstitutionExpression(expression) {
    if (!expression || !expression.startsWith("/")) return null;
    const text = expression;
    let i = 1;
    let pattern = "";
    let replacement = "";
    let flags = "";
    let foundFirst = false;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === "/" && text[i - 1] !== "\\") {
        foundFirst = true;
        i += 1;
        break;
      }
      pattern += ch;
    }
    if (!foundFirst) return null;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === "/" && text[i - 1] !== "\\") {
        i += 1;
        break;
      }
      replacement += ch;
    }
    flags = text.slice(i);
    if (pattern === "") pattern = ".*";
    return { pattern, replacement, flags };
  }

  function countWildcards(pattern) {
    return (pattern.match(/\*/g) || []).length;
  }

  function getDomainSpecificity(pattern) {
    const schemeIndex = pattern.indexOf("://");
    if (schemeIndex === -1) return 0;
    const hostStart = schemeIndex + 3;
    const hostEnd = pattern.indexOf("/", hostStart);
    const host = (hostEnd === -1 ? pattern.slice(hostStart) : pattern.slice(hostStart, hostEnd))
      .trim();
    if (!host) return 0;
    return host
      .split(".")
      .filter((part) => part && !part.includes("*")).length;
  }

  function getPathLength(pattern) {
    const schemeIndex = pattern.indexOf("://");
    const hostStart = schemeIndex === -1 ? 0 : schemeIndex + 3;
    const pathIndex = pattern.indexOf("/", hostStart);
    if (pathIndex === -1) return 0;
    return pattern.slice(pathIndex).replace(/\*/g, "").length;
  }

  function matchRegex(url, pattern) {
    const parsed = parseRegexPattern(pattern);
    if (!parsed) return null;
    try {
      const regex = new RegExp(parsed.source, parsed.flags || "");
      return regex.test(url) ? 100 : null;
    } catch (err) {
      return null;
    }
  }

  function getMatchScore(url, pattern) {
    if (!pattern || pattern.trim() === "") return null;
    const trimmed = pattern.trim();

    const regexScore = matchRegex(url, trimmed);
    if (regexScore !== null) return regexScore;

    const hasWildcard = trimmed.includes("*");
    if (!hasWildcard && url === trimmed) {
      return 400 + getPathLength(trimmed) + getDomainSpecificity(trimmed) * 10;
    }

    if (!hasWildcard) return null;

    const isPrefix = trimmed.endsWith("*") && trimmed.indexOf("*") === trimmed.length - 1;
    if (isPrefix && url.startsWith(trimmed.slice(0, -1))) {
      return (
        300 +
        getPathLength(trimmed) -
        countWildcards(trimmed) * 5 +
        getDomainSpecificity(trimmed) * 10
      );
    }

    const escaped = escapeRegex(trimmed).replace(/\\\*/g, ".*");
    const regex = new RegExp(`^${escaped}$`);
    if (!regex.test(url)) return null;
    return (
      200 +
      getPathLength(trimmed) -
      countWildcards(trimmed) * 5 +
      getDomainSpecificity(trimmed) * 10
    );
  }

  function pickRule(rules, url) {
    let best = null;
    let bestScore = -Infinity;
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      const score = getMatchScore(url, rule.urlPattern || "");
      if (score === null) continue;
      if (score > bestScore) {
        best = rule;
        bestScore = score;
      }
    }
    return best;
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

  function parseContentEntries(rule) {
    const selectors = parseContentSelectors(rule);
    return selectors
      .map((entry) => {
        const index = entry.indexOf("#/");
        if (index === -1) return { selector: entry.trim(), replace: null };
        const selector = entry.slice(0, index).trim();
        const expr = entry.slice(index + 1).trim();
        return { selector, replace: expr || null };
      })
      .filter((item) => item.selector);
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

  function applyReplacementToElement(element, regex, replacement) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    nodes.forEach((node) => {
      const original = node.nodeValue;
      if (!original) return;
      const next = original.replace(regex, replacement);
      if (next !== original) node.nodeValue = next;
    });
  }

  function applyContentReplacements(rule, entries) {
    const ruleId = rule.id || "default";
    entries.forEach((entry) => {
      if (!entry.replace) return;
      const element = document.querySelector(entry.selector);
      if (!element) return;
      if (element.getAttribute("data-wm-replace-id") === ruleId) return;
      const parsed = parseSubstitutionExpression(entry.replace);
      if (!parsed) return;
      try {
        const flags = parsed.flags || "g";
        const regex = new RegExp(parsed.pattern, flags);
        applyReplacementToElement(element, regex, parsed.replacement);
        element.setAttribute("data-wm-replace-id", ruleId);
      } catch (err) {
        return;
      }
    });
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
    const expression = rule.titleMaskExpression
      ? rule.titleMaskExpression.trim()
      : "";
    if (!expression) return;
    const parsed = parseSubstitutionExpression(expression);
    if (!parsed) return;
    try {
      const flags = parsed.flags || "g";
      const regex = new RegExp(parsed.pattern, flags);
      const current = document.title;
      const next = current.replace(regex, parsed.replacement);
      if (next !== current) {
        document.title = next;
      }
    } catch (err) {
      return;
    }
  }

  function startTitleObserver(rule) {
    const expression = rule.titleMaskExpression
      ? rule.titleMaskExpression.trim()
      : "";
    if (!expression) return;
    if (startTitleObserver.observer) return;
    const titleEl = document.querySelector("title");
    if (!titleEl) return;
    const observer = new MutationObserver(() => {
      updateTitle(rule);
    });
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    startTitleObserver.observer = observer;
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

    const entries = parseContentEntries(rule);
    const selectors = entries.map((item) => item.selector);
    const rects = collectVisibleRects(selectors);
    applyContentReplacements(rule, entries);
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
      const desaturateLevel = Number.isFinite(rule.desaturateLevel)
        ? rule.desaturateLevel
        : 0;
      const desaturate = Math.max(0, Math.min(20, desaturateLevel));
      const saturate = Math.max(0, 1 - desaturate / 10);
      const brightness = 1 + blur / 20;
      const color = "rgba(0, 0, 0, 0)";
      blocker.style.background = color;
      blocker.style.backdropFilter = `blur(${blur}px) saturate(${saturate.toFixed(2)})`;
      blocker.style.webkitBackdropFilter =
        `blur(${blur}px) brightness(${brightness.toFixed(2)}) ` +
        `saturate(${saturate.toFixed(2)})`;
      blocker.style.backdropFilter =
        `blur(${blur}px) brightness(${brightness.toFixed(2)}) ` +
        `saturate(${saturate.toFixed(2)})`;
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
        startTitleObserver(rule);
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
