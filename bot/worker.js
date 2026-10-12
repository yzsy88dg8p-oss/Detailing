/*
 * Zero KM Detailing — Telegram-бот для записи.
 * Работает на Cloudflare Workers (бесплатный тариф), без своего сервера.
 *
 * Что умеет:
 *  - запись по шагам: услуги, место, авто, район, условия, время, фото, имя, контакт;
 *  - ориентир цены по тем же правилам, что калькулятор на сайте;
 *  - заявка приходит вам в Telegram с кнопками «Принять / Выполнена / Отказ»;
 *  - ответ клиенту: ответьте (reply) на заявку или сообщение клиента в своём чате;
 *  - цены, условия выезда, частые вопросы;
 *  - приём заявок с формы сайта (адрес /form).
 *
 * Настройка — в bot/README.md. Тексты и цены — в объекте CONFIG ниже.
 */

const CONFIG = {
  brand: "Zero KM Detailing",
  descriptor: "Химчистка и детейлинг салона на выезд, СПб и ЛО",
  slogan: "0 км до сервиса. 0 км пробега салона.",
  phone: "+7 (000) 000-00-00",
  hours: "Ежедневно, 9:00–21:00, по предварительной записи",
  site: "https://zerokm-detailing.ru",   // можно переопределить переменной SITE_URL
  reviewUrl: "",                          // ссылка на отзывы (Яндекс Карты, 2ГИС), можно переменной REVIEW_URL
  minOrder: 6000,
  spotPrice: 1000,
  services: [
    { key: "complex", label: "Комплексная химчистка", price: 6500 },
    { key: "leather", label: "Чистка кожи", price: 2500 },
    { key: "ceiling", label: "Потолок", price: 1500 },
    { key: "odor", label: "Нейтрализация запаха", price: 1000 },
  ],
};

const SERVICE_LABELS = {
  complex: "Комплексная химчистка",
  leather: "Чистка кожи",
  ceiling: "Потолок",
  odor: "Нейтрализация запаха",
  spot: "Точечные пятна",
  help: "Не знаю, подскажите",
};

const PLACES = { parking: "Паркинг", garage: "Гараж", box: "Бокс", unknown: "Пока не знаю" };
const POWER = { both: "Розетка и вода есть", power: "Розетка есть, воду привезите", unknown: "Не знаю" };
const WHEN = { soon: "Ближайшие дни", weekdays: "Будни", weekend: "Выходные", other: "Укажу сам" };

const FAQ = [
  ["Что нужно для выезда?",
    "<b>Место:</b> паркинг, гараж или бокс. На улице осенью и зимой салон не высохнет, а при минусе мокрую чистку делать нельзя.\n" +
    "<b>Розетка 220 В</b> рядом с машиной. Удлинитель привезём.\n" +
    "<b>Вода:</b> 8–10 л тёплой. Если взять негде, привезём две канистры по 10 л.\n" +
    "<b>Пустой салон:</b> уберите личные вещи, детское кресло и мусор."],
  ["Сколько времени и сколько сохнет?",
    "Комплексная химчистка занимает рабочий день. Точное время назовём заранее, по марке авто и фото салона.\n" +
    "Сушим на месте феном и вентиляторами, двери открыты. Перед сдачей проверяем рукой. Мокрым салон не отдаём."],
  ["Что не отмоется?",
    "Старые въевшиеся пятна могут не отойти полностью. Прожжённую ткань и залитую кожу чистка не восстановит. " +
    "Такие места фотографируем до начала работы и говорим, какой результат реален."],
  ["Работаете ли зимой?",
    "Да, круглый год. Осенью и зимой — только в паркинге, боксе или гараже."],
  ["Нужно ли присутствовать?",
    "Всё время быть рядом не нужно. Важно встретить нас на осмотре и прийти на приёмку. На время работы оставьте ключи мастеру."],
  ["Как оплатить и получить чек?",
    "Оплата после финального осмотра: переводом или наличными. По каждому заказу присылаем чек самозанятого."],
  ["Алькантара и потолок?",
    "Алькантару сейчас не берём. Потолок чистим только вручную, мягкой щёткой и с минимумом влаги."],
  ["Есть ли гарантия?",
    "Услугу и ответственность фиксируем в договоре или чеке. Результат вы принимаете на финальном осмотре вместе с нами: " +
    "если что-то не устраивает, исправляем на месте."],
];

const STATE_TTL = 60 * 60 * 24;     // незавершённая запись хранится сутки
const MAP_TTL = 60 * 60 * 24 * 30;  // связь «сообщение в вашем чате → клиент» хранится 30 дней
const MAX_PHOTOS = 5;

