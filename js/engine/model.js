(function (root) {
  "use strict";

  const DEFAULT_POPULATION_WEIGHT = 0.5;
  const MODEL_VERSION = "DİNAMİK SINIF PAYI MODELİ V5";
  const GENERAL_DIRECTORATE_GROUPS = Object.freeze({
    ANADOLU: [
      "Adana", "Ad\u0131yaman", "Ankara", "Batman", "Diyarbak\u0131r", "Eski\u015fehir",
      "Gaziantep", "K\u0131r\u0131kkale", "Konya", "Malatya", "Mardin", "Mersin",
      "A\u011fr\u0131", "Aksaray", "Ardahan", "Bing\u00f6l", "Bitlis", "\u00c7ank\u0131r\u0131",
      "Elaz\u0131\u011f", "Hakkari", "I\u011fd\u0131r", "Karaman", "Kilis", "Mu\u015f",
      "Nev\u015fehir", "Ni\u011fde", "Siirt", "\u015eanl\u0131urfa", "\u015e\u0131rnak",
      "Tunceli", "Van", "Yozgat",
    ],
    "EGE AKDEN\u0130Z": [
      "Antalya", "Ayd\u0131n", "Bal\u0131kesir", "Bart\u0131n", "\u00c7anakkale", "Denizli",
      "Isparta", "\u0130zmir", "Karab\u00fck", "Kayseri", "K\u0131r\u015fehir", "K\u00fctahya",
      "Manisa", "Mu\u011fla", "U\u015fak", "Afyonkarahisar", "Burdur", "Hatay",
      "Kahramanmara\u015f", "Osmaniye",
    ],
    MARMARA: [
      "Bursa", "Edirne", "\u0130stanbul", "K\u0131rklareli", "Kocaeli", "Tekirda\u011f",
      "Bilecik", "Sakarya", "Yalova",
    ],
    "KARADEN\u0130Z": [
      "Artvin", "\u00c7orum", "Erzincan", "Erzurum", "Giresun", "Kars", "Ordu",
      "Rize", "Samsun", "Sinop", "Sivas", "Trabzon", "Amasya", "Bayburt", "Bolu",
      "D\u00fczce", "G\u00fcm\u00fc\u015fhane", "Kastamonu", "Tokat", "Zonguldak",
    ],
  });
  const GENERAL_DIRECTORATE_ORDER = Object.freeze(
    Object.keys(GENERAL_DIRECTORATE_GROUPS),
  );

  function cityMappingKey(value) {
    return String(value ?? "")
      .trim()
      .toLocaleUpperCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  const GENERAL_DIRECTORATE_BY_CITY = new Map(
    GENERAL_DIRECTORATE_ORDER.flatMap((group) =>
      GENERAL_DIRECTORATE_GROUPS[group].map((city) => [cityMappingKey(city), group]),
    ),
  );

  function generalDirectorateForCity(city) {
    const group = GENERAL_DIRECTORATE_BY_CITY.get(cityMappingKey(city));
    if (!group) {
      throw new Error(`Genel müdür yardımcılığı grubu bulunamadı: ${city}`);
    }
    return group;
  }

  function normalizeSelectedGeneralDirectorates(value) {
    if (value === null || value === undefined) {
      return [...GENERAL_DIRECTORATE_ORDER];
    }
    if (!Array.isArray(value)) {
      throw new Error("Genel m\u00fcd\u00fcr yard\u0131mc\u0131l\u0131\u011f\u0131 se\u00e7imi liste bi\u00e7iminde olmal\u0131d\u0131r.");
    }
    const supplied = new Set(value.map((item) => String(item)));
    const unknown = [...supplied].filter(
      (group) => !GENERAL_DIRECTORATE_ORDER.includes(group),
    );
    if (unknown.length) {
      throw new Error(`Bilinmeyen genel m\u00fcd\u00fcr yard\u0131mc\u0131l\u0131\u011f\u0131 grubu: ${unknown.join(", ")}`);
    }
    return GENERAL_DIRECTORATE_ORDER.filter((group) => supplied.has(group));
  }
  const DEFAULT_GROUP_WEIGHTS = {
    wealth_finance: 0.25,
    market_activity: 0.25,
    competitor_activity: 0.25,
    foreign_demand: 0.25,
  };
  const GROUP_DEFINITIONS = {
    wealth_finance: {
      label: "Zenginlik ve finans",
      indicators: [
        "gdp",
        "housing_price",
        "deposits",
        "insured_rate",
      ],
      indicator_labels: [
        "GSYH",
        "Konut fiyatı",
        "Mevduat",
        "Sigortalı oranı",
      ],
    },
    market_activity: {
      label: "Ekonomik hareketlilik",
      indicators: [
        "sales",
        "employment",
        "vehicles",
        "policies",
        "policyholders",
      ],
      indicator_labels: [
        "Satış",
        "İstihdam",
        "Taşıt",
        "Poliçe",
        "Sigorta ettiren",
      ],
    },
    competitor_activity: {
      label: "Rakip firma aktifliği",
      indicators: ["total_bank_branches", "atm"],
      indicator_labels: ["Toplam banka şubesi", "ATM"],
    },
    foreign_demand: {
      label: "Döviz ve Yabancı Talep",
      indicators: ["exchange_offices", "foreign_sales"],
      indicator_labels: [
        "Döviz bürosu",
        "Yabancılara gayrimenkul satışı",
      ],
    },
  };
  const LITERATURE_GROUP_DEFINITIONS = {
    wealth_finance: {
      label: "Zenginlik ve finans",
      indicators: [
        "gdp",
        "housing_price",
        "deposits",
        "insured_rate",
      ],
    },
    market_activity: {
      label: "Ekonomik hareketlilik",
      indicators: ["sales", "employment", "vehicles"],
    },
    competitor_activity: {
      label: "Rakip firma aktifliği",
      indicators: ["total_bank_branches", "atm"],
    },
    foreign_demand: {
      label: "Döviz ve Yabancı Talep",
      indicators: ["exchange_offices", "foreign_sales"],
    },
  };
  const LITERATURE_LOG_INDICATORS = new Set([
    "deposits",
    "sales",
    "vehicles",
    "total_bank_branches",
    "atm",
    "exchange_offices",
    "foreign_sales",
  ]);
  const DEFAULT_MULTIPLIERS = {
    "Öncelikli Büyüme Fırsatı +++": 5,
    "Güçlü Büyüme Fırsatı ++": 4.5,
    "Planlı Büyüme Alanı +": 4,
    "Dengeyi Koru": 3.5,
    "Yeterli Büyüme Mevcut -": 3,
    "Yeterli Büyüme Mevcut --": 2,
    "Yeterli Büyüme Mevcut ---": 1,
  };
  const RECOMMENDATION_ORDER = Object.keys(DEFAULT_MULTIPLIERS);
  const HIRING_ELIGIBLE = new Set([
    "Öncelikli Büyüme Fırsatı +++",
    "Güçlü Büyüme Fırsatı ++",
    "Planlı Büyüme Alanı +",
    "Dengeyi Koru",
  ]);
  const SUFFICIENT_GROWTH = new Set([
    "Yeterli Büyüme Mevcut -",
    "Yeterli Büyüme Mevcut --",
    "Yeterli Büyüme Mevcut ---",
  ]);
  const DEFAULT_SUFFICIENT_HIRE_SHARE = 0.05;
  const MIN_SUFFICIENT_HIRE_SHARE = 0.01;
  const MAX_SUFFICIENT_HIRE_SHARE = 0.15;
  const ISTANBUL_MIN_HIRE_SHARE_CAP = 0.2;
  const ISTANBUL_MIN_HIRE_SHARE_FACTOR = 1 / 3;

  const rawCompare = (left, right) =>
    left < right ? -1 : left > right ? 1 : 0;
  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  function pythonRound(value) {
    if (!Number.isFinite(value)) return value;
    const sign = value < 0 ? -1 : 1;
    const absolute = Math.abs(value);
    const floor = Math.floor(absolute);
    const fraction = absolute - floor;
    const tolerance = Number.EPSILON * Math.max(1, absolute) * 4;
    let rounded;
    if (fraction < 0.5 - tolerance) rounded = floor;
    else if (fraction > 0.5 + tolerance) rounded = floor + 1;
    else rounded = floor % 2 === 0 ? floor : floor + 1;
    return sign * rounded;
  }

  function roundTo(value, digits) {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** digits;
    return pythonRound(value * factor) / factor;
  }

  function boundedFloat(value, name, defaultValue, minimum, maximum) {
    if (value === null || value === undefined || value === "") {
      return defaultValue;
    }
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      number < minimum ||
      number > maximum
    ) {
      throw new Error(
        `${name}, ${minimum}–${maximum} aralığında olmalıdır.`,
      );
    }
    return number;
  }

  function normalizeParameters(payload) {
    const input = payload || {};
    const populationWeight = boundedFloat(
      input.populationWeight,
      "Nüfus ağırlığı",
      DEFAULT_POPULATION_WEIGHT,
      0,
      1,
    );
    const structuralWeight = 1 - populationWeight;
    const suppliedGroupWeights = input.groupWeights;
    if (
      suppliedGroupWeights !== null &&
      suppliedGroupWeights !== undefined &&
      (typeof suppliedGroupWeights !== "object" ||
        Array.isArray(suppliedGroupWeights))
    ) {
      throw new Error("Parametre ağırlıkları nesne biçiminde olmalıdır.");
    }
    let absoluteGroupWeights;
    if (suppliedGroupWeights === null || suppliedGroupWeights === undefined) {
      absoluteGroupWeights = Object.fromEntries(
        Object.entries(DEFAULT_GROUP_WEIGHTS).map(([key, value]) => [
          key,
          structuralWeight * value,
        ]),
      );
    } else {
      absoluteGroupWeights = Object.fromEntries(
        Object.keys(DEFAULT_GROUP_WEIGHTS).map((key) => [
          key,
          boundedFloat(
            suppliedGroupWeights[key],
            `${GROUP_DEFINITIONS[key].label} ağırlığı`,
            0,
            0,
            1,
          ),
        ]),
      );
      const combined =
        populationWeight +
        Object.values(absoluteGroupWeights).reduce(
          (sum, value) => sum + value,
          0,
        );
      if (Math.abs(combined - 1) > 0.0026) {
        throw new Error(
          `Nüfus ve dört yapısal parametre ağırlığının toplamı %100 olmalıdır; mevcut toplam %${(
            combined * 100
          ).toFixed(2)}.`,
        );
      }
    }
    const groupTotal = Object.values(absoluteGroupWeights).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (structuralWeight > 0 && groupTotal <= 0) {
      throw new Error(
        "Nüfus %100 değilken yapısal parametrelerin tamamı sıfır olamaz.",
      );
    }
    const groupWeights =
      groupTotal > 0
        ? Object.fromEntries(
            Object.entries(absoluteGroupWeights).map(([key, value]) => [
              key,
              value / groupTotal,
            ]),
          )
        : { ...DEFAULT_GROUP_WEIGHTS };
    const suppliedMultipliers = input.multipliers || {};
    if (
      typeof suppliedMultipliers !== "object" ||
      Array.isArray(suppliedMultipliers)
    ) {
      throw new Error("Öneri katsayıları nesne biçiminde olmalıdır.");
    }
    const multipliers = Object.fromEntries(
      Object.entries(DEFAULT_MULTIPLIERS).map(([label, defaultValue]) => [
        label,
        boundedFloat(
          suppliedMultipliers[label],
          `${label} katsayısı`,
          defaultValue,
          0.05,
          5,
        ),
      ]),
    );
    const mode = String(input.mode || "auto").toLowerCase();
    if (!["auto", "target", "delta"].includes(mode)) {
      throw new Error("Hedef modu auto, target veya delta olmalıdır.");
    }
    return {
      population_weight: populationWeight,
      structural_weight: structuralWeight,
      absolute_group_weights: absoluteGroupWeights,
      group_weights: groupWeights,
      istanbul_min_hire_share: Math.min(
        ISTANBUL_MIN_HIRE_SHARE_CAP,
        populationWeight * ISTANBUL_MIN_HIRE_SHARE_FACTOR,
      ),
      multipliers,
      mode,
      target: input.target,
      delta: input.delta,
      current_overrides: input.currentOverrides || {},
      selected_general_directorates: normalizeSelectedGeneralDirectorates(
        input.selectedGeneralDirectorates,
      ),
    };
  }

  function currentValues(provinces, overrides) {
    if (
      overrides === null ||
      typeof overrides !== "object" ||
      Array.isArray(overrides)
    ) {
      throw new Error(
        "Mevcut kadro değişiklikleri nesne biçiminde olmalıdır.",
      );
    }
    const known = new Set(provinces.map((province) => province.city));
    const unknown = Object.keys(overrides)
      .filter((city) => !known.has(city))
      .sort(rawCompare);
    if (unknown.length) {
      throw new Error(`Bilinmeyen il değişikliği: ${unknown.join(", ")}`);
    }
    return provinces.map((province) => {
      const raw = Object.hasOwn(overrides, province.city)
        ? overrides[province.city]
        : province.current_advisors;
      const number = Number(raw);
      if (!Number.isInteger(number)) {
        throw new Error(
          `${province.city}: mevcut danışman tam sayı olmalıdır.`,
        );
      }
      if (number < 0) {
        throw new Error(
          `${province.city}: mevcut danışman negatif olamaz.`,
        );
      }
      return number;
    });
  }

  function marketMetrics(provinces, parameters, currentTotal) {
    const {
      populationComponents,
      groupComponents,
      structuralComponents,
      combinedComponents: marketIndices,
    } = potentialComponents(provinces, parameters);
    const marketTotal = marketIndices.reduce((sum, value) => sum + value, 0);
    if (marketTotal <= 0) {
      throw new Error(
        "Yapısal parametreler ve nüfus değerleri potansiyel endeksi üretemedi.",
      );
    }
    const populationTotal = provinces.reduce(
      (sum, province) => sum + province.population,
      0,
    );
    // İl Potansiyeli ekranda OECD/EC-JRC bileşik endeksi olarak kalır.
    // Büyüme dağıtımında ise eski modelin daha seçici davranışını korumak
    // için operasyonel öncelik, mevcut yapısal skor üzerine seçili grup
    // ağırlıklarının etkisi eklenerek hesaplanır. Böylece sıfır kadrolu çok
    // sayıda il yalnızca min-max ölçeklemenin küçük pozitif değerleri nedeniyle
    // tek kişilik kadrolarla açılmaz.
    const allocationStructuralAdjustments = provinces.map((_, index) => {
      const selected = Object.keys(DEFAULT_GROUP_WEIGHTS).reduce(
        (sum, key) =>
          sum + parameters.group_weights[key] * groupComponents[key][index],
        0,
      );
      const defaultComponent = Object.keys(DEFAULT_GROUP_WEIGHTS).reduce(
        (sum, key) =>
          sum + DEFAULT_GROUP_WEIGHTS[key] * groupComponents[key][index],
        0,
      );
      return selected - defaultComponent;
    });
    const allocationStructuralComponents = provinces.map((province, index) =>
      clamp(
        province.score / 100 + allocationStructuralAdjustments[index],
        0,
        1,
      ),
    );
    const allocationStructuralTotal = allocationStructuralComponents.reduce(
      (sum, value) => sum + value,
      0,
    );
    let weightedMultiplier = 0;
    const metrics = provinces.map((province, index) => {
      const marketIndex = marketIndices[index];
      const marketShare = marketIndex / marketTotal;
      const multiplier = parameters.multipliers[province.recommendation];
      const populationShare = province.population / populationTotal;
      const structuralShare =
        allocationStructuralTotal > 0
          ? allocationStructuralComponents[index] / allocationStructuralTotal
          : 0;
      const allocationPriority =
        parameters.population_weight * populationShare +
        (1 - parameters.population_weight) * structuralShare;
      weightedMultiplier += marketShare * multiplier;
      const result = {
        score_component: structuralComponents[index],
        structural_component: structuralComponents[index],
        structural_adjustment: allocationStructuralAdjustments[index],
        allocation_structural_component:
          allocationStructuralComponents[index],
        population_component: populationComponents[index],
        market_index: marketIndex,
        market_share: marketShare,
        multiplier,
        priority: marketIndex * multiplier,
        population_share: populationShare,
        structural_share: structuralShare,
        allocation_population_weight: parameters.population_weight,
        allocation_structural_weight: 1 - parameters.population_weight,
        allocation_priority: allocationPriority,
      };
      for (const key of Object.keys(DEFAULT_GROUP_WEIGHTS)) {
        result[`${key}_component`] = groupComponents[key][index];
      }
      return result;
    });
    const modelOptimal = Math.max(
      0,
      pythonRound(currentTotal * weightedMultiplier),
    );
    return {
      metrics,
      modelOptimal,
      rangeTargets: {
        conservative: Math.max(0, pythonRound(modelOptimal * 0.93)),
        base: modelOptimal,
        growth: Math.max(0, pythonRound(modelOptimal * 1.07)),
      },
    };
  }

  function parseInteger(value, label) {
    const number = Number(value);
    if (typeof value === "boolean" || !Number.isInteger(number)) {
      throw new Error(`${label} tam sayı olmalıdır.`);
    }
    return number;
  }

  function selectTarget(parameters, currentTotal, modelOptimal) {
    let target;
    if (parameters.mode === "auto") target = modelOptimal;
    else if (parameters.mode === "target") {
      target = parseInteger(parameters.target, "Manuel hedef");
    } else {
      target =
        currentTotal + parseInteger(parameters.delta, "Net değişim");
    }
    if (target < 0 || target > 100000) {
      throw new Error(
        "Seçilen toplam kadro 0–100.000 aralığında olmalıdır.",
      );
    }
    return target;
  }

  const roundHalfUp = (value) =>
    Math.floor(Math.max(0, value) + 0.5);

  function dynamicSufficientHireShare(provinces, metrics) {
    let defaultSignal = 0;
    let selectedSignal = 0;
    provinces.forEach((province, index) => {
      if (!SUFFICIENT_GROWTH.has(province.recommendation)) return;
      const basePriority = metrics[index].allocation_priority;
      defaultSignal +=
        basePriority * DEFAULT_MULTIPLIERS[province.recommendation];
      selectedSignal += basePriority * metrics[index].multiplier;
    });
    if (defaultSignal <= 0) return DEFAULT_SUFFICIENT_HIRE_SHARE;
    return clamp(
      DEFAULT_SUFFICIENT_HIRE_SHARE *
        (selectedSignal / defaultSignal),
      MIN_SUFFICIENT_HIRE_SHARE,
      MAX_SUFFICIENT_HIRE_SHARE,
    );
  }

  function istanbulHireRequirement(
    amount,
    weights,
    provinces,
    minimumShare,
  ) {
    const index = provinces.findIndex(
      (province, provinceIndex) =>
        province.city === "İstanbul" && weights[provinceIndex] > 0,
    );
    if (amount <= 0 || index < 0 || minimumShare <= 0) {
      return [0, false];
    }
    let required = Math.ceil(amount * minimumShare);
    if (amount >= 5) required = Math.max(2, required);
    required = Math.min(amount, required);
    return [required, false];
  }

  function bestAllocationIndex(
    weights,
    allocations,
    provinces,
    excluded,
  ) {
    let best = -1;
    for (let index = 0; index < weights.length; index += 1) {
      if (weights[index] <= 0 || excluded.has(index)) continue;
      if (best < 0) {
        best = index;
        continue;
      }
      const quotient = weights[index] / (allocations[index] + 1);
      const bestQuotient = weights[best] / (allocations[best] + 1);
      if (quotient > bestQuotient) best = index;
      else if (quotient === bestQuotient) {
        if (weights[index] > weights[best]) best = index;
        else if (weights[index] === weights[best]) {
          if (provinces[index].population > provinces[best].population) {
            best = index;
          } else if (
            provinces[index].population === provinces[best].population
          ) {
            if (provinces[index].score > provinces[best].score) best = index;
            else if (
              provinces[index].score === provinces[best].score &&
              rawCompare(provinces[index].city, provinces[best].city) < 0
            ) {
              best = index;
            }
          }
        }
      }
    }
    return best;
  }

  function populationLedAllocation(
    amount,
    weights,
    provinces,
    minimumShare,
    requirement,
    lockOverride,
  ) {
    if (amount <= 0) return weights.map(() => 0);
    if (weights.reduce((sum, value) => sum + value, 0) <= 0) {
      throw new Error(
        "İşe alım dağılımı için pozitif öncelik bulunamadı.",
      );
    }
    const allocation = weights.map(() => 0);
    const istanbulIndex = provinces.findIndex(
      (province, index) =>
        province.city === "İstanbul" && weights[index] > 0,
    );
    const [calculatedRequired, defaultLock] =
      istanbulHireRequirement(
        amount,
        weights,
        provinces,
        minimumShare,
      );
    const required =
      requirement === undefined || requirement === null
        ? calculatedRequired
        : Math.min(amount, Math.max(0, Math.trunc(requirement)));
    const lock =
      istanbulIndex >= 0 &&
      (lockOverride === undefined || lockOverride === null
        ? defaultLock
        : Boolean(lockOverride));
    if (istanbulIndex >= 0 && required > 0) {
      allocation[istanbulIndex] = required;
    }
    const excluded = new Set(lock ? [istanbulIndex] : []);
    const rounds = amount - required;
    for (let round = 0; round < rounds; round += 1) {
      const index = bestAllocationIndex(
        weights,
        allocation,
        provinces,
        excluded,
      );
      if (index < 0) {
        throw new Error("İşe alım dağılımı tamamlanamadı.");
      }
      allocation[index] += 1;
    }
    while (
      !lock &&
      istanbulIndex >= 0 &&
      allocation[istanbulIndex] < required
    ) {
      const donors = allocation
        .map((count, index) => ({ count, index }))
        .filter(
          (item) => item.index !== istanbulIndex && item.count > 0,
        );
      if (!donors.length) break;
      donors.sort((left, right) => {
        const leftValue = weights[left.index] / allocation[left.index];
        const rightValue = weights[right.index] / allocation[right.index];
        if (leftValue !== rightValue) return leftValue - rightValue;
        const leftProvince = provinces[left.index];
        const rightProvince = provinces[right.index];
        if (leftProvince.population !== rightProvince.population) {
          return leftProvince.population - rightProvince.population;
        }
        if (leftProvince.score !== rightProvince.score) {
          return leftProvince.score - rightProvince.score;
        }
        return rawCompare(leftProvince.city, rightProvince.city);
      });
      allocation[donors[0].index] -= 1;
      allocation[istanbulIndex] += 1;
    }
    return allocation;
  }

  function allocateGrowthByGeneralDirectorate(
    amount,
    weights,
    provinces,
    selectedGroups,
    istanbulRequirement = 0,
  ) {
    const result = weights.map(() => 0);
    if (amount <= 0) return result;

    const groups = GENERAL_DIRECTORATE_ORDER.filter((group) =>
      selectedGroups.includes(group),
    );
    if (!groups.length) {
      throw new Error("B\u00fcy\u00fcme senaryosu i\u00e7in en az bir genel m\u00fcd\u00fcr yard\u0131mc\u0131l\u0131\u011f\u0131 grubu se\u00e7ilmelidir.");
    }

    const groupWeights = groups.map((group) =>
      provinces.reduce(
        (sum, province, index) =>
          sum + (generalDirectorateForCity(province.city) === group ? weights[index] : 0),
        0,
      ),
    );
    if (groupWeights.reduce((sum, value) => sum + value, 0) <= 0) {
      throw new Error("Se\u00e7ili genel m\u00fcd\u00fcr yard\u0131mc\u0131l\u0131\u011f\u0131 gruplar\u0131nda da\u011f\u0131t\u0131labilir pozitif \u00f6ncelik bulunamad\u0131.");
    }

    const groupProvinces = groups.map((group) => {
      const members = provinces.filter(
        (province) => generalDirectorateForCity(province.city) === group,
      );
      return {
        city: group,
        population: members.reduce((sum, province) => sum + province.population, 0),
        score: members.reduce((maximum, province) => Math.max(maximum, province.score), 0),
      };
    });
    const groupAllocation = populationLedAllocation(
      amount,
      groupWeights,
      groupProvinces,
      0,
    );

    const marmaraIndex = groups.indexOf("MARMARA");
    const requiredForIstanbul =
      marmaraIndex >= 0 && groupWeights[marmaraIndex] > 0
        ? Math.min(amount, Math.max(0, Math.trunc(istanbulRequirement)))
        : 0;
    while (
      marmaraIndex >= 0 &&
      groupAllocation[marmaraIndex] < requiredForIstanbul
    ) {
      const donor = groupAllocation
        .map((count, index) => ({ count, index }))
        .filter((item) => item.index !== marmaraIndex && item.count > 0)
        .sort((left, right) => {
          const leftValue = groupWeights[left.index] / left.count;
          const rightValue = groupWeights[right.index] / right.count;
          return leftValue - rightValue || right.count - left.count || left.index - right.index;
        })[0];
      if (!donor) break;
      groupAllocation[donor.index] -= 1;
      groupAllocation[marmaraIndex] += 1;
    }

    groups.forEach((group, groupIndex) => {
      const quota = groupAllocation[groupIndex];
      if (quota <= 0) return;
      const localWeights = weights.map((value, provinceIndex) =>
        generalDirectorateForCity(provinces[provinceIndex].city) === group ? value : 0,
      );
      const localIstanbulRequirement =
        group === "MARMARA" ? Math.min(quota, requiredForIstanbul) : 0;
      const localAllocation = populationLedAllocation(
        quota,
        localWeights,
        provinces,
        0,
        localIstanbulRequirement,
        false,
      );
      localAllocation.forEach((value, index) => {
        result[index] += value;
      });
    });

    if (result.reduce((sum, value) => sum + value, 0) !== amount) {
      throw new Error("Genel m\u00fcd\u00fcr yard\u0131mc\u0131l\u0131\u011f\u0131 bazl\u0131 i\u015fe al\u0131m da\u011f\u0131t\u0131m\u0131 hedefi tam tutturamad\u0131.");
    }
    return result;
  }

  function balancedReductions(amount, current, metrics, provinces) {
    if (amount <= 0) return current.map(() => 0);
    if (amount > current.reduce((sum, value) => sum + value, 0)) {
      throw new Error("Azaltım miktarı mevcut toplam kadroyu aşamaz.");
    }
    const candidates = [];
    current.forEach((count, index) => {
      if (count <= 0) return;
      const protection = Math.max(
        0.02,
        metrics[index].allocation_priority,
      );
      for (let removal = 1; removal <= count; removal += 1) {
        const remaining = count - removal;
        const spread = ((remaining + 1) / count) ** 2;
        const lastPenalty = remaining === 0 ? 0.035 : 1;
        candidates.push({
          attractiveness: (spread * lastPenalty) / protection,
          index,
          population: provinces[index].population,
          city: provinces[index].city,
        });
      }
    });
    candidates.sort((left, right) => {
      if (left.attractiveness !== right.attractiveness) {
        return right.attractiveness - left.attractiveness;
      }
      if (left.population !== right.population) {
        return left.population - right.population;
      }
      return rawCompare(right.city, left.city);
    });
    const reductions = current.map(() => 0);
    candidates.slice(0, amount).forEach((candidate) => {
      reductions[candidate.index] += 1;
    });
    return reductions;
  }

  function proportionalReductions(amount, current) {
    if (amount <= 0) return current.map(() => 0);
    const currentTotal = current.reduce((sum, value) => sum + value, 0);
    if (amount > currentTotal) {
      throw new Error("Azaltım miktarı mevcut toplam kadroyu aşamaz.");
    }
    if (currentTotal <= 0) return current.map(() => 0);

    const target = currentTotal - amount;
    const quotas = current.map((value) => (value * target) / currentTotal);
    const recommended = quotas.map((value) => Math.floor(value));
    const remaining =
      target - recommended.reduce((sum, value) => sum + value, 0);
    const remainderOrder = quotas
      .map((value, index) => ({
        index,
        fraction: value - recommended[index],
        current: current[index],
      }))
      .sort(
        (left, right) =>
          right.fraction - left.fraction ||
          right.current - left.current ||
          left.index - right.index,
      );

    for (let index = 0; index < remaining; index += 1) {
      recommended[remainderOrder[index].index] += 1;
    }
    return current.map((value, index) => value - recommended[index]);
  }

  function explanation(province, difference, metric) {
    const populationPercent = metric.population_component * 100;
    if (difference > 0) {
      return (
        `İl potansiyeliyle yönlendirilen büyüme payı: potansiyel endeksi ${(
          metric.market_index * 100
        ).toFixed(1)}, nüfus bileşeni ${populationPercent.toFixed(
          1,
        )}, yapısal bileşim payı %${(
          metric.structural_share * 100
        ).toFixed(2)} ve öneri sınıfı katsayısı ×${metric.multiplier.toFixed(2)}.`
      );
    }
    if (difference < 0) {
      return "Küçülme dağılımı: ilin mevcut Türkiye kadrosundaki payı en büyük kalan yöntemiyle korundu.";
    }
    return `Seçilen toplamda değişiklik gerekmedi; potansiyel endeksi ${metric.market_index.toFixed(
      3,
    )}.`;
  }

  function serializeProvince(province) {
    const result = {
      city: province.city,
      population: province.population,
      current_advisors: province.current_advisors,
      score: roundTo(province.score, 2),
      score_rank: province.score_rank,
      advisor_level: province.advisor_level,
      score_level: province.score_level,
      gap: province.gap,
      recommendation: province.recommendation,
      premium_average:
        province.premium_average === null ||
        province.premium_average === undefined
          ? null
          : roundTo(province.premium_average, 2),
      organization_type: province.organization_type,
      raw_indicators: province.raw_indicators
        ? { ...province.raw_indicators }
        : undefined,
    };
    if (province.policy_count !== undefined) {
      result.policy_count = province.policy_count;
    }
    return result;
  }

  function minMaxComponents(values, { logarithmic = false } = {}) {
    const numeric = values.map(Number);
    if (numeric.some((value) => !Number.isFinite(value))) {
      throw new Error("Kaynakçalı potansiyel hesabında sayısal olmayan gösterge bulundu.");
    }
    const prepared = logarithmic
      ? numeric.map((value) => Math.log1p(Math.max(0, value)))
      : numeric;
    const minimum = Math.min(...prepared);
    const maximum = Math.max(...prepared);
    const range = maximum - minimum;
    if (range <= 1e-12) return prepared.map(() => 0.5);
    return prepared.map((value) => (value - minimum) / range);
  }

  function potentialComponents(provinces, parameters) {
    const populationComponents = minMaxComponents(
      provinces.map((province) => province.population),
    );
    const indicatorComponents = {};
    const indicatorKeys = [
      ...new Set(
        Object.values(LITERATURE_GROUP_DEFINITIONS).flatMap(
          (definition) => definition.indicators,
        ),
      ),
    ];
    indicatorKeys.forEach((indicator) => {
      indicatorComponents[indicator] = minMaxComponents(
        provinces.map((province) => province.raw_indicators?.[indicator]),
        { logarithmic: LITERATURE_LOG_INDICATORS.has(indicator) },
      );
    });

    const groupComponents = Object.fromEntries(
      Object.entries(LITERATURE_GROUP_DEFINITIONS).map(
        ([groupKey, definition]) => [
          groupKey,
          provinces.map(
            (_, provinceIndex) =>
              definition.indicators.reduce(
                (sum, indicator) =>
                  sum + indicatorComponents[indicator][provinceIndex],
                0,
              ) / definition.indicators.length,
          ),
        ],
      ),
    );
    const structuralComponents = provinces.map((_, provinceIndex) =>
      Object.keys(LITERATURE_GROUP_DEFINITIONS).reduce(
        (sum, groupKey) =>
          sum +
          parameters.group_weights[groupKey] *
            groupComponents[groupKey][provinceIndex],
        0,
      ),
    );
    const combinedComponents = provinces.map((_, provinceIndex) =>
      parameters.population_weight * populationComponents[provinceIndex] +
      Object.keys(LITERATURE_GROUP_DEFINITIONS).reduce(
        (sum, groupKey) =>
          sum +
          parameters.absolute_group_weights[groupKey] *
            groupComponents[groupKey][provinceIndex],
        0,
      ),
    );
    return {
      populationComponents,
      indicatorComponents,
      groupComponents,
      structuralComponents,
      combinedComponents,
    };
  }

  function buildLiteraturePotential(provinces, payload = {}) {
    const parameters = normalizeParameters(payload);
    const {
      populationComponents,
      groupComponents,
      structuralComponents,
      combinedComponents,
    } = potentialComponents(provinces, parameters);

    return provinces.map((province, provinceIndex) => {
      const groupScores = Object.fromEntries(
        Object.keys(LITERATURE_GROUP_DEFINITIONS).map((groupKey) => [
          groupKey,
          groupComponents[groupKey][provinceIndex],
        ]),
      );
      return {
        city: province.city,
        population: province.population,
        recommendation: province.recommendation,
        score: province.score,
        policy_count: province.policy_count,
        population_component: roundTo(
          populationComponents[provinceIndex] * 100,
          2,
        ),
        structural_score: roundTo(
          structuralComponents[provinceIndex] * 100,
          2,
        ),
        literature_index: roundTo(
          combinedComponents[provinceIndex] * 100,
          2,
        ),
        group_scores: Object.fromEntries(
          Object.entries(groupScores).map(([key, value]) => [
            key,
            roundTo(value * 100, 2),
          ]),
        ),
      };
    });
  }

  function buildScenario(provinces, payload) {
    const parameters = normalizeParameters(payload);
    const current = currentValues(
      provinces,
      parameters.current_overrides,
    );
    const currentTotal = current.reduce((sum, value) => sum + value, 0);
    const market = marketMetrics(provinces, parameters, currentTotal);
    const target = selectTarget(
      parameters,
      currentTotal,
      market.modelOptimal,
    );
    const differenceTotal = target - currentTotal;
    const selectedGeneralDirectorates =
      parameters.selected_general_directorates;
    const selectedGeneralDirectorateSet = new Set(
      selectedGeneralDirectorates,
    );
    const allGeneralDirectoratesSelected =
      selectedGeneralDirectorates.length === GENERAL_DIRECTORATE_ORDER.length;
    const gmFilterActive =
      differenceTotal > 0 && !allGeneralDirectoratesSelected;
    if (differenceTotal > 0 && !selectedGeneralDirectorates.length) {
      throw new Error("B\u00fcy\u00fcme senaryosu i\u00e7in en az bir genel m\u00fcd\u00fcr yard\u0131mc\u0131l\u0131\u011f\u0131 grubu se\u00e7ilmelidir.");
    }
    const provinceInGrowthScope = (province) =>
      !gmFilterActive ||
      selectedGeneralDirectorateSet.has(
        generalDirectorateForCity(province.city),
      );
    const sufficientHireShare = dynamicSufficientHireShare(
      provinces,
      market.metrics,
    );
    let sufficientHireCount = 0;
    let additions = current.map(() => 0);
    let reductions = current.map(() => 0);
    if (differenceTotal > 0) {
      sufficientHireCount = Math.min(
        differenceTotal,
        roundHalfUp(differenceTotal * sufficientHireShare),
      );
      let standardHireCount =
        differenceTotal - sufficientHireCount;
      const standardWeights = provinces.map((province, index) =>
        provinceInGrowthScope(province) &&
        HIRING_ELIGIBLE.has(province.recommendation)
          ? (market.metrics[index].allocation_priority *
              market.metrics[index].multiplier) /
            DEFAULT_MULTIPLIERS[province.recommendation]
          : 0,
      );
      const sufficientWeights = provinces.map((province, index) =>
        provinceInGrowthScope(province) &&
        SUFFICIENT_GROWTH.has(province.recommendation)
          ? market.metrics[index].allocation_priority *
            market.metrics[index].multiplier
          : 0,
      );
      if (gmFilterActive) {
        const standardWeightSum = standardWeights.reduce(
          (sum, value) => sum + value,
          0,
        );
        const sufficientWeightSum = sufficientWeights.reduce(
          (sum, value) => sum + value,
          0,
        );
        if (sufficientHireCount > 0 && sufficientWeightSum <= 0) {
          standardHireCount += sufficientHireCount;
          sufficientHireCount = 0;
        }
        if (standardHireCount > 0 && standardWeightSum <= 0) {
          sufficientHireCount += standardHireCount;
          standardHireCount = 0;
        }
      }
      const [istanbulRequired, lockIstanbul] =
        istanbulHireRequirement(
          differenceTotal,
          standardWeights,
          provinces,
          parameters.istanbul_min_hire_share,
        );
      const standardAdditions = gmFilterActive
        ? allocateGrowthByGeneralDirectorate(
            standardHireCount,
            standardWeights,
            provinces,
            selectedGeneralDirectorates,
            istanbulRequired,
          )
        : populationLedAllocation(
            standardHireCount,
            standardWeights,
            provinces,
            parameters.istanbul_min_hire_share,
            istanbulRequired,
            lockIstanbul,
          );
      const sufficientAdditions = gmFilterActive
        ? allocateGrowthByGeneralDirectorate(
            sufficientHireCount,
            sufficientWeights,
            provinces,
            selectedGeneralDirectorates,
          )
        : populationLedAllocation(
            sufficientHireCount,
            sufficientWeights,
            provinces,
            0,
          );
      additions = standardAdditions.map(
        (value, index) => value + sufficientAdditions[index],
      );
    } else if (differenceTotal < 0) {
      reductions = proportionalReductions(-differenceTotal, current);
    }
    const recommended = current.map(
      (value, index) =>
        value + additions[index] - reductions[index],
    );
    if (recommended.some((value) => value < 0)) {
      throw new Error("Tahsis motoru negatif kadro üretti.");
    }
    if (
      recommended.reduce((sum, value) => sum + value, 0) !== target
    ) {
      throw new Error("Tahsis motoru hedef toplamı tam tutturamadı.");
    }

    const standardTheoreticalWeights = provinces.map(
      (province, index) =>
        provinceInGrowthScope(province) &&
        HIRING_ELIGIBLE.has(province.recommendation)
          ? (market.metrics[index].allocation_priority *
              market.metrics[index].multiplier) /
            DEFAULT_MULTIPLIERS[province.recommendation]
          : 0,
    );
    const sufficientTheoreticalWeights = provinces.map(
      (province, index) =>
        provinceInGrowthScope(province) &&
        SUFFICIENT_GROWTH.has(province.recommendation)
          ? market.metrics[index].allocation_priority *
            market.metrics[index].multiplier
          : 0,
    );
    const standardWeightTotal = standardTheoreticalWeights.reduce(
      (sum, value) => sum + value,
      0,
    );
    const sufficientWeightTotal =
      sufficientTheoreticalWeights.reduce(
        (sum, value) => sum + value,
        0,
      );
    const rows = provinces.map((province, index) => {
      const metric = market.metrics[index];
      const count = current[index];
      const suggestion = recommended[index];
      const difference = suggestion - count;
      const generalDirectorate = generalDirectorateForCity(province.city);
      const selectedForGrowth = selectedGeneralDirectorateSet.has(
        generalDirectorate,
      );
      const row = serializeProvince(province);
      let growthShare = 0;
      if (
        HIRING_ELIGIBLE.has(province.recommendation) &&
        standardWeightTotal > 0
      ) {
        growthShare =
          ((1 - sufficientHireShare) *
            ((metric.allocation_priority * metric.multiplier) /
              DEFAULT_MULTIPLIERS[province.recommendation])) /
          standardWeightTotal;
      } else if (
        SUFFICIENT_GROWTH.has(province.recommendation) &&
        sufficientWeightTotal > 0
      ) {
        growthShare =
          (sufficientHireShare *
            metric.allocation_priority *
            metric.multiplier) /
          sufficientWeightTotal;
      }
      Object.assign(row, {
        general_directorate: generalDirectorate,
        general_directorate_selected: selectedForGrowth,
        current_advisors: count,
        recommended_advisors: suggestion,
        difference,
        hire: Math.max(0, difference),
        reduce: Math.max(0, -difference),
        action:
          difference > 0
            ? "İşe al"
            : difference < 0
              ? "Azalt / transfer et"
              : "Değişiklik yok",
        hiring_eligible:
          HIRING_ELIGIBLE.has(province.recommendation) ||
          SUFFICIENT_GROWTH.has(province.recommendation),
        market_index: roundTo(metric.market_index, 6),
        market_index_100: roundTo(metric.market_index * 100, 2),
        market_share_percent: roundTo(metric.market_share * 100, 3),
        class_multiplier: roundTo(metric.multiplier, 3),
        population_share_percent: roundTo(
          metric.population_share * 100,
          3,
        ),
        allocation_priority: roundTo(
          metric.allocation_priority,
          6,
        ),
        growth_share_percent: roundTo(growthShare * 100, 3),
        group_scores: Object.fromEntries(
          Object.keys(DEFAULT_GROUP_WEIGHTS).map((key) => [
            key,
            roundTo(metric[`${key}_component`] * 100, 2),
          ]),
        ),
        explanation:
          gmFilterActive && !selectedForGrowth && difference === 0
            ? `${generalDirectorate} grubu bu b\u00fcy\u00fcme senaryosunda se\u00e7ilmedi\u011fi i\u00e7in ile yeni kadro ayr\u0131lmad\u0131.`
            : `${generalDirectorate} grubu. ${explanation(province, difference, metric)}`,
        policy_count: province.policy_count,
      });
      return row;
    });
    const grossHires = additions.reduce(
      (sum, value) => sum + Math.max(0, value),
      0,
    );
    const grossReductions = reductions.reduce(
      (sum, value) => sum + Math.max(0, value),
      0,
    );
    const generalDirectorateSummary = GENERAL_DIRECTORATE_ORDER.map(
      (group) => {
        const groupRows = rows.filter(
          (row) => row.general_directorate === group,
        );
        return {
          general_directorate: group,
          city_count: groupRows.length,
          selected: selectedGeneralDirectorateSet.has(group),
          current_advisors: groupRows.reduce(
            (sum, row) => sum + row.current_advisors,
            0,
          ),
          hires: groupRows.reduce((sum, row) => sum + row.hire, 0),
          reductions: groupRows.reduce((sum, row) => sum + row.reduce, 0),
          target_advisors: groupRows.reduce(
            (sum, row) => sum + row.recommended_advisors,
            0,
          ),
        };
      },
    );
    return {
      summary: {
        model_version: MODEL_VERSION,
        mode: parameters.mode,
        current_total: currentTotal,
        model_optimal_total: market.modelOptimal,
        target_total: target,
        net_change: target - currentTotal,
        selected_general_directorates: [
          ...selectedGeneralDirectorates,
        ],
        gm_filter_active: gmFilterActive,
        gm_filter_ignored_for_reduction: differenceTotal < 0,
        general_directorates: generalDirectorateSummary,
        gross_hires: grossHires,
        gross_reductions: grossReductions,
        cities_hiring: additions.filter((value) => value > 0).length,
        cities_reducing: reductions.filter((value) => value > 0).length,
        cities_unchanged: additions.filter(
          (value, index) => value === 0 && reductions[index] === 0,
        ).length,
        range_targets: market.rangeTargets,
        exact_total:
          recommended.reduce((sum, value) => sum + value, 0) === target,
        sufficient_growth_hires: sufficientHireCount,
        sufficient_growth_hire_share: roundTo(
          sufficientHireShare,
          6,
        ),
        weights: {
          population: roundTo(parameters.population_weight, 6),
          structural: roundTo(parameters.structural_weight, 6),
        },
        group_weights: Object.fromEntries(
          Object.entries(parameters.group_weights).map(([key, value]) => [
            key,
            roundTo(value, 6),
          ]),
        ),
        absolute_group_weights: Object.fromEntries(
          Object.entries(parameters.absolute_group_weights).map(
            ([key, value]) => [key, roundTo(value, 6)],
          ),
        ),
        multipliers: parameters.multipliers,
        allocation_rule: {
          population_weight: roundTo(
            market.metrics[0].allocation_population_weight,
            6,
          ),
          structural_weight: roundTo(
            market.metrics[0].allocation_structural_weight,
            6,
          ),
          istanbul_min_hire_share: roundTo(
            parameters.istanbul_min_hire_share,
            6,
          ),
          sufficient_growth_default_share:
            DEFAULT_SUFFICIENT_HIRE_SHARE,
          sufficient_growth_min_share: MIN_SUFFICIENT_HIRE_SHARE,
          sufficient_growth_max_share: MAX_SUFFICIENT_HIRE_SHARE,
          sufficient_growth_effective_share: roundTo(
            sufficientHireShare,
            6,
          ),
        },
        capacity_factor: roundTo(
          currentTotal ? market.modelOptimal / currentTotal : 0,
          4,
        ),
      },
      rows,
    };
  }

  function dataSummary(provinces, fileMeta) {
    const baseScenario = buildScenario(provinces, { mode: "auto" });
    const counts = Object.fromEntries(
      RECOMMENDATION_ORDER.map((label) => [label, 0]),
    );
    provinces.forEach((province) => {
      counts[province.recommendation] =
        (counts[province.recommendation] || 0) + 1;
    });
    return {
      model_version: MODEL_VERSION,
      source_name: fileMeta?.name || "Danisman_Model_Verisi.xlsx",
      source_path: "",
      source_modified: new Date(
        fileMeta?.lastModified || Date.now(),
      ).toISOString(),
      city_count: provinces.length,
      current_total: provinces.reduce(
        (sum, province) => sum + province.current_advisors,
        0,
      ),
      population_total: provinces.reduce(
        (sum, province) => sum + province.population,
        0,
      ),
      zero_staff_cities: provinces.filter(
        (province) => province.current_advisors === 0,
      ).length,
      score_average: roundTo(
        provinces.reduce(
          (sum, province) => sum + province.score,
          0,
        ) / provinces.length,
        2,
      ),
      recommendation_counts: counts,
      defaults: {
        population_weight: DEFAULT_POPULATION_WEIGHT,
        group_weights: { ...DEFAULT_GROUP_WEIGHTS },
        absolute_group_weights: Object.fromEntries(
          Object.entries(DEFAULT_GROUP_WEIGHTS).map(([key, value]) => [
            key,
            (1 - DEFAULT_POPULATION_WEIGHT) * value,
          ]),
        ),
        weight_groups: GROUP_DEFINITIONS,
        multipliers: { ...DEFAULT_MULTIPLIERS },
        allocation_rule: {
          istanbul_min_hire_share_cap: ISTANBUL_MIN_HIRE_SHARE_CAP,
          istanbul_min_hire_share_factor:
            ISTANBUL_MIN_HIRE_SHARE_FACTOR,
          sufficient_growth_default_share:
            DEFAULT_SUFFICIENT_HIRE_SHARE,
          sufficient_growth_min_share: MIN_SUFFICIENT_HIRE_SHARE,
          sufficient_growth_max_share: MAX_SUFFICIENT_HIRE_SHARE,
        },
      },
      model_optimal_total:
        baseScenario.summary.model_optimal_total,
      range_targets: baseScenario.summary.range_targets,
      provinces: provinces.map(serializeProvince),
    };
  }

  function rankComponent(value, field, city) {
    const normalized = String(value ?? "")
      .trim()
      .toLocaleLowerCase("tr-TR")
      .replace(/\s+/g, " ");
    const mapping = new Map([
      ["top %10", 1],
      ["top %20", 0.8],
      ["top %30", 0.6],
      ["top %40", 0.4],
      ["top %50", 0.2],
      ["diğer", 0],
    ]);
    if (!mapping.has(normalized)) {
      throw new Error(
        `${city}: ${field} sırası geçersiz veya boş (${String(value)}).`,
      );
    }
    return mapping.get(normalized);
  }

  const optionalInteger = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? pythonRound(number) : null;
  };
  const optionalFloat = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  function requiredNumber(value, field, city) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error(`${city}: ${field} sayısal olmalıdır.`);
    }
    return number;
  }

  function rowObjects(rows) {
    const headers = (rows[0] || []).map((value) =>
      value === null || value === undefined ? "" : String(value).trim(),
    );
    return rows
      .slice(1)
      .filter((row) => row.some((value) => value !== null && value !== ""))
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header, row[index]]),
        ),
      );
  }

  function loadProvincesFromRows(mainRows) {
    const mainHeaders = new Set(
      (mainRows[0] || []).map((value) => String(value ?? "").trim()),
    );
    const requiredMain = [
      "81 İl",
      "2025 Nüfüs",
      "81 İlde kaç danışman mevcut",
      "Skor",
      "Öneri",
      "2024 Gayri Safi Yurtiçi Hasıla ( Sıra )",
      "Yapı Kredi Şube Sayısı (Allianz)-Sıra",
      "Akbank Şube Sayısı-Sıra",
      "Vakıfbank&Ziraat&Halkbank Şube Sayısı (Türkiye Sigorta)-Sıra",
      "İş Bankası Şube Sayısı-Sıra",
      "Ort. Satılık Konut  Birim m2 Satış Fiyatı (TL/m2)-Mayıs 2025 verileri ( Sıra )",
      "2025 Toplam Konut+ İşyeri Satış Adet ( Sıra )",
      "2025 İstihdam oranı (%) ( Sıra )",
      "2025 Toplam Motorlu Kara Taşıtları Sayısı ( Sıra )",
      "2026 Döviz Bürosu Sayısı ( Sıra)",
      "2025 Yabancılara Satılan Konut+ İşyeri Sayısı ( Sıra )",
      "2024 Banka Şube Sayıları ( Sıra )",
      "2024 Mevduat Hacmi ( Sıra)",
      "2024-ATM Sayısı ( Sıra)",
      "POLİÇE SAYISI ( Sıra)",
      "SİGORTA ETTİREN SAYISI ( Sıra)",
      "İl Sigortalı Oranı ( 1000 kişide) ( Sıra)",
      "POLİÇE SAYISI",
      "2024 Gayri Safi Yurtiçi Hasıla",
      "Yapı Kredi Şube Sayısı (Allianz)",
      "Akbank Şube Sayısı",
      "Vakıfbank&Ziraat&Halkbank Şube Sayısı (Türkiye Sigorta)",
      "İş Bankası Şube Sayısı",
      "Ort. Satılık Konut  Birim m2 Satış Fiyatı (TL/m2)-Mayıs 2025 verileri",
      "2025 Toplam Konut+ İşyeri Satış Adet",
      "2025 İstihdam oranı (%)",
      "2025 Toplam Motorlu Kara Taşıtları Sayısı",
      "2026 Döviz Bürosu Sayısı",
      "2025 Yabancılara Satılan Konut+ İşyeri Sayısı",
      "2024 Banka Şube Sayıları",
      "2024 Mevduat Hacmi",
      "2024-ATM Sayısı",
      "İl Sigortalı Oranı ( 1000 kişide)",
    ];
    const missingMain = requiredMain.filter(
      (header) => !mainHeaders.has(header),
    );
    if (missingMain.length) {
      throw new Error(
        `Excel'de zorunlu sütunlar eksik: ${missingMain.join(", ")}`,
      );
    }
    const provinces = rowObjects(mainRows)
      .filter((row) => row["81 İl"] !== null && row["81 İl"] !== "")
      .map((row) => {
        const city = String(row["81 İl"]).trim();
        const population = pythonRound(
          requiredNumber(row["2025 Nüfüs"], "nüfus", city),
        );
        const current = pythonRound(
          requiredNumber(
            row["81 İlde kaç danışman mevcut"],
            "mevcut danışman",
            city,
          ),
        );
        const score = requiredNumber(row.Skor, "skor", city);
        const recommendation = String(row["Öneri"] ?? "").trim();
        if (population < 0 || current < 0) {
          throw new Error(
            `${city}: nüfus ve danışman sayısı negatif olamaz.`,
          );
        }
        if (score < 0 || score > 100) {
          throw new Error(`${city}: skor 0–100 aralığında olmalıdır.`);
        }
        if (!Object.hasOwn(DEFAULT_MULTIPLIERS, recommendation)) {
          throw new Error(
            `${city}: tanınmayan öneri sınıfı '${recommendation}'.`,
          );
        }
        const partnerKeys = [
          "Yapı Kredi Şube Sayısı (Allianz)-Sıra",
          "Akbank Şube Sayısı-Sıra",
          "Vakıfbank&Ziraat&Halkbank Şube Sayısı (Türkiye Sigorta)-Sıra",
          "İş Bankası Şube Sayısı-Sıra",
        ];
        const partners = partnerKeys.map((key) =>
          rankComponent(row[key], "partner banka şubeleri", city),
        );
        const rawPartnerKeys = [
          "Yapı Kredi Şube Sayısı (Allianz)",
          "Akbank Şube Sayısı",
          "Vakıfbank&Ziraat&Halkbank Şube Sayısı (Türkiye Sigorta)",
          "İş Bankası Şube Sayısı",
        ];
        const rawPartners = rawPartnerKeys.map((key) =>
          requiredNumber(row[key], "partner banka şubeleri", city),
        );
        const policyCount = requiredNumber(
          row["POLİÇE SAYISI"],
          "poliçe sayısı",
          city,
        );
        if (policyCount < 0) {
          throw new Error(
            `${city}: poliçe sayısı negatif olmayan bir değer olmalıdır.`,
          );
        }
        return {
          city,
          population,
          current_advisors: current,
          score: roundTo(score, 6),
          score_rank: null,
          advisor_level: optionalInteger(row["Danışman Açıklama"]),
          score_level: optionalInteger(row["Skor Açıklama"]),
          gap: optionalInteger(row.Fark),
          recommendation,
          premium_average: optionalFloat(
            row[
              "Prim Üretim Ortalaması ( Aktif Çalışanlar Son 3 Ay Hariç) $"
            ],
          ),
          organization_type: String(
            row["Bölge Mi İl Temsilcisi Mi?"] ?? "",
          ).trim(),
          policy_count: pythonRound(policyCount),
          indicators: {
            gdp: rankComponent(
              row["2024 Gayri Safi Yurtiçi Hasıla ( Sıra )"],
              "GSYH",
              city,
            ),
            housing_price: rankComponent(
              row[
                "Ort. Satılık Konut  Birim m2 Satış Fiyatı (TL/m2)-Mayıs 2025 verileri ( Sıra )"
              ],
              "konut fiyatı",
              city,
            ),
            deposits: rankComponent(
              row["2024 Mevduat Hacmi ( Sıra)"],
              "mevduat",
              city,
            ),
            insured_rate: rankComponent(
              row["İl Sigortalı Oranı ( 1000 kişide) ( Sıra)"],
              "sigortalı oranı",
              city,
            ),
            sales: rankComponent(
              row["2025 Toplam Konut+ İşyeri Satış Adet ( Sıra )"],
              "satış",
              city,
            ),
            employment: rankComponent(
              row["2025 İstihdam oranı (%) ( Sıra )"],
              "istihdam",
              city,
            ),
            vehicles: rankComponent(
              row[
                "2025 Toplam Motorlu Kara Taşıtları Sayısı ( Sıra )"
              ],
              "taşıt",
              city,
            ),
            policies: rankComponent(
              row["POLİÇE SAYISI ( Sıra)"],
              "poliçe",
              city,
            ),
            policyholders: rankComponent(
              row["SİGORTA ETTİREN SAYISI ( Sıra)"],
              "sigorta ettiren",
              city,
            ),
            partner_bank_branches:
              partners.reduce((sum, value) => sum + value, 0) /
              partners.length,
            total_bank_branches: rankComponent(
              row["2024 Banka Şube Sayıları ( Sıra )"],
              "toplam banka şubesi",
              city,
            ),
            atm: rankComponent(
              row["2024-ATM Sayısı ( Sıra)"],
              "ATM",
              city,
            ),
            exchange_offices: rankComponent(
              row["2026 Döviz Bürosu Sayısı ( Sıra)"],
              "döviz bürosu",
              city,
            ),
            foreign_sales: rankComponent(
              row[
                "2025 Yabancılara Satılan Konut+ İşyeri Sayısı ( Sıra )"
              ],
              "yabancılara gayrimenkul satışı",
              city,
            ),
          },
          raw_indicators: {
            gdp: requiredNumber(
              row["2024 Gayri Safi Yurtiçi Hasıla"],
              "GSYH",
              city,
            ),
            housing_price: requiredNumber(
              row[
                "Ort. Satılık Konut  Birim m2 Satış Fiyatı (TL/m2)-Mayıs 2025 verileri"
              ],
              "konut fiyatı",
              city,
            ),
            deposits: requiredNumber(
              row["2024 Mevduat Hacmi"],
              "mevduat",
              city,
            ),
            insured_rate: requiredNumber(
              row["İl Sigortalı Oranı ( 1000 kişide)"],
              "sigortalı oranı",
              city,
            ),
            sales: requiredNumber(
              row["2025 Toplam Konut+ İşyeri Satış Adet"],
              "satış",
              city,
            ),
            employment: requiredNumber(
              row["2025 İstihdam oranı (%)"],
              "istihdam",
              city,
            ),
            vehicles: requiredNumber(
              row["2025 Toplam Motorlu Kara Taşıtları Sayısı"],
              "taşıt",
              city,
            ),
            partner_bank_branches:
              rawPartners.reduce((sum, value) => sum + value, 0) /
              rawPartners.length,
            total_bank_branches: requiredNumber(
              row["2024 Banka Şube Sayıları"],
              "toplam banka şubesi",
              city,
            ),
            atm: requiredNumber(
              row["2024-ATM Sayısı"],
              "ATM",
              city,
            ),
            exchange_offices: requiredNumber(
              row["2026 Döviz Bürosu Sayısı"],
              "döviz bürosu",
              city,
            ),
            foreign_sales: requiredNumber(
              row["2025 Yabancılara Satılan Konut+ İşyeri Sayısı"],
              "yabancılara gayrimenkul satışı",
              city,
            ),
          },
        };
      });
    const ranked = provinces
      .map((province, index) => ({ province, index }))
      .sort((left, right) => {
        if (left.province.score !== right.province.score) {
          return right.province.score - left.province.score;
        }
        if (left.province.population !== right.province.population) {
          return right.province.population - left.province.population;
        }
        return rawCompare(left.province.city, right.province.city);
      });
    ranked.forEach((item, index) => {
      provinces[item.index].score_rank = index + 1;
    });
    if (provinces.length !== 81) {
      throw new Error(
        `Model tam 81 il bekliyor; Excel'de ${provinces.length} geçerli il bulundu.`,
      );
    }
    const cities = provinces.map((province) => province.city);
    if (new Set(cities).size !== cities.length) {
      throw new Error("Excel'de tekrarlanan il adları var.");
    }
    return provinces;
  }

  root.OfflineModel = {
    buildScenario,
    buildLiteraturePotential,
    dataSummary,
    loadProvincesFromRows,
    constants: {
      DEFAULT_POPULATION_WEIGHT,
      MODEL_VERSION,
      DEFAULT_GROUP_WEIGHTS,
      GROUP_DEFINITIONS,
      LITERATURE_GROUP_DEFINITIONS,
      LITERATURE_LOG_INDICATORS,
      DEFAULT_MULTIPLIERS,
      GENERAL_DIRECTORATE_GROUPS,
      GENERAL_DIRECTORATE_ORDER,
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.OfflineModel;
  }
})(typeof window !== 'undefined' ? window : globalThis);