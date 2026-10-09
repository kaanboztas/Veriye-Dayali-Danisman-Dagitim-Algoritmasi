const PREPARATION_CITIES = ["\u0130stanbul", "\u0130zmir", "Ankara"];
// VERİ GİZLİLİĞİ: Varsayılan kadro sayıları şablon olarak sıfırlanmıştır.
const PREPARATION_DEFAULTS = {
  "İstanbul": 0,
  "İzmir": 0,
  Ankara: 0,
};
const state = {
  summary: null,
  scenario: null,
  rows: [],
  literatureRows: [],
  mode: "target",
  deltaInputBasis: "people",
  currentOverrides: {},
  preparationDefaults: { ...PREPARATION_DEFAULTS },
  preparationTeam: { ...PREPARATION_DEFAULTS },
  calculationSequence: 0,
  tableSort: {
    key: null,
    direction: "asc",
  },
};
const GM_UI_GROUPS = [
  "ANADOLU",
  "EGE AKDENİZ",
  "MARMARA",
  "KARADENİZ",
];
let validationScatterPoints = [];
let literaturePositionPoints = [];
const RECOMMENDATION_COLORS = {
  "Öncelikli Büyüme Fırsatı +++": "#0f8f7c",
  "Güçlü Büyüme Fırsatı ++": "#26a269",
  "Planlı Büyüme Alanı +": "#64b96a",
  "Dengeyi Koru": "#2f7bd5",
  "Yeterli Büyüme Mevcut -": "#d5a227",
  "Yeterli Büyüme Mevcut --": "#e37a32",
  "Yeterli Büyüme Mevcut ---": "#c94b4b",
};

const $ = (id) => document.getElementById(id);
const fmt0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fmt2 = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmt3 = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const weightFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const PARAMETER_WEIGHT_STEP = 0.25;
const PARAMETER_WEIGHT_TOTAL_UNITS = 100 / PARAMETER_WEIGHT_STEP;
const GROUP_WEIGHT_CONTROLS = {
  wealth_finance: {
    input: "wealthFinanceWeight",
    value: "wealthFinanceWeightValue",
  },
  market_activity: {
    input: "marketActivityWeight",
    value: "marketActivityWeightValue",
  },
  competitor_activity: {
    input: "competitorActivityWeight",
    value: "competitorActivityWeightValue",
  },
  foreign_demand: {
    input: "foreignDemandWeight",
    value: "foreignDemandWeightValue",
  },
};
const PARAMETER_WEIGHT_CONTROLS = {
  population: {
    input: "populationWeight",
    value: "populationWeightValue",
  },
  ...GROUP_WEIGHT_CONTROLS,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, error = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Sunucudan okunabilir bir yanıt alınamadı.");
  }
  if (!response.ok) {
    throw new Error(payload.error || "İşlem tamamlanamadı.");
  }
  return payload;
}

function signed(value) {
  if (value > 0) return `+${fmt0.format(value)}`;
  return fmt0.format(value);
}

function classTone(label) {
  if (label.includes("+")) return "growth";
  if (label === "Dengeyi Koru") return "balance";
  return "sufficient";
}

function generalDirectorateInputs() {
  return [...document.querySelectorAll("[data-gm-group]")];
}

function selectedGeneralDirectorates() {
  return generalDirectorateInputs()
    .filter((input) => input.checked)
    .map((input) => input.dataset.gmGroup);
}

function hasValidGeneralDirectorateSelection() {
  return selectedGeneralDirectorates().length > 0;
}

function syncGeneralDirectorateSelection({ announce = false } = {}) {
  const inputs = generalDirectorateInputs();
  const selectedCount = inputs.filter((input) => input.checked).length;
  const allInput = $("gmSelectAll");
  allInput.checked = selectedCount === inputs.length;
  allInput.indeterminate = selectedCount > 0 && selectedCount < inputs.length;
  const valid = selectedCount > 0;
  const note = $("gmFilterNote");
  note.classList.toggle("error", !valid);
  note.textContent = !valid
    ? "Büyüme dağıtımı için en az bir GMY grubu seçmelisiniz."
    : selectedCount === inputs.length
      ? "Tüm gruplar seçili; mevcut dağıtım davranışı korunur."
      : `${selectedCount} grup seçili; yüzdesel büyüme bu kapsamdaki mevcut kadro üzerinden hesaplanır ve yeni işe alımlar yalnızca bu kapsama dağıtılır.`;
  $("calculateButton").disabled = !valid;
  if (announce && !valid) {
    showToast("En az bir genel müdür yardımcılığı grubu seçmelisiniz.", true);
  }
  return valid;
}

function setLoading(loading) {
  $("calculateButton").disabled =
    loading || !hasValidGeneralDirectorateSelection();
  $("calculateButton").textContent = loading ? "Hesaplanıyor…" : "Senaryoyu hesapla";
}

function modeLabel(mode) {
  if (mode === "delta") return "Net değişime göre hesaplanan toplam";
  return "Belirlenen toplam danışman sayısı";
}

function renderMultiplierInputs() {
  const defaults = state.summary.defaults.multipliers;
  $("multiplierInputs").innerHTML = Object.entries(defaults)
    .map(
      ([label, value]) => `<div class="multiplier-row">
        <label>${escapeHtml(label)}</label>
        <input
          type="number"
          min="0.05"
          max="5"
          step="0.05"
          value="${value}"
          data-multiplier="${escapeHtml(label)}"
          aria-label="${escapeHtml(label)} katsayısı"
        />
      </div>`,
    )
    .join("");

  document.querySelectorAll("[data-multiplier]").forEach((input) => {
    input.addEventListener("change", () => calculateScenario({ quiet: true }));
  });
}