/* ======================================================================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/webhook" && request.method === "POST") {
        if (env.WEBHOOK_SECRET && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
          return new Response("forbidden", { status: 403 });
        }
        const update = await request.json();
        try {
          await handleUpdate(update, env);
        } catch (e) {
          console.error("update failed", e && e.stack || e);
        }
        return new Response("ok");
      }
      if (url.pathname === "/form") {
        if (request.method === "OPTIONS") return withCors(env, new Response(null, { status: 204 }));
        if (request.method === "POST") return withCors(env, await handleSiteForm(request, env));
      }
      if (url.pathname === "/setup") return setup(url, env);
      return new Response(`${CONFIG.brand}: бот работает`, { headers: { "content-type": "text/plain; charset=utf-8" } });
    } catch (e) {
      console.error(e && e.stack || e);
      return new Response("error", { status: 500 });
    }
  },
};

/* ---------------------------- Telegram API ----------------------------- */

async function tg(env, method, body) {
  const init = body instanceof FormData
    ? { method: "POST", body }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) };
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, init);
  const json = await res.json().catch(() => ({ ok: false, description: "bad json" }));
  if (!json.ok) console.warn(method, json.description);
  return json;
}

function send(env, chatId, text, extra = {}) {
  return tg(env, "sendMessage", {
    chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra,
  });
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rub = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const kb = (rows) => ({ inline_keyboard: rows });
const btn = (text, data) => ({ text, callback_data: data });
const siteUrl = (env) => (env.SITE_URL || CONFIG.site).replace(/\/$/, "");

function adminChats(env) {
  return String(env.ADMIN_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
}
const isAdminChat = (env, chatId) => adminChats(env).includes(String(chatId));

/* ------------------------------ Хранилище ------------------------------ */

async function kvGet(env, key) {
  const raw = await env.STATE.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const kvPut = (env, key, val, ttl) => env.STATE.put(key, JSON.stringify(val), ttl ? { expirationTtl: ttl } : undefined);
const getState = (env, chatId) => kvGet(env, `s:${chatId}`);
const saveState = (env, chatId, st) => kvPut(env, `s:${chatId}`, st, STATE_TTL);
const clearState = (env, chatId) => env.STATE.delete(`s:${chatId}`);
const mapKey = (chat, msgId) => `m:${chat}:${msgId}`;
const linkToClient = (env, adminChat, msgId, link) => kvPut(env, mapKey(adminChat, msgId), link, MAP_TTL);

async function nextId(env) {
  const n = (Number(await env.STATE.get("seq")) || 0) + 1;
  await env.STATE.put("seq", String(n));
  return n;
}

/* ------------------------------- Расчёт -------------------------------- */

function estimate(d) {
  let sum = 0;
  for (const s of CONFIG.services) if (d.svc.includes(s.key)) sum += s.price;
  sum += (d.spots || 0) * CONFIG.spotPrice;
  const total = sum && sum < CONFIG.minOrder ? CONFIG.minOrder : sum;
  return { sum, total, minApplied: sum > 0 && sum < CONFIG.minOrder };
}

function servicesText(d) {
  const list = CONFIG.services.filter((s) => d.svc.includes(s.key)).map((s) => s.label);
  if (d.spots) list.push(`точечные пятна × ${d.spots}`);
  if (d.svc.includes("help")) list.push("нужна подсказка");
  return list.join(", ") || "—";
}

function estimateText(d) {
  const e = estimate(d);
  if (!e.total) return "назовём после фото салона";
  let t = `от ${rub(e.total)} ₽`;
  if (e.minApplied) t += " (минимальный заказ с выездом)";
  if (d.zone === "lo") t += " + выезд в ЛО по договорённости";
  return t;
}

/* ------------------------------ Обновления ----------------------------- */

async function handleUpdate(update, env) {
  if (update.callback_query) return onCallback(update.callback_query, env);
  const msg = update.message;
  if (!msg || !msg.chat) return;

  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const command = text.startsWith("/") ? text.split(/[\s@]/)[0].toLowerCase() : "";

  if (command === "/id") {
    return send(env, chatId, `ID этого чата: <code>${chatId}</code>\nВпишите его в переменную ADMIN_CHAT_ID.`);
  }

  // Ваш рабочий чат: ответы клиентам
  if (isAdminChat(env, chatId)) {
    if (msg.reply_to_message) {
      const handled = await relayToClient(msg, env);
      if (handled || msg.chat.type !== "private") return;
    } else if (msg.chat.type !== "private") {
      return;
    }
  }
  if (msg.chat.type !== "private") return;

  if (command === "/start" || command === "/menu") {
    await clearState(env, chatId);
    return sendMenu(env, chatId, msg.from);
  }
  if (command === "/book") return startBooking(env, chatId, msg.from);
  if (command === "/prices") return sendPrices(env, chatId);
  if (command === "/faq") return sendFaq(env, chatId);
  if (command === "/contacts") return sendContacts(env, chatId);
  if (command === "/cancel") {
    await clearState(env, chatId);
    return send(env, chatId, "Запись отменена. Начать заново: /book", { reply_markup: { remove_keyboard: true } });
  }

  const st = await getState(env, chatId);
  if (st && st.step) return onStepInput(env, chatId, msg, st);

  return forwardClientMessage(env, msg);
}

/* --------------------------------- Меню -------------------------------- */

const MENU_KB = () => kb([
  [btn("Записаться", "m:book")],
  [btn("Цены", "m:prices"), btn("Условия выезда", "m:cond")],
  [btn("Вопросы", "m:faq"), btn("Контакты", "m:contacts")],
]);

function sendMenu(env, chatId, from) {
  const hi = from && from.first_name ? `${esc(from.first_name)}, здравствуйте!` : "Здравствуйте!";
  return send(env, chatId,
    `${hi}\n\n<b>${CONFIG.brand}</b> — ${esc(CONFIG.descriptor.toLowerCase())}.\n<i>${esc(CONFIG.slogan)}</i>\n\n` +
    "Приедем к вам, почистим салон и сфотографируем до и после. " +
    "Запись займёт пару минут: выберите услуги и расскажите про машину — назовём цену и время.",
    { reply_markup: MENU_KB() });
}

function sendPrices(env, chatId) {
  const rows = CONFIG.services.map((s) => `${s.label} — <b>от ${rub(s.price)} ₽</b>`);
  rows.push(`Точечное пятно — <b>от ${rub(CONFIG.spotPrice)} ₽</b>`);
  return send(env, chatId,
    "<b>Цены</b>\nЦены «от»: точную назовём по марке авто и фото салона.\n\n" + rows.join("\n") +
    "\n\nКомплексная химчистка: сухая уборка, ткань и ковролин экстрактором, пластик, стёкла изнутри, сушка, фото до и после.\n\n" +
    `Выезд по СПб входит в заказ от ${rub(CONFIG.minOrder)} ₽. В Ленинградскую область — по договорённости.`,
    { reply_markup: kb([[btn("Записаться", "m:book")], [btn("‹ Меню", "m:menu")]]) });
}

function sendConditions(env, chatId) {
  return send(env, chatId,
    "<b>Условия выезда</b>\nПодтверждаем их с вами до визита.\n\n" +
    "• <b>Место:</b> паркинг, гараж или бокс. На улице осенью и зимой салон не высохнет, при минусе работать нельзя.\n" +
    "• <b>Розетка 220 В</b> рядом с машиной. Удлинитель привезём.\n" +
    "• <b>Вода:</b> 8–10 л тёплой. Нет — привезём две канистры по 10 л.\n" +
    "• <b>Пустой салон:</b> личные вещи, детское кресло и мусор убраны.\n\n" +
    "Мойку кузова не предлагаем: во дворах она часто запрещена.",
    { reply_markup: kb([[btn("Записаться", "m:book")], [btn("‹ Меню", "m:menu")]]) });
}

function sendFaq(env, chatId) {
  const rows = FAQ.map(([q], i) => [btn(q, `f:${i}`)]);
  rows.push([btn("‹ Меню", "m:menu")]);
  return send(env, chatId, "<b>Частые вопросы</b>\nВыберите вопрос:", { reply_markup: kb(rows) });
}

function sendContacts(env, chatId) {
  return send(env, chatId,
    `<b>${CONFIG.brand}</b>\nТелефон: ${esc(CONFIG.phone)}\n${esc(CONFIG.hours)}\n` +
    "Зона выезда: Санкт-Петербург и Ленинградская область.\n\n" +
    "Можно написать вопрос прямо сюда — ответим в этом чате.",
    { reply_markup: kb([[{ text: "Сайт", url: siteUrl(env) + "/" }], [btn("Записаться", "m:book")], [btn("‹ Меню", "m:menu")]]) });
}

/* -------------------------------- Запись ------------------------------- */

function newBooking(from) {
  return {
    step: "svc",
    d: {
      svc: [], spots: 0, zone: "", car: "", district: "", place: "", power: "", when: "",
      photos: [], name: "", contact: "",
      user: { id: from?.id, first_name: from?.first_name || "", username: from?.username || "" },
    },
  };
}

async function startBooking(env, chatId, from) {
  const st = newBooking(from);
  await saveState(env, chatId, st);
  return askServices(env, chatId, st);
}

function servicesKeyboard(d) {
  const rows = CONFIG.services.map((s) => [btn(`${d.svc.includes(s.key) ? "☑" : "☐"} ${s.label} · от ${rub(s.price)} ₽`, `s:${s.key}`)]);
  rows.push([btn("−", "s:sp-"), btn(`Пятна: ${d.spots}`, "s:nop"), btn("+", "s:sp+")]);
  rows.push([btn(`${d.svc.includes("help") ? "☑" : "☐"} Не знаю, подскажите`, "s:help")]);
  rows.push([btn("Готово →", "s:ok")]);
  return kb(rows);
}

function servicesText2(d) {
  const e = estimate(d);
  return "<b>Что нужно салону?</b>\nОтметьте одну или несколько услуг. Точечные пятна — кнопками «−» и «+»." +
    (e.total ? `\n\nОриентир: <b>${estimateText(d)}</b>` : "");
}

function askServices(env, chatId, st) {
  return send(env, chatId, servicesText2(st.d), { reply_markup: servicesKeyboard(st.d) });
}

async function ask(env, chatId, st, step) {
  st.step = step;
  await saveState(env, chatId, st);
  const d = st.d;
  switch (step) {
    case "zone":
      return send(env, chatId, "<b>Где машина?</b>", { reply_markup: kb([[btn("Санкт-Петербург", "z:spb")], [btn("Ленинградская область", "z:lo")]]) });
    case "car":
      return send(env, chatId, "<b>Марка и модель авто?</b>\nНапример: Kia Rio 2017");
    case "district":
      return send(env, chatId, d.zone === "lo"
        ? "<b>Какой населённый пункт?</b>\nНапример: Мурино, Всеволожск"
        : "<b>Какой район?</b>\nНапример: Приморский");
    case "place":
      return send(env, chatId,
        "<b>Где будет стоять машина во время работы?</b>\nОсенью и зимой работаем только под крышей: на улице салон не высохнет.",
        { reply_markup: kb([[btn("Паркинг", "p:parking"), btn("Гараж", "p:garage"), btn("Бокс", "p:box")], [btn("Пока не знаю", "p:unknown")]]) });
    case "power":
      return send(env, chatId,
        "<b>Рядом есть розетка 220 В и тёплая вода?</b>\nВоды нужно 8–10 л. Если нет, привезём сами.",
        { reply_markup: kb([[btn(POWER.both, "r:both")], [btn(POWER.power, "r:power")], [btn(POWER.unknown, "r:unknown")]]) });
    case "when":
      return send(env, chatId, "<b>Когда удобно?</b>",
        { reply_markup: kb([[btn(WHEN.soon, "t:soon")], [btn(WHEN.weekdays, "t:weekdays"), btn(WHEN.weekend, "t:weekend")], [btn(WHEN.other, "t:other")]]) });
    case "when_text":
      return send(env, chatId, "Напишите удобные день и время. Например: суббота после 12:00");
    case "photos":
      return send(env, chatId,
        `<b>Пришлите 1–${MAX_PHOTOS} фото салона</b>\nСиденья, ковролин, пятна крупным планом. Так оценка будет точнее.`,
        { reply_markup: kb([[btn("Пропустить", "ph:ok")]]) });
    case "name": {
      const rows = d.user.first_name ? [[btn(d.user.first_name, "n:tg")]] : [];
      return send(env, chatId, "<b>Как к вам обращаться?</b>", rows.length ? { reply_markup: kb(rows) } : {});
    }
    case "contact": {
      const keyboard = [[{ text: "📱 Отправить мой номер", request_contact: true }]];
      if (d.user.username) keyboard.push([{ text: "Пишите мне в Telegram" }]);
      return send(env, chatId,
        "<b>Как с вами связаться?</b>\nНажмите кнопку, чтобы отправить номер, или напишите его сообщением.",
        { reply_markup: { keyboard, resize_keyboard: true, one_time_keyboard: true } });
    }
    case "confirm":
      await send(env, chatId, "Почти готово.", { reply_markup: { remove_keyboard: true } });
      return send(env, chatId, summaryText(env, d), {
        reply_markup: kb([[btn("✅ Отправить заявку", "x:send")], [btn("Начать заново", "x:restart"), btn("Отмена", "x:cancel")]]),
      });
  }
}

function summaryText(env, d) {
  return "<b>Проверьте заявку</b>\n\n" + requestLines(d).join("\n") +
    `\n\nОриентир: <b>${estimateText(d)}</b>\nТочную цену и время назовём после фото салона.` +
    `\n\nНажимая «Отправить заявку», вы даёте <a href="${siteUrl(env)}/privacy.html#consent">согласие на обработку персональных данных</a>.`;
}

function requestLines(d) {
  const zone = d.zone === "lo" ? "Ленинградская область" : "Санкт-Петербург";
  const lines = [
    `<b>Услуги:</b> ${esc(servicesText(d))}`,
    `<b>Авто:</b> ${esc(d.car)}`,
    `<b>Где:</b> ${esc(zone)}, ${esc(d.district)}`,
    `<b>Место:</b> ${esc(PLACES[d.place] || "—")} · ${esc(POWER[d.power] || "—")}`,
    `<b>Когда удобно:</b> ${esc(d.when || "—")}`,
    `<b>Фото салона:</b> ${d.photos.length ? d.photos.length + " шт." : "нет"}`,
    `<b>Имя:</b> ${esc(d.name)}`,
    `<b>Связь:</b> ${esc(d.contact)}`,
  ];
  return lines;
}

const PHONE_RE = /^[\d\s()+\-]{10,20}$/;
function normalizeContact(v) {
  v = (v || "").trim();
  if (/^(@|https?:\/\/t\.me\/|t\.me\/)[A-Za-z0-9_]{4,}$/i.test(v)) return "@" + v.replace(/^.*[@/]/, "");
  if (PHONE_RE.test(v)) {
    let d = v.replace(/\D/g, "");
    if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
    if (d.length === 10) return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
    if (d.length >= 10 && d.length <= 13) return "+" + d;
  }
  return "";
}

async function onStepInput(env, chatId, msg, st) {
  const d = st.d;
  const text = (msg.text || "").trim();

  switch (st.step) {
    case "car":
      if (text.length < 2) return send(env, chatId, "Напишите марку и модель текстом, например: Kia Rio 2017");
      d.car = text.slice(0, 120);
      return ask(env, chatId, st, "district");
    case "district":
      if (text.length < 2) return send(env, chatId, "Напишите район или населённый пункт текстом.");
      d.district = text.slice(0, 120);
      return ask(env, chatId, st, "place");
    case "when_text":
      if (text.length < 2) return send(env, chatId, "Напишите удобные день и время текстом.");
      d.when = text.slice(0, 160);
      return ask(env, chatId, st, "photos");
    case "photos": {
      if (msg.photo && msg.photo.length) {
        if (d.photos.length >= MAX_PHOTOS) return;
        d.photos.push(msg.photo[msg.photo.length - 1].file_id);
        await saveState(env, chatId, st);
        if (msg.media_group_id && st.lastGroup === msg.media_group_id) return;
        st.lastGroup = msg.media_group_id || "";
        await saveState(env, chatId, st);
        return send(env, chatId, d.photos.length >= MAX_PHOTOS
          ? `Фото получены (${d.photos.length}).`
          : "Фото получено. Можно прислать ещё или продолжить.",
          { reply_markup: kb([[btn("Продолжить →", "ph:ok")]]) });
      }
      if (/^(готово|далее|пропустить|нет)$/i.test(text)) return ask(env, chatId, st, "name");
      return send(env, chatId, "Пришлите фото салона или нажмите «Продолжить».", { reply_markup: kb([[btn("Продолжить →", "ph:ok")]]) });
    }
    case "name":
      if (text.length < 2) return send(env, chatId, "Напишите, как к вам обращаться.");
      d.name = text.slice(0, 60);
      return ask(env, chatId, st, "contact");
    case "contact": {
      let contact = "";
      if (msg.contact && msg.contact.phone_number) contact = normalizeContact(msg.contact.phone_number) || msg.contact.phone_number;
      else if (text === "Пишите мне в Telegram" && d.user.username) contact = "@" + d.user.username;
      else contact = normalizeContact(text);
      if (!contact) return send(env, chatId, "Не похоже на номер. Напишите телефон, например +7 900 123-45-67, или ник в Telegram через @.");
      d.contact = contact;
      return ask(env, chatId, st, "confirm");
    }
    default:
      return send(env, chatId, "Выберите вариант кнопкой выше. Начать заново: /book, отменить: /cancel");
  }
}

/* ------------------------------- Кнопки -------------------------------- */

async function onCallback(cq, env) {
  const data = cq.data || "";
  const msg = cq.message;
  const chatId = msg && msg.chat && msg.chat.id;
  const answer = (text, alert) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: !!alert });

  if (data.startsWith("a:")) {
    if (!isAdminChat(env, chatId)) return answer("Только для администраторов", true);
    return adminAction(env, cq, answer);
  }
  if (data.startsWith("m:")) {
    await answer();
    const what = data.slice(2);
    if (what === "book") return startBooking(env, chatId, cq.from);
    if (what === "prices") return sendPrices(env, chatId);
    if (what === "cond") return sendConditions(env, chatId);
    if (what === "faq") return sendFaq(env, chatId);
    if (what === "contacts") return sendContacts(env, chatId);
    return sendMenu(env, chatId, cq.from);
  }
  if (data.startsWith("f:")) {
    await answer();
    const item = FAQ[Number(data.slice(2))];
    if (!item) return;
    return send(env, chatId, `<b>${esc(item[0])}</b>\n\n${item[1]}`,
      { reply_markup: kb([[btn("Записаться", "m:book")], [btn("‹ Все вопросы", "m:faq")]]) });
  }

  const st = await getState(env, chatId);
  if (!st) return answer("Эта кнопка устарела. Начните запись заново: /book", true);
  const d = st.d;
  const choose = (label) => tg(env, "editMessageText", {
    chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML",
    text: `${esc(msg.text || "")}\n\n<b>✓ ${esc(label)}</b>`,
  });

  const [kind, value] = data.split(":");

  if (kind === "s") {
    if (st.step !== "svc") return answer("Услуги уже выбраны. Начать заново: /book", true);
    if (value === "nop") return answer();
    if (value === "ok") {
      if (!d.svc.length && !d.spots) return answer("Отметьте хотя бы одну услугу или «Не знаю, подскажите»", true);
      await answer();
      await tg(env, "editMessageText", {
        chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML",
        text: `<b>Услуги:</b> ${esc(servicesText(d))}\nОриентир: <b>${estimateText(d)}</b>`,
      });
      return ask(env, chatId, st, "zone");
    }
    if (value === "sp+") d.spots = Math.min(10, d.spots + 1);
    else if (value === "sp-") d.spots = Math.max(0, d.spots - 1);
    else if (SERVICE_LABELS[value]) d.svc = d.svc.includes(value) ? d.svc.filter((k) => k !== value) : [...d.svc, value];
    await saveState(env, chatId, st);
    await answer();
    return tg(env, "editMessageText", {
      chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML",
      text: servicesText2(d), reply_markup: servicesKeyboard(d),
    });
  }

  const expected = { z: "zone", p: "place", r: "power", t: "when", ph: "photos", n: "name", x: "confirm" }[kind];
  if (!expected || st.step !== expected) return answer("Эта кнопка уже не активна", false);
  await answer();

  if (kind === "z") {
    d.zone = value === "lo" ? "lo" : "spb";
    await choose(d.zone === "lo" ? "Ленинградская область" : "Санкт-Петербург");
    if (d.zone === "lo") await send(env, chatId, "Выезд в Ленинградскую область — по договорённости. Назовём стоимость, когда узнаем адрес.");
    return ask(env, chatId, st, "car");
  }
  if (kind === "p") {
    d.place = PLACES[value] ? value : "unknown";
    await choose(PLACES[d.place]);
    return ask(env, chatId, st, "power");
  }
  if (kind === "r") {
    d.power = POWER[value] ? value : "unknown";
    await choose(POWER[d.power]);
    return ask(env, chatId, st, "when");
  }
  if (kind === "t") {
    if (value === "other") {
      await choose(WHEN.other);
      return ask(env, chatId, st, "when_text");
    }
    d.when = WHEN[value] || "";
    await choose(d.when);
    return ask(env, chatId, st, "photos");
  }
  if (kind === "ph") return ask(env, chatId, st, "name");
  if (kind === "n") {
    d.name = d.user.first_name || "";
    await choose(d.name);
    return ask(env, chatId, st, "contact");
  }
  if (kind === "x") {
    if (value === "cancel") {
      await clearState(env, chatId);
      await choose("Отменено");
      return send(env, chatId, "Запись отменена. Если передумаете: /book");
    }
    if (value === "restart") {
      await choose("Начинаем заново");
      return startBooking(env, chatId, cq.from);
    }
    if (value === "send") {
      await clearState(env, chatId);
      const id = await nextId(env);
      await tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: msg.message_id, reply_markup: kb([]) });
      const delivered = await deliverToAdmins(env, id, d, chatId);
      await kvPut(env, `r:${id}`, { id, chatId, name: d.name, status: "new" }, MAP_TTL);
      if (!delivered) console.error("заявка не доставлена: проверьте ADMIN_CHAT_ID");
      return send(env, chatId,
        `<b>Заявка №${id} отправлена.</b>\nСвяжемся с вами, уточним детали и назовём цену и время.\n\n` +
        "Если появятся вопросы или фото, пишите прямо сюда.",
        { reply_markup: MENU_KB() });
    }
  }
}

