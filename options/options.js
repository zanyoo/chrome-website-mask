(() => {
  const STORAGE_KEY = "sites";

  const form = document.getElementById("rule-form");
  const nameInput = document.getElementById("name");
  const urlPatternInput = document.getElementById("urlPattern");
  const titleMaskTextInput = document.getElementById("titleMaskText");
  const iconUrlInput = document.getElementById("iconUrl");
  const contentSelectorsInput = document.getElementById("contentSelectors");
  const frostedLevelInput = document.getElementById("frostedLevel");
  const frostedLevelValue = document.getElementById("frostedLevelValue");

  function setFrostedLevelValue(value) {
    frostedLevelValue.textContent = String(value);
  }

  function loadRule() {
    chrome.storage.sync.get([STORAGE_KEY], (data) => {
      const rules = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
      if (!rules[0]) return;
      const rule = rules[0];
      nameInput.value = rule.name || "";
      urlPatternInput.value = rule.urlPattern || "";
      titleMaskTextInput.value = rule.titleMaskText || "";
      iconUrlInput.value = rule.iconUrl || "";
      if (Array.isArray(rule.contentSelectors)) {
        contentSelectorsInput.value = rule.contentSelectors.join("\n");
      } else if (rule.contentSelector) {
        contentSelectorsInput.value = rule.contentSelector;
      } else {
        contentSelectorsInput.value = "";
      }
      const level = Number.isFinite(rule.frostedLevel) ? rule.frostedLevel : 10;
      frostedLevelInput.value = String(level);
      setFrostedLevelValue(level);
    });
  }

  function saveRule(e) {
    e.preventDefault();
    const rule = {
      id: "demo-rule",
      name: nameInput.value.trim(),
      urlPattern: urlPatternInput.value.trim(),
      titleMaskText: titleMaskTextInput.value.trim(),
      iconUrl: iconUrlInput.value.trim(),
      contentSelectors: contentSelectorsInput.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      frostedLevel: Number(frostedLevelInput.value || 10),
      enabled: true
    };
    chrome.storage.sync.set({ [STORAGE_KEY]: [rule] }, () => {
      alert("已保存规则");
    });
  }

  frostedLevelInput.addEventListener("input", () => {
    setFrostedLevelValue(frostedLevelInput.value);
  });
  form.addEventListener("submit", saveRule);
  loadRule();
})();
