/* Zero KM Detailing — интерактив сайта. Без библиотек. */
(function () {
  "use strict";

  var CFG = window.ZKM || {};
  var PRICES = CFG.prices || {};
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var NBSP = " ";

  function rub(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  function store(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  function storeGet(kind, key) {
    try { var s = store(kind); return s ? s.getItem(key) : null; } catch (e) { return null; }
  }
  function storeSet(kind, key, val) {
    try { var s = store(kind); if (s) s.setItem(key, val); } catch (e) { /* хранилище недоступно */ }
  }
  function storeDel(kind, key) {
    try { var s = store(kind); if (s) s.removeItem(key); } catch (e) { /* хранилище недоступно */ }
  }
  function goal(name) {
    if (!name || !CFG.metrika || typeof window.ym !== "function") return;
    try { window.ym(Number(CFG.metrika), "reachGoal", name); } catch (e) { /* счётчик не загружен */ }
  }
  var tgUrl = CFG.telegram ? "https://t.me/" + CFG.telegram : "";
  function waUrl(text) {
    if (!CFG.whatsapp) return "";
    return "https://wa.me/" + CFG.whatsapp + (text ? "?text=" + encodeURIComponent(text) : "");
  }

  /* ---------- Уведомление ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-visible"); }, 3600);
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || "Скопировано"); };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) done(); else toast("Не получилось скопировать. Выделите текст вручную.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- Шапка ---------- */
  var header = $("[data-header]");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 12); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Мобильное меню ---------- */
  var menu = $("[data-menu]");
  var burger = $("[data-menu-open]");
  if (menu && burger) {
    var lastFocus = null;
    var openMenu = function () {
      lastFocus = document.activeElement;
      menu.hidden = false;
      menu.classList.add("is-open");
      document.body.classList.add("menu-open");
      burger.setAttribute("aria-expanded", "true");
      var first = $(".mmenu__nav a", menu);
      if (first) first.focus({ preventScroll: true });
    };
    var closeMenu = function () {
      menu.classList.remove("is-open");
      menu.hidden = true;
      document.body.classList.remove("menu-open");
      burger.setAttribute("aria-expanded", "false");
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };
    burger.addEventListener("click", openMenu);
    $$("[data-menu-close]", menu).forEach(function (el) { el.addEventListener("click", closeMenu); });
    menu.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeMenu(); return; }
      if (e.key !== "Tab") return;
      var f = $$("a[href], button:not([disabled])", menu).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth >= 1200 && !menu.hidden) closeMenu();
    });
  }

  /* ---------- Одометр ---------- */
  function odoSet(el, value, animate, baseDur) {
    var reels = $$(".odo__reel", el);
    var digits = String(value).padStart(reels.length, "0").slice(-reels.length);
    reels.forEach(function (reel, i) {
      if (!animate) {
        reel.style.transition = "none";
      } else {
        reel.style.transition = "";
        reel.style.setProperty("--dur", ((baseDur || 1.5) + (reels.length - 1 - i) * 0.14).toFixed(2) + "s");
      }
      reel.parentNode.style.setProperty("--d", digits.charAt(i));
    });
  }
  function odoRoll(el, delay, dur) {
    var start = el.getAttribute("data-start");
    var final = el.getAttribute("data-final") || "0";
    if (!start || reduced) return;
    odoSet(el, start, false);
    void el.offsetWidth;
    setTimeout(function () { odoSet(el, final, true, dur); }, delay || 0);
  }

  /* ---------- Прибор на главной: стрелка уходит до упора и возвращается к нулю ---------- */
  var gaugeEl = $("[data-gauge]");
  if (gaugeEl) {
    var needle = $(".g-needle", gaugeEl);
    var prog = $(".g-progress", gaugeEl);
    var ticks = $$(".g-tick", gaugeEl);
    var odoHero = $("[data-odo]", gaugeEl);
    var VMAX = 240;
    var setG = function (v) {
      needle.setAttribute("transform", "rotate(" + (135 + 270 * v / VMAX).toFixed(2) + " 220 220)");
      prog.style.strokeDashoffset = String(1 - v / VMAX);
      for (var i = 0; i < ticks.length; i++) {
        var tv = +ticks[i].getAttribute("data-v");
        ticks[i].classList.toggle("is-lit", v > 0.6 && tv <= v + 0.01);
      }
    };
    var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
    var easeInOut = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    var run = function () {
      if (reduced) { setG(0); return; }
      if (odoHero) odoSet(odoHero, odoHero.getAttribute("data-start") || "0", false);
      var phases = [
        { from: 0, to: VMAX, ms: 950, ease: easeOut },
        { from: VMAX, to: VMAX, ms: 220, ease: easeOut },
        { from: VMAX, to: 0, ms: 1500, ease: easeInOut }
      ];
      var idx = 0, t0 = null;
      var frame = function (ts) {
        if (t0 === null) {
          t0 = ts;
          if (idx === 2 && odoHero) odoSet(odoHero, "0", true, 1.35);
        }
        var p = phases[idx];
        var k = Math.min(1, (ts - t0) / p.ms);
        setG(p.from + (p.to - p.from) * p.ease(k));
        if (k >= 1) { idx++; t0 = null; if (idx >= phases.length) { setG(0); return; } }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    };
    if (document.readyState === "complete") setTimeout(run, 250);
    else window.addEventListener("load", function () { setTimeout(run, 250); });
  }
  $$("[data-odo]").forEach(function (el) {
    if (gaugeEl && gaugeEl.contains(el)) return;
    odoRoll(el, 400, 1.6);
  });

  /* ---------- До / после ---------- */
  $$("[data-ba]").forEach(function (ba) {
    var range = $(".ba__range", ba);
    var pos = 50;
    var set = function (p) {
      pos = Math.max(0, Math.min(100, p));
      ba.style.setProperty("--pos", pos.toFixed(2) + "%");
      if (range) range.value = String(Math.round(pos));
    };
    var pct = function (e) {
      var r = ba.getBoundingClientRect();
      return (e.clientX - r.left) / r.width * 100;
    };
    var state = null;
    ba.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      state = { id: e.pointerId, x: e.clientX, y: e.clientY, active: e.pointerType === "mouse" };
      if (state.active) {
        ba.setPointerCapture(e.pointerId);
        ba.classList.add("is-dragging");
        set(pct(e));
        e.preventDefault();
      }
    });
    ba.addEventListener("pointermove", function (e) {
      if (!state || e.pointerId !== state.id) return;
      if (!state.active) {
        var dx = Math.abs(e.clientX - state.x), dy = Math.abs(e.clientY - state.y);
        if (dx > 6 && dx > dy) {
          state.active = true;
          try { ba.setPointerCapture(e.pointerId); } catch (err) { /* ок */ }
          ba.classList.add("is-dragging");
        } else if (dy > 8) { state = null; return; }
      }
      if (state && state.active) set(pct(e));
    });
    var end = function (e) {
      if (state && !state.active && e.type === "pointerup") set(pct(e));
      state = null;
      ba.classList.remove("is-dragging");
    };
    ba.addEventListener("pointerup", end);
    ba.addEventListener("pointercancel", end);
    if (range) range.addEventListener("input", function () { set(+range.value); });

    /* Подсказка при первом появлении: шторка слегка качается */
    if (!reduced && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.disconnect();
          var keys = [50, 32, 68, 50], i = 0, t0 = null, seg = 520;
          var step = function (ts) {
            if (state) return;
            if (t0 === null) t0 = ts;
            var k = Math.min(1, (ts - t0) / seg);
            var e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            set(keys[i] + (keys[i + 1] - keys[i]) * e);
            if (k >= 1) { i++; t0 = null; if (i >= keys.length - 1) return; }
            requestAnimationFrame(step);
          };
          setTimeout(function () { requestAnimationFrame(step); }, 300);
        });
      }, { threshold: .6 });
      io.observe(ba);
    }
  });

  /* ---------- Калькулятор ---------- */
  var SERVICE_NAMES = {
    complex: "Комплексная химчистка салона",
    leather: "Чистка кожи",
    ceiling: "Потолок",
    odor: "Нейтрализация запаха",
    spot: "Точечное пятно"
  };
  var calc = $("[data-calc]");
  if (calc) {
    var totalEl = $("[data-calc-total]", calc);
    var linesEl = $("[data-calc-lines]", calc);
    var notesEl = $("[data-calc-notes]", calc);
    var spotsOut = $("[data-spots]", calc);
    var spots = 0;
    var shown = 0;
    var tween = null;
    var state = {};

    var animateTotal = function (to) {
      if (reduced) { totalEl.textContent = to ? rub(to) : "—"; shown = to; return; }
      var from = shown, t0 = null;
      cancelAnimationFrame(tween);
      var step = function (ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / 380);
        var v = from + (to - from) * (1 - Math.pow(1 - k, 3));
        totalEl.textContent = to || k < 1 ? rub(v) : "—";
        if (k < 1) tween = requestAnimationFrame(step); else shown = to;
      };
      tween = requestAnimationFrame(step);
    };

    var note = function (icon, html, warn) {
      return '<p' + (warn ? ' class="is-warn"' : "") + '><svg class="icon" aria-hidden="true"><use href="#i-' + icon + '"></use></svg><span>' + html + "</span></p>";
    };

    var recalc = function () {
      var picked = $$('input[name="svc"]:checked', calc).map(function (i) { return i.value; });
      var zone = ($('input[name="zone"]:checked', calc) || {}).value || "spb";
      var sum = 0, lines = [];
      picked.forEach(function (k) {
        sum += PRICES[k] || 0;
        lines.push("<li><span>" + SERVICE_NAMES[k] + "</span><b>от " + rub(PRICES[k] || 0) + NBSP + "₽</b></li>");
      });
      if (spots > 0) {
        sum += spots * (PRICES.spot || 0);
        lines.push("<li><span>Точечные пятна × " + spots + "</span><b>от " + rub(spots * (PRICES.spot || 0)) + NBSP + "₽</b></li>");
      }
      var min = PRICES.min_order || 0;
      var total = sum && sum < min ? min : sum;
      var notes = [];
      if (!sum) {
        lines = ['<li class="is-empty"><span>Выберите хотя бы одну услугу</span></li>'];
      } else if (sum < min) {
        notes.push(note("info", "Минимальный заказ с выездом — " + rub(min) + NBSP + "₽: на каждый выезд мы привозим экстрактор, химию и сушку.", true));
      }
      if (sum) {
        notes.push(zone === "spb"
          ? note("check", "Выезд по Санкт-Петербургу входит в стоимость.")
          : note("route", "Выезд в Ленинградскую область — по договорённости. Назовём стоимость, когда узнаем адрес.", true));
      }
      notes.push(note("camera", "Это ориентир. Точную цену назовём по марке авто и фото салона."));
      linesEl.innerHTML = lines.join("");
      notesEl.innerHTML = notes.join("");
      animateTotal(total);
      state = { services: picked, spots: spots, zone: zone, total: total };
    };

    var summaryText = function () {
      var parts = state.services.map(function (k) { return SERVICE_NAMES[k]; });
      if (state.spots) parts.push("точечные пятна × " + state.spots);
      return "Здравствуйте! Хочу записаться на детейлинг салона.\n" +
        "Услуги: " + (parts.join(", ") || "—") + "\n" +
        "Где машина: " + (state.zone === "lo" ? "Ленинградская область" : "Санкт-Петербург") + "\n" +
        "Ориентир с сайта: от " + rub(state.total) + " ₽\n" +
        "Марка и модель авто: \nРайон: ";
    };

    calc.addEventListener("change", recalc);
    $$("[data-step]", calc).forEach(function (b) {
      b.addEventListener("click", function () {
        spots = Math.max(0, Math.min(10, spots + Number(b.getAttribute("data-step"))));
        spotsOut.textContent = String(spots);
        recalc();
      });
    });
    calc.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!state.total) { toast("Выберите хотя бы одну услугу"); return; }
      storeSet("sessionStorage", "zkm-calc", JSON.stringify(state));
      goal("calc_send");
      window.location.href = calc.getAttribute("data-next") || "contacts.html#form";
    });
    var waBtn = $("[data-calc-wa]", calc);
    if (waBtn) waBtn.addEventListener("click", function () {
      waBtn.href = waUrl(summaryText());
      goal("click_wa");
    });
    var tgBtn = $("[data-calc-tg]", calc);
    if (tgBtn) tgBtn.addEventListener("click", function () {
      copyText(summaryText(), "Расчёт скопирован: вставьте его в чат Telegram");
      goal("click_tg");
    });
    recalc();
  }

  /* ---------- Работы: фильтр ---------- */
  var worksGrid = $("[data-works]");
  if (worksGrid) {
    var chips = $$("[data-filter-salon]");
    var brandSel = $("[data-filter-brand]");
    var countEl = $("[data-works-count]");
    var emptyEl = $("[data-works-empty]");
    var cur = { salon: "", brand: "" };
    var apply = function () {
      var n = 0;
      $$(".work", worksGrid).forEach(function (w) {
        var ok = (!cur.salon || w.getAttribute("data-salon") === cur.salon) &&
                 (!cur.brand || w.getAttribute("data-brand") === cur.brand);
        w.hidden = !ok;
        if (ok) n++;
      });
      if (countEl) countEl.textContent = "Показано: " + n;
      if (emptyEl) emptyEl.classList.toggle("is-visible", n === 0);
    };
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        cur.salon = c.getAttribute("data-filter-salon");
        chips.forEach(function (x) {
          var on = x === c;
          x.classList.toggle("is-active", on);
          x.setAttribute("aria-pressed", on ? "true" : "false");
        });
        apply();
      });
    });
    if (brandSel) brandSel.addEventListener("change", function () { cur.brand = brandSel.value; apply(); });
    apply();
  }

  /* ---------- FAQ: открыть вопрос по ссылке ---------- */
  var openFromHash = function () {
    var id = decodeURIComponent((location.hash || "").slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (el && el.tagName === "DETAILS") el.open = true;
  };
  openFromHash();
  window.addEventListener("hashchange", openFromHash);

  /* ---------- Форма заявки ---------- */
  var form = $("[data-form]");
  if (form) {
    var started = Date.now();
    var done = $("[data-form-done]");
    var alertEl = $("[data-form-alert]", form);
    var fileInput = $('input[type="file"]', form);
    var thumbs = $("[data-thumbs]", form);
    var upload = $(".upload", form);
    var fileHint = $("[data-file-hint]", form);
    var files = [];
    var MAX_FILES = 6, MAX_MB = 10;

    /* Подставляем расчёт из калькулятора */
    var saved = storeGet("sessionStorage", "zkm-calc");
    if (saved) {
      try {
        var s = JSON.parse(saved);
        (s.services || []).forEach(function (k) {
          var box = $('input[name="services"][value="' + k + '"]', form);
          if (box) box.checked = true;
        });
        if (s.spots) {
          var spotBox = $('input[name="services"][value="spot"]', form);
          if (spotBox) spotBox.checked = true;
        }
        var cm = $('textarea[name="comment"]', form);
        if (cm && !cm.value) {
          var names = (s.services || []).map(function (k) { return SERVICE_NAMES[k]; });
          if (s.spots) names.push("точечные пятна × " + s.spots);
          cm.value = "Расчёт с сайта: " + names.join(", ") + "; " +
            (s.zone === "lo" ? "Ленинградская область" : "Санкт-Петербург") +
            "; ориентир от " + rub(s.total) + " ₽.";
        }
        var pre = $("[data-prefill-note]", form);
        if (pre) pre.hidden = false;
      } catch (e) { /* испорченные данные — пропускаем */ }
      storeDel("sessionStorage", "zkm-calc");
    }

    var fieldOf = function (input) { return input.closest(".field"); };
    var setInvalid = function (input, bad) {
      var f = fieldOf(input);
      if (!f) return;
      f.classList.toggle("is-invalid", bad);
      input.setAttribute("aria-invalid", bad ? "true" : "false");
    };
    var digits = function (v) { return (v || "").replace(/\D/g, ""); };
    var isContact = function (v) {
      v = (v || "").trim();
      if (/^(@|https?:\/\/t\.me\/|t\.me\/)[A-Za-z0-9_]{4,}$/i.test(v)) return true;
      if (/^[A-Za-z][A-Za-z0-9_]{4,}$/.test(v)) return true;
      var d = digits(v);
      return /^[\d\s()+\-]+$/.test(v) && d.length >= 10 && d.length <= 13;
    };
    var rules = {
      name: function (v) { return v.trim().length >= 2; },
      contact: isContact,
      car: function (v) { return v.trim().length >= 2; },
      district: function (v) { return v.trim().length >= 2; }
    };
    var validate = function () {
      var firstBad = null;
      Object.keys(rules).forEach(function (n) {
        var input = form.elements[n];
        if (!input) return;
        var bad = !rules[n](input.value);
        setInvalid(input, bad);
        if (bad && !firstBad) firstBad = input;
      });
      var consent = form.elements.consent;
      if (consent) {
        setInvalid(consent, !consent.checked);
        if (!consent.checked && !firstBad) firstBad = consent;
      }
      return firstBad;
    };
    $$(".input, input[name='consent']", form).forEach(function (input) {
      var ev = input.type === "checkbox" ? "change" : "input";
      input.addEventListener(ev, function () {
        if (fieldOf(input) && fieldOf(input).classList.contains("is-invalid")) {
          var ok = input.type === "checkbox" ? input.checked : (!rules[input.name] || rules[input.name](input.value));
          if (ok) setInvalid(input, false);
        }
      });
    });

    /* Аккуратный формат номера после ввода */
    var contactInput = form.elements.contact;
    if (contactInput) contactInput.addEventListener("blur", function () {
      var v = contactInput.value.trim();
      if (!/^[\d\s()+\-]+$/.test(v)) return;
      var d = digits(v);
      if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
      if (d.length === 10) {
        contactInput.value = "+7 (" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6, 8) + "-" + d.slice(8);
      }
    });

    /* Фото салона */
    var syncFiles = function () {
      if (!fileInput) return;
      try {
        var dt = new DataTransfer();
        files.forEach(function (f) { dt.items.add(f); });
        fileInput.files = dt.files;
      } catch (e) { /* старый браузер: оставляем как выбрано */ }
      thumbs.innerHTML = "";
      files.forEach(function (f, i) {
        var t = document.createElement("div");
        t.className = "thumb";
        var img = document.createElement("img");
        img.alt = "Фото салона " + (i + 1);
        img.src = URL.createObjectURL(f);
        img.onload = function () { URL.revokeObjectURL(img.src); };
        var rm = document.createElement("button");
        rm.type = "button";
        rm.setAttribute("aria-label", "Убрать фото " + (i + 1));
        rm.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg>';
        rm.addEventListener("click", function () { files.splice(i, 1); syncFiles(); });
        t.appendChild(img);
        t.appendChild(rm);
        thumbs.appendChild(t);
      });
    };
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var skipped = 0;
        Array.prototype.forEach.call(fileInput.files, function (f) {
          if (!/^image\//.test(f.type) || f.size > MAX_MB * 1024 * 1024 || files.length >= MAX_FILES) { skipped++; return; }
          if (files.some(function (x) { return x.name === f.name && x.size === f.size; })) return;
          files.push(f);
        });
        if (fileHint) fileHint.textContent = skipped
          ? "Часть файлов не добавлена: до " + MAX_FILES + " фото, до " + MAX_MB + " МБ каждое."
          : "До " + MAX_FILES + " фото, до " + MAX_MB + " МБ каждое.";
        syncFiles();
      });
      ["dragenter", "dragover"].forEach(function (ev) { upload.addEventListener(ev, function () { upload.classList.add("is-drag"); }); });
      ["dragleave", "drop"].forEach(function (ev) { upload.addEventListener(ev, function () { upload.classList.remove("is-drag"); }); });
    }

    var buildMessage = function () {
      var el = form.elements;
      var svc = $$('input[name="services"]:checked', form).map(function (i) { return i.getAttribute("data-label"); });
      var lines = [
        "Заявка с сайта Zero KM Detailing",
        "Имя: " + el.name.value.trim(),
        "Связь: " + el.contact.value.trim(),
        "Авто: " + el.car.value.trim(),
        "Район: " + el.district.value.trim(),
        "Что нужно: " + (svc.join(", ") || "подскажите"),
        "Удобное время: " + (el.when.value.trim() || "любое")
      ];
      if (el.comment && el.comment.value.trim()) lines.push("Комментарий: " + el.comment.value.trim());
      if (files.length) lines.push("Фото салона: пришлю в чат (" + files.length + " шт.)");
      return lines.join("\n");
    };

    var showDone = function (mode, text) {
      form.hidden = true;
      done.hidden = false;
      $$("[data-done]", done).forEach(function (el) { el.hidden = el.getAttribute("data-done") !== mode; });
      var pre = $("[data-done-text]", done);
      if (pre) pre.textContent = text || "";
      var wa = $("[data-done-wa]", done);
      if (wa) wa.href = waUrl(text);
      var tg = $("[data-done-tg]", done);
      if (tg) tg.href = tgUrl;
      done.setAttribute("tabindex", "-1");
      done.focus({ preventScroll: true });
      done.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (alertEl) alertEl.classList.remove("is-visible");
      var bad = validate();
      if (bad) {
        bad.focus();
        if (alertEl) { alertEl.textContent = "Проверьте отмеченные поля."; alertEl.classList.add("is-visible"); }
        return;
      }
      var text = buildMessage();
      var bot = (form.elements.website && form.elements.website.value) || Date.now() - started < 2500;
      if (bot) { showDone("sent"); return; }
      goal("form_submit");
      if (!CFG.formEndpoint) { showDone("manual", text); return; }

      var btn = $('button[type="submit"]', form);
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      var data = new FormData(form);
      data.delete("website");
      data.append("message", text);
      fetch(CFG.formEndpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); showDone("sent", text); })
        .catch(function () {
          if (alertEl) {
            alertEl.innerHTML = "Не удалось отправить заявку: нет связи с сервером. Напишите нам в мессенджер — текст заявки уже готов.";
            alertEl.classList.add("is-visible");
          }
          showDone("manual", text);
        })
        .then(function () { btn.classList.remove("is-loading"); btn.removeAttribute("aria-busy"); });
    });

    $$("[data-copy-request]", done).forEach(function (b) {
      b.addEventListener("click", function () { copyText($("[data-done-text]", done).textContent, "Текст заявки скопирован"); });
    });
    var doneTg = $("[data-done-tg]", done);
    if (doneTg) doneTg.addEventListener("click", function () {
      copyText($("[data-done-text]", done).textContent, "Заявка скопирована: вставьте её в чат Telegram");
    });
    var again = $("[data-form-again]", done);
    if (again) again.addEventListener("click", function () {
      done.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    });
  }

  /* ---------- Копирование контактов ---------- */
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () { copyText(b.getAttribute("data-copy"), "Скопировано: " + b.getAttribute("data-copy")); });
  });

  /* ---------- Цели Метрики ---------- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-goal]");
    if (a) goal(a.getAttribute("data-goal"));
  });

  /* ---------- Cookies ---------- */
  var cookie = $("[data-cookie]");
  if (cookie && !storeGet("localStorage", "zkm-cookie")) {
    cookie.hidden = false;
    $("[data-cookie-ok]", cookie).addEventListener("click", function () {
      storeSet("localStorage", "zkm-cookie", "1");
      cookie.hidden = true;
    });
  }
})();
