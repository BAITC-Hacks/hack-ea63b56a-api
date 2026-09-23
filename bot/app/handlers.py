import logging
from html import escape
from typing import Any

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .api import BackendClient, BackendError
from .formatters import missing_prompt, request_summary, result_messages
from .keyboards import again_keyboard, choices_keyboard, confirm_keyboard
from .validation import (
    CATALOG_FIELDS,
    catalog_match,
    clean_values,
    next_missing,
    parse_budget,
    parse_iso_date,
)


logger = logging.getLogger(__name__)
router = Router()


class BotState(StatesGroup):
    description = State()
    collecting = State()
    confirm = State()


WELCOME = (
    "👋 <b>Подбор подрядчиков HackAlem</b>\n\n"
    "Опишите мероприятие одним сообщением. Например:\n"
    "<i>Нужен ведущий в Алматы на корпоратив 15 октября 2026, "
    "бюджет 900 000 тенге, русский язык.</i>\n\n"
    "Я распознаю параметры, уточню недостающее и обращусь к сервису подбора."
)


@router.message(CommandStart())
@router.message(Command("new"))
async def start(message: Message, state: FSMContext) -> None:
    await state.clear()
    await state.set_state(BotState.description)
    await message.answer(WELCOME)


@router.message(Command("help"))
async def help_command(message: Message) -> None:
    await message.answer(
        "Отправьте описание события или используйте /new для нового подбора. "
        "Обязательны город, дата, формат, категория подрядчика и бюджет."
    )


@router.message(BotState.description, F.text)
async def receive_description(
    message: Message,
    state: FSMContext,
    api: BackendClient,
    catalog: dict[str, Any],
) -> None:
    text = (message.text or "").strip()
    if not text:
        return
    wait = await message.answer("⏳ Разбираю запрос…")
    try:
        parsed = await api.parse_intent(text)
    except BackendError as exc:
        await wait.edit_text(f"Не удалось разобрать запрос: {escape(str(exc))}")
        return

    values = clean_values(parsed.get("values"))
    await state.update_data(values=values)
    assumptions = parsed.get("assumptions") or []
    if assumptions:
        await wait.edit_text(
            "Учёл предположения backend:\n• "
            + "\n• ".join(escape(str(item)) for item in assumptions)
        )
    else:
        await wait.delete()
    await ask_next(message, state, catalog)


async def ask_next(message: Message, state: FSMContext, catalog: dict[str, Any]) -> None:
    data = await state.get_data()
    values = data.get("values", {})
    field = next_missing(values)
    if field is None:
        await state.set_state(BotState.confirm)
        await message.answer(
            "<b>Проверьте параметры:</b>\n\n" + request_summary(values),
            reply_markup=confirm_keyboard(),
        )
        return

    await state.update_data(current_field=field)
    await state.set_state(BotState.collecting)
    keyboard = None
    if field in CATALOG_FIELDS:
        keyboard = choices_keyboard(field, catalog[CATALOG_FIELDS[field]])
    await message.answer(
        missing_prompt(field, catalog["calendar"]),
        reply_markup=keyboard,
    )


@router.callback_query(BotState.collecting, F.data.startswith("pick:"))
async def pick_catalog_value(
    callback: CallbackQuery,
    state: FSMContext,
    catalog: dict[str, Any],
) -> None:
    parts = (callback.data or "").split(":")
    if len(parts) != 3 or parts[1] not in CATALOG_FIELDS:
        await callback.answer("Кнопка устарела", show_alert=True)
        return
    field = parts[1]
    data = await state.get_data()
    if data.get("current_field") != field:
        await callback.answer("Этот вопрос уже заполнен", show_alert=True)
        return
    try:
        value = catalog[CATALOG_FIELDS[field]][int(parts[2])]
    except (ValueError, IndexError, KeyError):
        await callback.answer("Кнопка устарела", show_alert=True)
        return

    values = data.get("values", {})
    values[field] = value
    await state.update_data(values=values)
    await callback.answer(f"Выбрано: {value}")
    if callback.message:
        await callback.message.edit_reply_markup(reply_markup=None)
        await ask_next(callback.message, state, catalog)


@router.message(BotState.collecting, F.text)
async def receive_field(
    message: Message,
    state: FSMContext,
    catalog: dict[str, Any],
) -> None:
    data = await state.get_data()
    field = data.get("current_field")
    text = (message.text or "").strip()
    value: Any = None

    if field == "budgetKzt":
        value = parse_budget(text)
        error = "Введите целое положительное число, например 900000."
    elif field == "date":
        value = parse_iso_date(text, catalog["calendar"])
        error = (
            "Дата должна быть в формате ГГГГ-ММ-ДД и внутри периода "
            f"{catalog['calendar']['from']} — {catalog['calendar']['to']}."
        )
    elif field in CATALOG_FIELDS:
        value = catalog_match(text, catalog[CATALOG_FIELDS[field]])
        error = "Выберите значение кнопкой или введите его точно как в списке."
    else:
        error = "Не удалось распознать значение."

    if value is None:
        await message.answer(error)
        return
    values = data.get("values", {})
    values[field] = value
    await state.update_data(values=values)
    await ask_next(message, state, catalog)


@router.callback_query(F.data == "action:restart")
async def restart(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await state.set_state(BotState.description)
    await callback.answer()
    if callback.message:
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.message.answer(WELCOME)


@router.callback_query(BotState.confirm, F.data == "action:search")
async def search(
    callback: CallbackQuery,
    state: FSMContext,
    api: BackendClient,
) -> None:
    await callback.answer()
    if not callback.message:
        return
    await callback.message.edit_reply_markup(reply_markup=None)
    wait = await callback.message.answer("⏳ Подбираю подрядчиков…")
    values = (await state.get_data()).get("values", {})
    try:
        result = await api.recommendations(values)
    except BackendError as exc:
        await wait.edit_text(
            f"Подбор не выполнен: {escape(str(exc))}",
            reply_markup=confirm_keyboard(),
        )
        return
    except Exception:
        logger.exception("Unexpected recommendation error")
        await wait.edit_text(
            "Произошла непредвиденная ошибка. Попробуйте ещё раз.",
            reply_markup=confirm_keyboard(),
        )
        return

    messages = result_messages(result)
    await wait.edit_text(messages[0])
    for text in messages[1:]:
        await callback.message.answer(text)
    await callback.message.answer("Хотите сделать ещё один подбор?", reply_markup=again_keyboard())


@router.message()
async def fallback(message: Message) -> None:
    await message.answer("Используйте /new, чтобы начать новый подбор.")