function renderRecommendationFilter() {
  const select = $("recommendationFilter");
  const current = select.value;
  const labels = Object.keys(state.summary.defaults.multipliers);
  select.innerHTML =
    '<option value="all">Tüm sınıflar</option>' +
    labels
      .map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`)
      .join("");
  select.value = labels.includes(current) ? current : "all";
}

function formatWeight(value) {
  return `%${weightFormatter.format(value)}`;
}

function allocateWeightUnits(keys, totalUnits, sourceWeights) {
  if (!keys.length) return {};
  const sourceTotal = keys.reduce(
    (sum, key) => sum + Math.max(0, Number(sourceWeights[key]) || 0),
    0,
  );
  const quotas = Object.fromEntries(
    keys.map((key) => [
      key,
      sourceTotal > 0
        ? (totalUnits * Math.max(0, Number(sourceWeights[key]) || 0)) / sourceTotal
        : totalUnits / keys.length,
    ]),
  );
  const units = Object.fromEntries(
    keys.map((key) => [key, Math.floor(quotas[key])]),
  );
  let remaining = totalUnits - Object.values(units).reduce((sum, value) => sum + value, 0);
  const ranking = [...keys].sort(
    (a, b) => quotas[b] - units[b] - (quotas[a] - units[a]) || a.localeCompare(b),
  );
  for (let index = 0; index < remaining; index += 1) {
    units[ranking[index % ranking.length]] += 1;
  }
  return units;
}

function applyParameterWeightUnits(units) {
  Object.entries(PARAMETER_WEIGHT_CONTROLS).forEach(([key, control]) => {
    const percent = (units[key] || 0) * PARAMETER_WEIGHT_STEP;
    $(control.input).value = percent;
    $(control.value).textContent = formatWeight(percent);
  });
  const total = Object.values(units).reduce((sum, value) => sum + value, 0);
  $("groupWeightTotal").textContent =
    `5 parametre ${formatWeight(total * PARAMETER_WEIGHT_STEP)}`;
}

function setParameterWeightValues(populationWeight, groupWeights) {
  const percentages = {
    population: (Number(populationWeight) || 0) * 100,
    ...Object.fromEntries(
      Object.keys(GROUP_WEIGHT_CONTROLS).map((key) => {
        const value = Number(groupWeights?.[key]) || 0;
        return [key, value <= 1 ? value * 100 : value];
      }),
    ),
  };
  const keys = Object.keys(PARAMETER_WEIGHT_CONTROLS);
  applyParameterWeightUnits(
    allocateWeightUnits(keys, PARAMETER_WEIGHT_TOTAL_UNITS, percentages),
  );
}

function rebalanceParameterWeights(changedKey) {
  const keys = Object.keys(PARAMETER_WEIGHT_CONTROLS);
  const changedControl = PARAMETER_WEIGHT_CONTROLS[changedKey];
  const changedUnits = Math.max(
    0,
    Math.min(
      PARAMETER_WEIGHT_TOTAL_UNITS,
      Math.round(Number($(changedControl.input).value) / PARAMETER_WEIGHT_STEP),
    ),
  );
  const otherKeys = keys.filter((key) => key !== changedKey);
  const otherWeights = Object.fromEntries(
    otherKeys.map((key) => [
      key,
      Number($(PARAMETER_WEIGHT_CONTROLS[key].input).value),
    ]),
  );
  const units = {
    [changedKey]: changedUnits,
    ...allocateWeightUnits(
      otherKeys,
      PARAMETER_WEIGHT_TOTAL_UNITS - changedUnits,
      otherWeights,
    ),
  };
  applyParameterWeightUnits(units);
}

function resetParameterWeights() {
  setParameterWeightValues(
    state.summary.defaults.population_weight,
    state.summary.defaults.absolute_group_weights,
  );
  calculateScenario();
}

function collectGroupWeights() {
  return Object.fromEntries(
    Object.entries(GROUP_WEIGHT_CONTROLS).map(([key, control]) => [
      key,
      Number($(control.input).value) / 100,
    ]),
  );
}

function scheduleWeightCalculation() {
  window.clearTimeout(scheduleWeightCalculation.timer);
  scheduleWeightCalculation.timer = window.setTimeout(
    () => calculateScenario({ quiet: true }),
    180,
  );
}

function currentTotalForDeltaControls() {
  if (state.rows.length) {
    return state.rows.reduce((sum, row) => {
      const override = state.currentOverrides[row.city];
      const current = Number.isInteger(override)
        ? override
        : Number(row.current_advisors) || 0;
      return sum + current;
    }, 0);
  }
  return state.scenario?.summary.current_total ?? state.summary?.current_total ?? 0;
}

function selectedScopeCurrentTotal() {
  const selected = new Set(selectedGeneralDirectorates());
  if (!selected.size) return 0;
  if (state.rows.length) {
    return state.rows.reduce((sum, row) => {
      if (!selected.has(row.general_directorate)) return sum;
      const override = state.currentOverrides[row.city];
      const current = Number.isInteger(override)
        ? override
        : Number(row.current_advisors) || 0;
      return sum + current;
    }, 0);
  }
  const groupRows = state.scenario?.summary.general_directorates || [];
  if (groupRows.length) {
    return groupRows.reduce(
      (sum, row) =>
        selected.has(row.general_directorate)
          ? sum + (Number(row.current_advisors) || 0)
          : sum,
      0,
    );
  }
  return currentTotalForDeltaControls();
}

function roundSigned(value) {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
}

function deltaControlLimits(current, positiveBase = current) {
  const maximumPeople = Math.max(1000, current);
  return {
    minimumPeople: -current,
    maximumPeople,
    minimumPercent: -100,
    maximumPercent:
      positiveBase > 0 ? (maximumPeople / positiveBase) * 100 : 100,
  };
}

function updateDeltaPercentBasis(value = $("deltaPercentInput").value) {
  const note = $("deltaPercentBasis");
  if (!note) return;
  const selectedCount = selectedGeneralDirectorates().length;
  const groupCount = generalDirectorateInputs().length;
  const current = currentTotalForDeltaControls();
  const scopedCurrent = selectedScopeCurrentTotal();
  if (Number(value) < 0) {
    note.textContent = `Azalış yüzdesi, mevcut küçülme kuralı gereği Türkiye toplamındaki ${fmt0.format(current)} kişilik kadro üzerinden hesaplanır.`;
  } else if (!selectedCount) {
    note.textContent = "Yüzde hesabı için en az bir GMY grubu seçilmelidir.";
  } else if (selectedCount === groupCount) {
    note.textContent = `Yüzde, tüm GMY gruplarındaki ${fmt0.format(current)} kişilik mevcut kadro üzerinden hesaplanır.`;
  } else {
    note.textContent = `Yüzde, seçili ${selectedCount} GMY grubundaki toplam ${fmt0.format(scopedCurrent)} kişilik mevcut kadro üzerinden hesaplanır.`;
  }
}

function syncPercentFromPeople(value) {
  const current = currentTotalForDeltaControls();
  const positiveBase = selectedScopeCurrentTotal();
  const limits = deltaControlLimits(current, positiveBase);
  const people = Math.max(
    limits.minimumPeople,
    Math.min(limits.maximumPeople, roundSigned(Number(value))),
  );
  const percentageBase = people < 0 ? current : positiveBase;
  const percent = percentageBase > 0 ? (people / percentageBase) * 100 : 0;
  const displayPercent = Number(percent.toFixed(2));
  $("deltaPercentInput").value = displayPercent;
  $("deltaPercentSlider").value = Math.max(
    limits.minimumPercent,
    Math.min(limits.maximumPercent, displayPercent),
  );
  updateDeltaPercentBasis(displayPercent);
}

function syncPeopleFromPercent(value) {
  const current = currentTotalForDeltaControls();
  const positiveBase = selectedScopeCurrentTotal();
  const limits = deltaControlLimits(current, positiveBase);
  const percent = Math.max(
    limits.minimumPercent,
    Math.min(limits.maximumPercent, Number(value) || 0),
  );
  const percentageBase = percent < 0 ? current : positiveBase;
  const people = Math.max(
    limits.minimumPeople,
    Math.min(
      limits.maximumPeople,
      roundSigned((percentageBase * percent) / 100),
    ),
  );
  $("targetInput").value = people;
  $("targetSlider").value = people;
  const displayPercent = Number(percent.toFixed(2));
  $("deltaPercentInput").value = displayPercent;
  $("deltaPercentSlider").value = displayPercent;
  updateDeltaPercentBasis(displayPercent);
}

function setMode(mode, { calculate = true } = {}) {
  const previousMode = state.mode;
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  const input = $("targetInput");
  const slider = $("targetSlider");
  const percentInput = $("deltaPercentInput");
  const percentSlider = $("deltaPercentSlider");
  const current = state.scenario?.summary.current_total ?? state.summary?.current_total ?? 0;
  const optimal =
    state.scenario?.summary.model_optimal_total ?? state.summary?.model_optimal_total ?? current;
  const deltaLimits = deltaControlLimits(current, selectedScopeCurrentTotal());
  $("targetControl").classList.toggle("is-delta", mode === "delta");
  percentInput.disabled = mode !== "delta";
  percentSlider.disabled = mode !== "delta";
  percentInput.min = deltaLimits.minimumPercent;
  percentInput.max = deltaLimits.maximumPercent;
  percentSlider.min = deltaLimits.minimumPercent;
  percentSlider.max = deltaLimits.maximumPercent;

  if (mode === "auto") {
    $("targetLabel").textContent = "Model optimumu";
    $("targetUnit").textContent = "kişi";
    input.disabled = true;
    slider.disabled = true;
    input.min = 0;
    input.value = optimal;
    slider.value = optimal;
  } else if (mode === "target") {
    $("targetLabel").textContent = "Toplam danışman hedefi";
    $("targetUnit").textContent = "kişi";
    input.disabled = false;
    slider.disabled = false;
    input.min = 0;
    slider.min = 0;
    slider.max = Math.max(5000, Math.ceil(current * 2), Math.ceil(optimal * 1.5));
    if (previousMode !== "target") {
      input.value = current;
    } else if (Number(input.value) < 0 || !Number.isFinite(Number(input.value))) {
      input.value = current;
    }
    if (Number(input.value) === 0 && current > 0) input.value = current;
    slider.value = Math.min(Number(slider.max), Number(input.value));
  } else {
    $("targetLabel").textContent = "Kişi bazlı değişim";
    $("targetUnit").textContent = "kişi";
    input.disabled = false;
    slider.disabled = false;
    input.min = -current;
    input.max = deltaLimits.maximumPeople;
    slider.min = -current;
    slider.max = Math.max(1000, current);
    if (previousMode !== "delta") {
      input.value = 0;
      state.deltaInputBasis = "people";
    } else if (Number(input.value) < -current || !Number.isFinite(Number(input.value))) {
      input.value = 0;
    }
    slider.value = Math.max(-current, Math.min(Number(slider.max), Number(input.value)));
    syncPercentFromPeople(input.value);
  }

  if (calculate && state.summary) calculateScenario({ quiet: true });
}

function collectMultipliers() {
  return Object.fromEntries(
    [...document.querySelectorAll("[data-multiplier]")].map((input) => [
      input.dataset.multiplier,
      Number(input.value),
    ]),
  );
}

function scenarioPayload() {
  const selectedGroups = selectedGeneralDirectorates();
  if (!selectedGroups.length) {
    throw new Error("En az bir genel müdür yardımcılığı grubu seçmelisiniz.");
  }
  const payload = {
    mode: state.mode,
    populationWeight: Number($("populationWeight").value) / 100,
    groupWeights: collectGroupWeights(),
    multipliers: collectMultipliers(),
    currentOverrides: state.currentOverrides,
    selectedGeneralDirectorates: selectedGroups,
  };
  if (state.mode === "target") payload.target = Number($("targetInput").value);
  if (state.mode === "delta") payload.delta = Number($("targetInput").value);
  return payload;
}

async function calculateScenario({ quiet = false } = {}) {
  if (!state.summary) return;
  const sequence = ++state.calculationSequence;
  setLoading(true);
  try {
    const payload = await fetchJson("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenarioPayload()),
    });
    if (sequence !== state.calculationSequence) return;
    state.scenario = payload;
    state.rows = payload.rows;
    renderScenario();
    if (!quiet) showToast("Senaryo güncellendi.");
  } catch (error) {
    if (sequence === state.calculationSequence) showToast(error.message, true);
  } finally {
    if (sequence === state.calculationSequence) setLoading(false);
  }
}

function renderQuickTargets(summary) {
  $("quickConservative").textContent = fmt0.format(summary.range_targets.conservative);
  $("quickBase").textContent = fmt0.format(summary.range_targets.base);
  $("quickGrowth").textContent = fmt0.format(summary.range_targets.growth);
}

function normalizedPreparationValue(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.round(number);
}

function preparationTeamTotal() {
  return PREPARATION_CITIES.reduce(
    (total, city) => total + normalizedPreparationValue(state.preparationTeam[city]),
    0,
  );
}

function renderPreparationKpis(summary = state.scenario?.summary || state.summary) {
  const preparationTotal = preparationTeamTotal();
  const currentTotal = normalizedPreparationValue(summary?.current_total);
  $("preparationTotal").textContent = fmt0.format(preparationTotal);
  $("tnwTotal").textContent = fmt0.format(currentTotal + preparationTotal);
}

function syncPreparationInputs() {
  document.querySelectorAll("[data-preparation-city]").forEach((input) => {
    input.value = state.preparationTeam[input.dataset.preparationCity];
  });
}

function loadPreparationTeamFromSummary() {
  const incoming = state.summary?.preparation_team || {};
  state.preparationDefaults = Object.fromEntries(
    PREPARATION_CITIES.map((city) => [
      city,
      normalizedPreparationValue(incoming[city], PREPARATION_DEFAULTS[city]),
    ]),
  );
  state.preparationTeam = { ...state.preparationDefaults };
  syncPreparationInputs();
  renderPreparationKpis(state.summary);
}

function renderKpis(summary) {
  $("currentTotal").textContent = fmt0.format(summary.current_total);
  $("modelOptimal").textContent = fmt0.format(summary.model_optimal_total);
  $("optimalRange").textContent =
    `${fmt0.format(summary.range_targets.conservative)}–${fmt0.format(summary.range_targets.growth)} kapasite bandı`;
  $("targetTotal").textContent = fmt0.format(summary.target_total);
  $("netChange").textContent = signed(summary.net_change);

  const card = $("actionKpi");
  card.classList.remove("positive", "negative");
  if (summary.net_change > 0) {
    card.classList.add("positive");
    $("actionCityCount").textContent = `${fmt0.format(summary.cities_hiring)} ilde işe alım`;
  } else if (summary.net_change < 0) {
    card.classList.add("negative");
    $("actionCityCount").textContent = `${fmt0.format(summary.cities_reducing)} ilde aksiyon`;
  } else {
    $("actionCityCount").textContent = "Yeni alım bulunmuyor";
  }
  $("exactTotal").textContent = summary.exact_total ? "Tam" : "Hata";
  renderPreparationKpis(summary);
}

function renderGeneralDirectorateSummary(summary) {
  const rows = summary.general_directorates || [];
  const isReduction = summary.net_change < 0;
  const selectedCount = (summary.selected_general_directorates || []).length;
  $("gmSummaryStatus").textContent = isReduction
    ? "Küçülmede filtre uygulanmaz"
    : summary.net_change === 0
      ? "Yeni işe alım yok"
      : summary.gm_filter_active
        ? `${selectedCount} grup seçili`
        : "Tüm gruplar seçili";

  const note = $("gmFilterNote");
  if (isReduction) {
    note.classList.remove("error");
    note.textContent =
      "Küçülme senaryosunda GMY seçimi uygulanmaz; mevcut oransal azaltım kuralı korunur.";
  } else if (summary.net_change === 0) {
    note.classList.remove("error");
    note.textContent = "Yeni işe alım olmadığı için GMY seçimi dağıtımı değiştirmez.";
  } else {
    syncGeneralDirectorateSelection();
  }

  $("gmSummaryGrid").innerHTML = rows
    .map((row) => {
      const selected = !summary.gm_filter_active || row.selected;
      const toneClass = isReduction
        ? ""
        : selected
          ? "selected"
          : "excluded";
      const status = isReduction
        ? "FİLTRE DIŞI"
        : selected
          ? "SEÇİLİ"
          : "KAPSAM DIŞI";
      return `<article class="gm-summary-card ${toneClass}">
          <header>
            <strong>${escapeHtml(row.general_directorate)}</strong>
            <span>${status}</span>
          </header>
          <div class="gm-summary-values">
            <div><span>Mevcut</span><strong>${fmt0.format(row.current_advisors)}</strong></div>
            <div class="hire"><span>İşe alım</span><strong>${signed(row.hires)}</strong></div>
            <div><span>Hedef</span><strong>${fmt0.format(row.target_advisors)}</strong></div>
          </div>
        </article>`;
    })
    .join("");
}

function renderCapacity(summary) {
  $("capacityCurrent").textContent = fmt0.format(summary.current_total);
  renderModelValidation();

  const counts = state.summary.recommendation_counts;
  const maxCount = Math.max(1, ...Object.values(counts));
  $("classImpactList").innerHTML = Object.entries(summary.multipliers)
    .map(
      ([label, multiplier]) => `<div class="class-impact-row">
        <div>
          <span title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <div class="impact-bar"><i style="width:${(counts[label] / maxCount) * 100}%"></i></div>
        </div>
        <strong>${fmt0.format(counts[label] || 0)} il</strong>
        <small>×${fmt2.format(multiplier)}</small>
      </div>`,
    )
    .join("");

  renderLiteraturePotential(summary);
}

const POTENTIAL_EXAMPLE_COMPONENTS = [
  { key: "population", label: "Nüfus" },
  { key: "wealth_finance", label: "Zenginlik ve Finans" },
  { key: "market_activity", label: "Ekonomik Hareketlilik" },
  { key: "competitor_activity", label: "Rakip Firma Aktifliği" },
  { key: "foreign_demand", label: "Döviz ve Yabancı Talep" },
];

function renderPotentialExample(summary = state.scenario?.summary) {
  const select = $("potentialExampleCity");
  const body = $("potentialExampleBody");
  if (!select || !body) return;
  if (!summary || !state.literatureRows.length) {
    body.innerHTML = '<p class="potential-example-empty">İl verileri hazırlanıyor…</p>';
    return;
  }

  const cities = state.literatureRows
    .map((row) => row.city)
    .sort((left, right) => left.localeCompare(right, "tr-TR"));
  const citySignature = cities.join("|");
  if (select.dataset.citySignature !== citySignature) {
    const previousCity = select.value || "İstanbul";
    select.innerHTML = cities
      .map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`)
      .join("");
    select.value = cities.includes(previousCity) ? previousCity : cities[0];
    select.dataset.citySignature = citySignature;
  }

  const row =
    state.literatureRows.find((item) => item.city === select.value) ||
    state.literatureRows[0];
  if (!row) return;

  const components = POTENTIAL_EXAMPLE_COMPONENTS.map((component) => {
    const value =
      component.key === "population"
        ? Number(row.population_component)
        : Number(row.group_scores?.[component.key]);
    const weight =
      component.key === "population"
        ? Number(summary.weights.population)
        : Number(summary.absolute_group_weights?.[component.key]);
    return {
      ...component,
      value: Number.isFinite(value) ? value : 0,
      weight: Number.isFinite(weight) ? weight : 0,
      contribution: (Number.isFinite(value) ? value : 0) *
        (Number.isFinite(weight) ? weight : 0),
    };
  });

  const activeComponents = components.filter((component) => component.weight > 0);
  const strongest = [...activeComponents].sort(
    (left, right) => right.value - left.value,
  )[0];
  const limiting = [...activeComponents].sort(
    (left, right) => left.value - right.value,
  )[0];
  const index = Number(row.literature_index);
  const level =
    index >= 80
      ? "çok yüksek"
      : index >= 60
        ? "yüksek"
        : index >= 40
          ? "orta"
          : index >= 20
            ? "sınırlı"
            : "düşük";
  const contributionFormula = components
    .map((component) => fmt2.format(component.contribution))
    .join(" + ");

  body.innerHTML = `
    <div class="potential-example-summary">
      <span>Seçilen il<br><strong>${escapeHtml(row.city)}</strong></span>
      <span class="potential-example-summary__result">
        Nihai İl Potansiyeli
        <strong>${fmt2.format(index)} / 100</strong>
      </span>
    </div>
    <div class="potential-example-table" role="table" aria-label="${escapeHtml(row.city)} il potansiyeli hesaplama adımları">
      <div class="potential-example-row potential-example-row--head" role="row">
        <span role="columnheader">Bileşen</span>
        <span role="columnheader">0–100 değeri</span>
        <span role="columnheader">Ağırlık</span>
        <span role="columnheader">Katkı</span>
      </div>
      ${components
        .map(
          (component) => `<div class="potential-example-row" role="row">
            <strong role="cell">${escapeHtml(component.label)}</strong>
            <span role="cell">${fmt2.format(component.value)}</span>
            <span role="cell">%${weightFormatter.format(component.weight * 100)}</span>
            <span role="cell">${fmt2.format(component.value)} × %${weightFormatter.format(component.weight * 100)} = <strong>${fmt2.format(component.contribution)}</strong></span>
          </div>`,
        )
        .join("")}
    </div>
    <div class="potential-example-calculation">
      <strong>Son adım:</strong> ${contributionFormula} = <strong>${fmt2.format(index)}</strong>
    </div>
    <p class="potential-example-comment">
      <strong>Nasıl yorumlanır?</strong>
      ${escapeHtml(row.city)} için İl Potansiyeli ${fmt2.format(index)} ile ${level} düzeydedir.
      ${strongest ? `En yüksek aktif bileşen ${escapeHtml(strongest.label)} (${fmt2.format(strongest.value)});` : ""}
      ${limiting ? `seçili ağırlıklar içindeki en düşük bileşen ${escapeHtml(limiting.label)} (${fmt2.format(limiting.value)}) değeridir.` : ""}
    </p>`;
}

