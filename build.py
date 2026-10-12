#!/usr/bin/env python3
"""Сборка сайта Zero KM Detailing.

    python3 build.py            # src/ -> docs/ (готовый сайт)
    python3 build.py --preview  # src/ -> preview/ (версия для предпросмотра в Claude)

Нужен только Python 3.9+, без сторонних библиотек.
Контакты, цены, домен и счётчик меняются в src/config.json,
FAQ, работы и отзывы — в src/data/*.json, тексты страниц — в src/pages/*.html.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import shutil
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"

NAV = [
    ("index", "index.html", "Главная"),
    ("services", "services.html", "Услуги и цены"),
    ("process", "process.html", "Как мы работаем"),
    ("works", "works.html", "Работы"),
    ("about", "about.html", "О нас"),
    ("faq", "faq.html", "Вопросы"),
    ("contacts", "contacts.html", "Контакты"),
]

SALON_TYPES = {
    "fabric": "Тканевый салон",
    "leather": "Кожаный салон",
    "combo": "Комбинированный салон",
}

NBSP = " "


# --------------------------------------------------------------------------
# Мини-шаблонизатор: {{ path }}, {% include "name" %}, {% if path %}…{% else %}…{% endif %}
# Значения из ключей, оканчивающихся на _html, вставляются как есть, остальные экранируются.
# --------------------------------------------------------------------------
TOKEN_RE = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")
INCLUDE_RE = re.compile(r'\{%\s*include\s+"([\w./-]+)"\s*%\}')
IF_RE = re.compile(
    r"\{%\s*if\s+(not\s+)?([\w.]+)\s*%\}"
    r"((?:(?!\{%\s*if\b).)*?)"
    r"(?:\{%\s*else\s*%\}((?:(?!\{%\s*if\b).)*?))?"
    r"\{%\s*endif\s*%\}",
    re.S,
)


def lookup(ctx: dict, path: str, strict: bool = True):
    cur = ctx
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            if strict:
                raise KeyError(f"Нет значения для {{{{ {path} }}}}")
            return None
    return cur


def render(tpl: str, ctx: dict) -> str:
    for _ in range(10):
        new = INCLUDE_RE.sub(lambda m: (SRC / "partials" / f"{m.group(1)}.html").read_text("utf-8"), tpl)
        if new == tpl:
            break
        tpl = new

    def _if(m: re.Match) -> str:
        negate, path, yes, no = m.group(1), m.group(2), m.group(3), m.group(4) or ""
        val = bool(lookup(ctx, path, strict=False))
        if negate:
            val = not val
        return yes if val else no

    while True:
        new = IF_RE.sub(_if, tpl)
        if new == tpl:
            break
        tpl = new

    def _tok(m: re.Match) -> str:
        path = m.group(1)
        val = lookup(ctx, path)
        if path.split(".")[-1].endswith("_html") or path.startswith("i."):
            return str(val)
        return html.escape(str(val), quote=True)

    return TOKEN_RE.sub(_tok, tpl)


# --------------------------------------------------------------------------
# Типограф: неразрывные пробелы после коротких слов и перед тире, между числом и единицей.
# Трогает только текст между тегами, пропуская script/style/svg/textarea.
# --------------------------------------------------------------------------
SHORT_WORDS = "в во и с со к ко о об у а но на по до от не ни за из для без как что или при про под над".split()
SHORT_RE = re.compile(r"(?<![\w\-])(" + "|".join(SHORT_WORDS) + r") +(?=[\w«(0-9\"])", re.I)
DASH_RE = re.compile(r" +([—–]) ")
UNIT_RE = re.compile(r"(\d) +(₽|В|Вт|л|кг|мм|см|км|ч|шт|мин|дн|тыс|%)(?![\w])")
NUM_RE = re.compile(r"(\d) (\d{3})(?!\d)")
SKIP_TAGS = ("script", "style", "svg", "textarea", "pre", "code", "title")
TRAIL_RE = re.compile(r"(?<![\w\-])(" + "|".join(SHORT_WORDS) + r") +$", re.I)
NOWRAP = ("Санкт-Петербург", "Санкт-Петербурге", "Санкт-Петербургу")


def typograph(src: str) -> str:
    parts = re.split(r"(<[^>]+>)", src)
    out, skip = [], []
    for part in parts:
        if part.startswith("<"):
            m = re.match(r"<(/?)([a-zA-Z0-9]+)", part)
            if m:
                closing, tag = m.group(1), m.group(2).lower()
                if tag in SKIP_TAGS and not part.endswith("/>"):
                    if closing and skip and skip[-1] == tag:
                        skip.pop()
                    elif not closing:
                        skip.append(tag)
            out.append(part)
            continue
        if skip or not part.strip():
            out.append(part)
            continue
        t = part
        t = DASH_RE.sub(NBSP + r"\1 ", t)
        t = UNIT_RE.sub(r"\1" + NBSP + r"\2", t)
        t = NUM_RE.sub(r"\1" + NBSP + r"\2", t)
        t = SHORT_RE.sub(lambda m: m.group(1) + NBSP, t)
        t = TRAIL_RE.sub(lambda m: m.group(1) + NBSP, t)
        for word in sorted(NOWRAP, key=len, reverse=True):
            t = re.sub(r"(?<![\w-])" + word + r"(?![\w])", f'<span class="nowrap">{word}</span>', t)
        out.append(t)
    return "".join(out)


# --------------------------------------------------------------------------
# Компоненты
# --------------------------------------------------------------------------
def rub(n: int) -> str:
    return f"{n:,}".replace(",", NBSP)


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def icon(name: str, cls: str = "") -> str:
    extra = f" {cls}" if cls else ""
    return f'<svg class="icon{extra}" aria-hidden="true" focusable="false"><use href="#i-{name}"></use></svg>'


def logo_mark(cls: str = "logo__mark") -> str:
    """Знак-одометр: шесть ячеек с нулями. Рисуется фигурами, без шрифта."""
    cells = []
    for i in range(6):
        x = i * 19
        cells.append(
            f'<rect x="{x}" y="0" width="16" height="24" rx="3.5" class="lm-cell"/>'
            f'<rect x="{x + 4.25}" y="5.5" width="7.5" height="13" rx="3.75" class="lm-zero"/>'
        )
    return (
        f'<svg class="{cls}" viewBox="-1 -1 113 26" aria-hidden="true" focusable="false">'
        + "".join(cells)
        + "</svg>"
    )


def odometer(digits: int = 6, start: str = "", final: str = "", unit: str = "km", label: str = "", cls: str = "") -> str:
    """Одометр из барабанов. Без JS сразу показывает final; с JS прокручивается от start к final."""
    reel = "".join(f"<span>{d}</span>" for d in range(10))
    final = (final or "0").rjust(digits, "0")[-digits:]
    cells = "".join(
        f'<span class="odo__cell" style="--d:{d}"><span class="odo__reel">{reel}</span></span>' for d in final
    )
    data = f' data-final="{final}"'
    if start:
        data += f' data-start="{esc(start)}"'
    unit_html = f'<span class="odo__unit">{esc(unit)}</span>' if unit else ""
    aria = label or f"{final} {unit}".strip()
    extra = f" {cls}" if cls else ""
    return (
        f'<span class="odo{extra}" role="img" aria-label="{esc(aria)}" data-odo{data}>'
        f"{cells}{unit_html}</span>"
    )


def gauge_svg() -> str:
    cx = cy = 220
    vmax = 240

    def pt(r: float, v: float):
        th = math.radians(135 + 270 * v / vmax)
        return cx + r * math.cos(th), cy + r * math.sin(th)

    ticks = []
    for v in range(0, vmax + 1, 5):
        major = v % 20 == 0
        mid = v % 10 == 0
        r1 = 166 if major else (174 if mid else 178)
        x1, y1 = pt(r1, v)
        x2, y2 = pt(184, v)
        cls = "g-tick g-tick--major" if major else "g-tick"
        ticks.append(f'<line class="{cls}" data-v="{v}" x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}"/>')

    labels = []
    for v in range(0, vmax + 1, 40):
        x, y = pt(146, v)
        cls = "g-label g-label--zero" if v == 0 else "g-label"
        labels.append(f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}">{v}</text>')

    x0, y0 = pt(194, 0)
    x1, y1 = pt(194, vmax)
    arc = f"M {x0:.2f} {y0:.2f} A 194 194 0 1 1 {x1:.2f} {y1:.2f}"

    return f"""<svg class="gauge__svg" viewBox="0 0 440 440" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="g-disc" cx="50%" cy="45%" r="60%">
      <stop offset="0" stop-color="#2a3035"/>
      <stop offset=".62" stop-color="#1a1d20"/>
      <stop offset="1" stop-color="#121416"/>
    </radialGradient>
    <radialGradient id="g-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#7CC8F2" stop-opacity=".22"/>
      <stop offset="1" stop-color="#7CC8F2" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="g-needle" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#7CC8F2" stop-opacity=".2"/>
      <stop offset=".35" stop-color="#7CC8F2"/>
      <stop offset="1" stop-color="#E6F5FE"/>
    </linearGradient>
  </defs>
  <circle cx="220" cy="220" r="214" class="g-ring-outer"/>
  <circle cx="220" cy="220" r="204" fill="url(#g-disc)" class="g-disc"/>
  <circle cx="220" cy="220" r="150" fill="url(#g-glow)"/>
  <path d="{arc}" class="g-track"/>
  <path d="{arc}" class="g-progress" pathLength="1"/>
  {''.join(ticks)}
  {''.join(labels)}
  <text class="g-caption" x="220" y="168">км до сервиса</text>
  <g class="g-needle" transform="rotate(135 220 220)">
    <path d="M 196 216.6 L 376 219.2 Q 380 220 376 220.8 L 196 223.4 Z" fill="url(#g-needle)"/>
  </g>
  <circle cx="220" cy="220" r="13" class="g-hub"/>
  <circle cx="220" cy="220" r="4.5" class="g-hub-dot"/>
