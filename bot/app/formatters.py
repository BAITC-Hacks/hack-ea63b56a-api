from html import escape
from typing import Any

from .validation import FIELD_LABELS


def money(value: Any) -> str:
    try:
        return f"{int(value):,}".replace(",", " ") + " ₸"
    except (TypeError, ValueError):
        return "—"


def request_summary(values: dict[str, Any]) -> str:
    rows = [
        ("Город", values.get("city")),
        ("Дата", values.get("date")),
        ("Формат", values.get("eventFormat")),
        ("Категория", values.get("category")),
        ("Бюджет", money(values.get("budgetKzt"))),
    ]
    if values.get("language"):
        rows.append(("Язык", values["language"]))
    if values.get("durationHours") is not None:
        rows.append(("Длительность", f'{values["durationHours"]} ч'))
    return "\n".join(f"<b>{escape(label)}:</b> {escape(str(value))}" for label, value in rows)


def result_messages(result: dict[str, Any]) -> list[str]:
    count = int(result.get("count", 0))
    mode = {
        "ai": "AI-анализ",
        "fallback": "локальный анализ",
        "not_needed": "анализ не потребовался",
    }.get(result.get("analysisMode"), "анализ")
    heading = "✅ <b>Подбор готов</b>" if count else "🔎 <b>Результат подбора</b>"
    intro = (
        f"{heading}\n\n{escape(str(result.get('message', '')))}\n\n"
        f"Найдено: <b>{count}</b> · {escape(mode)}"
    )
    messages = [intro]

    for index, item in enumerate(result.get("items", []), start=1):
        alternative = item.get("matchType") == "alternative" or item.get("alternative")
        title = f"{index}. {escape(str(item.get('name', 'Без названия')))}"
        lines = [
            f"<b>{title}</b>{' · ⚠️ близкий вариант' if alternative else ''}",
            f"{escape(str(item.get('category', '')))} · {escape(str(item.get('city', '')))}",
            f"Цена от <b>{money(item.get('priceFromKzt'))}</b>",
            "",
            escape(str(item.get("explanation", ""))),
        ]

        differences = item.get("differences") or []
        if differences:
            lines.extend(["", "<b>Отличия от запроса:</b>"])
            lines.extend(f"• {escape(str(diff.get('message', '')))}" for diff in differences)

        flags = []
        if item.get("synthetic"):
            flags.append("синтетический профиль")
        if item.get("city_imputed"):
            flags.append("город восстановлен")
        if item.get("price_imputed"):
            flags.append("цена восстановлена")
        if flags:
            lines.extend(["", f"ℹ️ {escape(', '.join(flags))}"])
        messages.append("\n".join(lines))

    exclusions = result.get("exclusions") or {}
    if not count and exclusions:
        labels = {
            "busy": "заняты",
            "budget": "выше бюджета",
            "format": "не тот формат",
            "language": "не тот язык",
            "duration": "не подходит длительность",
        }
        details = [
            f"{labels[key]} — {value}"
            for key, value in exclusions.items()
            if key in labels and value
        ]
        if details:
            messages[0] += "\n\n<b>Причины исключения:</b>\n" + "\n".join(
                f"• {escape(detail)}" for detail in details
            )
    return messages


def missing_prompt(field: str, calendar: dict[str, str]) -> str:
    if field == "date":
        return (
            f"Укажите дату в формате <code>ГГГГ-ММ-ДД</code>.\n"
            f"Доступный период: {escape(calendar['from'])} — {escape(calendar['to'])}."
        )
    if field == "budgetKzt":
        return "Укажите максимальный бюджет в тенге, например <code>900000</code>."
    return f"Выберите: <b>{escape(FIELD_LABELS[field].lower())}</b>."
