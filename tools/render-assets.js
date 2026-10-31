#!/usr/bin/env node
/* Генерация графики сайта: иконки, картинка для соцсетей, демо-фото «до / после».
   Запуск (нужен Playwright с Chromium):
     NODE_PATH=$(npm root -g) node tools/render-assets.js
   Результат пишется в src/static/. Реальные фото работ этим скриптом не трогаются. */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { W, H, scenes } = require("./scenes");

const ROOT = path.resolve(__dirname, "..");
const STATIC = path.join(ROOT, "src", "static");
const FONTS = path.join(STATIC, "assets", "fonts");
const only = process.argv.slice(2);

const fontCss = ["cyrillic", "latin", "latin-ext"].map(function (s) {
  const b64 = fs.readFileSync(path.join(FONTS, "manrope-" + s + ".woff2")).toString("base64");
  return "@font-face{font-family:Manrope;font-weight:200 800;src:url(data:font/woff2;base64," + b64 + ") format('woff2')}";
}).join("");

function logoCells(cell, gap, stroke) {
  let s = "";
  for (let i = 0; i < 6; i++) {
    const x = i * (cell + gap);
    s += `<rect x="${x}" y="0" width="${cell}" height="${cell * 1.5}" rx="${cell * 0.22}" fill="#2a2f34" stroke="rgba(232,234,237,.14)" stroke-width="1"/>`;
    s += `<rect x="${x + cell * 0.27}" y="${cell * 0.34}" width="${cell * 0.46}" height="${cell * 0.82}" rx="${cell * 0.23}" fill="none" stroke="#7CC8F2" stroke-width="${stroke}" filter="url(#gl)"/>`;
  }
  const w = 6 * cell + 5 * gap;
  return `<svg width="${w}" height="${cell * 1.5}" viewBox="-2 -2 ${w + 4} ${cell * 1.5 + 4}" style="overflow:visible"><defs><filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${stroke * 0.9}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${s}</svg>`;
}

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;font-family:Manrope,sans-serif;color:#E8EAED;overflow:hidden;
background:radial-gradient(700px 520px at 88% 30%,rgba(124,200,242,.22),transparent 60%),radial-gradient(500px 400px at 0% 100%,rgba(124,200,242,.08),transparent 60%),#16181B}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(232,234,237,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(232,234,237,.05) 1px,transparent 1px);background-size:60px 60px;-webkit-mask-image:radial-gradient(ellipse 70% 80% at 75% 40%,#000 20%,transparent 75%)}
.wrap{position:absolute;inset:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.name{font-size:30px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin-top:34px}
.name span{font-weight:500;color:#9AA3AB}
h1{font-size:68px;line-height:.98;font-weight:700;text-transform:uppercase;letter-spacing:-.01em;max-width:820px}
h1 em{font-style:normal;color:#7CC8F2;text-shadow:0 0 40px rgba(124,200,242,.4)}
.foot{display:flex;justify-content:space-between;align-items:flex-end;font-size:22px;color:#9AA3AB}
.foot b{color:#E8EAED;font-weight:700}
.ring{position:absolute;right:-120px;top:-60px;width:620px;height:620px;border-radius:50%;border:1px solid rgba(124,200,242,.2)}
.ring:after{content:"";position:absolute;left:34%;right:34%;top:18%;bottom:18%;border-radius:999px;border:3px solid rgba(124,200,242,.55);box-shadow:0 0 50px rgba(124,200,242,.3)}
</style></head><body><div class="grid"></div><div class="ring"></div>
<div class="wrap"><div>${logoCells(38, 8, 4)}<p class="name">Zero KM <span>Detailing</span></p></div>
<h1>Химчистка салона на выезд <em>в СПб и ЛО</em></h1>
<div class="foot"><span><b>0 км до сервиса. 0 км пробега салона.</b></span><span>Фото до и после по каждому заказу</span></div></div></body></html>`;

function iconHtml(size, pad) {
  const inner = size * (1 - pad * 2);
  return `<!doctype html><html><head><style>*{margin:0}body{width:${size}px;height:${size}px;background:#1C1F22;display:grid;place-items:center}</style></head><body>
<svg width="${inner}" height="${inner}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="none" stroke="#7CC8F2" stroke-opacity=".45" stroke-width="2"/><rect x="23.5" y="16" width="17" height="32" rx="8.5" fill="none" stroke="#7CC8F2" stroke-width="5"/></svg></body></html>`;
}

(async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  if (!only.length || only.includes("icons")) {
    const fav = fs.readFileSync(path.join(STATIC, "favicon.svg"), "utf8");
    await page.setViewportSize({ width: 32, height: 32 });
    await page.setContent(`<!doctype html><html><head><style>*{margin:0}body{width:32px;height:32px}</style></head><body>${fav.replace("<svg ", '<svg width="32" height="32" ')}</body></html>`);
    await page.screenshot({ path: path.join(STATIC, "favicon-32.png"), omitBackground: true });
    for (const [file, size, pad] of [["apple-touch-icon.png", 180, 0.14], ["icon-192.png", 192, 0.16], ["icon-512.png", 512, 0.16]]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(iconHtml(size, pad));
      await page.screenshot({ path: path.join(STATIC, file) });
    }
    console.log("иконки готовы");
  }

  if (!only.length || only.includes("og")) {
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(ogHtml, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(STATIC, "og-image.jpg"), type: "jpeg", quality: 88 });
    console.log("og-image.jpg готов");
  }

  if (!only.length || only.includes("works")) {
    const outDir = path.join(STATIC, "assets", "img", "works");
    fs.mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: W, height: H });
    for (const [name, draw] of Object.entries(scenes)) {
      for (const [suffix, dirty] of [["before", true], ["after", false]]) {
        await page.setContent(`<!doctype html><html><head><style>*{margin:0}body{width:${W}px;height:${H}px;overflow:hidden}</style></head><body>${draw(dirty)}</body></html>`);
        const png = await page.screenshot({ type: "png" });
        const webp = await page.evaluate(async function (b64) {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          return c.toDataURL("image/webp", 0.84).split(",")[1];
        }, png.toString("base64"));
        const file = path.join(outDir, `${name}-${suffix}.webp`);
        fs.writeFileSync(file, Buffer.from(webp, "base64"));
        console.log(path.relative(ROOT, file), Math.round(fs.statSync(file).size / 1024) + " КБ");
      }
    }
  }

  await browser.close();
})().catch(function (e) { console.error(e); process.exit(1); });
