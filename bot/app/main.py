import asyncio
import logging
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import BotCommand
from dotenv import load_dotenv

from .api import BackendClient, BackendError
from .config import Settings
from .handlers import router


async def run() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    settings = Settings.from_env()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    api = BackendClient(settings.backend_url)
    bot = Bot(
        token=settings.telegram_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = Dispatcher()
    dispatcher.include_router(router)

    try:
        await api.health()
        catalog = await api.catalog()
    except BackendError:
        await api.close()
        await bot.session.close()
        raise RuntimeError(
            f"Backend is unavailable at {settings.backend_url}"
        ) from None

    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Запустить бота"),
            BotCommand(command="new", description="Новый подбор"),
            BotCommand(command="help", description="Помощь"),
        ]
    )
    try:
        await dispatcher.start_polling(
            bot,
            api=api,
            catalog=catalog,
            close_bot_session=False,
        )
    finally:
        await api.close()
        await bot.session.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
