import unittest

from app.formatters import money, request_summary, result_messages


class FormatterTests(unittest.TestCase):
    def test_money(self) -> None:
        self.assertEqual(money(900000), "900 000 ₸")

    def test_summary_escapes_html(self) -> None:
        summary = request_summary(
            {
                "city": "<Алматы>",
                "date": "2026-10-15",
                "eventFormat": "корпоратив",
                "category": "Ведущий",
                "budgetKzt": 900000,
            }
        )
        self.assertIn("&lt;Алматы&gt;", summary)
        self.assertNotIn("<Алматы>", summary)

    def test_result_marks_alternative_and_flags(self) -> None:
        messages = result_messages(
            {
                "count": 1,
                "message": "Есть один вариант",
                "analysisMode": "fallback",
                "items": [
                    {
                        "name": "Профиль 1",
                        "category": "Ведущий",
                        "city": "Алматы",
                        "priceFromKzt": 100000,
                        "explanation": "Подходит для корпоратива.",
                        "matchType": "alternative",
                        "synthetic": True,
                        "differences": [{"message": "другая дата"}],
                    }
                ],
            }
        )
        self.assertEqual(len(messages), 2)
        self.assertIn("близкий вариант", messages[1])
        self.assertIn("синтетический профиль", messages[1])
        self.assertIn("другая дата", messages[1])


if __name__ == "__main__":
    unittest.main()