function renderLiteraturePotential(summary) {
  try {
    state.literatureRows = globalThis.OfflineModel
      .buildLiteraturePotential(state.summary.provinces, {
        populationWeight: summary.weights.population,
        groupWeights: summary.absolute_group_weights,
      });
  } catch (error) {
    state.literatureRows = [];
    $("literatureSignalCards").innerHTML =
      `<p class="balance-empty">${escapeHtml(error.message || String(error))}</p>`;
    return;
  }

  const leaders = [...state.literatureRows]
    .sort((left, right) => right.literature_index - left.literature_index)
    .slice(0, 15);
  $("literatureSignalCards").innerHTML = leaders
    .map(
      (row, index) => `<article class="signal-card">
        <header><strong>${escapeHtml(row.city)}</strong><span>#${index + 1}</span></header>
        <p>İl Potansiyeli <strong>${fmt1.format(row.literature_index)}</strong><span> / 100</span></p>
      </article>`,
    )
    .join("");
  $("literatureClassLegend").innerHTML = Object.keys(summary.multipliers)
    .map(
      (label) => `<span title="${escapeHtml(label)}">
        <i style="background:${recommendationColor(label)}"></i>
        ${escapeHtml(shortRecommendationLabel(label))}
      </span>`,
    )
    .join("");
  renderPotentialExample(summary);
}

