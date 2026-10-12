/* Процедурные демо-сцены «до / после» для раздела «Работы».
   Одна функция рисует обе версии кадра, поэтому ракурс совпадает до пикселя.
   Используется tools/render-assets.js. */
"use strict";

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1600, H = 1200;

const commonDefs = `
  <filter id="blot" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="4" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="70" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="2.5"/>
  </filter>
  <filter id="blot2" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="44" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="1.6"/>
  </filter>
  <filter id="edge" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="17" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="16" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="1.4"/>
  </filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="dust" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="21" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.83  0 0 0 0 0.76  0 0 0 9 -6.6"/>
    <feComposite in2="SourceAlpha" operator="in"/>
  </filter>
  <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
  </radialGradient>
  <linearGradient id="light" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.10"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.25"/>
  </linearGradient>`;

function textureFilter(id, freq, scale, seed, gain) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" result="n"/>
    <feDiffuseLighting in="n" lighting-color="#ffffff" surfaceScale="${scale}" result="lit">
      <feDistantLight azimuth="235" elevation="58"/>
    </feDiffuseLighting>
    <feComposite in="lit" in2="SourceGraphic" operator="arithmetic" k1="${gain}" k2="0" k3="0" k4="0" result="m"/>
    <feComposite in="m" in2="SourceAlpha" operator="in"/>
  </filter>`;
}

/* ---------- Сиденье (общая геометрия) ---------- */
const seat = {
  headrest: "M688 92 Q688 70 720 66 L880 66 Q912 70 912 92 L918 220 Q918 262 868 266 L732 266 Q682 262 682 220 Z",
  back: "M548 300 Q552 276 600 272 L1000 272 Q1048 276 1052 300 L1098 726 Q1102 760 1060 764 L540 764 Q498 760 502 726 Z",
  backInsert: "M640 318 L960 318 Q978 320 980 338 L1004 700 Q1006 724 982 726 L618 726 Q594 724 596 700 L620 338 Q622 320 640 318 Z",
  cushion: "M526 784 L1074 784 Q1112 786 1124 822 L1188 1066 Q1196 1104 1150 1110 L450 1110 Q404 1104 412 1066 L476 822 Q488 786 526 784 Z",
  cushionInsert: "M616 806 L984 806 Q1004 808 1010 828 L1058 1050 Q1062 1078 1034 1080 L566 1080 Q538 1078 542 1050 L590 828 Q596 808 616 806 Z"
};

function seatScene(opts) {
  const { dirty, material } = opts;
  const r = rng(material === "leather" ? 77 : 42);
  const isLeather = material === "leather";
  const base = isLeather
    ? { bolster: "#b9b1a5", insert: "#cbc4b8", head: "#c2baae", seam: "#8d857a", bg1: "#2b2e31", bg2: "#141618" }
    : { bolster: "#3f454c", insert: "#555c65", head: "#474d55", seam: "#2a2e33", bg1: "#2a2d31", bg2: "#131517" };
  const tex = isLeather ? "url(#tLeather)" : "url(#tFabric)";
  const texIns = isLeather ? "url(#tLeather)" : "url(#tWeave)";

  let defs = commonDefs +
    textureFilter("tFabric", "1.1 0.9", 1.4, 7, 1.22) +
    textureFilter("tWeave", "1.6 1.6", 2.2, 3, 1.28) +
    textureFilter("tLeather", "0.22 0.24", 1.1, 9, 1.12) +
    `<linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base.bg1}"/><stop offset="1" stop-color="${base.bg2}"/></linearGradient>
     <linearGradient id="vol" x1="0" y1="0" x2="1" y2="0">
       <stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset=".22" stop-color="#000" stop-opacity="0"/>
       <stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/>
     </linearGradient>
     <linearGradient id="volV" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#fff" stop-opacity=".09"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/>
     </linearGradient>
     <pattern id="perf" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="2.3" fill="#3b3631" opacity=".55"/></pattern>
     <clipPath id="seatClip"><path d="${seat.headrest}"/><path d="${seat.back}"/><path d="${seat.cushion}"/></clipPath>
     <clipPath id="cushClip"><path d="${seat.cushion}"/></clipPath>
     <clipPath id="backClip"><path d="${seat.back}"/></clipPath>`;

  let g = "";
  /* Фон салона: дверь слева, тоннель справа, пол */
  g += `<rect width="${W}" height="${H}" fill="url(#bgGrad)"/>`;
  g += `<path d="M0 0 L300 0 L360 1200 L0 1200 Z" fill="#1d2023"/>`;
  g += `<path d="M300 0 L310 0 L372 1200 L360 1200 Z" fill="#3a3f44" opacity=".5"/>`;
  g += `<path d="M60 520 Q200 500 300 540 L318 700 Q200 690 70 720 Z" fill="#26292d"/>`;
  g += `<path d="M1310 380 L1600 360 L1600 1200 L1250 1200 Z" fill="#191b1e"/>`;
  g += `<path d="M1310 380 L1600 360 L1600 376 L1312 396 Z" fill="#3a3f44" opacity=".6"/>`;
  g += `<rect x="1380" y="560" width="160" height="70" rx="14" fill="#232629"/>`;
  g += `<rect x="0" y="1040" width="${W}" height="160" fill="#18191b"/>`;
  g += `<ellipse cx="800" cy="1135" rx="520" ry="60" fill="#000" opacity=".55" filter="url(#soft)"/>`;

  /* Подголовник и стойки */
  g += `<rect x="738" y="262" width="14" height="40" rx="5" fill="#8c9196"/><rect x="848" y="262" width="14" height="40" rx="5" fill="#8c9196"/>`;
  g += `<g filter="${tex}"><path d="${seat.headrest}" fill="${base.head}"/></g>`;
  g += `<path d="${seat.headrest}" fill="url(#volV)"/>`;
  g += `<path d="M700 230 Q800 246 900 230" fill="none" stroke="${base.seam}" stroke-width="3" stroke-dasharray="7 6" opacity=".7"/>`;

  /* Спинка */
  g += `<path d="${seat.back}" fill="#000" opacity=".5" transform="translate(0 10)" filter="url(#soft2)"/>`;
  g += `<g filter="${tex}"><path d="${seat.back}" fill="${base.bolster}"/></g>`;
  g += `<g filter="${texIns}"><path d="${seat.backInsert}" fill="${base.insert}"/></g>`;
  if (isLeather) g += `<path d="${seat.backInsert}" fill="url(#perf)"/>`;
  g += `<path d="${seat.backInsert}" fill="none" stroke="${base.seam}" stroke-width="5" opacity=".8"/>`;
  [430, 540, 640].forEach(function (y) {
    g += `<path d="M${612 - (y - 330) * 0.02} ${y} L${988 + (y - 330) * 0.02} ${y}" stroke="${base.seam}" stroke-width="4" opacity=".75"/>`;
    g += `<path d="M${612 - (y - 330) * 0.02} ${y - 7} L${988 + (y - 330) * 0.02} ${y - 7}" stroke="${isLeather ? "#e6dfd3" : "#6b737c"}" stroke-width="2" stroke-dasharray="8 6" opacity=".55"/>`;
  });
  g += `<path d="${seat.back}" fill="url(#vol)"/><path d="${seat.back}" fill="url(#volV)"/>`;

  /* Подушка */
  g += `<path d="M520 772 L1080 772 L1090 796 L510 796 Z" fill="#0b0c0d" opacity=".9"/>`;
  g += `<g filter="${tex}"><path d="${seat.cushion}" fill="${base.bolster}"/></g>`;
  g += `<g filter="${texIns}"><path d="${seat.cushionInsert}" fill="${base.insert}"/></g>`;
  if (isLeather) g += `<path d="${seat.cushionInsert}" fill="url(#perf)"/>`;
  g += `<path d="${seat.cushionInsert}" fill="none" stroke="${base.seam}" stroke-width="5" opacity=".8"/>`;
  [880, 960].forEach(function (y) {
    const k = (y - 806) / 274;
    const x1 = 590 - 48 * k, x2 = 1010 + 48 * k;
    g += `<path d="M${x1} ${y} L${x2} ${y}" stroke="${base.seam}" stroke-width="4" opacity=".75"/>`;
    g += `<path d="M${x1} ${y - 7} L${x2} ${y - 7}" stroke="${isLeather ? "#e6dfd3" : "#6b737c"}" stroke-width="2" stroke-dasharray="8 6" opacity=".55"/>`;
  });
  g += `<path d="${seat.cushion}" fill="url(#vol)"/>`;
  g += `<path d="M430 1060 Q800 1092 1170 1060 L1188 1066 Q1196 1104 1150 1110 L450 1110 Q404 1104 412 1066 Z" fill="#000" opacity=".28"/>`;
  g += `<path d="M528 788 L1072 788" stroke="#fff" stroke-opacity="${isLeather ? 0.25 : 0.08}" stroke-width="3"/>`;

  if (dirty) {
    let d = "";
    /* общий налёт: тусклость и пыль */
    d += `<g clip-path="url(#seatClip)">`;
    d += `<rect width="${W}" height="${H}" fill="${isLeather ? "#6e604c" : "#7a6b55"}" opacity="${isLeather ? 0.22 : 0.16}" style="mix-blend-mode:multiply"/>`;
    d += `<rect width="${W}" height="${H}" filter="url(#dust)" opacity="${isLeather ? 0.25 : 0.55}"/>`;
    d += `</g>`;
    if (!isLeather) {
      /* кофе на подушке */
      d += `<g clip-path="url(#cushClip)" style="mix-blend-mode:multiply">`;
      d += `<ellipse cx="760" cy="930" rx="92" ry="54" fill="#6b4b2c" opacity=".62" filter="url(#blot)"/>`;
      d += `<ellipse cx="760" cy="930" rx="92" ry="54" fill="none" stroke="#3a2614" stroke-width="7" opacity=".5" filter="url(#blot)"/>`;
      d += `<ellipse cx="900" cy="1010" rx="40" ry="22" fill="#6b4b2c" opacity=".5" filter="url(#blot2)"/>`;
      d += `<ellipse cx="640" cy="860" rx="26" ry="16" fill="#5a3d22" opacity=".45" filter="url(#blot2)"/>`;
      d += `</g>`;
      /* разводы соли и засохшие капли */
      d += `<g clip-path="url(#seatClip)">`;
      ["M470 1040 Q620 990 780 1030 T1150 1020", "M450 1080 Q640 1040 820 1075 T1180 1070"].forEach(function (p, i) {
        d += `<path d="${p}" fill="none" stroke="#ece6d9" stroke-width="22" opacity=".12" filter="url(#soft2)"/>`;
        d += `<path d="${p}" fill="none" stroke="#ece6d9" stroke-width="2.6" opacity="${0.34 - i * 0.06}" filter="url(#edge)"/>`;
      });
      d += `<ellipse cx="1010" cy="560" rx="58" ry="40" fill="#e7e0d2" opacity=".07" filter="url(#soft2)"/>`;
      d += `<ellipse cx="1010" cy="560" rx="58" ry="40" fill="none" stroke="#e7e0d2" stroke-width="2.4" opacity=".28" filter="url(#edge)"/>`;
      d += `<ellipse cx="700" cy="420" rx="46" ry="30" fill="#4a3b2b" opacity=".3" filter="url(#blot2)" style="mix-blend-mode:multiply"/>`;
      d += `</g>`;
      /* засаленный край боковины */
      d += `<g clip-path="url(#cushClip)"><path d="M420 1000 Q470 860 520 790 L580 790 Q530 880 500 1100 L420 1100 Z" fill="#2b241c" opacity=".35" filter="url(#soft)"/></g>`;
    } else {
      /* кожа: потемневшие боковины, перенос краски от джинсов, разводы */
      d += `<g clip-path="url(#seatClip)" style="mix-blend-mode:multiply">`;
      d += `<path d="M420 1110 L480 800 L590 800 L540 1110 Z" fill="#7d6f5c" opacity=".55" filter="url(#soft)"/>`;
      d += `<path d="M1180 1110 L1120 800 L1010 800 L1060 1110 Z" fill="#7d6f5c" opacity=".45" filter="url(#soft)"/>`;
      d += `<path d="M520 300 L560 740 L600 740 L640 310 Z" fill="#7d6f5c" opacity=".35" filter="url(#soft)"/>`;
      d += `<ellipse cx="510" cy="960" rx="60" ry="130" fill="#4f6a8f" opacity=".42" filter="url(#soft)"/>`;
      d += `<ellipse cx="800" cy="900" rx="170" ry="60" fill="#8a7a63" opacity=".35" filter="url(#blot)"/>`;
      d += `<ellipse cx="760" cy="520" rx="110" ry="140" fill="#8f806a" opacity=".22" filter="url(#soft)"/>`;
      d += `<ellipse cx="930" cy="1000" rx="50" ry="28" fill="#5d4a33" opacity=".45" filter="url(#blot2)"/>`;
      d += `</g>`;
      /* грязь в швах и перфорации */
      d += `<g clip-path="url(#seatClip)">`;
      [430, 540, 640].forEach(function (y) { d += `<path d="M620 ${y} L980 ${y}" stroke="#3e352b" stroke-width="7" opacity=".4" filter="url(#soft2)"/>`; });
      [880, 960].forEach(function (y) { d += `<path d="M570 ${y} L1030 ${y}" stroke="#3e352b" stroke-width="7" opacity=".4" filter="url(#soft2)"/>`; });
      d += `</g>`;
    }
    /* крошки и песок */
    d += `<g clip-path="url(#seatClip)">`;
    const crumbColors = isLeather ? ["#8b7355", "#6e5a41", "#a8946f", "#5b4a37"] : ["#c9b38c", "#a88f68", "#e2d3b4", "#8d7556", "#d8cfc0"];
    const n = isLeather ? 70 : 170;
    for (let i = 0; i < n; i++) {
      let x, y;
      const zone = r();
      if (zone < 0.45) { x = 540 + r() * 520; y = 800 + Math.pow(r(), 2.2) * 90; }
      else if (zone < 0.75) { x = 560 + r() * 480; y = 830 + r() * 250; }
      else { x = 600 + r() * 400; y = 330 + r() * 400; }
      const s = (0.8 + r() * 3.2) * (zone < 0.45 ? 1.15 : 0.8);
      const c = crumbColors[Math.floor(r() * crumbColors.length)];
      if (r() < 0.6) d += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="${c}" opacity="${(0.65 + r() * 0.35).toFixed(2)}"/>`;
      else {
        const a = r() * Math.PI;
        const pts = [0, 1, 2, 3].map(function (k) {
          const ang = a + k * Math.PI / 2 + (r() - 0.5) * 0.8;
          const rr = s * (0.8 + r() * 0.9);
          return (x + Math.cos(ang) * rr).toFixed(1) + "," + (y + Math.sin(ang) * rr).toFixed(1);
        }).join(" ");
        d += `<polygon points="${pts}" fill="${c}" opacity="${(0.7 + r() * 0.3).toFixed(2)}"/>`;
      }
    }
    if (!isLeather) {
      /* шерсть */
      for (let i = 0; i < 14; i++) {
        const x = 580 + r() * 440, y = 340 + r() * 720, l = 18 + r() * 34, a = r() * Math.PI * 2;
        const cx = x + Math.cos(a + 0.6) * l * 0.6, cy = y + Math.sin(a + 0.6) * l * 0.6;
        d += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${(x + Math.cos(a) * l).toFixed(1)} ${(y + Math.sin(a) * l).toFixed(1)}" stroke="#d9d0c2" stroke-width="1.3" fill="none" opacity=".55"/>`;
      }
    }
    d += `</g>`;
    g += d;
  } else {
    /* после: свежий ровный вид и мягкий блик */
    g += `<g clip-path="url(#seatClip)"><rect width="${W}" height="${H}" fill="url(#light)"/></g>`;
    if (isLeather) {
      g += `<g clip-path="url(#seatClip)"><ellipse cx="700" cy="460" rx="120" ry="200" fill="#fff" opacity=".10" filter="url(#soft)"/><ellipse cx="720" cy="900" rx="200" ry="50" fill="#fff" opacity=".1" filter="url(#soft)"/></g>`;
    }
  }

  g += `<rect width="${W}" height="${H}" fill="url(#vignette)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${g}</svg>`;
}

