"""
Dinamik Sınıf Payı Modeli V5 (Dynamic Class Share Model V5)
Danışman Kadro Planlama ve Optimizasyon Çekirdek Algoritması

Bu modül, web arayüzünden ve dış veri kaynaklarından tamamen bağımsız,
saf Python 3 ile çalışabilen optimizasyon ve kadro dağıtım motorudur.
Herhangi bir gizli anahtar (API key), kimlik bilgisi veya kurumsal veri içermez.
"""

from typing import Dict, List, Any, Optional, Tuple
import math
import copy

MODEL_VERSION = "DİNAMİK SINIF PAYI MODELİ V5"
DEFAULT_POPULATION_WEIGHT = 0.5

GENERAL_DIRECTORATE_GROUPS = {
    "ANADOLU": [
        "Adana", "Adıyaman", "Ankara", "Batman", "Diyarbakır", "Eskişehir",
        "Gaziantep", "Hatay", "Kahramanmaraş", "Kayseri", "Konya", "Malatya",
        "Mersin", "Mardin", "Nevşehir", "Osmaniye", "Sivas", "Şanlıurfa",
        "Aksaray", "Kırşehir", "Kırıkkale", "Niğde", "Karaman", "Kilis",
    ],
    "EGE AKDENİZ": [
        "Afyonkarahisar", "Antalya", "Aydın", "Balıkesir", "Burdur", "Çanakkale",
        "Denizli", "Isparta", "İzmir", "Kütahya", "Manisa", "Muğla", "Uşak",
    ],
    "MARMARA": [
        "Bilecik", "Bolu", "Bursa", "Edirne", "İstanbul", "Kırklareli",
        "Kocaeli", "Sakarya", "Tekirdağ", "Yalova", "Düzce",
    ],
    "KARADENİZ": [
        "Amasya", "Artvin", "Ağrı", "Bingöl", "Bitlis", "Elazığ", "Erzincan",
        "Erzurum", "Giresun", "Gümüşhane", "Hakkari", "Kars", "Kastamonu",
        "Muş", "Ordu", "Rize", "Samsun", "Siirt", "Sinop", "Tokat", "Trabzon",
        "Tunceli", "Van", "Zonguldak", "Bayburt", "Bartın", "Ardahan", "Iğdır",
        "Karabük", "Şırnak", "Çankırı", "Çorum", "Yozgat",
    ],
}

GENERAL_DIRECTORATE_ORDER = list(GENERAL_DIRECTORATE_GROUPS.keys())

CITY_TO_GD = {}
for gd_group, cities in GENERAL_DIRECTORATE_GROUPS.items():
    for c in cities:
        CITY_TO_GD[c.strip().lower()] = gd_group

DEFAULT_GROUP_WEIGHTS = {
    "wealth_finance": 0.25,
    "market_activity": 0.25,
    "competitor_activity": 0.25,
    "foreign_demand": 0.25,
}

GROUP_DEFINITIONS = {
    "wealth_finance": {
        "label": "Zenginlik ve finans",
        "indicators": ["gdp", "housing_price", "deposits", "insured_rate"],
        "indicator_labels": ["GSYH", "Konut fiyatı", "Mevduat", "Sigortalı oranı"],
    },
    "market_activity": {
        "label": "Ekonomik hareketlilik",
        "indicators": ["sales", "employment", "vehicles", "policies", "policyholders"],
        "indicator_labels": ["Satış", "İstihdam", "Taşıt", "Poliçe", "Sigorta ettiren"],
    },
    "competitor_activity": {
        "label": "Rakip firma aktifliği",
        "indicators": ["total_bank_branches", "atm"],
        "indicator_labels": ["Toplam banka şubesi", "ATM"],
    },
    "foreign_demand": {
        "label": "Döviz ve Yabancı Talep",
        "indicators": ["exchange_offices", "foreign_sales"],
        "indicator_labels": ["Döviz bürosu", "Yabancılara gayrimenkul satışı"],
    },
}

LITERATURE_GROUP_DEFINITIONS = copy.deepcopy(GROUP_DEFINITIONS)

LITERATURE_LOG_INDICATORS = {
    "deposits", "sales", "vehicles", "total_bank_branches",
    "atm", "exchange_offices", "foreign_sales",
}

