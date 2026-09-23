# Сценарии подбора подрядчиков

Новые сценарии лежат в корневой папке `tests/` и запускаются вместе с существующими
backend-тестами. Они используют настоящий `MatchingService` и синтетические фикстуры;
приложение и сетевой доступ к AI для тестов не нужны. Исходный датасет не изменяется.

Из корня проекта, с Node.js 22.13+:

```sh
npm --prefix backend ci
npm --prefix backend test
```

Только новые сценарии:

```sh
npm --prefix backend test -- --runTestsByPath ../tests/matching.spec.cjs
```

1. Один подрядчик не проходит одновременно по бюджету и языку. Обе причины
   учитываются, изменение только одного условия не даёт совпадения.
2. Один подрядчик подходит только по цене, другой — только по языку. Выдача пуста:
   все условия должны выполняться для одного профиля. Добавление подходящего
   по обоим условиям профиля даёт ровно его в допустимом наборе.

Это проверки фильтрации. HTTP-статусы, объяснения и интерфейс проверяются
существующими наборами в `backend/test/` и `frontend/`.

## Полный прогон

Существующие тесты остаются в своих каталогах; команда backend теперь также
обнаруживает новые сценарии в корневой папке `tests/`.

```sh
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run build
npx --yes npm@11.6.2 --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
docker compose config --quiet
docker compose up -d --build --wait
node scripts/smoke.mjs
node scripts/browser-smoke.mjs
```

Для frontend используется npm 11.6.2, как в `frontend/Dockerfile`.
E2E запускает отдельный dev-сервер на порту 3101 с подменой API.
Smoke-проверки требуют работающие frontend на 3000 и backend на 3001;
браузерный smoke проверяет настоящее приложение на ширинах 1440, 390 и 320 px.
AI unit-тесты используют подмену SDK, а smoke без ключа проверяет fallback.