</svg>"""


def nav_html(active: str) -> str:
    items = []
    for key, href, label in NAV:
        cur = ' aria-current="page"' if key == active else ""
        items.append(f'<li><a href="{href}"{cur}>{label}</a></li>')
    return "".join(items)


def mnav_html(active: str) -> str:
    items = []
    for key, href, label in NAV:
        cur = ' aria-current="page"' if key == active else ""
        items.append(f'<li><a href="{href}"{cur}><span>{label}</span>{icon("arrow-up-right")}</a></li>')
    return "".join(items)


def faq_html(faq: list) -> str:
    out = []
    for i, item in enumerate(faq, 1):
        out.append(
            f'<details class="faq__item" id="{esc(item["id"])}">'
            f'<summary class="faq__q"><span class="faq__num">{i:02d}</span>'
            f'<span class="faq__text">{esc(item["q"])}</span>'
            f'<span class="faq__toggle" aria-hidden="true"></span></summary>'
            f'<div class="faq__a"><div class="faq__a-inner prose">{item["a"]}</div></div>'
            f"</details>"
        )
    return "".join(out)


def ba_html(w: dict, eager: bool = False, cls: str = "") -> str:
    loading = "eager" if eager else "lazy"
    title = w.get("title", "")
    extra = f" {cls}" if cls else ""
    return f"""<div class="ba{extra}" data-ba style="--pos:50%">
  <img class="ba__img" src="{esc(w['after'])}" alt="После: {esc(title)}" width="1600" height="1200" loading="{loading}" decoding="async">
  <div class="ba__before"><img class="ba__img" src="{esc(w['before'])}" alt="До: {esc(title)}" width="1600" height="1200" loading="{loading}" decoding="async"></div>
  <span class="ba__tag ba__tag--before">До</span>
  <span class="ba__tag ba__tag--after">После</span>
  <span class="ba__line" aria-hidden="true"><span class="ba__knob">{icon('drag')}</span></span>
  <input class="ba__range" type="range" min="0" max="100" value="50" step="1" aria-label="Сравнение до и после: {esc(title)}">
