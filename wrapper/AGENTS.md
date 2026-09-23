# Проект не настроен

`codex-wrapper:unbootstrapped` — по этой строке bootstrap понимает, что файл создан обёрткой и
его можно переписать целиком. Она должна остаться видимой.

Всегда используй OpenAI developer documentation MCP server, если нужно работать с OpenAI API,
plugins, ChatGPT, Codex или их документацией.

**Первое сообщение — это ТЗ, бриф или требования проекта? Скажи «настрой проект» или попроси
bootstrap.** Прочитай `.agents/skills/bootstrap/SKILL.md` и выполни его: он определит стек,
проверит реальные команды сборки и тестов, перепишет этот файл и заведёт стартовую память.

До bootstrap работать можно, но в `.serena/memories/` ничего не писать — таксономии ещё нет.

Общие правила проекта лежат в `.codex/rules/core.md` и `.codex/rules/memory.md`. Правило стека
прочитай явно, когда работаешь с соответствующим кодом:

- React / Next.js: `.codex/rules/react.md`
- NestJS: `.codex/rules/nest.md`
- Flutter: `.codex/rules/flutter.md`