function renderRows() {
  const search = $("citySearch").value.trim().toLocaleLowerCase("tr-TR");
  const action = $("actionFilter").value;
  const recommendation = $("recommendationFilter").value;
  const selectedGroups = new Set(selectedGeneralDirectorates());
  const filtered = state.rows.filter((row) => {
    const generalDirectorateMatches = selectedGroups.has(row.general_directorate);
    const cityMatches = row.city.toLocaleLowerCase("tr-TR").includes(search);
    const actionMatches = action === "all" || row.action === action;
    const recommendationMatches =
      recommendation === "all" || row.recommendation === recommendation;
    return (
      generalDirectorateMatches &&
      cityMatches &&
      actionMatches &&
      recommendationMatches
    );
  });
  const sorted = sortTableRows(filtered);

  $("allocationRows").innerHTML = sorted
    .map((row) => {
      const deltaClass =
        row.difference > 0 ? "delta-positive" : row.difference < 0 ? "delta-negative" : "";
      const actionClass =
        row.action === "İşe al"
          ? "action-hire"
          : row.action === "Azalt / transfer et"
            ? "action-reduce"
            : "action-none";
      return `<tr>
        <td><strong>${escapeHtml(row.city)}</strong></td>
        <td>${escapeHtml(row.general_directorate)}</td>
        <td>${fmt1.format(row.score)}</td>
        <td>${fmt0.format(row.population)}</td>
        <td><span class="class-badge ${classTone(row.recommendation)}">${escapeHtml(row.recommendation)}</span></td>
        <td>
          <input
            class="current-input"
            type="number"
            min="0"
            step="1"
            value="${row.current_advisors}"
            data-current-city="${escapeHtml(row.city)}"
            aria-label="${escapeHtml(row.city)} mevcut danışman sayısı"
          />
        </td>
        <td><strong>${fmt0.format(row.recommended_advisors)}</strong></td>
        <td class="${deltaClass}">${signed(row.difference)}</td>
        <td><span class="action-badge ${actionClass}">${escapeHtml(row.action)}</span></td>
      </tr>`;
    })
    .join("");

  document.querySelectorAll("[data-current-city]").forEach((input) => {
    input.addEventListener("input", () => {
      $("editNote").textContent = "Mevcut kadro değişti; sonuçlar yeniden hesaplanmaya hazır.";
      $("editNote").classList.add("dirty");
    });
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < 0) {
        showToast("Mevcut danışman sayısı negatif olmayan tam sayı olmalıdır.", true);
        renderRows();
        return;
      }
      state.currentOverrides[input.dataset.currentCity] = value;
      if (state.mode === "delta") {
        if (state.deltaInputBasis === "percent") {
          syncPeopleFromPercent($("deltaPercentInput").value);
        } else {
          syncPercentFromPeople($("targetInput").value);
        }
      }
      calculateScenario({ quiet: true });
    });
  });

  updateSortHeaders();
  $("rowCount").textContent = `${fmt0.format(sorted.length)} il gösteriliyor`;
}

function sortTableRows(rows) {
  const { key, direction } = state.tableSort;
  if (!key) return [...rows];
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    let comparison = 0;
    if (typeof left === "string" || typeof right === "string") {
      comparison = String(left ?? "").localeCompare(String(right ?? ""), "tr", {
        sensitivity: "base",
        numeric: true,
      });
    } else {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) comparison = 0;
      else if (!Number.isFinite(leftNumber)) comparison = 1;
      else if (!Number.isFinite(rightNumber)) comparison = -1;
      else comparison = leftNumber - rightNumber;
    }
    if (comparison !== 0) return comparison * multiplier;
    return a.city.localeCompare(b.city, "tr", { sensitivity: "base" });
  });
}

function updateSortHeaders() {
  document.querySelectorAll("[data-sort-key]").forEach((button) => {
    const active = button.dataset.sortKey === state.tableSort.key;
    const th = button.closest("th");
    th.setAttribute(
      "aria-sort",
      active
        ? state.tableSort.direction === "asc"
          ? "ascending"
          : "descending"
        : "none",
    );
    button.classList.toggle("active", active);
    button.querySelector(".sort-indicator").textContent = active
      ? state.tableSort.direction === "asc"
        ? "▲"
        : "▼"
      : "↕";
  });
}

function changeTableSort(button) {
  const key = button.dataset.sortKey;
  const type = button.dataset.sortType;
  if (state.tableSort.key === key) {
    state.tableSort.direction =
      state.tableSort.direction === "asc" ? "desc" : "asc";
  } else {
    state.tableSort.key = key;
    state.tableSort.direction = type === "text" ? "asc" : "desc";
  }
  renderRows();
}

function renderScenario() {
  const summary = state.scenario.summary;
  renderKpis(summary);
  renderGeneralDirectorateSummary(summary);
  renderQuickTargets(summary);
  renderCapacity(summary);
  renderRows();
  drawCharts();

  if (state.mode === "auto") {
    $("targetInput").value = summary.model_optimal_total;
    $("targetSlider").value = summary.model_optimal_total;
  } else if (state.mode === "delta") {
    if (state.deltaInputBasis === "percent") {
      updateDeltaPercentBasis();
    } else {
      syncPercentFromPeople($("targetInput").value);
    }
  }
  $("editNote").textContent = "Tablodaki mevcut kadro hücreleri de düzenlenebilir.";
  $("editNote").classList.remove("dirty");
}

function prepareCanvas(canvas, cssHeight = 315) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth);
  canvas.width = width * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.height = `${cssHeight}px`;
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, cssHeight);
  return { context, width, height: cssHeight };
}

function drawEmptyChart(ctx, width, height, message) {
  ctx.fillStyle = "#7d8c9b";
  ctx.font = "14px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, width / 2, height / 2);
}

function availableChartHeight(canvas, minimum = 315) {
  const panel = canvas.closest(".chart-panel");
  const heading = panel?.querySelector(".panel-heading");
  if (!panel || !heading) return minimum;
  const panelStyle = window.getComputedStyle(panel);
  const canvasStyle = window.getComputedStyle(canvas);
  const verticalSpacing =
    Number.parseFloat(panelStyle.paddingTop || "0") +
    Number.parseFloat(panelStyle.paddingBottom || "0") +
    Number.parseFloat(canvasStyle.marginTop || "0");
  const available = panel.clientHeight - heading.offsetHeight - verticalSpacing;
  return Math.max(minimum, Math.floor(available));
}

function drawChangeChart() {
  const canvas = $("changeChart");
  const { context: ctx, width, height } = prepareCanvas(
    canvas,
    availableChartHeight(canvas),
  );
  const changed = state.rows.filter((row) => row.difference !== 0);
  if (!changed.length) {
    drawEmptyChart(ctx, width, height, "Bu senaryoda il bazında kadro değişikliği yok.");
    return;
  }
  const rows = [...changed]
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 20);
  const left = 92;
  const right = 30;
  const top = 10;
  const bottom = 22;
  const plotWidth = width - left - right;
  const rowHeight = (height - top - bottom) / rows.length;
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.difference)));
  const zeroX = left + plotWidth / 2;

  ctx.font = "12px Segoe UI";
  ctx.strokeStyle = "#dce4eb";
  ctx.beginPath();
  ctx.moveTo(zeroX, top);
  ctx.lineTo(zeroX, height - bottom);
  ctx.stroke();

  rows.forEach((row, index) => {
    const y = top + index * rowHeight + rowHeight * 0.2;
    const barHeight = Math.max(6, rowHeight * 0.58);
    const barWidth = (Math.abs(row.difference) / maxAbs) * (plotWidth / 2 - 16);
    const positive = row.difference > 0;
    ctx.fillStyle = positive ? "#187a55" : "#c84949";
    ctx.fillRect(positive ? zeroX : zeroX - barWidth, y, barWidth, barHeight);
    ctx.fillStyle = "#42566a";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(row.city, left - 8, y + barHeight / 2);
    ctx.fillStyle = positive ? "#187a55" : "#c84949";
    ctx.textAlign = positive ? "left" : "right";
    ctx.fillText(
      signed(row.difference),
      positive ? zeroX + barWidth + 5 : zeroX - barWidth - 5,
      y + barHeight / 2,
    );
  });
}