/* ------------------------- Ваш чат: заявки и ответы -------------------- */

function adminKeyboard(id, status) {
  if (status === "done" || status === "no") return kb([]);
  const rows = [];
  if (status !== "ok") rows.push([btn("✅ Принять", `a:ok:${id}`), btn("✖ Отказ", `a:no:${id}`)]);
  rows.push([btn("✔ Выполнена, попросить отзыв", `a:done:${id}`)]);
  return kb(rows);
}

async function deliverToAdmins(env, id, d, clientChatId) {
  const who = d.user.username ? `@${esc(d.user.username)}` : `<a href="tg://user?id=${d.user.id}">${esc(d.user.first_name || "профиль")}</a>`;
  const text = `🆕 <b>Заявка №${id}</b> · из Telegram-бота\n\n` + requestLines(d).join("\n") +
    `\n<b>Ориентир:</b> ${estimateText(d)}\n<b>Клиент:</b> ${who}\n\n` +
    "<i>Ответьте на это сообщение (reply), и бот перешлёт ответ клиенту.</i>";
  let ok = false;
  for (const chat of adminChats(env)) {
    const res = await send(env, chat, text, { reply_markup: adminKeyboard(id, "new") });
    if (!res.ok) continue;
    ok = true;
    const cardId = res.result.message_id;
    await linkToClient(env, chat, cardId, { chatId: clientChatId, id });
    if (d.photos.length === 1) {
      const p = await tg(env, "sendPhoto", { chat_id: chat, photo: d.photos[0], caption: `Фото к заявке №${id}`, reply_to_message_id: cardId });
      if (p.ok) await linkToClient(env, chat, p.result.message_id, { chatId: clientChatId, id });
    } else if (d.photos.length > 1) {
      const media = d.photos.map((fileId, i) => ({ type: "photo", media: fileId, ...(i === 0 ? { caption: `Фото к заявке №${id}` } : {}) }));
      await tg(env, "sendMediaGroup", { chat_id: chat, media, reply_to_message_id: cardId });
    }
  }
  return ok;
}

