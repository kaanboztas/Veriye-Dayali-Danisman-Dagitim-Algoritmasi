import unittest
from model_engine import (
    min_max_components,
    proportional_reductions,
    build_scenario,
    GENERAL_DIRECTORATE_GROUPS,
)

class TestModelEngine(unittest.TestCase):
    def test_min_max_components(self):
        vals = [10.0, 20.0, 30.0, 50.0]
        res = min_max_components(vals)
        self.assertAlmostEqual(res[0], 0.0)
        self.assertAlmostEqual(res[-1], 1.0)
        self.assertTrue(all(0.0 <= x <= 1.0 for x in res))

    def test_proportional_reductions(self):
        current = [100, 50, 30, 20]
        total_current = sum(current)
        amount_to_reduce = 25
        reductions = proportional_reductions(amount_to_reduce, current)
        self.assertEqual(sum(reductions), amount_to_reduce)
        # Verify no reduction exceeds current staff
        for r, c in zip(reductions, current):
            self.assertTrue(0 <= r <= c)

    def test_build_scenario_expansion(self):
        # Create minimal synthetic provinces for testing (ZERO actual data)
        provinces = [
            {
                "city": "Adana",
                "population": 2200000,
                "current": 50,
                "score": 0.65,
                "recommendation": "Öncelikli Büyüme Fırsatı +++",
            },
            {
                "city": "İzmir",
                "population": 4400000,
                "current": 100,
                "score": 0.85,
                "recommendation": "Güçlü Büyüme Fırsatı ++",
            },
            {
                "city": "İstanbul",
                "population": 15000000,
                "current": 300,
                "score": 0.95,
                "recommendation": "Planlı Büyüme Alanı +",
            },
            {
                "city": "Bolu",
                "population": 320000,
                "current": 10,
                "score": 0.40,
                "recommendation": "Dengeyi Koru",
            },
        ]
        current_sum = sum(p["current"] for p in provinces)
        target = current_sum + 40  # 40 new hires

        res = build_scenario(provinces, {"target": target})
        rec_sum = sum(r["recommended"] for r in res["rows"])
        self.assertEqual(rec_sum, target)
        self.assertEqual(res["gross_hires"], 40)
        self.assertEqual(res["gross_reductions"], 0)

    def test_build_scenario_reduction(self):
        provinces = [
            {"city": "Adana", "population": 2200000, "current": 50, "score": 0.65, "recommendation": "Dengeyi Koru"},
            {"city": "İzmir", "population": 4400000, "current": 100, "score": 0.85, "recommendation": "Dengeyi Koru"},
            {"city": "İstanbul", "population": 15000000, "current": 300, "score": 0.95, "recommendation": "Dengeyi Koru"},
        ]
        current_sum = sum(p["current"] for p in provinces)
        target = current_sum - 30

        res = build_scenario(provinces, {"target": target})
        rec_sum = sum(r["recommended"] for r in res["rows"])
        self.assertEqual(rec_sum, target)
        self.assertEqual(res["gross_reductions"], 30)

if __name__ == "__main__":
    unittest.main()