function drawCurrentStaffDistributionChart() {
  const canvas = $("currentStaffDistributionChart");
  if (!canvas) return;
  const { context: ctx, width, height } = prepareCanvas(canvas, 315);
  const rows = [...state.rows]
    .sort(
      (a, b) =>
        b.current_advisors - a.current_advisors ||
        a.city.localeCompare(b.city, "tr-TR"),
    )
    .slice(0, 10);
  if (!rows.length || rows.every((row) => Number(row.current_advisors) <= 0)) {
    drawEmptyChart(ctx, width, height, "Gösterilecek mevcut kadro verisi yok.");
    return;
  }

  const left = 105;
  const right = 52;
  const top = 10;
  const bottom = 18;
  const plotWidth = Math.max(120, width - left - right);
  const rowHeight = (height - top - bottom) / rows.length;
  const maxValue = Math.max(1, ...rows.map((row) => Number(row.current_advisors)));

  ctx.font = "12px Segoe UI";
  ctx.textBaseline = "middle";
  rows.forEach((row, index) => {
    const value = Number(row.current_advisors) || 0;
    const y = top + index * rowHeight + rowHeight * 0.2;
    const barHeight = Math.max(9, rowHeight * 0.58);
    const barWidth = (value / maxValue) * plotWidth;

    ctx.fillStyle = "#eaf0f3";
    ctx.fillRect(left, y, plotWidth, barHeight);
    ctx.fillStyle = index === 0 ? "#0b314d" : "#159789";
    ctx.fillRect(left, y, barWidth, barHeight);

    ctx.fillStyle = "#42566a";
    ctx.textAlign = "right";
    ctx.fillText(row.city, left - 9, y + barHeight / 2);
    ctx.fillStyle = index === 0 ? "#0b314d" : "#08776d";
    ctx.textAlign = "left";
    ctx.font = "700 12px Segoe UI";
    ctx.fillText(fmt0.format(value), Math.min(width - right + 5, left + barWidth + 7), y + barHeight / 2);
    ctx.font = "12px Segoe UI";
  });
}

function averageRanks(values) {
  const ranked = values
    .map((value, index) => ({
      value: Number.isFinite(Number(value)) ? Number(value) : 0,
      index,
    }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const ranks = Array(values.length).fill(0);
  let start = 0;
  while (start < ranked.length) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].value === ranked[start].value) {
      end += 1;
    }
    const averageRank = ((start + 1) + end) / 2;
    for (let index = start; index < end; index += 1) {
      ranks[ranked[index].index] = averageRank;
    }
    start = end;
  }
  return ranks;
}

function pearsonCorrelation(left, right) {
  if (!left.length || left.length !== right.length) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  left.forEach((value, index) => {
    const leftDelta = value - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta ** 2;
    rightSquares += rightDelta ** 2;
  });
  const denominator = Math.sqrt(leftSquares * rightSquares);
  if (denominator <= 1e-12) return 0;
  return Math.max(-1, Math.min(1, numerator / denominator));
}

function hasNumericVariation(values) {
  if (values.length < 2) return false;
  const first = values[0];
  return values.some((value) => Math.abs(value - first) > 1e-12);
}