async function adminAction(env, cq, answer) {
  const [, action, idStr] = (cq.data || "").split(":");
  const id = Number(idStr);
  const req = await kvGet(env, `r:${id}`);
  const msg = cq.message;
  const by = esc(cq.from.first_name || "администратор");
  const labels = { ok: "✅ Принята", no: "✖ Отказ", done: "✔ Выполнена" };
  if (!labels[action]) return answer();

  await tg(env, "editMessageText", {
    chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: "HTML",
    text: `${esc(msg.text || "")}\n\n<b>${labels[action]}</b> — ${by}`,
    reply_markup: adminKeyboard(id, action),
    link_preview_options: { is_disabled: true },
  });

  if (!req || !req.chatId) return answer("Статус обновлён. Клиент не найден: заявка с сайта или старше 30 дней.", true);
  req.status = action;
  await kvPut(env, `r:${id}`, req, MAP_TTL);
  await answer("Готово, клиенту отправлено уведомление");

  if (action === "ok") {
    return send(env, req.chatId, `✅ <b>Заявка №${id} принята.</b>\nМы свяжемся с вами, чтобы согласовать время и условия на месте.`);
  }
  if (action === "no") {
    return send(env, req.chatId, `К сожалению, по заявке №${id} не сможем приехать. Если хотите обсудить другие варианты, напишите сюда.`);
  }
  const reviewUrl = env.REVIEW_URL || CONFIG.reviewUrl;
  return send(env, req.chatId,
    `Спасибо, что выбрали ${CONFIG.brand}! Если всё понравилось, оставьте, пожалуйста, отзыв.` +
    (reviewUrl ? "" : " Можно просто ответить сюда парой слов."),
    reviewUrl ? { reply_markup: kb([[{ text: "Оставить отзыв", url: reviewUrl }]]) } : {});
}

