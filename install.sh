#!/bin/sh
# Ставит Codex-обёртку в проект. Ничего не перезаписывает — о конфликтах сообщает.
# Использование:  ./install.sh /путь/к/проекту
set -eu

SRC="$(cd "$(dirname "$0")/wrapper" && pwd)"
DST="${1:-}"
[ -n "$DST" ] || { echo "Использование: $0 /путь/к/проекту" >&2; exit 1; }
[ -d "$DST" ] || { echo "Нет такой директории: $DST" >&2; exit 1; }
DST="$(cd "$DST" && pwd)"

CONFLICTS=""
for rel in AGENTS.md .codex/config.toml; do
  [ -e "$DST/$rel" ] && CONFLICTS="$CONFLICTS $rel"
done

if command -v rsync >/dev/null 2>&1; then
  rsync -a --ignore-existing --exclude '.claude/' "$SRC/" "$DST/"
else
  (cd "$SRC" && find . -path './.claude' -prune -o -type d -exec mkdir -p "$DST/{}" \;)
  (cd "$SRC" && find . -path './.claude' -prune -o -type f -exec sh -c '
    root="$1"
    shift
    for file do
      target="$root/${file#./}"
      [ -e "$target" ] || cp "$file" "$target"
    done
  ' sh "$DST" {} +)
fi

echo "Codex-обёртка скопирована в $DST"

if [ -n "$CONFLICTS" ]; then
  echo
  echo "ПРОПУЩЕНО (у вас уже есть свои):$CONFLICTS"
  echo "Это значит, что обёртка установлена НЕ полностью."
  case "$CONFLICTS" in *AGENTS.md*)
    echo "  -> AGENTS.md: маркер codex-wrapper:unbootstrapped не встал,"
    echo "     bootstrap сам не поймёт, что файл можно переписать целиком."
  ;; esac
  case "$CONFLICTS" in *.codex/config.toml*)
    echo "  -> .codex/config.toml: Docs MCP не добавлен. Слейте настройку вручную:"
    echo "     [mcp_servers.openaiDeveloperDocs]"
    echo "     url = \"https://developers.openai.com/mcp\""
  ;; esac
fi

echo
echo "Дальше:"
echo "  1. Перезапустить Codex в $DST, чтобы он перечитал AGENTS.md, .codex/config.toml и скиллы."
echo "  2. Первым промптом прислать ТЗ проекта и попросить: «настрой проект»."
echo "  3. Если нужна долговременная память, подключить MCP-сервер Serena."
echo "  4. Для OpenAI-вопросов Codex будет использовать Docs MCP из .codex/config.toml."
