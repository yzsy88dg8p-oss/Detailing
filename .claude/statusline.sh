#!/usr/bin/env bash
# Статус-строка Claude Code: полоска оставшегося контекста («памяти») модели.
# Claude Code передаёт JSON о сессии на stdin.
input=$(cat)

model=$(jq -r '.model.display_name // "Claude"' <<<"$input")

# Новые версии Claude Code сразу дают remaining_percentage;
# для старых считаем по current_usage и размеру окна.
left=$(jq -r '
  .context_window as $c
  | if $c == null then empty
    elif $c.remaining_percentage != null then $c.remaining_percentage
    elif $c.current_usage != null and ($c.context_window_size // 0) > 0 then
      100 - (($c.current_usage.input_tokens // 0)
           + ($c.current_usage.cache_creation_input_tokens // 0)
           + ($c.current_usage.cache_read_input_tokens // 0)) * 100 / $c.context_window_size
    else 100 end
  | floor | if . < 0 then 0 elif . > 100 then 100 else . end
' <<<"$input" 2>/dev/null)
left=${left:-100}

width=20
filled=$(( left * width / 100 ))
empty=$(( width - filled ))

if   (( left > 50 )); then color=$'\e[32m'   # зелёный
elif (( left > 20 )); then color=$'\e[33m'   # жёлтый
else                       color=$'\e[31m'   # красный
fi
reset=$'\e[0m'; dim=$'\e[2m'

bar=""
for ((i = 0; i < filled; i++)); do bar+="█"; done
for ((i = 0; i < empty; i++));  do bar+="░"; done
printf '%s  %sПамять %s%s %d%%%s\n' "$model" "$color" "$bar" "$dim" "$left" "$reset"
