# HackAlem AI #79-lite

Подбор event-подрядчиков в Казахстане: Next.js принимает параметры мероприятия, NestJS
проверяет ограничения и использует OpenAI для смыслового ранжирования допустимых профилей.
Результат: до трёх карточек с индивидуальными объяснениями. Бронирования и уведомлений нет.

## Запуск локально

Нужны Node.js 22 (от 22.12) и npm. Два терминала, команды из корня репозитория:

```sh
npm --prefix backend ci
npm --prefix backend run start:dev
```

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Сайт: http://localhost:3000. Датасет: http://localhost:3000/dataset.
API: http://localhost:3001/api/v1.
Swagger: http://localhost:3001/api/docs. Health: http://localhost:3001/api/v1/health.
Без API-ключа работает детерминированный подбор с объяснениями из исходных профилей;
интерфейс явно показывает резервный режим.

Для ИИ создайте `backend/.env` по `backend/.env.example` и задайте `OPENAI_API_KEY`.
Файлы `.env` исключены из Git и Docker build context. Ключ не нужен frontend и не должен
попадать в `NEXT_PUBLIC_*`. Промокредит в кабинете OpenAI не является API-ключом.
После изменения env перезапустите приложение.

| Backend env | Назначение / значение по умолчанию |
|---|---|
| `PORT` | `3001` |
| `OPENAI_API_KEY` | Пусто: fallback; задан: реальный запрос к OpenAI |
| `OPENAI_MODEL` | `gpt-4o-mini`; можно выбрать доступную аккаунту модель со Structured Outputs |
| `OPENAI_TIMEOUT_MS` | `7000`, максимум 7 секунд, без повторных попыток |
| `DATASET_PATH` | Исходный CSV в корне, путь относительно backend |
| `CACHE_DIR` | `./cache`, сохраняемые результаты для повторяемого порядка |
| `FRONTEND_ORIGIN` | `http://localhost:3000` для CORS |

Frontend принимает только серверную `BACKEND_URL`, по умолчанию `http://localhost:3001`.
Пример: `frontend/.env.example`. Браузер обращается к `/api/v1/*` своего домена;
Next.js пересылает разрешённые запросы в NestJS.

## Docker

Docker Desktop должен быть запущен с Linux containers. Из корня:

```sh
docker compose config --quiet
docker compose build
docker compose up -d --wait
node scripts/smoke.mjs
```

Открыть http://localhost:3000. Swagger: http://localhost:3001/api/docs.
`backend/.env` подключается при наличии; запуск без него поддерживается. Контейнер Next.js
обращается к `http://backend:3001`, а исходный CSV копируется в backend-образ без изменения.
Кэш хранится в named volume `recommendations`, поэтому переживает restart/rebuild.
`docker compose down` останавливает сервисы и сохраняет кэш. Для других портов задайте
`FRONTEND_PORT` и `BACKEND_PORT`; для smoke соответственно `FRONTEND_URL` и `API_URL`.

## Демо

Во frontend есть готовые сценарии. Те же запросы напрямую (curl для Bash; в PowerShell
удобнее Swagger либо `Invoke-RestMethod` с JSON-телом):

```sh
# Плотная категория: три карточки
curl -s http://localhost:3001/api/v1/recommendations -H 'Content-Type: application/json' -d '{"city":"Алматы","date":"2026-10-15","eventFormat":"корпоратив","category":"Ведущий","budgetKzt":900000,"language":"русский"}'

# Редкая категория: один синтетический флорист, причина нехватки карточек
curl -s http://localhost:3001/api/v1/recommendations -H 'Content-Type: application/json' -d '{"city":"Астана","date":"2026-11-14","eventFormat":"корпоратив","category":"Флорист","budgetKzt":900000,"language":"русский"}'

# Кандидаты есть, но бюджет исключает всех
curl -s http://localhost:3001/api/v1/recommendations -H 'Content-Type: application/json' -d '{"city":"Алматы","date":"2026-10-15","eventFormat":"корпоратив","category":"Ведущий","budgetKzt":1}'

# Такой категории в городе нет
curl -s http://localhost:3001/api/v1/recommendations -H 'Content-Type: application/json' -d '{"city":"Астана","date":"2026-11-14","eventFormat":"корпоратив","category":"Инструменталист","budgetKzt":900000}'

# Та же плотная категория в декабре: занятость меняет выдачу
curl -s http://localhost:3001/api/v1/recommendations -H 'Content-Type: application/json' -d '{"city":"Алматы","date":"2026-12-20","eventFormat":"корпоратив","category":"Ведущий","budgetKzt":900000,"language":"русский"}'

# Свободный текст: распознанные значения подставляются в форму, неизвестные остаются missing
curl -s http://localhost:3001/api/v1/intake/parse -H 'Content-Type: application/json' -d '{"message":"хочу свадьбу на 65000 тенге"}'

# Анонимизированный датасет: синтетические профили, первая страница
curl -s 'http://localhost:3001/api/v1/contractors?profileType=synthetic&page=1&limit=12'
```

