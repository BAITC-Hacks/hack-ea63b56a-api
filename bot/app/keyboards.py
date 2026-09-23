from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder


def choices_keyboard(field: str, choices: list[str]) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for index, choice in enumerate(choices):
        builder.button(text=choice, callback_data=f"pick:{field}:{index}")
    builder.adjust(2)
    return builder.as_markup()


def confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔎 Найти подрядчиков", callback_data="action:search")],
            [InlineKeyboardButton(text="🔄 Заполнить заново", callback_data="action:restart")],
        ]
    )


def again_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔄 Новый подбор", callback_data="action:restart")]
        ]
    )