async function relayToClient(msg, env) {
  const link = await kvGet(env, mapKey(msg.chat.id, msg.reply_to_message.message_id));
  if (!link || !link.chatId) return false;
  let res;
  if (msg.text) {
    res = await send(env, link.chatId, `<b>${CONFIG.brand}:</b>\n${esc(msg.text)}`);
  } else {
    res = await tg(env, "copyMessage", { chat_id: link.chatId, from_chat_id: msg.chat.id, message_id: msg.message_id });
  }
  await tg(env, "sendMessage", {
    chat_id: msg.chat.id, reply_to_message_id: msg.message_id, disable_notification: true,
    text: res.ok ? "Отправлено клиенту ✓" : "Не удалось отправить: возможно, клиент остановил бота.",
  });
  return true;
}

async function forwardClientMessage(env, msg) {
  const from = msg.from || {};
  const who = from.username ? `@${esc(from.username)}` : `<a href="tg://user?id=${from.id}">${esc(from.first_name || "клиент")}</a>`;
  for (const chat of adminChats(env)) {
    const head = await send(env, chat, `💬 Сообщение от ${esc(from.first_name || "клиента")} (${who}).\n<i>Ответьте (reply), чтобы написать клиенту.</i>`);
    if (head.ok) await linkToClient(env, chat, head.result.message_id, { chatId: msg.chat.id });
    const copy = await tg(env, "copyMessage", { chat_id: chat, from_chat_id: msg.chat.id, message_id: msg.message_id });
    if (copy.ok) await linkToClient(env, chat, copy.result.message_id, { chatId: msg.chat.id });
  }
  const ackKey = `ack:${msg.chat.id}`;
  if (await env.STATE.get(ackKey)) return;
  await env.STATE.put(ackKey, "1", { expirationTtl: 1800 });
  return send(env, msg.chat.id, "Передали ваше сообщение, ответим здесь же. Записаться: /book", { reply_markup: MENU_KB() });
}