Обязательные поля: `city`, `date`, `eventFormat`, `category`, `budgetKzt`.
Опциональные: `durationHours` (больше 0, не больше 24), `language`.
Цена в карточке всегда **от**, а не окончательная стоимость мероприятия.
Календарь ограничен 23.09.2026–31.12.2026: вне окна API возвращает 400, поскольку
отсутствие занятой даты вне датасета не доказывает доступность.

Ответ содержит `status`, `count`, `exactCount`, `alternativeCount`, `totalCandidates`, `eligibleCount`, `message`,
`analysisMode`, `exclusions` и `items`. Три исхода: `matched`, `no_category_in_city`,
`no_candidates_after_filters`. Они возвращаются с HTTP 200; некорректный запрос с 400.
Количество исключений считается по каждой причине независимо: один профиль может нарушать
несколько условий. Если точных совпадений меньше трёх, карточки с `matchType=alternative`
сохраняют город, категорию и формат события, а каждое ослабленное условие перечислено в
`differences`. Полный контракт: [docs/API-CONTRACT.md](docs/API-CONTRACT.md).

## Архитектура и ИИ

```text
Next.js form/chat -> same-origin proxy -> NestJS DTO validation
  -> OpenAI/Zod intent extraction -> editable form values
  -> CSV repository -> city/category/date/budget/format/language/duration filters
  -> OpenAI Responses API + Zod Structured Outputs
  -> validate IDs/scores/profile evidence -> stable score/price/ID sort
  -> exact cards first -> transparent same-intent alternatives -> top 3
```

ИИ получает только допустимых кандидатов и оценивает смысл описаний применительно к формату
мероприятия. ID, имя, город, цена и флаги берутся из CSV. Ответ модели проверяется по Zod
и исходным профилям. При отсутствии ключа, отказе, таймауте, ошибке или невалидном ответе
применяется детерминированный fallback. `analysisMode` честно сообщает использованный режим.
Документация интеграции: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Порядок повторных ответов фиксируется локальными JSON-снимками: ключ включает нормализованный
запрос, хэш CSV, модель, версию промпта и наличие ИИ. Сохраняется первый ответ, в том числе
fallback; одновременные одинаковые запросы объединяются. Это обеспечивает повторяемость
после перезапуска без обещаний детерминизма самой LLM. Изменение данных/модели/версии или
удаление кэша создаёт новый набор результатов. После временного сбоя уже сохранённый fallback
остаётся для того же запроса. MVP рассчитан на один экземпляр backend; БД и Redis нет.

Модули и библиотеки: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Исходный CSV остаётся единственным источником профилей. DOCX и HTML preview сохранены в корне.
Данные: 66 профилей, города 50/15/1; `synthetic=13`, `city_imputed=8`, `price_imputed=18`.
В интерфейсе видны синтетические профили и восстановленные значения города/цены.
`max_hours=null` означает неприменимость ограничения присутствия, а не неизвестный ноль.

## Проверки

```sh
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run build
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
node scripts/smoke.mjs
```

Smoke требует запущенные оба приложения и проверяет API, frontend proxy, чат, альтернативы,
датасет, повтор запроса, плотную/редкую/пустую категории, смену даты, флаги и валидацию. Unit/e2e-тесты backend
проверяют ИИ через подмену SDK; это не подтверждает доступность модели или баланс аккаунта.
Живую интеграцию с OpenAI проверяют с собственным ключом и `analysisMode=ai` в ответе.

Браузерная проверка всей связки без подмены API (при запущенных приложениях):

```sh
npm --prefix frontend exec -- playwright install chromium
node scripts/browser-smoke.mjs
```

Она проверяет сценарии на ширинах 1440, 390 и 320 px и сохраняет снимки в игнорируемую
папку `frontend/test-results`. Отдельный `npm --prefix frontend run test:e2e` проверяет
интерфейс с фиксированным ответом API.
