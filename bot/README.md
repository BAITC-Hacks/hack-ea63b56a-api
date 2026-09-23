# Telegram-бот HackAlem

Бот принимает описание события, разбирает его через `POST /api/v1/intake/parse`, уточняет
обязательные параметры и получает карточки через `POST /api/v1/recommendations`.

## Быстрый запуск через Docker

1. Создайте бота в Telegram через `@BotFather` командой `/newbot` и скопируйте токен.
2. Скопируйте `bot/.env.example` в `bot/.env` и вставьте токен:

   ```env
   TELEGRAM_BOT_TOKEN=123456:ваш_токен
   BACKEND_URL=http://backend:3001/api/v1
   ```

3. Из корня репозитория запустите:

   ```sh
   docker compose --profile bot up -d --build --wait bot
   ```

4. Откройте созданного бота в Telegram и отправьте `/start`.

Логи: `docker compose logs -f bot`. Остановка: `docker compose --profile bot down`.

## Локальный запуск

Нужен Python 3.11+. Сначала запустите backend на порту 3001, затем:

```powershell
cd bot
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Вставьте токен в `.env`, затем выполните `python -m app.main`.

Тесты без подключения к Telegram и backend:

```sh
cd bot
python -m unittest discover -s tests -v
```