DEFAULT_MULTIPLIERS = {
    "Öncelikli Büyüme Fırsatı +++": 5.0,
    "Güçlü Büyüme Fırsatı ++": 4.5,
    "Planlı Büyüme Alanı +": 4.0,
    "Dengeyi Koru": 3.5,
    "Yeterli Büyüme Mevcut -": 3.0,
    "Yeterli Büyüme Mevcut --": 2.0,
    "Yeterli Büyüme Mevcut ---": 1.0,
}

RECOMMENDATION_ORDER = list(DEFAULT_MULTIPLIERS.keys())
HIRING_ELIGIBLE = {
    "Öncelikli Büyüme Fırsatı +++",
    "Güçlü Büyüme Fırsatı ++",
    "Planlı Büyüme Alanı +",
    "Dengeyi Koru",
}
SUFFICIENT_GROWTH = {
    "Yeterli Büyüme Mevcut -",
    "Yeterli Büyüme Mevcut --",
    "Yeterli Büyüme Mevcut ---",
}

DEFAULT_SUFFICIENT_HIRE_SHARE = 0.05
MIN_SUFFICIENT_HIRE_SHARE = 0.01
MAX_SUFFICIENT_HIRE_SHARE = 0.15
ISTANBUL_MIN_HIRE_SHARE_CAP = 0.20
ISTANBUL_MIN_HIRE_SHARE_FACTOR = 1.0 / 3.0


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def min_max_components(values: List[float], logarithmic: bool = False) -> List[float]:
    """
    OECD Handbook on Constructing Composite Indicators yöntemine göre
    değerleri 0 ile 1 aralığında min-max ölçekler.
    """
    prepared = []
    for val in values:
        if logarithmic:
            prepared.append(math.log1p(max(0.0, float(val))))
        else:
            prepared.append(float(val))

    minimum = min(prepared)
    maximum = max(prepared)
    val_range = maximum - minimum

    if val_range <= 1e-12:
        return [0.5 for _ in prepared]

    return [(v - minimum) / val_range for v in prepared]


def proportional_reductions(amount: int, current: List[int]) -> List[int]:
    """
    Hedef küçülmelerde en büyük kalan (Hare-Niemeyer / Largest Remainder)
    yöntemi ile mevcut kadroyu orantılı azaltır.
    """
    if amount <= 0:
        return [0 for _ in current]

    current_total = sum(current)
    if amount > current_total:
        raise ValueError("Azaltım miktarı mevcut toplam kadroyu aşamaz.")
    if current_total <= 0:
        return [0 for _ in current]

    target = current_total - amount
    quotas = [(val * target) / current_total for val in current]
    recommended = [math.floor(q) for q in quotas]
    remaining = target - sum(recommended)

    # Kalan kotaları en büyük ondalık kısımlara göre dağıt
    remainders = sorted(
        [
            {"index": idx, "fraction": quotas[idx] - recommended[idx], "current": current[idx]}
            for idx in range(len(current))
        ],
        key=lambda x: (-x["fraction"], -x["current"], x["index"]),
    )

    for i in range(remaining):
        recommended[remainders[i]["index"]] += 1

    reductions = [curr - rec for curr, rec in zip(current, recommended)]
    return reductions


def dynamic_sufficient_hire_share(provinces: List[Dict[str, Any]], metrics: List[Dict[str, Any]]) -> float:
    """
    Yeterli büyüme grubundaki illere verilecek kontenjan payını hesaplar.
    """
    default_signal = 0.0
    selected_signal = 0.0
    for idx, province in enumerate(provinces):
        rec = province.get("recommendation", "")
        if rec not in SUFFICIENT_GROWTH:
            continue
        base_priority = metrics[idx].get("allocation_priority", 0.0)
        default_signal += base_priority * DEFAULT_MULTIPLIERS.get(rec, 1.0)
        selected_signal += base_priority * metrics[idx].get("multiplier", 1.0)

    if default_signal <= 0.0:
        return DEFAULT_SUFFICIENT_HIRE_SHARE

    ratio = selected_signal / default_signal
    return clamp(DEFAULT_SUFFICIENT_HIRE_SHARE * ratio, MIN_SUFFICIENT_HIRE_SHARE, MAX_SUFFICIENT_HIRE_SHARE)


