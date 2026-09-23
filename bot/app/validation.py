from datetime import date
from typing import Any


REQUIRED_FIELDS = ("city", "date", "eventFormat", "category", "budgetKzt")
ALLOWED_FIELDS = REQUIRED_FIELDS + ("language", "durationHours")

FIELD_LABELS = {
    "city": "Город",
    "date": "Дата",
    "eventFormat": "Формат мероприятия",
    "category": "Категория подрядчика",
    "budgetKzt": "Бюджет",
    "language": "Язык",
    "durationHours": "Длительность",
}

CATALOG_FIELDS = {
    "city": "cities",
    "eventFormat": "eventFormats",
    "category": "categories",
}


def clean_values(values: Any) -> dict[str, Any]:
    if not isinstance(values, dict):
        return {}
    return {
        key: value
        for key, value in values.items()
        if key in ALLOWED_FIELDS and value not in (None, "")
    }


def next_missing(values: dict[str, Any]) -> str | None:
    return next((field for field in REQUIRED_FIELDS if field not in values), None)


def parse_budget(text: str) -> int | None:
    compact = text.lower().replace("₸", "").replace("тг", "").replace("тенге", "")
    compact = compact.replace(" ", "").replace("\u00a0", "")
    if not compact.isdigit():
        return None
    value = int(compact)
    return value if value > 0 else None


def parse_iso_date(text: str, calendar: dict[str, str]) -> str | None:
    try:
        parsed = date.fromisoformat(text.strip())
        start = date.fromisoformat(calendar["from"])
        end = date.fromisoformat(calendar["to"])
    except (ValueError, KeyError, TypeError):
        return None
    return parsed.isoformat() if start <= parsed <= end else None


def catalog_match(text: str, choices: list[str]) -> str | None:
    normalized = text.strip().casefold()
    return next((choice for choice in choices if choice.casefold() == normalized), None)