</div>"""


def works_html(works: list) -> tuple[str, str]:
    cards = []
    brands = sorted({w["brand"] for w in works if w.get("brand")})
    salons = [k for k in SALON_TYPES if any(w.get("salon") == k for w in works)]
    for w in works:
        meta = [SALON_TYPES.get(w.get("salon", ""), "")]
        if w.get("services"):
            meta.append(w["services"])
        if w.get("district"):
            meta.append(w["district"])
        car = " ".join(x for x in [w.get("brand", ""), w.get("car", "")] if x)
        badge = '<span class="work__badge">Демо-пример</span>' if w.get("demo") else ""
        heading = esc(car) if car else esc(w["title"])
        sub = f'<p class="work__sub">{esc(w["title"])}</p>' if car else ""
        cards.append(
            f'<article class="work" data-salon="{esc(w.get("salon", ""))}" data-brand="{esc(w.get("brand", ""))}">'
            f'<div class="work__media">{ba_html(w)}{badge}</div>'
            f'<div class="work__body"><h3 class="work__title">{heading}</h3>'
            f"{sub}"
            f'<p class="work__meta">{" · ".join(esc(m) for m in meta if m)}</p></div>'
            f"</article>"
        )
    chips = ['<button type="button" class="chip is-active" data-filter-salon="" aria-pressed="true">Все</button>']
    for key in salons:
        chips.append(
            f'<button type="button" class="chip" data-filter-salon="{key}" aria-pressed="false">{SALON_TYPES[key]}</button>'
        )
    brand_select = ""
    if brands:
        opts = "".join(f'<option value="{esc(b)}">{esc(b)}</option>' for b in brands)
        brand_select = (
            '<label class="select"><span class="sr-only">Марка</span>'
            f'<select id="works-brand" data-filter-brand><option value="">Все марки</option>{opts}</select>'
            f'{icon("chevron-down")}</label>'
        )
    filters = f'<div class="works__filters" role="group" aria-label="Фильтр работ">{"".join(chips)}{brand_select}</div>'
    return filters, "".join(cards)


def reviews_html(reviews: list) -> str:
    if not reviews:
        return ""
    cards = []
    for r in reviews:
        src = ""
        if r.get("url"):
            src = f'<a class="review__src" href="{esc(r["url"])}" target="_blank" rel="noopener">{esc(r.get("source", "Источник"))}{icon("arrow-up-right")}</a>'
        elif r.get("source"):
            src = f'<span class="review__src">{esc(r["source"])}</span>'
        cards.append(
            '<figure class="review">'
            f'<blockquote class="review__text">{esc(r["text"])}</blockquote>'
            f'<figcaption class="review__who"><span class="review__name">{esc(r["name"])}</span>'
            f'<span class="review__car">{esc(r.get("car", ""))}</span>{src}</figcaption>'
            "</figure>"
        )
    return "".join(cards)


def jsonld(obj) -> str:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'<script type="application/ld+json">{raw}</script>'


def business_ld(cfg: dict) -> dict:
    c, p = cfg["contacts"], cfg["prices"]
    same_as = [v for v in cfg["links"].values() if v]
    if c.get("telegram_username"):
        same_as.append(f"https://t.me/{c['telegram_username']}")
    offers = [
        ("Комплексная химчистка салона", p["complex"]),
        ("Чистка кожи", p["leather"]),
        ("Чистка потолка", p["ceiling"]),
        ("Нейтрализация запаха", p["odor"]),
        ("Выведение точечного пятна", p["spot"]),
    ]
    data = {
        "@context": "https://schema.org",
        "@type": "AutomotiveBusiness",
        "name": cfg["brand"],
        "description": "Выездная химчистка и детейлинг салона авто в СПб и Ленинградской области. Фото до и после, честные цены, приезжаем к вам.",
        "slogan": cfg["slogan"],
        "url": cfg["site_url"] + "/",
        "logo": cfg["site_url"] + "/icon-512.png",
        "image": cfg["site_url"] + "/og-image.jpg",
        "telephone": c["phone_tel"],
        "areaServed": [
            {"@type": "City", "name": "Санкт-Петербург"},
            {"@type": "AdministrativeArea", "name": "Ленинградская область"},
        ],
        "address": {"@type": "PostalAddress", "addressLocality": "Санкт-Петербург", "addressCountry": "RU"},
        "priceRange": f"от {p['spot']} ₽",
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Химчистка и детейлинг салона на выезд",
            "itemListElement": [
                {
                    "@type": "Offer",
                    "itemOffered": {"@type": "Service", "name": name},
                    "priceSpecification": {"@type": "PriceSpecification", "minPrice": price, "priceCurrency": "RUB"},
                }
                for name, price in offers
            ],
        },
    }
    if same_as:
        data["sameAs"] = same_as
    return data


def faq_ld(faq: list) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": item["q"],
                "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", item["a"])).strip()},
            }
            for item in faq
        ],
    }


def breadcrumbs_ld(cfg: dict, page: dict) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Главная", "item": cfg["site_url"] + "/"},
            {"@type": "ListItem", "position": 2, "name": page["crumb"], "item": f"{cfg['site_url']}/{page['path']}"},
        ],
    }


def metrika_html(counter_id: str) -> str:
    if not counter_id:
        return ""
    cid = esc(str(counter_id))
    return f"""<script>