def normalize_parameters(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload or {}
    population_weight = float(payload.get("populationWeight", DEFAULT_POPULATION_WEIGHT))
    population_weight = clamp(population_weight, 0.0, 1.0)
    structural_weight = 1.0 - population_weight

    supplied_groups = payload.get("groupWeights")
    if supplied_groups is None:
        absolute_group_weights = {
            k: structural_weight * v for k, v in DEFAULT_GROUP_WEIGHTS.items()
        }
    else:
        group_sum = sum(supplied_groups.values()) or 1.0
        normalized_groups = {k: supplied_groups.get(k, 0.25) / group_sum for k in DEFAULT_GROUP_WEIGHTS}
        absolute_group_weights = {
            k: structural_weight * normalized_groups[k] for k in DEFAULT_GROUP_WEIGHTS
        }

    return {
        "populationWeight": population_weight,
        "structuralWeight": structural_weight,
        "groupWeights": absolute_group_weights,
        "multipliers": payload.get("multipliers", DEFAULT_MULTIPLIERS),
        "target": payload.get("target"),
        "delta": payload.get("delta", 0),
        "mode": payload.get("mode", "target"),
        "selectedGeneralDirectorates": payload.get(
            "selectedGeneralDirectorates", GENERAL_DIRECTORATE_ORDER
        ),
    }


def potential_components(provinces: List[Dict[str, Any]], parameters: Dict[str, Any]) -> Dict[str, Any]:
    population_components = min_max_components([p["population"] for p in provinces])
    indicator_components = {}

    all_indicators = set()
    for grp in LITERATURE_GROUP_DEFINITIONS.values():
        all_indicators.update(grp["indicators"])

    for ind in all_indicators:
        values = [p.get(ind, p.get("raw_indicators", {}).get(ind, 0.0)) for p in provinces]
        is_log = ind in LITERATURE_LOG_INDICATORS
        indicator_components[ind] = min_max_components(values, logarithmic=is_log)

    group_components = {}
    for group_key, definition in LITERATURE_GROUP_DEFINITIONS.items():
        indicators = definition["indicators"]
        group_components[group_key] = [
            sum(indicator_components[ind][p_idx] for ind in indicators) / len(indicators)
            for p_idx in range(len(provinces))
        ]

    structural_weights = parameters["groupWeights"]
    structural_weight_sum = sum(structural_weights.values()) or 1.0
    normalized_weights = {k: v / structural_weight_sum for k, v in structural_weights.items()}

    structural_components = [
        sum(group_components[grp][p_idx] * normalized_weights[grp] for grp in GROUP_DEFINITIONS)
        for p_idx in range(len(provinces))
    ]

    pop_weight = parameters["populationWeight"]
    struct_weight = parameters["structuralWeight"]

    combined_components = [
        pop_weight * population_components[p_idx] + struct_weight * structural_components[p_idx]
        for p_idx in range(len(provinces))
    ]

    return {
        "populationComponents": population_components,
        "indicatorComponents": indicator_components,
        "groupComponents": group_components,
        "structuralComponents": structural_components,
        "combinedComponents": combined_components,
    }


def market_metrics(provinces: List[Dict[str, Any]], parameters: Dict[str, Any], current_total: int) -> Dict[str, Any]:
    comp = potential_components(provinces, parameters)
    market_indices = comp["combinedComponents"]
    market_total = sum(market_indices) or 1.0
    population_total = sum(p["population"] for p in provinces) or 1.0

    metrics = []
    for idx, province in enumerate(provinces):
        market_index = market_indices[idx]
        market_share = market_index / market_total
        population_share = province["population"] / population_total
        raw_score = province.get("score", 0.0)

        # Operasyonel öncelik hesabı
        priority = (
            raw_score
            + comp["groupComponents"]["wealth_finance"][idx] * parameters["groupWeights"]["wealth_finance"]
            + comp["groupComponents"]["market_activity"][idx] * parameters["groupWeights"]["market_activity"]
            + comp["groupComponents"]["competitor_activity"][idx] * parameters["groupWeights"]["competitor_activity"]
            + comp["groupComponents"]["foreign_demand"][idx] * parameters["groupWeights"]["foreign_demand"]
        )

        rec = province.get("recommendation", "Dengeyi Koru")
        mult = parameters.get("multipliers", {}).get(rec, DEFAULT_MULTIPLIERS.get(rec, 1.0))

        metrics.append({
            "market_index": market_index,
            "market_share": market_share,
            "population_share": population_share,
            "allocation_priority": priority,
            "multiplier": mult,
        })

    return {
        "metrics": metrics,
        "marketTotal": market_total,
    }


def build_scenario(provinces: List[Dict[str, Any]], payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Belirtilen hedef veya bütçeye göre tüm iller için kadro dağıtım optimizasyonu çalıştırır.
    """
    parameters = normalize_parameters(payload)
    current = [int(p.get("current", 0)) for p in provinces]
    current_total = sum(current)

    market = market_metrics(provinces, parameters, current_total)
    metrics = market["metrics"]

    mode = parameters.get("mode", "target")
    if mode == "delta":
        target = current_total + int(parameters.get("delta", 0))
    else:
        target = int(parameters.get("target", current_total))

    diff_total = target - current_total

    selected_gds = set(parameters.get("selectedGeneralDirectorates", GENERAL_DIRECTORATE_ORDER))
    all_gds_selected = len(selected_gds) == len(GENERAL_DIRECTORATE_ORDER)
    gm_filter_active = not all_gds_selected

    def in_growth_scope(province):
        if not gm_filter_active:
            return True
        city = province.get("city", "").strip().lower()
        gd = CITY_TO_GD.get(city)
        return gd in selected_gds

    additions = [0 for _ in provinces]
    reductions = [0 for _ in provinces]

    if diff_total < 0:
        # Küçülme senaryosu
        amount_to_reduce = abs(diff_total)
        reductions = proportional_reductions(amount_to_reduce, current)
        recommended = [curr - red for curr, red in zip(current, reductions)]
    elif diff_total > 0:
        # Büyüme senaryosu
        hire_count = diff_total
        suff_share = dynamic_sufficient_hire_share(provinces, metrics)
        suff_hire_count = math.floor(hire_count * suff_share) if hire_count > 0 else 0
        std_hire_count = hire_count - suff_hire_count

        # Ağırlıklar
        std_weights = []
        suff_weights = []
        for idx, p in enumerate(provinces):
            in_scope = in_growth_scope(p)
            rec = p.get("recommendation", "")
            pr = metrics[idx]["allocation_priority"]
            m = metrics[idx]["multiplier"]

            if in_scope and rec in HIRING_ELIGIBLE:
                std_weights.append(pr * m)
            else:
                std_weights.append(0.0)

            if in_scope and rec in SUFFICIENT_GROWTH:
                suff_weights.append(pr * m)
            else:
                suff_weights.append(0.0)

        std_sum = sum(std_weights) or 1.0
        suff_sum = sum(suff_weights) or 1.0

        std_quotas = [(w * std_hire_count) / std_sum for w in std_weights]
        std_floor = [math.floor(q) for q in std_quotas]
        std_rem = std_hire_count - sum(std_floor)

        std_rem_order = sorted(
            [{"idx": i, "frac": std_quotas[i] - std_floor[i]} for i in range(len(provinces))],
            key=lambda x: -x["frac"]
        )
        for i in range(std_rem):
            std_floor[std_rem_order[i]["idx"]] += 1

        suff_quotas = [(w * suff_hire_count) / suff_sum for w in suff_weights]
        suff_floor = [math.floor(q) for q in suff_quotas]
        suff_rem = suff_hire_count - sum(suff_floor)

        suff_rem_order = sorted(
            [{"idx": i, "frac": suff_quotas[i] - suff_floor[i]} for i in range(len(provinces))],
            key=lambda x: -x["frac"]
        )
        for i in range(suff_rem):
            suff_floor[suff_rem_order[i]["idx"]] += 1

        additions = [std + suff for std, suff in zip(std_floor, suff_floor)]
        recommended = [curr + add for curr, add in zip(current, additions)]
    else:
        recommended = copy.copy(current)

    # İl bazlı satır sonuçlarını derle
    rows = []
    for idx, p in enumerate(provinces):
        city = p.get("city", "")
        gd = CITY_TO_GD.get(city.strip().lower(), "DİĞER")
        rec = recommended[idx]
        cur = current[idx]
        diff = rec - cur
        rows.append({
            "city": city,
            "general_directorate": gd,
            "population": p.get("population", 0),
            "current": cur,
            "recommended": rec,
            "difference": diff,
            "recommendation": p.get("recommendation", ""),
            "market_index": metrics[idx]["market_index"],
            "addition": additions[idx],
            "reduction": reductions[idx],
        })

    return {
        "model_version": MODEL_VERSION,
        "target": target,
        "current_total": current_total,
        "difference_total": diff_total,
        "gross_hires": sum(additions),
        "gross_reductions": sum(reductions),
        "rows": rows,
    }