/* ---------------------------- Заявки с сайта --------------------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function withCors(env, res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN || "*");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Accept");
  h.set("Vary", "Origin");
  return new Response(res.body, { status: res.status, headers: h });
}

async function handleSiteForm(request, env) {
  let fd;
  try { fd = await request.formData(); } catch { return json({ ok: false, error: "bad_request" }, 400); }
  if (String(fd.get("website") || "").trim()) return json({ ok: true });

  const get = (k, max = 300) => String(fd.get(k) || "").trim().slice(0, max);
  const name = get("name", 60), contact = get("contact", 80), car = get("car", 120), district = get("district", 120);
  if (!name || !contact || !car || !district) return json({ ok: false, error: "missing_fields" }, 422);
  if (fd.get("consent") !== "yes") return json({ ok: false, error: "no_consent" }, 422);

  const services = fd.getAll("services").map((k) => SERVICE_LABELS[String(k)]).filter(Boolean);
  const photos = fd.getAll("photos")
    .filter((f) => f && typeof f === "object" && f.size > 0 && f.size <= 10 * 1024 * 1024 && String(f.type).startsWith("image/"))
    .slice(0, 6);
  const id = await nextId(env);

  const text = `🌐 <b>Заявка №${id}</b> · с сайта\n\n` + [
    `<b>Услуги:</b> ${esc(services.join(", ") || "—")}`,
    `<b>Авто:</b> ${esc(car)}`,
    `<b>Район:</b> ${esc(district)}`,
    `<b>Когда удобно:</b> ${esc(get("when", 160) || "—")}`,
    `<b>Комментарий:</b> ${esc(get("comment", 1000) || "—")}`,
    `<b>Имя:</b> ${esc(name)}`,
    `<b>Связь:</b> ${esc(contact)}`,
    `<b>Фото:</b> ${photos.length ? photos.length + " шт." : "нет"}`,
  ].join("\n") + "\n\n<i>Клиент оставил заявку на сайте: свяжитесь с ним по телефону или в мессенджере.</i>";

  let delivered = false;
  for (const chat of adminChats(env)) {
    const res = await send(env, chat, text, { reply_markup: adminKeyboard(id, "new") });
    if (!res.ok) continue;
    delivered = true;
    if (!photos.length) continue;
    const form = new FormData();
    form.append("chat_id", String(chat));
    form.append("reply_to_message_id", String(res.result.message_id));
    if (photos.length === 1) {
      form.append("photo", photos[0], photos[0].name || "photo.jpg");
      form.append("caption", `Фото к заявке №${id}`);
      await tg(env, "sendPhoto", form);
    } else {
      form.append("media", JSON.stringify(photos.map((_, i) => ({ type: "photo", media: `attach://p${i}`, ...(i === 0 ? { caption: `Фото к заявке №${id}` } : {}) }))));
      photos.forEach((f, i) => form.append(`p${i}`, f, f.name || `photo${i}.jpg`));
      await tg(env, "sendMediaGroup", form);
    }
  }
  if (!delivered) return json({ ok: false, error: "delivery_failed" }, 502);
  return json({ ok: true, id });
}

/* ------------------------------ Настройка ------------------------------ */

