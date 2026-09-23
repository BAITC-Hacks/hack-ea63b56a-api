import unittest

from app.validation import catalog_match, next_missing, parse_budget, parse_iso_date


class ValidationTests(unittest.TestCase):
    def test_next_missing(self) -> None:
        self.assertEqual(next_missing({"city": "Алматы"}), "date")

    def test_budget_accepts_human_format(self) -> None:
        self.assertEqual(parse_budget("900 000 тенге"), 900000)
        self.assertIsNone(parse_budget("0"))
        self.assertIsNone(parse_budget("много"))

    def test_date_must_be_real_and_in_calendar(self) -> None:
        calendar = {"from": "2026-09-23", "to": "2026-12-31"}
        self.assertEqual(parse_iso_date("2026-10-15", calendar), "2026-10-15")
        self.assertIsNone(parse_iso_date("2026-02-30", calendar))
        self.assertIsNone(parse_iso_date("2027-01-01", calendar))

    def test_catalog_match_is_case_insensitive(self) -> None:
        self.assertEqual(catalog_match("алматы", ["Алматы", "Астана"]), "Алматы")


if __name__ == "__main__":
    unittest.main()
