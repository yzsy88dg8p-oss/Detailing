// Прогон бота без Telegram: подменяем fetch и хранилище KV, шлём обновления и проверяем ответы.
// Запуск: node bot/test/simulate.mjs
import assert from "node:assert/strict";
import worker, { estimate, normalizeContact } from "../worker.js";

const calls = [];
let msgId = 100;
globalThis.fetch = async (url, init) => {
  const method = String(url).split("/").pop();
  const body = init.body instanceof FormData ? Object.fromEntries([...init.body.keys()].map((k) => [k, init.body.get(k)])) : JSON.parse(init.body);
  calls.push({ method, body });
  const result = method === "getMe" ? { username: "zerokm_test_bot" } : { message_id: ++msgId };
  return new Response(JSON.stringify({ ok: true, result }));
};

const kv = new Map();
const env = {
  BOT_TOKEN: "test", WEBHOOK_SECRET: "s3cret", ADMIN_CHAT_ID: "-1001", SITE_URL: "https://example.ru",
  STATE: {
    get: async (k) => kv.get(k) ?? null,
    put: async (k, v) => { kv.set(k, v); },
    delete: async (k) => { kv.delete(k); },
  },
};

const USER = { id: 555, first_name: "Анна", username: "anna_car" };
const ADMIN = { id: 777, first_name: "Мастер" };
let upd = 1;
const hook = (update) => worker.fetch(new Request("https://bot.example/webhook", {
  method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "s3cret" }, body: JSON.stringify({ update_id: upd++, ...update }),
}), env);
const text = (t, extra = {}) => hook({ message: { message_id: ++msgId, chat: { id: USER.id, type: "private" }, from: USER, text: t, ...extra } });
const press = (data, chatId = USER.id, from = USER, mtext = "вопрос") =>
  hook({ callback_query: { id: "cq" + upd, from, data, message: { message_id: 42, chat: { id: chatId, type: chatId < 0 ? "supergroup" : "private" }, text: mtext } } });
const last = (method, chat) => [...calls].reverse().find((c) => c.method === method && (chat === undefined || String(c.body.chat_id) === String(chat)));
const state = () => JSON.parse(kv.get(`s:${USER.id}`) || "null");

// Расчёт как на сайте
assert.equal(estimate({ svc: ["complex", "leather"], spots: 2 }).total, 11000);
assert.equal(estimate({ svc: [], spots: 1 }).total, 6000);
assert.equal(normalizeContact("89001234567"), "+7 (900) 123-45-67");
assert.equal(normalizeContact("@anna_car"), "@anna_car");
assert.equal(normalizeContact("привет"), "");

// Защита вебхука
let r = await worker.fetch(new Request("https://bot.example/webhook", { method: "POST", body: "{}" }), env);
assert.equal(r.status, 403);

// Меню и запись
await text("/start");
assert.match(last("sendMessage").body.text, /Zero KM Detailing/);
await press("m:book");
assert.equal(state().step, "svc");
await press("s:ok");
assert.equal(last("answerCallbackQuery").body.show_alert, true, "без услуг дальше не пускает");
await press("s:complex"); await press("s:leather"); await press("s:sp+"); await press("s:sp+");
assert.match(last("editMessageText").body.text, /11 000/);
await press("s:ok");
assert.equal(state().step, "zone");
await press("z:lo");
assert.equal(state().step, "car");
await text("Kia Rio 2017");
await text("Мурино");
assert.equal(state().step, "place");
await press("p:parking");
await press("r:power");
await press("t:other");
assert.equal(state().step, "when_text");
await text("суббота после 12");
assert.equal(state().step, "photos");
await hook({ message: { message_id: ++msgId, chat: { id: USER.id, type: "private" }, from: USER, photo: [{ file_id: "small" }, { file_id: "BIG1" }], media_group_id: "g1" } });
await hook({ message: { message_id: ++msgId, chat: { id: USER.id, type: "private" }, from: USER, photo: [{ file_id: "BIG2" }], media_group_id: "g1" } });
assert.deepEqual(state().d.photos, ["BIG1", "BIG2"]);
await press("ph:ok");
await press("n:tg");
assert.equal(state().d.name, "Анна");
await text("Пишите мне в Telegram");
assert.equal(state().d.contact, "@anna_car");
assert.equal(state().step, "confirm");
assert.match(last("sendMessage", USER.id).body.text, /Проверьте заявку[\s\S]*от 11 000 ₽ \+ выезд в ЛО/);
await press("x:send");
assert.equal(state(), null);
const card = calls.find((c) => c.method === "sendMessage" && c.body.chat_id === "-1001" && /Заявка №1/.test(c.body.text));
assert.ok(card, "заявка пришла в ваш чат");
assert.match(card.body.text, /Kia Rio 2017[\s\S]*Мурино[\s\S]*@anna_car/);
assert.ok(last("sendMediaGroup", "-1001"), "фото ушли альбомом");
assert.match(last("sendMessage", USER.id).body.text, /Заявка №1 отправлена/);
await press("x:send");
assert.match(last("answerCallbackQuery").body.text, /устарела/, "повторное нажатие не дублирует заявку");

// Админ принимает заявку
await press("a:ok:1", -1001, ADMIN, "🆕 Заявка №1");
assert.match(last("sendMessage", USER.id).body.text, /принята/);
await press("a:ok:1", USER.id, USER);
assert.equal(last("answerCallbackQuery").body.show_alert, true, "клиент не может нажимать админские кнопки");

// Ответ клиенту через reply
const cardKey = [...kv.keys()].find((k) => k.startsWith("m:-1001:"));
const repliedId = Number(cardKey.split(":")[2]);
await hook({ message: { message_id: ++msgId, chat: { id: -1001, type: "supergroup" }, from: ADMIN, text: "Будем в субботу в 12:00", reply_to_message: { message_id: repliedId } } });
assert.match(last("sendMessage", USER.id).body.text, /Будем в субботу/);

// Свободное сообщение клиента уходит в ваш чат
await text("А шерсть собаки уберёте?");
assert.ok(last("copyMessage", "-1001"));

// Заявка с сайта
const fd = new FormData();
for (const [k, v] of Object.entries({ name: "Олег", contact: "+7 (911) 111-22-33", car: "Skoda Octavia", district: "Приморский", when: "завтра", consent: "yes" })) fd.append(k, v);
fd.append("services", "complex"); fd.append("services", "odor");
fd.append("photos", new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" }));
r = await worker.fetch(new Request("https://bot.example/form", { method: "POST", body: fd }), env);
assert.equal(r.status, 200);
assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
assert.match(last("sendMessage", "-1001").body.text, /Заявка №2[\s\S]*Комплексная химчистка, Нейтрализация запаха/);
assert.ok(last("sendPhoto"), "фото с сайта отправлено");
const bad = new FormData(); bad.append("name", "x");
r = await worker.fetch(new Request("https://bot.example/form", { method: "POST", body: bad }), env);
assert.equal(r.status, 422);

// Страница настройки
r = await worker.fetch(new Request("https://bot.example/setup?key=s3cret"), env);
const setupText = await r.text();
assert.match(setupText, /Вебхук: https:\/\/bot\.example\/webhook/);
assert.equal(last("setWebhook").body.max_connections, 1);

console.log(`Все проверки пройдены. Вызовов Telegram API: ${calls.length}`);