async function setup(url, env) {
  const out = [];
  const say = (s) => out.push(s);
  const done = () => new Response(out.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });

  if (!env.BOT_TOKEN) { say("✖ Не задан BOT_TOKEN (секрет с токеном от @BotFather)."); return done(); }
  if (!env.WEBHOOK_SECRET) { say("✖ Не задан WEBHOOK_SECRET (секрет: придумайте длинный пароль из букв и цифр)."); return done(); }
  if (url.searchParams.get("key") !== env.WEBHOOK_SECRET) { say("✖ Откройте адрес вида /setup?key=ВАШ_WEBHOOK_SECRET"); return done(); }
  if (!env.STATE) { say("✖ Не подключено хранилище KV с именем STATE."); return done(); }

  const me = await tg(env, "getMe", {});
  say(me.ok ? `✓ Бот: @${me.result.username}` : `✖ Токен не подходит: ${me.description}`);
  if (!me.ok) return done();

  const hook = await tg(env, "setWebhook", {
    url: `${url.origin}/webhook`,
    secret_token: env.WEBHOOK_SECRET,
    max_connections: 1,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  say(hook.ok ? `✓ Вебхук: ${url.origin}/webhook` : `✖ Вебхук: ${hook.description}`);

  const cmds = await tg(env, "setMyCommands", {
    commands: [
      { command: "start", description: "Главное меню" },
      { command: "book", description: "Записаться" },
      { command: "prices", description: "Цены" },
      { command: "faq", description: "Частые вопросы" },
      { command: "contacts", description: "Контакты" },
      { command: "cancel", description: "Отменить запись" },
    ],
  });
  say(cmds.ok ? "✓ Команды меню" : `✖ Команды: ${cmds.description}`);

  await tg(env, "setMyShortDescription", { short_description: `${CONFIG.brand}: химчистка салона на выезд, СПб и ЛО` });
  await tg(env, "setMyDescription", {
    description: `${CONFIG.brand}\n${CONFIG.slogan}\n\nЗапись на выездную химчистку и детейлинг салона в СПб и ЛО. Фото до и после по каждому заказу.`,
  });
  say("✓ Описание бота");

  const admins = adminChats(env);
  if (!admins.length) {
    say("! ADMIN_CHAT_ID не задан: напишите боту /id, впишите число в ADMIN_CHAT_ID и откройте эту страницу ещё раз.");
  } else {
    for (const chat of admins) {
      const r = await send(env, chat, "✓ Бот подключён. Сюда будут приходить заявки.");
      say(r.ok ? `✓ Чат для заявок ${chat}` : `✖ Чат ${chat}: ${r.description}. Напишите боту /start из этого чата и повторите.`);
    }
  }
  return done();
}

export { handleUpdate, handleSiteForm, estimate, normalizeContact, CONFIG };
