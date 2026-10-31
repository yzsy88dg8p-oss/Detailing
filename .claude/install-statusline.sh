#!/usr/bin/env bash
# Ставит полоску «Память» в глобальные настройки Claude Code (~/.claude),
# чтобы она показывалась во всех проектах.
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)/statusline.sh"
dir="$HOME/.claude"
settings="$dir/settings.json"
mkdir -p "$dir"
cp "$src" "$dir/statusline.sh"
chmod +x "$dir/statusline.sh"
[ -s "$settings" ] || echo '{}' > "$settings"
cp "$settings" "$settings.bak"
tmp=$(mktemp)
jq '.statusLine = {"type":"command","command":"bash ~/.claude/statusline.sh","padding":0}' "$settings" > "$tmp"
mv "$tmp" "$settings"
echo "Готово: полоска включена во всех проектах (старые настройки: $settings.bak). Перезапустите Claude Code."