(function(m,e,t,r,i,k,a){{m[i]=m[i]||function(){{(m[i].a=m[i].a||[]).push(arguments)}};m[i].l=1*new Date();
for(var j=0;j<document.scripts.length;j++){{if(document.scripts[j].src===r){{return;}}}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)}})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym({cid},"init",{{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true}});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/{cid}" style="position:absolute;left:-9999px" alt=""></div></noscript>"""


FONT_FACES = """<style>
@font-face{font-family:"Manrope";font-style:normal;font-weight:200 800;font-display:swap;src:url("assets/fonts/manrope-cyrillic.woff2") format("woff2");unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:"Manrope";font-style:normal;font-weight:200 800;font-display:swap;src:url("assets/fonts/manrope-latin-ext.woff2") format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Manrope";font-style:normal;font-weight:200 800;font-display:swap;src:url("assets/fonts/manrope-latin.woff2") format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
</style>
<link rel="preload" href="assets/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossorigin>"""

FONT_GOOGLE = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&amp;display=swap">'
)


# --------------------------------------------------------------------------
# Сборка
# --------------------------------------------------------------------------
META_RE = re.compile(r"^\s*<!--meta\s+(\{.*?\})\s*-->\s*", re.S)


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def build(out: Path, preview: bool) -> None:
    cfg = json.loads((SRC / "config.json").read_text("utf-8"))
    faq = json.loads((SRC / "data" / "faq.json").read_text("utf-8"))
    works = json.loads((SRC / "data" / "works.json").read_text("utf-8"))
    reviews = json.loads((SRC / "data" / "reviews.json").read_text("utf-8"))

    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SRC / "static", out)

    c = cfg["contacts"]
    tg_url = f"https://t.me/{c['telegram_username']}" if c.get("telegram_username") else ""
    wa_url = f"https://wa.me/{c['whatsapp_number']}" if c.get("whatsapp_number") else ""
    tel_url = f"tel:{c['phone_tel']}"
    filters, cards = works_html(works)
    review_cards = reviews_html(reviews)
    year = date.today().year
    years = f"{cfg['founded_year']}–{year}" if year > cfg["founded_year"] else str(year)

    js_cfg = {
        "telegram": c.get("telegram_username", ""),
        "whatsapp": c.get("whatsapp_number", ""),
        "phoneTel": c.get("phone_tel", ""),
        "phoneDisplay": c.get("phone_display", ""),
        "formEndpoint": cfg.get("form_endpoint", ""),
        "metrika": str(cfg.get("yandex_metrika_id", "") or ""),
        "prices": cfg["prices"],
    }

    base_ctx = {
        **cfg,
        "p": {k: rub(v) for k, v in cfg["prices"].items()},
        "tg_url": tg_url,
        "wa_url": wa_url,
        "tel_url": tel_url,
        "tg_handle": f"@{c['telegram_username']}" if c.get("telegram_username") else "",
        "years": years,
        "logo_html": logo_mark(),
        "logo_footer_html": logo_mark("logo__mark logo__mark--lg"),
        "gauge_html": gauge_svg(),
        "odo_hero_html": odometer(6, start="184726", unit="km", label="Пробег салона: 000000 км"),
        "odo_404_html": odometer(6, start="000000", final="000404", unit="", label="Ошибка 404", cls="odo--xl"),
        "faq_html": faq_html(faq),
        "works_filters_html": filters,
        "works_cards_html": cards,
        "reviews_html": review_cards,
        "has_reviews": bool(reviews),
        "demo_ba_html": ba_html(works[0], eager=False, cls="ba--xl") if works else "",
        "has_works": bool(works),
        "metrika_html": metrika_html(cfg.get("yandex_metrika_id", "")),
        "fonts_html": FONT_GOOGLE if preview else FONT_FACES,
        "js_config_html": json.dumps(js_cfg, ensure_ascii=False).replace("</", "<\\/"),
        "css_href": "assets/css/style.css" + ("" if preview else "?v=" + file_hash(SRC / "static/assets/css/style.css")),
        "js_href": "assets/js/main.js" + ("" if preview else "?v=" + file_hash(SRC / "static/assets/js/main.js")),
        "operator_name": cfg["legal"]["operator_name"] or "[ФИО самозанятого]",
        "operator_inn": cfg["legal"]["inn"] or "[ИНН]",
        "privacy_email": cfg["legal"].get("email") or cfg["contacts"].get("email") or "",
        "today": date.today().strftime("%d.%m.%Y"),
    }
    for key, href, _ in NAV:
        base_ctx[f"href_{key}"] = href

    icons = (SRC / "partials" / "icons.svg").read_text("utf-8")
    base_ctx["icons_html"] = icons
    for name in re.findall(r'<symbol id="i-([\w-]+)"', icons):
        base_ctx.setdefault("i", {})[name.replace("-", "_")] = icon(name)

    layout = (SRC / "layout.html").read_text("utf-8")
    sitemap = []
    for page_file in sorted((SRC / "pages").glob("*.html")):
        raw = page_file.read_text("utf-8")
        m = META_RE.match(raw)
        if not m:
            raise SystemExit(f"{page_file.name}: нет блока <!--meta {{...}} -->")
        page = json.loads(m.group(1))
        body = raw[m.end():]
        slug = page_file.stem
        page["file"] = f"{slug}.html"
        page["path"] = "" if slug == "index" else page["file"]
        page.setdefault("crumb", page.get("nav_label", ""))
        page.setdefault("og_title", page["title"])
        page.setdefault("noindex", False)
        if preview and slug == "index":
            page["title"] = cfg["brand"]

        ld = []
        if page.get("ld_business"):
            ld.append(jsonld(business_ld(cfg)))
        if page.get("ld_faq"):
            ld.append(jsonld(faq_ld(faq)))
        if slug not in ("index", "404"):
            ld.append(jsonld(breadcrumbs_ld(cfg, page)))

        ctx = {
            **base_ctx,
            "page": page,
            "nav_html": nav_html(page.get("nav", "")),
            "mnav_html": mnav_html(page.get("nav", "")),
            "jsonld_html": "".join(ld),
            "canonical": f"{cfg['site_url']}/{page['path']}",
        }
        ctx["content_html"] = render(body, ctx)
        doc = render(layout, ctx)
        doc = typograph(doc)

        if preview and slug == "index":
            doc = strip_document_shell(doc)
        (out / page["file"]).write_text(doc, "utf-8")
        if not page["noindex"]:
            sitemap.append(page["path"])

    write_seo_files(out, cfg, sitemap)
    print(f"Готово: {out.relative_to(ROOT)}/ — страниц: {len(list((SRC / 'pages').glob('*.html')))}")