/* ---------- Ковролин водителя, вид сверху ---------- */
function carpetScene(opts) {
  const { dirty } = opts;
  const r = rng(5);
  let defs = commonDefs + textureFilter("tCarpet", "0.95 0.95", 3.2, 13, 1.35) +
    `<linearGradient id="sill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2d31"/><stop offset=".6" stop-color="#3b4046"/><stop offset="1" stop-color="#1c1e21"/></linearGradient>
     <linearGradient id="pedal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3e43"/><stop offset="1" stop-color="#202326"/></linearGradient>
     <pattern id="stripes" width="220" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
       <rect width="110" height="220" fill="#fff" opacity=".018"/><rect x="110" width="110" height="220" fill="#000" opacity=".03"/>
     </pattern>
     <clipPath id="carpetClip"><path d="M250 0 L1600 0 L1600 1200 L190 1200 Z"/></clipPath>`;
  let g = "";
  g += `<rect width="${W}" height="${H}" fill="#151618"/>`;
  g += `<g filter="url(#tCarpet)"><path d="M250 0 L1600 0 L1600 1200 L190 1200 Z" fill="#3a3d41"/></g>`;
  /* тоннель справа и порог слева */
  g += `<path d="M1330 0 L1600 0 L1600 1200 L1250 1200 Q1300 700 1330 0 Z" fill="#000" opacity=".28" filter="url(#soft)"/>`;
  g += `<path d="M0 0 L250 0 L190 1200 L0 1200 Z" fill="url(#sill)"/>`;
  g += `<path d="M236 0 L250 0 L190 1200 L176 1200 Z" fill="#555b62" opacity=".6"/>`;
  for (let i = 0; i < 9; i++) g += `<rect x="${40 - i * 2}" y="${120 + i * 120}" width="${150 - i * 4}" height="10" rx="5" fill="#1a1c1f" opacity=".7"/>`;
  /* педали */
  g += `<g transform="translate(560 40)"><rect width="230" height="250" rx="34" fill="url(#pedal)"/>${Array.from({ length: 7 }, (_, i) => `<rect x="24" y="${30 + i * 30}" width="182" height="9" rx="4.5" fill="#15171a"/>`).join("")}</g>`;
  g += `<g transform="translate(980 -40)"><rect width="150" height="300" rx="26" fill="url(#pedal)"/>${Array.from({ length: 8 }, (_, i) => `<rect x="20" y="${40 + i * 30}" width="110" height="9" rx="4.5" fill="#15171a"/>`).join("")}</g>`;
  g += `<rect x="560" y="290" width="230" height="40" fill="#000" opacity=".35" filter="url(#soft2)"/>`;
  /* пятка водителя: потёртая площадка */
  g += `<ellipse cx="690" cy="760" rx="220" ry="160" fill="#2c2f33" opacity=".45" filter="url(#soft)"/>`;

  if (dirty) {
    let d = `<g clip-path="url(#carpetClip)">`;
    d += `<rect width="${W}" height="${H}" fill="#7b6a52" opacity=".18" style="mix-blend-mode:multiply"/>`;
    d += `<rect width="${W}" height="${H}" filter="url(#dust)" opacity=".5"/>`;
    /* соляные разводы */
    const salt = [
      "M260 980 Q520 900 760 980 T1260 940",
      "M240 1060 Q560 990 860 1060 T1500 1010",
      "M300 880 Q480 840 640 900",
      "M820 520 Q980 470 1180 540",
      "M900 640 Q1080 600 1260 660"
    ];
    salt.forEach(function (p, i) {
      d += `<path d="${p}" fill="none" stroke="#efe9dc" stroke-width="46" opacity=".09" filter="url(#soft)"/>`;
      d += `<path d="${p}" fill="none" stroke="#efe9dc" stroke-width="16" opacity=".12" filter="url(#soft2)"/>`;
      d += `<path d="${p}" fill="none" stroke="#f3eee3" stroke-width="${3.2 - i * 0.3}" opacity="${0.42 - i * 0.05}" filter="url(#edge)"/>`;
    });
    /* грязь от обуви */
    d += `<g style="mix-blend-mode:multiply">`;
    d += `<ellipse cx="690" cy="760" rx="150" ry="110" fill="#5b4631" opacity=".5" filter="url(#blot)"/>`;
    d += `<ellipse cx="1010" cy="420" rx="90" ry="70" fill="#5b4631" opacity=".45" filter="url(#blot)"/>`;
    d += `<ellipse cx="460" cy="560" rx="70" ry="50" fill="#4b3a29" opacity=".4" filter="url(#blot2)"/>`;
    d += `</g>`;
    /* песок */
    const sand = ["#cdbb98", "#b7a27e", "#e3d7bf", "#9a8566", "#d6cbb6"];
    for (let i = 0; i < 950; i++) {
      const cx = 640 + (r() - 0.5) * 700 * Math.sqrt(r()) * 1.4;
      const cy = 760 + (r() - 0.5) * 520 * Math.sqrt(r()) * 1.4;
      if (cx < 220) continue;
      d += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(0.7 + r() * 2.3).toFixed(2)}" fill="${sand[Math.floor(r() * sand.length)]}" opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`;
    }
    for (let i = 0; i < 260; i++) {
      const cx = 260 + r() * 1250, cy = r() * 1200;
      d += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(0.6 + r() * 1.6).toFixed(2)}" fill="${sand[Math.floor(r() * sand.length)]}" opacity=".7"/>`;
    }
    /* мелкий мусор: обрывок чека, листик */
    d += `<g transform="translate(1180 820) rotate(-24)"><rect width="92" height="54" rx="3" fill="#e9e5dc" opacity=".85"/><path d="M10 14 H70 M10 26 H82 M10 38 H58" stroke="#9a958b" stroke-width="3"/></g>`;
    d += `<path d="M420 300 q40 -30 80 6 q-28 40 -80 -6 Z" fill="#7a5a2a" opacity=".85"/><path d="M424 300 L498 306" stroke="#4d3818" stroke-width="2"/>`;
    d += `</g>`;
    g += d;
  } else {
    g += `<g clip-path="url(#carpetClip)"><rect width="${W}" height="${H}" fill="url(#stripes)"/><rect width="${W}" height="${H}" fill="url(#light)"/></g>`;
  }
  g += `<rect width="${W}" height="${H}" fill="url(#vignette)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${g}</svg>`;
}

module.exports = {
  W, H,
  scenes: {
    "demo-seat-fabric": function (dirty) { return seatScene({ dirty: dirty, material: "fabric" }); },
    "demo-carpet": function (dirty) { return carpetScene({ dirty: dirty }); },
    "demo-seat-leather": function (dirty) { return seatScene({ dirty: dirty, material: "leather" }); }
  }
};