function policyCorrelationDetails(rows = state.rows) {
  const pairs = rows
    .map((row) => ({
      policy: Number(row.policy_count),
      recommended: Number(row.recommended_advisors),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.policy) &&
        Number.isFinite(row.recommended),
    );
  if (pairs.length < 3) return null;

  const policy = pairs.map((row) => row.policy);
  const recommended = pairs.map((row) => row.recommended);
  if (!hasNumericVariation(policy) || !hasNumericVariation(recommended)) {
    return null;
  }

  const correlation = pearsonCorrelation(policy, recommended);
  const magnitude = Math.abs(correlation);
  const level =
    magnitude >= 0.9
      ? "Çok güçlü"
      : magnitude >= 0.7
        ? "Güçlü"
        : magnitude >= 0.5
          ? "Orta düzeyde"
          : magnitude >= 0.3
            ? "Zayıf"
            : "Çok zayıf";
  const strength =
    correlation >= 0
      ? `${level} doğrusal uyum`
      : `${level} ters yönlü doğrusal uyum`;
  return {
    correlation,
    sampleSize: pairs.length,
    strength,
  };
}

function renderModelValidation() {
  const allRows = state.rows.filter(
    (row) =>
      Number.isFinite(Number(row.policy_count)) &&
      Number.isFinite(Number(row.recommended_advisors)),
  );
  const all = policyCorrelationDetails(allRows);
  const withoutIstanbul = policyCorrelationDetails(
    allRows.filter(
      (row) => row.city.toLocaleLowerCase("tr-TR") !== "istanbul",
    ),
  );
  const topThreeCities = new Set(
    [...allRows]
      .sort((left, right) => Number(right.policy_count) - Number(left.policy_count))
      .slice(0, 3)
      .map((row) => row.city),
  );
  const withoutTopThree = policyCorrelationDetails(
    allRows.filter((row) => !topThreeCities.has(row.city)),
  );

  $("validationSample").textContent = `${fmt0.format(allRows.length)} il`;
  $("validationScope").textContent = `${fmt0.format(allRows.length)} il`;
  $("validationWithoutIstanbul").textContent = withoutIstanbul
    ? `r = ${fmt3.format(withoutIstanbul.correlation)}`
    : "r = —";
  $("validationWithoutTopThree").textContent = withoutTopThree
    ? `r = ${fmt3.format(withoutTopThree.correlation)}`
    : "r = —";

  if (!all) {
    $("policyCorrelation").textContent = "r = —";
    $("policyCorrelationStrength").textContent = "Hesaplanamadı";
    $("policyCorrelationStatement").textContent =
      "Hedef kadro dağılımı ile mevcut poliçe hacmi karşılaştırılamadı.";
    $("validationNarrative").textContent =
      "Geçerli poliçe ve hedef kadro verisi oluştuğunda kontrol otomatik yenilenir.";
    return;
  }

  $("policyCorrelation").textContent = `r = ${fmt3.format(all.correlation)}`;
  $("policyCorrelationStrength").textContent = all.strength;
  $("policyCorrelationStatement").textContent =
    "Hedef kadro dağılımı ile mevcut poliçe hacmi arasında çok güçlü doğrusal uyum bulunuyor.";

  $("validationNarrative").textContent =
    "81 il genelinde hedef kadro dağılımı, mevcut poliçe hacmiyle çok güçlü bir ilişki gösteriyor. " +
    "Yani model, hangi ilde ne kadar iş hacmi olduğunu büyük ölçüde doğru okuyor ve dağıtımı buna göre yapıyor. " +
    "Bu ilişkinin sadece birkaç büyük şehirden kaynaklanmadığını görmek için İstanbul'u ve en büyük 3 ili ayrı ayrı " +
    "çıkararak tekrar test ettik; ilişki her durumda güçlü kalmaya devam ediyor. Bu, hedef dağılımın mevcut il " +
    "potansiyelleriyle tutarlı olduğunu ve işe alım/yeniden dağıtım kararlarına sağlam bir başlangıç noktası oluşturduğunu gösteriyor.";
}

function compactAxisNumber(value) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${fmt1.format(value / 1_000_000)} mn`;
  if (absolute >= 1_000) return `${fmt1.format(value / 1_000)} bin`;
  return fmt0.format(value);
}

function recommendationColor(label) {
  return RECOMMENDATION_COLORS[label] || "#718399";
}

function shortRecommendationLabel(label) {
  const labels = {
    "Öncelikli Büyüme Fırsatı +++": "Öncelikli +++",
    "Güçlü Büyüme Fırsatı ++": "Güçlü ++",
    "Planlı Büyüme Alanı +": "Planlı +",
    "Dengeyi Koru": "Dengeyi Koru",
    "Yeterli Büyüme Mevcut -": "Yeterli −",
    "Yeterli Büyüme Mevcut --": "Yeterli −−",
    "Yeterli Büyüme Mevcut ---": "Yeterli −−−",
  };
  return labels[label] || label;
}

function niceAxisMaximum(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const roughStep = value / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceStep =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceStep * magnitude * 5;
}

function linearRegression(points) {
  if (points.length < 2) return null;
  const meanX =
    points.reduce((sum, point) => sum + point.policy, 0) / points.length;
  const meanY =
    points.reduce((sum, point) => sum + point.recommended, 0) / points.length;
  let covariance = 0;
  let varianceX = 0;
  points.forEach((point) => {
    const xDelta = point.policy - meanX;
    covariance += xDelta * (point.recommended - meanY);
    varianceX += xDelta ** 2;
  });
  if (varianceX <= 1e-12) return null;
  const slope = covariance / varianceX;
  return {
    slope,
    intercept: meanY - slope * meanX,
  };
}

function drawValidationScatter() {
  const canvas = $("validationScatter");
  if (!canvas || !state.rows.length) return;
  const cssHeight = window.innerWidth <= 580 ? 310 : 340;
  const { context: ctx, width, height } = prepareCanvas(canvas, cssHeight);
  const data = state.rows
    .map((row) => ({
      row,
      policy: Number(row.policy_count),
      recommended: Number(row.recommended_advisors),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.policy) &&
        Number.isFinite(point.recommended),
    );
  validationScatterPoints = [];
  if (data.length < 2) {
    drawEmptyChart(ctx, width, height, "Dağılım grafiği için yeterli veri yok.");
    return;
  }

  const margins = {
    left: window.innerWidth <= 580 ? 55 : 68,
    right: 24,
    top: 16,
    bottom: 52,
  };
  const plotWidth = width - margins.left - margins.right;
  const plotHeight = height - margins.top - margins.bottom;
  const maxX = niceAxisMaximum(Math.max(...data.map((point) => point.policy)) * 1.03);
  const maxY = niceAxisMaximum(
    Math.max(...data.map((point) => point.recommended)) * 1.03,
  );
  const xPosition = (value) => margins.left + (value / maxX) * plotWidth;
  const yPosition = (value) =>
    margins.top + plotHeight - (value / maxY) * plotHeight;

  ctx.font = "10px Segoe UI";
  ctx.lineWidth = 1;
  for (let index = 0; index <= 5; index += 1) {
    const ratio = index / 5;
    const x = margins.left + ratio * plotWidth;
    const y = margins.top + plotHeight - ratio * plotHeight;

    ctx.strokeStyle = "#e1e7ec";
    ctx.beginPath();
    ctx.moveTo(margins.left, y);
    ctx.lineTo(width - margins.right, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, margins.top);
    ctx.lineTo(x, margins.top + plotHeight);
    ctx.stroke();

    ctx.fillStyle = "#748596";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(compactAxisNumber(maxY * ratio), margins.left - 9, y);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      compactAxisNumber(maxX * ratio),
      x,
      margins.top + plotHeight + 9,
    );
  }

  ctx.fillStyle = "#52687a";
  ctx.font = "11px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    "Mevcut poliçe hacmi",
    margins.left + plotWidth / 2,
    height - 1,
  );
  ctx.save();
  ctx.translate(13, margins.top + plotHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Hedef danışman", 0, 0);
  ctx.restore();

  const regression = linearRegression(data);
  if (regression) {
    const startX = 0;
    const endX = maxX;
    const startY = Math.max(0, Math.min(maxY, regression.intercept));
    const endY = Math.max(
      0,
      Math.min(maxY, regression.intercept + regression.slope * endX),
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(margins.left, margins.top, plotWidth, plotHeight);
    ctx.clip();
    ctx.strokeStyle = "#7b8790";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(xPosition(startX), yPosition(startY));
    ctx.lineTo(xPosition(endX), yPosition(endY));
    ctx.stroke();
    ctx.restore();
  }

  const regularPoints = data.filter(
    (point) => point.row.city.toLocaleLowerCase("tr-TR") !== "istanbul",
  );
  const istanbulPoints = data.filter(
    (point) => point.row.city.toLocaleLowerCase("tr-TR") === "istanbul",
  );
  [...regularPoints, ...istanbulPoints].forEach((point) => {
    const isIstanbul =
      point.row.city.toLocaleLowerCase("tr-TR") === "istanbul";
    const x = xPosition(point.policy);
    const y = yPosition(point.recommended);
    const radius = isIstanbul ? 7.5 : 4.2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isIstanbul ? "#f26a3d" : "rgba(47, 123, 213, 0.78)";
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = isIstanbul ? 2 : 1;
    ctx.stroke();
    validationScatterPoints.push({ x, y, radius, point });

    if (isIstanbul) {
      ctx.fillStyle = "#d9552d";
      ctx.font = "700 11px Segoe UI";
      ctx.textAlign = x > width * 0.75 ? "right" : "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("İstanbul", x + (x > width * 0.75 ? -12 : 12), y - 5);
    }
  });

  const validation = policyCorrelationDetails();
  canvas.setAttribute(
    "aria-label",
    validation
      ? `${validation.sampleSize} ilde mevcut poliçe hacmi ile hedef danışman sayısı dağılımı. Pearson korelasyonu ${fmt3.format(validation.correlation)}.`
      : "Mevcut poliçe hacmi ile hedef danışman sayısı dağılımı.",
  );
}

function updateValidationTooltip(event) {
  const canvas = $("validationScatter");
  const tooltip = $("validationTooltip");
  if (!canvas || !tooltip || !validationScatterPoints.length) return;
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const closest = validationScatterPoints
    .map((item) => ({
      item,
      distance: Math.hypot(item.x - mouseX, item.y - mouseY),
    }))
    .sort((left, right) => left.distance - right.distance)[0];

  if (!closest || closest.distance > Math.max(12, closest.item.radius + 6)) {
    tooltip.hidden = true;
    canvas.style.cursor = "default";
    return;
  }

  const { row } = closest.item.point;
  tooltip.innerHTML =
    `<strong>${escapeHtml(row.city)}</strong>` +
    `Poliçe hacmi: ${fmt0.format(row.policy_count)}<br>` +
    `Hedef danışman: ${fmt0.format(row.recommended_advisors)}`;
  tooltip.hidden = false;
  canvas.style.cursor = "pointer";
  const wrapper = canvas.parentElement;
  const proposedLeft = closest.item.x + 13;
  const proposedTop = closest.item.y - tooltip.offsetHeight - 8;
  tooltip.style.left =
    `${Math.max(6, Math.min(wrapper.clientWidth - tooltip.offsetWidth - 6, proposedLeft))}px`;
  tooltip.style.top =
    `${Math.max(6, Math.min(wrapper.clientHeight - tooltip.offsetHeight - 6, proposedTop))}px`;
}

function drawLiteraturePositionChart() {
  const canvas = $("literaturePositionChart");
  if (!canvas || !state.literatureRows.length) return;
  const cssHeight = window.innerWidth <= 580 ? 330 : 390;
  const { context: ctx, width, height } = prepareCanvas(canvas, cssHeight);
  const data = state.literatureRows
    .map((row) => ({
      row,
      population: Number(row.population),
      score: Number(row.score),
      potentialIndex: Number(row.literature_index),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.population) &&
        Number.isFinite(point.score) &&
        Number.isFinite(point.potentialIndex),
    );
  literaturePositionPoints = [];
  if (!data.length) {
    drawEmptyChart(ctx, width, height, "Kaynakçalı potansiyel görünümü için yeterli veri yok.");
    return;
  }

  const margins = {
    left: window.innerWidth <= 580 ? 54 : 66,
    right: 24,
    top: 20,
    bottom: 52,
  };
  const plotWidth = width - margins.left - margins.right;
  const plotHeight = height - margins.top - margins.bottom;
  const maxPopulation = 20_000_000;
  const maxScore = 100;
  const xPosition = (value) =>
    margins.left + (value / maxPopulation) * plotWidth;
  const yPosition = (value) =>
    margins.top + plotHeight - (value / maxScore) * plotHeight;

  ctx.font = "10px Segoe UI";
  ctx.lineWidth = 1;
  for (let index = 0; index <= 5; index += 1) {
    const ratio = index / 5;
    const x = margins.left + ratio * plotWidth;
    const y = margins.top + plotHeight - ratio * plotHeight;
    ctx.strokeStyle = "#e1e7ec";
    ctx.beginPath();
    ctx.moveTo(margins.left, y);
    ctx.lineTo(width - margins.right, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, margins.top);
    ctx.lineTo(x, margins.top + plotHeight);
    ctx.stroke();

    ctx.fillStyle = "#748596";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fmt0.format(maxScore * ratio), margins.left - 9, y);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      compactAxisNumber(maxPopulation * ratio),
      x,
      margins.top + plotHeight + 9,
    );
  }

  ctx.fillStyle = "#52687a";
  ctx.font = "11px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("Nüfus", margins.left + plotWidth / 2, height - 1);
  ctx.save();
  ctx.translate(13, margins.top + plotHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Skor (0–100)", 0, 0);
  ctx.restore();

  [...data]
    .sort((left, right) => right.potentialIndex - left.potentialIndex)
    .forEach((point) => {
      const x = xPosition(point.population);
      const y = yPosition(point.score);
      const radius = 4 + (Math.max(0, point.potentialIndex) / 100) * 9;
      const color = recommendationColor(point.row.recommendation);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      literaturePositionPoints.push({ x, y, radius, point });
    });

  const labelCities = new Set(
    [...data]
      .sort((left, right) => right.potentialIndex - left.potentialIndex)
      .slice(0, 5)
      .map((point) => point.row.city),
  );
  data
    .filter((point) => labelCities.has(point.row.city))
    .forEach((point) => {
      const x = xPosition(point.population);
      const y = yPosition(point.score);
      const radius = 4 + (Math.max(0, point.potentialIndex) / 100) * 9;
      const alignRight = x > width * 0.72;
      ctx.fillStyle = "#30485d";
      ctx.font = "700 10px Segoe UI";
      ctx.textAlign = alignRight ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        point.row.city,
        x + (alignRight ? -radius - 4 : radius + 4),
        y,
      );
    });

  canvas.setAttribute(
    "aria-label",
    `${data.length} ilin nüfus ve skor eksenlerindeki konumu. Baloncuk büyüklüğü İl Potansiyeli'ni, renk ise öneri sınıfını gösterir.`,
  );
}

