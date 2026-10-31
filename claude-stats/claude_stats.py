#!/usr/bin/env python3
"""Статистика Claude Code в стиле /stats: календарь активности, токены, модели.

Читает историю сессий из ~/.claude/projects/**/*.jsonl и пишет
claude-stats.html, который открывается в браузере.

    python3 claude_stats.py              # создать и открыть страницу
    python3 claude_stats.py --no-open    # только создать
    python3 claude_stats.py --name Дамир # имя в заголовке
"""
import argparse
import getpass
import json
import os
import sys
import webbrowser
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def parse_ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone()
    except Exception:
        return None


def collect(root):
    seen = set()
    # day -> {"tokens", "messages", "sessions": set, "hours": {h: n}, "models": {m: tokens}}
    days = defaultdict(lambda: {"tokens": 0, "messages": 0, "sessions": set(),
                                "hours": defaultdict(int), "models": defaultdict(int)})
    files = list(Path(root).glob("**/*.jsonl"))
    for f in files:
        try:
            lines = f.open(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        with lines:
            for line in lines:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                t = r.get("type")
                if t not in ("user", "assistant"):
                    continue
                ts = parse_ts(r.get("timestamp", ""))
                if not ts:
                    continue
                msg = r.get("message") or {}
                key = (msg.get("id") or r.get("requestId")) if t == "assistant" else r.get("uuid")
                if key:
                    if key in seen:
                        continue
                    seen.add(key)
                if t == "user":
                    c = msg.get("content")
                    # результаты инструментов — не сообщения человека
                    if isinstance(c, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c):
                        continue
                    if r.get("isMeta"):
                        continue
                d = days[ts.strftime("%Y-%m-%d")]
                d["messages"] += 1
                if r.get("sessionId"):
                    d["sessions"].add(r["sessionId"])
                d["hours"][ts.hour] += 1
                if t == "assistant":
                    u = msg.get("usage") or {}
                    tok = sum(int(u.get(k) or 0) for k in (
                        "input_tokens", "output_tokens",
                        "cache_creation_input_tokens", "cache_read_input_tokens"))
                    d["tokens"] += tok
                    model = msg.get("model") or "unknown"
                    if model != "<synthetic>":
                        d["models"][model] += tok
    out = {}
    for day, d in days.items():
        out[day] = {"tokens": d["tokens"], "messages": d["messages"],
                    "sessions": sorted(d["sessions"]),
                    "hours": dict(d["hours"]), "models": dict(d["models"])}
    return out, len(files)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.expanduser("~/.claude/projects"))
    ap.add_argument("--out", default="claude-stats.html")
    ap.add_argument("--name", default=None)
    ap.add_argument("--no-open", action="store_true")
    a = ap.parse_args()

    if not Path(a.dir).exists():
        sys.exit(f"Не найдена папка {a.dir} — Claude Code на этом компьютере ещё не запускали?")
    data, nfiles = collect(a.dir)
    name = a.name or getpass.getuser()
    tpl = (Path(__file__).with_name("template.html")).read_text(encoding="utf-8")
    html = (tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False))
               .replace("__NAME__", json.dumps(name, ensure_ascii=False)))
    out = Path(a.out).resolve()
    out.write_text(html, encoding="utf-8")
    print(f"Готово: {out} ({nfiles} файлов истории, {len(data)} активных дней)")
    if not a.no_open:
        webbrowser.open(out.as_uri())


if __name__ == "__main__":
    main()