def strip_document_shell(doc: str) -> str:
    """Для предпросмотра: оболочку <html>/<head>/<body> добавляет сама площадка."""
    doc = re.sub(r"<!doctype html>\s*", "", doc, flags=re.I)
    doc = re.sub(r"</?html[^>]*>\s*", "", doc)
    doc = re.sub(r"</?head>\s*", "", doc)
    doc = re.sub(r"</?body[^>]*>\s*", "", doc)
    doc = re.sub(r'<meta charset="utf-8">\s*', "", doc)
    doc = re.sub(r'<meta name="viewport"[^>]*>\s*', "", doc)
    return doc


def write_seo_files(out: Path, cfg: dict, paths: list) -> None:
    today = date.today().isoformat()
    urls = "".join(
        f"  <url><loc>{esc(cfg['site_url'])}/{p}</loc><lastmod>{today}</lastmod>"
        f"<priority>{'1.0' if p == '' else '0.8'}</priority></url>\n"
        for p in paths
    )
    (out / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n",
        "utf-8",
    )
    (out / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nDisallow: /404.html\n\nSitemap: {cfg['site_url']}/sitemap.xml\n", "utf-8"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Сборка сайта Zero KM Detailing")
    ap.add_argument("--preview", action="store_true", help="собрать версию для предпросмотра в preview/")
    ap.add_argument("--out", help="папка для результата (по умолчанию docs/ или preview/)")
    args = ap.parse_args()
    out = Path(args.out) if args.out else ROOT / ("preview" if args.preview else "docs")
    build(out.resolve(), args.preview)


if __name__ == "__main__":
    main()