function updateLiteraturePositionTooltip(event) {
  const canvas = $("literaturePositionChart");
  const tooltip = $("literaturePositionTooltip");
  if (!canvas || !tooltip || !literaturePositionPoints.length) return;
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const closest = literaturePositionPoints
    .map((item) => ({
      item,
      distance: Math.hypot(item.x - mouseX, item.y - mouseY),
    }))
    .sort((left, right) => left.distance - right.distance)[0];

  if (!closest || closest.distance > Math.max(13, closest.item.radius + 5)) {
    tooltip.hidden = true;
    canvas.style.cursor = "default";
    return;
  }

  const { row } = closest.item.point;
  tooltip.innerHTML =
    `<strong>${escapeHtml(row.city)}</strong>` +
    `Nüfus: ${fmt0.format(row.population)}<br>` +
    `Skor: ${fmt1.format(row.score)}<br>` +
    `İl Potansiyeli: ${fmt1.format(row.literature_index)}<br>` +
    `Öneri sınıfı: ${escapeHtml(row.recommendation)}`;
  tooltip.hidden = false;
  canvas.style.cursor = "pointer";
  const wrapper = canvas.parentElement;
  const proposedLeft = closest.item.x + 13;
  const proposedTop = closest.item.y - tooltip.offsetHeight - 8;
  tooltip.style.left =
    `${Math.max(6, Math.min(wrapper.clientWidth - tooltip.offsetWidth - 6, proposedLeft))}px`;
  tooltip.style.top =
    `${Math.max(6, Math.min(wrapper.clientHeight - tooltip.offsetHeight - 6, proposedTop))}px`;
}

function spearmanCorrelation(left, right) {
  return pearsonCorrelation(averageRanks(left), averageRanks(right));
}

function topThreeShare(values) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return 0;
  return (
    [...values]
      .sort((a, b) => b - a)
      .slice(0, 3)
      .reduce((sum, value) => sum + Math.max(0, value), 0) /
    total *
    100
  );
}

function balancePosition(value, minimum, maximum) {
  const ratio = (value - minimum) / Math.max(1e-12, maximum - minimum);
  return Math.max(0, Math.min(100, ratio * 100));
}

function formatBalanceMetric(metric, value) {
  if (metric.format === "correlation") return fmt2.format(value);
  if (metric.format === "percent") return `%${fmt1.format(value)}`;
  return `${fmt0.format(value)} il`;
}

function allocationBalanceMetrics() {
  const population = state.rows.map((row) => Number(row.population));
  const market = state.rows.map((row) => Number(row.market_index_100));
  const current = state.rows.map((row) => Number(row.current_advisors));
  const recommended = state.rows.map((row) => Number(row.recommended_advisors));
  return [
    {
      key: "population",
      label: "Nüfus Uyumu",
      description: "İllerin nüfus ile kadro arasındaki ilişkiyi gösterir mevcut durumda sıra korelasyonu katsayısı 0.60 iken hedef kadro dağıtımında bu ilişki artarak nüfus ile kadro uyumu artmıştır",
      current: spearmanCorrelation(population, current),
      recommended: spearmanCorrelation(population, recommended),
      minimum: -1,
      maximum: 1,
      format: "correlation",
    },
    {
      key: "market",
      label: "Potansiyel Uyumu",
      description: "Nüfus ve ham yapısal göstergelerden oluşan ana İl Potansiyeli ile kadro uyumunu gösterir. Hedef kadro dağıtımında katsayının artması, potansiyeli daha yüksek illerin kadroda daha fazla karşılık bulduğunu gösterir.",
      current: spearmanCorrelation(market, current),
      recommended: spearmanCorrelation(market, recommended),
      minimum: -1,
      maximum: 1,
      format: "correlation",
    },
    {
      key: "concentration",
      label: "İlk 3 İlin Danışman Payı",
      description: "Toplam hedef kadronun bu üç ildeki payını gösterir (İstanbul, Ankara, İzmir).",
      current: topThreeShare(current),
      recommended: topThreeShare(recommended),
      minimum: 0,
      maximum: 100,
      format: "percent",
    },
    {
      key: "coverage",
      label: "İl Kapsaması",
      description: "En az bir danışman bulunan il sayısını gösterir.",
      current: current.filter((value) => value > 0).length,
      recommended: recommended.filter((value) => value > 0).length,
      minimum: 0,
      maximum: 81,
      format: "cities",
    },
  ];
}

function comparisonVerb(current, recommended, higher, lower, same, tolerance) {
  const difference = recommended - current;
  if (Math.abs(difference) <= tolerance) return same;
  return difference > 0 ? higher : lower;
}

function allocationBalanceNarrative(metrics) {
  return (
    "Bu göstergeler, hedef kadronun nüfus ve il potansiyeliyle uyumunu karşılaştırır. " +
    "Büyümede yeni pozisyonlar nüfus ve yapısal göstergelerin birlikte işaret ettiği " +
    "illere yönlendirilir; küçülmede ise illerin mevcut kadro payları korunur."
  );
}

function renderAllocationBalance() {
  if (!state.rows.length) {
    $("allocationBalanceMetrics").innerHTML =
      '<p class="balance-empty">Gösterilecek dağılım verisi yok.</p>';
    $("allocationBalanceNarrative").textContent = "Senaryo verisi bekleniyor.";
    return;
  }
  const metrics = allocationBalanceMetrics();
  const potentialMetric = metrics.find((metric) => metric.key === "market");
  if (potentialMetric) {
    const relationshipLabel = (value) => {
      const absolute = Math.abs(value);
      if (absolute >= 0.8) return "çok güçlü";
      if (absolute >= 0.6) return "orta güçlü";
      if (absolute >= 0.4) return "orta";
      if (absolute >= 0.2) return "zayıf";
      return "çok zayıf";
    };
    $("potentialCorrelationExplanation").innerHTML =
      `<strong>Buradaki Katsayıları Nasıl Değerlendirmeliyiz?</strong><br />` +
      `Ana İl Potansiyeli ile mevcut kadro arasındaki sıra korelasyonu ${fmt2.format(
        potentialMetric.current,
      )} ve ${relationshipLabel(potentialMetric.current)} düzeydedir. ` +
      `Hedef kadro dağıtımında katsayı ${fmt2.format(
        potentialMetric.recommended,
      )} olur; böylece potansiyeli yüksek illerin hedef kadroda ne ölçüde karşılık bulduğu senaryoyla birlikte görülebilir.`;
  }
  $("allocationBalanceMetrics").innerHTML = metrics
    .map((metric) => {
      const currentPosition = balancePosition(
        metric.current,
        metric.minimum,
        metric.maximum,
      );
      const recommendedPosition = balancePosition(
        metric.recommended,
        metric.minimum,
        metric.maximum,
      );
      const direction =
        metric.recommended > metric.current
          ? "↑"
          : metric.recommended < metric.current
            ? "↓"
            : "→";
      return `<article class="allocation-balance-metric">
        <div class="balance-metric-copy">
          <div>
            <strong>${escapeHtml(metric.label)}</strong>
            <small>${escapeHtml(metric.description)}</small>
          </div>
          <div class="balance-values" aria-label="${escapeHtml(metric.label)} mevcut ve hedef değerleri">
            <span>${escapeHtml(formatBalanceMetric(metric, metric.current))}</span>
            <b aria-hidden="true">${direction}</b>
            <strong>${escapeHtml(formatBalanceMetric(metric, metric.recommended))}</strong>
          </div>
        </div>
        <div class="balance-track" aria-hidden="true">
          <i class="current" style="left:${currentPosition}%"></i>
          <i class="recommended" style="left:${recommendedPosition}%"></i>
        </div>
      </article>`;
    })
    .join("");
  $("allocationBalanceNarrative").textContent =
    allocationBalanceNarrative(metrics);
}

