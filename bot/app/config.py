from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    telegram_bot_token: str
    backend_url: str

    @classmethod
    def from_env(cls) -> "Settings":
        token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        if not token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is required")

        backend_url = os.getenv(
            "BACKEND_URL", "http://127.0.0.1:3001/api/v1"
        ).strip()
        if not backend_url:
            raise RuntimeError("BACKEND_URL must not be empty")

        return cls(
            telegram_bot_token=token,
            backend_url=backend_url.rstrip("/"),
        )
