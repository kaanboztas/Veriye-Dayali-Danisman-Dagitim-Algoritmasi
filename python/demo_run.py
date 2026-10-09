import os
import sys

# Motoru içe aktar
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)
from model_engine import build_scenario

# Örnek sentetik il verileri (Gerçek veri içermez, şablon amaçlıdır)
demo_provinces = [
    {
        "city": "Adana",
        "population": 2270000,
        "current": 45,
        "score": 0.72,
        "recommendation": "Öncelikli Büyüme Fırsatı +++",
    },
    {
        "city": "Ankara",
        "population": 5800000,
        "current": 120,
        "score": 0.88,
        "recommendation": "Planlı Büyüme Alanı +",
    },
    {
        "city": "İzmir",
        "population": 4460000,
        "current": 95,
        "score": 0.84,
        "recommendation": "Güçlü Büyüme Fırsatı ++",
    },
    {
        "city": "İstanbul",
        "population": 15650000,
        "current": 310,
        "score": 0.96,
        "recommendation": "Dengeyi Koru",
    },
    {
        "city": "Bursa",
        "population": 3190000,
        "current": 60,
        "score": 0.78,
        "recommendation": "Planlı Büyüme Alanı +",
    },
]

if __name__ == "__main__":
    current_sum = sum(p["current"] for p in demo_provinces)
    target_kadro = 700

    print("=" * 65)
    print("  DİNAMİK SINIF PAYI MODELİ V5 - OPTİMİZASYON SENARYO HESABI")
    print("=" * 65)
    print(f"Mevcut Toplam Kadro: {current_sum}")
    print(f"Hedef Toplam Kadro : {target_kadro}")
    print(f"Net Alım Hedefi    : +{target_kadro - current_sum}")
    print("-" * 65)

    scenario = build_scenario(demo_provinces, {"target": target_kadro})

    print(f"{'İl':<12} | {'Bölge':<12} | {'Mevcut':<7} | {'Öneri':<7} | {'Fark':<6}")
    print("-" * 65)
    for row in scenario["rows"]:
        diff_str = f"+{row['difference']}" if row['difference'] > 0 else str(row['difference'])
        print(f"{row['city']:<12} | {row['general_directorate']:<12} | {row['current']:<7} | {row['recommended']:<7} | {diff_str:<6}")

    print("=" * 65)
    print(f"Brüt Yeni Alım: {scenario['gross_hires']} | Brüt Azaltım: {scenario['gross_reductions']}")
    print(f"Toplam Önerilen Kadro: {sum(r['recommended'] for r in scenario['rows'])} (Hedefe Tam Uyumlu)")