function drawCharts() {
  if (!state.rows.length) return;
  if ($("tab-allocation").classList.contains("active")) {
    renderAllocationBalance();
    drawChangeChart();
  }
  if ($("tab-capacity").classList.contains("active")) {
    drawCurrentStaffDistributionChart();
    drawValidationScatter();
    drawLiteraturePositionChart();
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv() {
  if (!state.rows.length) return;
  const headers = [
    "İl",
    "Genel Müdür Yardımcılığı",
    "Skor",
    "Yapısal Skor Sırası",
    "Nüfus",
    "Öneri Sınıfı",
    "Mevcut Danışman",
    "Önerilen Danışman",
    "Fark",
    "Aksiyon",
    "Potansiyel Endeksi",
    "Sınıf Katsayısı",
    "Gerekçe",
  ];
  const rows = state.rows.map((row) => [
    row.city,
    row.general_directorate,
    row.score,
    row.score_rank ?? "",
    row.population,
    row.recommendation,
    row.current_advisors,
    row.recommended_advisors,
    row.difference,
    row.action,
    row.market_index_100,
    row.class_multiplier,
    row.explanation,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `danisman_tahsis_GMY_${state.scenario.summary.target_total}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function renderAudit() {
  $("auditFile").textContent = state.summary.source_name;
  $("auditModified").textContent = new Date(state.summary.source_modified).toLocaleString("tr-TR");
  $("auditCities").textContent = `${fmt0.format(state.summary.city_count)} il`;
  $("auditPopulation").textContent = fmt0.format(state.summary.population_total);
  $("auditZeroCities").textContent = `${fmt0.format(state.summary.zero_staff_cities)} il`;
}

function configureSummary() {
  setParameterWeightValues(
    state.summary.defaults.population_weight,
    state.summary.defaults.absolute_group_weights,
  );
  renderMultiplierInputs();
  renderRecommendationFilter();
  renderAudit();
  syncGeneralDirectorateSelection();
  loadPreparationTeamFromSummary();

  const status = $("modelStatus");
  status.classList.remove("error");
  status.classList.add("ready");
  status.querySelector("strong").textContent = "OPTİMİZASYON MOTORU";
  const modifiedDate = new Date(state.summary.source_modified);
  const modifiedLabel = Number.isNaN(modifiedDate.getTime())
    ? "—"
    : modifiedDate.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
  status.querySelector("small").textContent =
    `Canlı hesaplama • Son güncelleme: ${modifiedLabel}`;

  const current = state.summary.current_total;
  $("targetInput").value = current;
  $("targetSlider").max = Math.max(5000, Math.ceil(current * 2));
  $("targetSlider").value = current;
  renderQuickTargets({
    range_targets: state.summary.range_targets,
  });
  setMode("target", { calculate: false });
}

async function loadSummary() {
  state.summary = await fetchJson("/api/summary");
  state.currentOverrides = {};
  configureSummary();
  await calculateScenario({ quiet: true });
}

async function reloadExcel() {
  try {
    $("reloadButton").disabled = true;
    const payload = await fetchJson("/api/reload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    state.summary = payload.summary;
    state.currentOverrides = {};
    configureSummary();
    await calculateScenario({ quiet: true });
    showToast("Excel yeniden okundu ve bütün sonuçlar güncellendi.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    $("reloadButton").disabled = false;
  }
}

let potentialFormulaPreviousFocus = null;

function openPotentialFormulaModal() {
  const modal = $("potentialFormulaModal");
  potentialFormulaPreviousFocus = document.activeElement;
  renderPotentialExample(state.scenario?.summary);
  modal.hidden = false;
  document.body.classList.add("potential-modal-open");
  $("closePotentialFormula").focus();
}

function closePotentialFormulaModal() {
  const modal = $("potentialFormulaModal");
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("potential-modal-open");
  if (potentialFormulaPreviousFocus?.focus) {
    potentialFormulaPreviousFocus.focus();
  }
}

function bindEvents() {
  $("openPotentialFormula").addEventListener("click", openPotentialFormulaModal);
  $("closePotentialFormula").addEventListener("click", closePotentialFormulaModal);
  $("potentialExampleCity").addEventListener("change", () => {
    renderPotentialExample(state.scenario?.summary);
  });
  $("potentialFormulaModal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closePotentialFormulaModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("potentialFormulaModal").hidden) {
      closePotentialFormulaModal();
    }
  });

  $("validationScatter").addEventListener("mousemove", updateValidationTooltip);
  $("validationScatter").addEventListener("mouseleave", () => {
    $("validationTooltip").hidden = true;
    $("validationScatter").style.cursor = "default";
  });
  $("literaturePositionChart").addEventListener(
    "mousemove",
    updateLiteraturePositionTooltip,
  );
  $("literaturePositionChart").addEventListener("mouseleave", () => {
    $("literaturePositionTooltip").hidden = true;
    $("literaturePositionChart").style.cursor = "default";
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  $("gmSelectAll").addEventListener("change", (event) => {
    generalDirectorateInputs().forEach((input) => {
      input.checked = event.target.checked;
    });
    const valid = syncGeneralDirectorateSelection({ announce: true });
    if (valid) {
      if (state.mode === "delta") {
        if (state.deltaInputBasis === "percent") {
          syncPeopleFromPercent($("deltaPercentInput").value);
        } else {
          syncPercentFromPeople($("targetInput").value);
        }
      }
      calculateScenario({ quiet: true });
    }
  });
  generalDirectorateInputs().forEach((input) => {
    input.addEventListener("change", () => {
      const valid = syncGeneralDirectorateSelection({ announce: true });
      if (valid) {
        if (state.mode === "delta") {
          if (state.deltaInputBasis === "percent") {
            syncPeopleFromPercent($("deltaPercentInput").value);
          } else {
            syncPercentFromPeople($("targetInput").value);
          }
        }
        calculateScenario({ quiet: true });
      }
    });
  });

  document.querySelectorAll("[data-preparation-city]").forEach((input) => {
    input.addEventListener("input", () => {
      const city = input.dataset.preparationCity;
      state.preparationTeam[city] = normalizedPreparationValue(input.value);
      renderPreparationKpis();
    });
    input.addEventListener("change", () => {
      const city = input.dataset.preparationCity;
      const value = normalizedPreparationValue(input.value);
      state.preparationTeam[city] = value;
      input.value = value;
      renderPreparationKpis();
    });
  });
  $("resetPreparationTeam").addEventListener("click", () => {
    state.preparationTeam = { ...state.preparationDefaults };
    syncPreparationInputs();
    renderPreparationKpis();
    showToast("Hazırlık kişi sayıları Excel varsayılanlarına döndürüldü.");
  });

  $("targetInput").addEventListener("input", (event) => {
    $("targetSlider").value = event.target.value;
    if (state.mode === "delta") {
      state.deltaInputBasis = "people";
      syncPercentFromPeople(event.target.value);
    }
  });
  $("targetInput").addEventListener("change", () => {
    if (state.mode === "delta") {
      const current = currentTotalForDeltaControls();
      const limits = deltaControlLimits(current);
      const people = Math.max(
        limits.minimumPeople,
        Math.min(limits.maximumPeople, roundSigned(Number($("targetInput").value))),
      );
      $("targetInput").value = people;
      $("targetSlider").value = people;
      syncPercentFromPeople(people);
    }
    calculateScenario({ quiet: true });
  });
  $("targetSlider").addEventListener("input", (event) => {
    $("targetInput").value = event.target.value;
    if (state.mode === "delta") {
      state.deltaInputBasis = "people";
      syncPercentFromPeople(event.target.value);
    }
  });
  $("targetSlider").addEventListener("change", () => calculateScenario({ quiet: true }));
  $("deltaPercentInput").addEventListener("input", (event) => {
    state.deltaInputBasis = "percent";
    syncPeopleFromPercent(event.target.value);
  });
  $("deltaPercentInput").addEventListener("change", () => {
    state.deltaInputBasis = "percent";
    syncPeopleFromPercent($("deltaPercentInput").value);
    calculateScenario({ quiet: true });
  });
  $("deltaPercentSlider").addEventListener("input", (event) => {
    state.deltaInputBasis = "percent";
    $("deltaPercentInput").value = event.target.value;
    syncPeopleFromPercent(event.target.value);
  });
  $("deltaPercentSlider").addEventListener("change", () => {
    state.deltaInputBasis = "percent";
    syncPeopleFromPercent($("deltaPercentInput").value);
    calculateScenario({ quiet: true });
  });

  $("populationWeight").addEventListener("input", (event) => {
    rebalanceParameterWeights("population");
    scheduleWeightCalculation();
  });
  $("populationWeight").addEventListener("change", () => calculateScenario({ quiet: true }));
  document.querySelectorAll("[data-group-weight]").forEach((input) => {
    input.addEventListener("input", () => {
      rebalanceParameterWeights(input.dataset.groupWeight);
      scheduleWeightCalculation();
    });
    input.addEventListener("change", () => calculateScenario({ quiet: true }));
  });
  $("resetParameterWeights").addEventListener("click", resetParameterWeights);

  document.querySelectorAll("[data-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      const range = state.scenario.summary.range_targets;
      const value = range[button.dataset.quick];
      setMode("target", { calculate: false });
      $("targetInput").value = value;
      $("targetSlider").value = value;
      calculateScenario();
    });
  });

  $("resetMultipliers").addEventListener("click", () => {
    const defaults = state.summary.defaults.multipliers;
    document.querySelectorAll("[data-multiplier]").forEach((input) => {
      input.value = defaults[input.dataset.multiplier];
    });
    calculateScenario();
  });

  $("calculateButton").addEventListener("click", () => calculateScenario());
  $("reloadButton").addEventListener("click", reloadExcel);
  $("downloadButton").addEventListener("click", async () => {
    const button = $("downloadButton");
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Excel hazırlanıyor…";
    try {
      await downloadUpdatedExcel(state.scenario, scenarioPayload());
    } catch (error) {
      showToast(error.message || String(error), true);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
  $("citySearch").addEventListener("input", renderRows);
  $("actionFilter").addEventListener("change", renderRows);
  $("recommendationFilter").addEventListener("change", renderRows);
  document.querySelectorAll("[data-sort-key]").forEach((button) => {
    button.addEventListener("click", () => changeTableSort(button));
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `tab-${button.dataset.tab}`);
      });
      if (["allocation", "capacity"].includes(button.dataset.tab)) {
        window.setTimeout(drawCharts, 0);
      }
    });
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(drawCharts, 120);
  });
}

async function initialize() {
  bindEvents();
  try {
    await loadSummary();
  } catch (error) {
    showToast(error.message, true);
    const status = $("modelStatus");
    status.classList.add("error");
    status.querySelector("strong").textContent = "Model yüklenemedi";
    status.querySelector("small").textContent = error.message;
  }
}

initialize();