(() => {
  const STORAGE_KEY = "sites";

  const form = document.getElementById("rule-form");
  const formTitle = document.getElementById("formTitle");
  const addRuleButton = document.getElementById("addRule");
  const resetFormButton = document.getElementById("resetForm");
  const ruleList = document.getElementById("ruleList");
  const emptyState = document.getElementById("emptyState");
  const modal = document.getElementById("modal");
  const closeModalButton = document.getElementById("closeModal");
  const editRuleButton = document.getElementById("editRule");
  const deleteRuleButton = document.getElementById("deleteRule");
  const toggleRuleButton = document.getElementById("toggleRule");

  const nameInput = document.getElementById("name");
  const urlPatternInput = document.getElementById("urlPattern");
  const titleMaskSourceInput = document.getElementById("titleMaskSource");
  const titleMaskReplacementInput = document.getElementById("titleMaskReplacement");
  const iconUrlInput = document.getElementById("iconUrl");
  const iconPresetButton = document.getElementById("iconPreset");
  const contentSelectorsInput = document.getElementById("contentSelectors");
  const frostedLevelInput = document.getElementById("frostedLevel");
  const frostedLevelValue = document.getElementById("frostedLevelValue");
  const desaturateLevelInput = document.getElementById("desaturateLevel");
  const desaturateLevelValue = document.getElementById("desaturateLevelValue");
  const presetIconUrl =
    "https://www.gstatic.com/images/branding/searchlogo/ico/favicon.ico";

  let rules = [];
  let currentId = null;

  function setFrostedLevelValue(value) {
    frostedLevelValue.textContent = String(value);
  }

  function setDesaturateLevelValue(value) {
    desaturateLevelValue.textContent = String(value);
  }

  function generateId() {
    return `rule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function normalizeRule(rule) {
    const rawPattern = rule.urlPattern || "";
    const normalizedPattern =
      /^[a-z]+:\/\/[^/]+$/.test(rawPattern.trim()) && !rawPattern.trim().endsWith("/")
        ? `${rawPattern.trim()}/`
        : rawPattern;
    return {
      id: rule.id || generateId(),
      name: rule.name || "",
      urlPattern: normalizedPattern,
      titleMaskSource: rule.titleMaskSource || rule.titleMaskRegex || "",
      titleMaskReplacement: rule.titleMaskReplacement || rule.titleMaskText || "",
      iconUrl: rule.iconUrl || "",
      contentSelectors: Array.isArray(rule.contentSelectors)
        ? rule.contentSelectors
        : rule.contentSelector
          ? [rule.contentSelector]
          : [],
      frostedLevel: Number.isFinite(rule.frostedLevel) ? rule.frostedLevel : 10,
      desaturateLevel: Number.isFinite(rule.desaturateLevel) ? rule.desaturateLevel : 0,
      enabled: rule.enabled !== false
    };
  }

  function migrateRules(data) {
    const raw = data[STORAGE_KEY];
    if (Array.isArray(raw)) return raw.map(normalizeRule);
    if (raw && typeof raw === "object") return [normalizeRule(raw)];
    return [];
  }

  function saveRules(nextRules) {
    chrome.storage.sync.set({ [STORAGE_KEY]: nextRules });
  }

  function renderList() {
    ruleList.innerHTML = "";
    if (rules.length === 0) {
      emptyState.style.display = "block";
      editRuleButton.disabled = true;
      deleteRuleButton.disabled = true;
      toggleRuleButton.disabled = true;
      return;
    }
    emptyState.style.display = "none";

    rules.forEach((rule) => {
      const row = document.createElement("tr");
      row.dataset.id = rule.id;
      if (rule.id === currentId) row.classList.add("active");

      const nameCell = document.createElement("td");
      const nameSpan = document.createElement("span");
      nameSpan.className = "rule-name";
      nameSpan.textContent = rule.name || rule.urlPattern || "未命名配置";
      nameCell.appendChild(nameSpan);

      const urlCell = document.createElement("td");
      const urlSpan = document.createElement("span");
      urlSpan.className = "rule-sub";
      urlSpan.textContent = rule.urlPattern || "未设置 URL 规则";
      urlCell.appendChild(urlSpan);

      const statusCell = document.createElement("td");
      statusCell.textContent = rule.enabled ? "启用" : "停用";

      row.append(nameCell, urlCell, statusCell);
      ruleList.appendChild(row);
    });
    updateToggleButton();
  }

  function updateToggleButton() {
    const rule = rules.find((item) => item.id === currentId);
    if (!rule) {
      toggleRuleButton.disabled = true;
      toggleRuleButton.textContent = "禁用";
      return;
    }
    toggleRuleButton.disabled = false;
    toggleRuleButton.textContent = rule.enabled ? "禁用" : "启用";
  }

  function openModal(title) {
    formTitle.textContent = title;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  function fillForm(rule) {
    currentId = rule.id;
    nameInput.value = rule.name;
    urlPatternInput.value = rule.urlPattern;
    titleMaskSourceInput.value = rule.titleMaskSource;
    titleMaskReplacementInput.value = rule.titleMaskReplacement;
    iconUrlInput.value = rule.iconUrl;
    contentSelectorsInput.value = rule.contentSelectors.join("\n");
    frostedLevelInput.value = String(rule.frostedLevel);
    setFrostedLevelValue(rule.frostedLevel);
    desaturateLevelInput.value = String(rule.desaturateLevel);
    setDesaturateLevelValue(rule.desaturateLevel);
  }

  function clearForm() {
    currentId = null;
    nameInput.value = "";
    urlPatternInput.value = "";
    titleMaskSourceInput.value = "";
    titleMaskReplacementInput.value = "";
    iconUrlInput.value = "";
    contentSelectorsInput.value = "";
    frostedLevelInput.value = "10";
    setFrostedLevelValue(10);
    desaturateLevelInput.value = "0";
    setDesaturateLevelValue(0);
  }

  function upsertRule() {
    const rawPattern = urlPatternInput.value.trim();
    const normalizedPattern =
      /^[a-z]+:\/\/[^/]+$/.test(rawPattern) && !rawPattern.endsWith("/")
        ? `${rawPattern}/`
        : rawPattern;
    const existing = rules.find((rule) => rule.id === currentId);
    const draft = normalizeRule({
      id: currentId || generateId(),
      name: nameInput.value.trim(),
      urlPattern: normalizedPattern,
      titleMaskSource: titleMaskSourceInput.value.trim(),
      titleMaskReplacement: titleMaskReplacementInput.value.trim(),
      iconUrl: iconUrlInput.value.trim(),
      contentSelectors: contentSelectorsInput.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      frostedLevel: Number(frostedLevelInput.value || 10),
      desaturateLevel: Number(desaturateLevelInput.value || 0),
      enabled: existing ? existing.enabled : true
    });

    const index = rules.findIndex((rule) => rule.id === draft.id);
    if (index === -1) {
      rules.push(draft);
    } else {
      rules[index] = draft;
    }
    currentId = draft.id;
    saveRules(rules);
    renderList();
    closeModal();
  }

  function deleteRule(id) {
    const nextRules = rules.filter((rule) => rule.id !== id);
    rules = nextRules;
    saveRules(rules);
    if (currentId === id) {
      currentId = null;
    }
    editRuleButton.disabled = rules.length === 0;
    deleteRuleButton.disabled = rules.length === 0;
    toggleRuleButton.disabled = rules.length === 0;
    renderList();
  }

  function loadRules() {
    chrome.storage.sync.get([STORAGE_KEY], (data) => {
      rules = migrateRules(data);
      currentId = rules[0] ? rules[0].id : null;
      editRuleButton.disabled = !currentId;
      deleteRuleButton.disabled = !currentId;
      toggleRuleButton.disabled = !currentId;
      renderList();
    });
  }

  ruleList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest("tr");
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;
    currentId = id;
    editRuleButton.disabled = false;
    deleteRuleButton.disabled = false;
    toggleRuleButton.disabled = false;
    renderList();
  });

  addRuleButton.addEventListener("click", () => {
    clearForm();
    openModal("新增配置");
  });

  resetFormButton.addEventListener("click", () => {
    if (currentId) {
      const rule = rules.find((r) => r.id === currentId);
      if (rule) {
        fillForm(rule);
        return;
      }
    }
    clearForm();
  });

  closeModalButton.addEventListener("click", () => {
    closeModal();
  });

  editRuleButton.addEventListener("click", () => {
    if (!currentId) return;
    const rule = rules.find((r) => r.id === currentId);
    if (rule) {
      fillForm(rule);
      openModal("编辑配置");
    }
  });

  deleteRuleButton.addEventListener("click", () => {
    if (!currentId) return;
    if (!window.confirm("确定要删除这条配置吗？")) return;
    deleteRule(currentId);
  });

  toggleRuleButton.addEventListener("click", () => {
    const rule = rules.find((item) => item.id === currentId);
    if (!rule) return;
    rule.enabled = !rule.enabled;
    saveRules(rules);
    renderList();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  frostedLevelInput.addEventListener("input", () => {
    setFrostedLevelValue(frostedLevelInput.value);
  });

  desaturateLevelInput.addEventListener("input", () => {
    setDesaturateLevelValue(desaturateLevelInput.value);
  });

  iconPresetButton.addEventListener("click", () => {
    iconUrlInput.value = presetIconUrl;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    upsertRule();
  });

  loadRules();
})();
