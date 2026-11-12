// Gera as cenas (compositions/<bloco>.html) e as partes (parte-N.html + index.html)
// a partir de roteiro.json e tempos.json (criado por scripts/gerar_voz.py).
//
// Uso (na pasta videos/manipulacao):  node scripts/montar.mjs
//
// As cenas geradas são HTML comum: dá para ajustar à mão, mas rodar o script de novo
// sobrescreve. Para mudanças permanentes, edite este arquivo ou o roteiro.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const roteiro = JSON.parse(fs.readFileSync(path.join(AQUI, "roteiro.json"), "utf8"));
const tempos = JSON.parse(fs.readFileSync(path.join(AQUI, "tempos.json"), "utf8"));

const COR = {
  preto: "#0B0B0F",
  grafite: "#1C1D24",
  nevoa: "#8A8D98",
  off: "#E8E6E1",
  ambar: "#C9A227",
  sangue: "#8E1B1B",
  linha: "#2A2B33",
  sombra: "#121318",
};
const CANAL_PADRAO = "Sem Perceber";
const FADE = 0.6;
const r3 = (n) => Math.round(n * 1000) / 1000;

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const escapar = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Texto do roteiro pode ter <em> para a palavra-chave em âmbar; o resto é escapado.
const comEnfase = (s) => escapar(s).replace(/&lt;em&gt;/g, "<em>").replace(/&lt;\/em&gt;/g, "</em>");

// Silhueta humana simples (cabeça + corpo), em coordenadas locais, pés em y=0.
function figura({ x, y, s = 1, cor = COR.sombra, id = "", borda = COR.linha }) {
  return `<g ${id ? `id="${id}"` : ""} transform="translate(${x} ${y}) scale(${s})">
      <circle cx="0" cy="-292" r="38" fill="${cor}" stroke="${borda}" stroke-width="2"/>
      <path d="M-62,-238 Q0,-262 62,-238 L74,-96 L52,-96 L44,-150 L40,-60 L34,0 L10,0 L0,-118 L-10,0 L-34,0 L-40,-60 L-44,-150 L-52,-96 L-74,-96 Z" fill="${cor}" stroke="${borda}" stroke-width="2"/>
    </g>`;
}

// ---------------------------------------------------------------- motivos por bloco
// Cada motivo devolve { svg, html, css, js } — js usa `tl` e os tempos já resolvidos.
const MOTIVOS = {
  gancho(id, at, dur) {
    const texto = "Desculpa…";
    const tDig = at("desculpa", 0.3);
    const letras = [...texto]
      .map((c, i) => `<tspan id="${id}-c${i}" opacity="0">${escapar(c)}</tspan>`)
      .join("");
    const corte = at("duvidar", -0.2);
    const svg = `
    <defs>
      <radialGradient id="${id}-luzrosto" cx="50%" cy="100%" r="70%">
        <stop offset="0%" stop-color="${COR.off}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${COR.off}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${id}-tela" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2c2e38"/><stop offset="100%" stop-color="#1b1c23"/>
      </linearGradient>
      <filter id="${id}-embaco" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
    </defs>
    <g id="${id}-celular">
      <ellipse cx="960" cy="360" rx="280" ry="300" fill="url(#${id}-luzrosto)"/>
      <ellipse cx="960" cy="290" rx="112" ry="138" fill="#0e0f13" stroke="#3a3328" stroke-width="3"/>
      <path d="M915,410 L915,450 Q760,470 700,560 L1220,560 Q1160,470 1005,450 L1005,410 Z" fill="#0e0f13" stroke="#2a2620" stroke-width="2"/>
      <g transform="rotate(-6 960 640)">
        <rect x="830" y="420" width="260" height="470" rx="38" fill="#101116" stroke="#34353e" stroke-width="3"/>
        <rect x="844" y="436" width="232" height="438" rx="28" fill="url(#${id}-tela)"/>
        <rect x="864" y="470" width="150" height="44" rx="18" fill="#34363f"/>
        <rect x="904" y="530" width="152" height="44" rx="18" fill="#3c3830"/>
        <g id="${id}-enviada" opacity="0"><rect x="864" y="588" width="196" height="58" rx="22" fill="${COR.ambar}" opacity="0.9"/>
          <text x="962" y="627" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" fill="${COR.preto}">${escapar(texto)}</text></g>
        <rect x="858" y="790" width="204" height="56" rx="26" fill="#14151b" stroke="#4a4b55" stroke-width="2"/>
        <text id="${id}-digitado" x="878" y="829" font-family="Inter" font-weight="500" font-size="30" data-layout-ignore fill="${COR.off}">${letras}</text>
        <rect id="${id}-cursor" x="878" y="802" width="3" height="30" fill="${COR.ambar}"/>
        <path id="${id}-polegar" d="M1010,1000 Q995,880 1030,850 Q1070,840 1078,890 L1090,1000 Z" fill="#0b0c10" stroke="#26272e" stroke-width="2"/>
      </g>
    </g>
    <g id="${id}-espelho" opacity="0">
      <ellipse cx="1180" cy="430" rx="230" ry="310" fill="#15161c" stroke="${COR.nevoa}" stroke-width="4"/>
      <g filter="url(#${id}-embaco)" opacity="0.8">${figura({ x: 1180, y: 760, s: 1.05, cor: "#2a2c35", borda: "#2a2c35" })}</g>
      <ellipse id="${id}-nevoa" cx="1180" cy="430" rx="220" ry="300" fill="${COR.off}" opacity="0.08" filter="url(#${id}-embaco)"/>
      ${figura({ x: 700, y: 900, s: 1.35, cor: "#0d0e12" })}
    </g>`;
    let js = `
    tl.fromTo("#${id}-celular", { y: 0 }, { y: -12, duration: ${r3(corte)}, ease: "sine.inOut" }, 0);
    tl.fromTo("#${id}-cursor", { opacity: 1 }, { opacity: 0, duration: 0.45, repeat: ${Math.max(1, Math.floor(corte / 0.45) - 1)}, yoyo: true, ease: "steps(1)" }, 0);`;
    [...texto].forEach((_, i) => {
      js += `\n    tl.fromTo("#${id}-c${i}", { opacity: 0 }, { opacity: 1, duration: 0.01 }, ${r3(tDig + i * 0.16)});`;
    });
    js += `
    tl.fromTo("#${id}-cursor", { x: 0 }, { x: ${texto.length * 15.5}, duration: ${r3(texto.length * 0.16)}, ease: "steps(${texto.length})" }, ${r3(tDig)});
    tl.fromTo("#${id}-polegar", { y: 0 }, { y: -10, duration: 0.16, repeat: ${texto.length * 2 - 1}, yoyo: true }, ${r3(tDig)});
    tl.to("#${id}-digitado, #${id}-cursor", { opacity: 0, duration: 0.25 }, ${r3(at("sussurra", -0.4))});
    tl.fromTo("#${id}-enviada", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, ${r3(at("sussurra", -0.3))});
    tl.to("#${id}-celular", { opacity: 0, duration: 0.6 }, ${r3(corte)});
    tl.fromTo("#${id}-espelho", { opacity: 0 }, { opacity: 1, duration: 1.0 }, ${r3(corte + 0.3)});
    tl.fromTo("#${id}-nevoa", { opacity: 0.04 }, { opacity: 0.16, duration: ${r3(dur - corte - 0.3)}, ease: "sine.inOut" }, ${r3(corte + 0.3)});`;
    return { svg, js, motivoAtrasado: false };
  },

  assinatura(id, at, dur) {
    const r = prng(11);
    const nevoas = Array.from({ length: 6 }, (_, i) => {
      const cx = 560 + r() * 800, cy = 380 + r() * 320, rx = 420 + r() * 260;
      return `<div id="${id}-n${i}" class="nevoa" style="left:${(cx - rx).toFixed(0)}px;top:${(cy - rx * 0.45).toFixed(0)}px;width:${(rx * 2).toFixed(0)}px;height:${(rx * 0.9).toFixed(0)}px"></div>`;
    }).join("");
    const html = `${nevoas}<div id="${id}-logo" class="logo"><span data-var-text="canal">${escapar(CANAL_PADRAO)}</span><i id="${id}-traco"></i></div>`;
    let js = "";
    for (let i = 0; i < 6; i++) js += `\n    tl.fromTo("#${id}-n${i}", { x: ${i % 2 ? -40 : 40}, opacity: 1 }, { x: ${i % 2 ? 50 : -50}, opacity: 0.4, duration: ${dur}, ease: "none" }, 0);`;
    js += `
    tl.fromTo("#${id}-logo span", { opacity: 0, filter: "blur(18px)", scale: 1.12 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 1.4, ease: "power3.out" }, 0.15);
    tl.fromTo("#${id}-traco", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "expo.out" }, 0.9);`;
    return { svg: "", html, js };
  },

  intro(id, at, dur) {
    const PE = 760; // pés do boneco
    const pontos = [[0, -330], [-74, -96], [74, -96], [-22, -40], [22, -40]];
    const fios = pontos
      .map(([px, py], i) => `<line id="${id}-f${i}" x1="${960 + px * 1.3}" y1="-40" x2="${960 + px * 1.3}" y2="${PE + py * 1.3}" stroke="${COR.nevoa}" stroke-width="1.6" opacity="0.55" stroke-dasharray="1200" stroke-dashoffset="1200"/>
        <circle id="${id}-b${i}" cx="${960 + px * 1.3}" cy="0" r="3.5" fill="${COR.ambar}" opacity="0"/>`)
      .join("");
    const svg = `<defs><radialGradient id="${id}-contraluz"><stop offset="0%" stop-color="${COR.ambar}" stop-opacity="0.22"/><stop offset="100%" stop-color="${COR.ambar}" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="960" cy="${PE - 200}" rx="300" ry="360" fill="url(#${id}-contraluz)"/>
      <g id="${id}-boneco">${fios}${figura({ x: 960, y: PE, s: 1.3, cor: "#131419", borda: "#4a4536" })}</g>`;
    const ciclo = 2.6;
    let js = `
    tl.fromTo("#${id}-boneco", { rotation: -1.4, svgOrigin: "960 -200" }, { rotation: 1.4, svgOrigin: "960 -200", duration: ${ciclo}, ease: "sine.inOut", repeat: ${Math.floor(dur / ciclo) - 1}, yoyo: true }, 0);`;
    pontos.forEach((_, i) => {
      js += `\n    tl.to("#${id}-f${i}", { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut" }, ${r3(0.4 + i * 0.25)});`;
      js += `\n    tl.fromTo("#${id}-b${i}", { opacity: 0, attr: { cy: 0 } }, { opacity: 0.9, attr: { cy: ${PE + pontos[i][1] * 1.3} }, duration: 3.2, ease: "sine.in", repeat: ${Math.max(0, Math.floor((dur - 4) / 6) - 1)}, repeatDelay: 2.8 }, ${r3(2.8 + i * 0.7)});`;
    });
    return { svg, js };
  },

  sinal1(id, at, dur) {
    const n = 9;
    const ini = at("l1"), fim = at("l3", 1.5);
    let cards = "";
    for (let i = 0; i < n; i++) {
      const y = 560 - i * 50, dx = (i % 3 - 1) * 8;
      cards += `<g id="${id}-k${i}" opacity="0"><rect x="${790 + dx}" y="${y - 44}" width="340" height="56" rx="14" fill="${COR.grafite}" stroke="${i % 3 === 0 ? COR.ambar : COR.linha}" stroke-width="2"/>
        <circle cx="${818 + dx}" cy="${y - 16}" r="9" fill="${COR.ambar}"/><rect x="${842 + dx}" y="${y - 28}" width="${160 + (i * 37) % 90}" height="9" rx="4" fill="${COR.nevoa}"/><rect x="${842 + dx}" y="${y - 12}" width="${110 + (i * 53) % 120}" height="7" rx="3" fill="#4a4c57"/></g>`;
    }
    const svg = `
    <g transform="translate(-70 0)"><ellipse cx="960" cy="690" rx="520" ry="110" fill="${COR.ambar}" opacity="0.05"/>
    <g id="${id}-celular"><rect x="780" y="600" width="360" height="170" rx="30" fill="#101116" stroke="#34353e" stroke-width="3"/>
      <rect x="796" y="614" width="328" height="142" rx="20" fill="#1a1b22"/><circle cx="960" cy="685" r="26" fill="none" stroke="${COR.ambar}" stroke-width="3" opacity="0.7"/></g>
    <g id="${id}-torre">${cards}</g></g>`;
    let js = `
    tl.fromTo("#${id}-celular", { x: -3 }, { x: 3, duration: 0.05, repeat: ${Math.floor((fim - ini) / 0.05) - 1}, yoyo: true, ease: "none" }, ${r3(ini)});`;
    for (let i = 0; i < n; i++) {
      js += `\n    tl.fromTo("#${id}-k${i}", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, ${r3(ini + (i * (fim - ini - 0.5)) / n)});`;
    }
    const balanco = at("l4");
    js += `
    tl.fromTo("#${id}-torre", { rotation: 0, svgOrigin: "960 600" }, { rotation: 1.2, svgOrigin: "960 600", duration: 1.1, ease: "sine.inOut", repeat: ${Math.floor((dur - balanco) / 1.1) - 1}, yoyo: true }, ${r3(balanco)});
    tl.to("#${id}-torre", { x: -14, duration: ${r3(dur - balanco)}, ease: "sine.in" }, ${r3(balanco)});`;
    return { svg, js };
  },

  sinal2(id, at, dur) {
    const r = prng(22);
    const svg = `
    <defs>
      <filter id="${id}-agua" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence id="${id}-turb" type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="2" seed="4"/>
        <feDisplacementMap id="${id}-desloc" in="SourceGraphic" scale="0"/>
      </filter>
      <radialGradient id="${id}-brilho"><stop offset="0%" stop-color="${COR.ambar}" stop-opacity="0.55"/><stop offset="100%" stop-color="${COR.ambar}" stop-opacity="0"/></radialGradient>
    </defs>
    <g id="${id}-sala" filter="url(#${id}-agua)" stroke="${COR.linha}" stroke-width="3" fill="none">
      <rect x="640" y="240" width="640" height="400"/>
      <line x1="640" y1="240" x2="80" y2="-40"/><line x1="1280" y1="240" x2="1840" y2="-40"/>
      <line x1="640" y1="640" x2="80" y2="1100"/><line x1="1280" y1="640" x2="1840" y2="1100"/>
      <rect x="1060" y="320" width="150" height="190" stroke="#24252c"/><line x1="1135" y1="320" x2="1135" y2="510" stroke="#24252c"/>
    </g>
    <g id="${id}-lampada">
      <circle id="${id}-halo" cx="900" cy="330" r="240" fill="url(#${id}-brilho)"/>
      <line x1="900" y1="0" x2="900" y2="230" stroke="#3a3b44" stroke-width="3"/>
      <path d="M868,232 L932,232 L922,256 L878,256 Z" fill="#2a2b33"/>
      <path d="M872,258 Q842,320 872,388 L928,388 Q958,320 928,258 Z" fill="#E8E6E1" fill-opacity="0.08" stroke="${COR.nevoa}" stroke-width="2"/>
      <path id="${id}-chama" d="M900,300 Q918,330 900,360 Q882,330 900,300 Z" fill="${COR.ambar}"/>
      <rect x="878" y="388" width="44" height="14" rx="4" fill="#2a2b33"/>
    </g>
    <g id="${id}-pessoa" opacity="0">
      <circle cx="1160" cy="610" r="30" fill="#0d0e12" stroke="${COR.linha}" stroke-width="2"/>
      <path d="M1112,656 Q1160,640 1208,656 L1214,780 L1106,780 Z" fill="#0d0e12" stroke="${COR.linha}" stroke-width="2"/>
      <path d="M1116,664 Q1098,620 1132,596 M1204,664 Q1222,620 1188,596" stroke="#0d0e12" stroke-width="18" stroke-linecap="round" fill="none"/>
    </g>`;
    const quadros = [];
    let t = 0;
    while (t < dur - 0.4) {
      const d = 0.08 + r() * 0.3;
      quadros.push(`{ opacity: ${(0.45 + r() * 0.55).toFixed(2)}, duration: ${d.toFixed(2)} }`);
      t += d;
    }
    let js = `\n    tl.to("#${id}-chama", { keyframes: [${quadros.join(", ")}], ease: "none" }, 0);\n    tl.to("#${id}-halo", { keyframes: [${quadros.join(", ")}], ease: "none" }, 0);`;
    js += `
    tl.fromTo("#${id}-desloc", { attr: { scale: 0 } }, { attr: { scale: 26 }, duration: 4, ease: "sine.inOut" }, ${r3(at("frases"))});
    tl.to("#${id}-turb", { attr: { baseFrequency: "0.009 0.018" }, duration: ${r3(dur - at("frases"))}, ease: "none" }, ${r3(at("frases"))});
    tl.to("#${id}-desloc", { attr: { scale: 44 }, duration: 5, ease: "sine.inOut" }, ${r3(at("real", -1))});
    tl.fromTo("#${id}-pessoa", { opacity: 0 }, { opacity: 1, duration: 1.2 }, ${r3(at("l3"))});`;
    return { svg, js };
  },

  sinal3(id, at, dur) {
    const svg = `
    <defs>
      <linearGradient id="${id}-fresta" x1="0" x2="1"><stop offset="0%" stop-color="#f0c75e"/><stop offset="100%" stop-color="${COR.ambar}"/></linearGradient>
      <linearGradient id="${id}-chao" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${COR.ambar}" stop-opacity="0.45"/><stop offset="100%" stop-color="${COR.ambar}" stop-opacity="0"/></linearGradient>
    </defs>
    <line x1="0" y1="760" x2="1920" y2="760" stroke="${COR.linha}" stroke-width="2"/>
    <g id="${id}-luz"><polygon id="${id}-cunha" points="1032,760 1100,760 1500,1080 860,1080" fill="url(#${id}-chao)"/>
      <rect id="${id}-vao" x="1032" y="200" width="68" height="560" fill="url(#${id}-fresta)"/></g>
    <rect x="820" y="190" width="290" height="580" fill="none" stroke="#2c2d35" stroke-width="10"/>
    <polygon id="${id}-porta" points="826,196 1032,206 1032,754 826,764" fill="#141519" stroke="#24252c" stroke-width="2"/>
    <circle cx="1010" cy="490" r="9" fill="#5a4a22"/>
    <path id="${id}-sombra" d="M1060,1080 Q1090,960 1120,900 L1180,900 Q1200,860 1240,860 L1260,900 L1300,1080 Z" fill="#0B0B0F" opacity="0.85"/>
    <path id="${id}-mao" d="M930,520 Q960,486 994,494 L1002,506 Q980,514 972,530 Q950,548 930,540 Z" fill="#0c0d11" stroke="#2c2d35" stroke-width="2" opacity="0"/>
    ${figura({ x: 520, y: 760, s: 0.95, cor: "#0f1014" })}`;
    const fala = at("fala");
    const fica = at("l3");
    const js = `
    tl.fromTo("#${id}-vao", { scaleX: 0.35, svgOrigin: "1032 480" }, { scaleX: 1, svgOrigin: "1032 480", duration: 2.2, ease: "power2.out" }, ${r3(fala)});
    tl.fromTo("#${id}-cunha", { opacity: 0.4 }, { opacity: 1, duration: 2.2 }, ${r3(fala)});
    tl.fromTo("#${id}-mao", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 1.4, ease: "power2.out" }, ${r3(fala + 1.2)});
    tl.to("#${id}-mao", { x: -20, duration: 0.5, ease: "sine.inOut", repeat: 3, yoyo: true }, ${r3(fala + 2.8)});
    tl.to("#${id}-mao", { x: -90, opacity: 0, duration: 1.2, ease: "power2.in" }, ${r3(fica)});
    tl.to("#${id}-vao", { scaleX: 0.5, svgOrigin: "1032 480", duration: 1.6, ease: "power2.inOut" }, ${r3(fica + 0.4)});
    tl.to("#${id}-cunha", { opacity: 0.5, duration: 1.6 }, ${r3(fica + 0.4)});
    tl.fromTo("#${id}-sombra", { scaleY: 0.9, svgOrigin: "1180 1080" }, { scaleY: 1.06, svgOrigin: "1180 1080", duration: ${r3(dur)}, ease: "none" }, 0);`;
    return { svg, js };
  },

  retencao(id, at, dur) {
    const C = 17, L = 9, P = 64, x0 = 960 - (C * P) / 2, y0 = 470 - (L * P) / 2;
    const r = prng(5);
    const visit = Array.from({ length: L }, () => Array(C).fill(false));
    const paredes = new Set();
    for (let y = 0; y < L; y++) for (let x = 0; x < C; x++) { paredes.add(`h${x},${y}`); paredes.add(`v${x},${y}`); }
    const pilha = [[8, 4]]; visit[4][8] = true;
    while (pilha.length) {
      const [x, y] = pilha[pilha.length - 1];
      const viz = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy])
        .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < C && ny < L && !visit[ny][nx]);
      if (!viz.length) { pilha.pop(); continue; }
      const [nx, ny, dx, dy] = viz[Math.floor(r() * viz.length)];
      if (dx === 1) paredes.delete(`v${nx},${y}`); if (dx === -1) paredes.delete(`v${x},${y}`);
      if (dy === 1) paredes.delete(`h${x},${ny}`); if (dy === -1) paredes.delete(`h${x},${y}`);
      visit[ny][nx] = true; pilha.push([nx, ny]);
    }
    let d = `M${x0},${y0 + L * P}H${x0 + C * P}V${y0}`;
    for (const p of paredes) {
      const [a, b] = p.slice(1).split(",").map(Number);
      if (p[0] === "h") d += `M${x0 + a * P},${y0 + b * P}h${P}`; else d += `M${x0 + a * P},${y0 + b * P}v${P}`;
    }
    const svg = `
    <defs><radialGradient id="${id}-ponto"><stop offset="0%" stop-color="${COR.ambar}" stop-opacity="0.9"/><stop offset="100%" stop-color="${COR.ambar}" stop-opacity="0"/></radialGradient></defs>
    <g id="${id}-labirinto"><path d="${d}" stroke="${COR.nevoa}" stroke-width="5" stroke-linecap="square" fill="none" opacity="0.55"/>
      <circle id="${id}-halo" cx="${x0 + 8.5 * P}" cy="${y0 + 4.5 * P}" r="90" fill="url(#${id}-ponto)"/>
      <circle cx="${x0 + 8.5 * P}" cy="${y0 + 4.5 * P}" r="9" fill="#f6dc8a"/></g>`;
    const js = `
    tl.fromTo("#${id}-labirinto", { scale: 3.4, svgOrigin: "${x0 + 8.5 * P} ${y0 + 4.5 * P}" }, { scale: 1, svgOrigin: "${x0 + 8.5 * P} ${y0 + 4.5 * P}", duration: ${r3(dur - 1)}, ease: "power1.inOut" }, 0);
    tl.fromTo("#${id}-halo", { scale: 0.8, svgOrigin: "${x0 + 8.5 * P} ${y0 + 4.5 * P}" }, { scale: 1.25, svgOrigin: "${x0 + 8.5 * P} ${y0 + 4.5 * P}", duration: 1.6, ease: "sine.inOut", repeat: ${Math.floor(dur / 1.6) - 1}, yoyo: true }, 0);`;
    return { svg, js };
  },

  sinal4(id, at, dur) {
    const coracao = (cx, cy) => `<path d="M${cx},${cy + 30} C${cx - 52},${cy - 6} ${cx - 30},${cy - 48} ${cx},${cy - 20} C${cx + 30},${cy - 48} ${cx + 52},${cy - 6} ${cx},${cy + 30} Z" fill="${COR.ambar}"/>`;
    const frio = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="36" fill="none" stroke="${COR.nevoa}" stroke-width="5"/><circle cx="${cx - 13}" cy="${cy - 8}" r="4" fill="${COR.nevoa}"/><circle cx="${cx + 13}" cy="${cy - 8}" r="4" fill="${COR.nevoa}"/><line x1="${cx - 15}" y1="${cy + 14}" x2="${cx + 15}" y2="${cy + 14}" stroke="${COR.nevoa}" stroke-width="5" stroke-linecap="round"/>`;
    const S = 120, N = 24;
    // Sequência de símbolos por rolo (true = coração).
    // Rolos param nos símbolos 4, 9, 14 e 19: coração, frio, coração, frio.
    const PARADAS = [4, 9, 14, 19];
    const seq = (k) => {
      const r = prng(40 + k);
      const s = Array.from({ length: N }, () => r() < 0.5);
      PARADAS.forEach((i, p) => (s[i] = p % 2 === 0));
      return s;
    };
    const alvos = () => PARADAS;
    let rolos = "";
    for (let k = 0; k < 3; k++) {
      const cx = 780 + k * 180;
      const simbolos = seq(k).map((h, i) => (h ? coracao(cx, 430 - i * S) : frio(cx, 430 - i * S))).join("");
      rolos += `<g clip-path="url(#${id}-jan${k})"><g id="${id}-r${k}">${simbolos}</g></g>
        <clipPath id="${id}-jan${k}"><rect x="${cx - 75}" y="335" width="150" height="190" rx="14"/></clipPath>
        <rect x="${cx - 75}" y="335" width="150" height="190" rx="14" fill="none" stroke="${COR.linha}" stroke-width="3"/>`;
    }
    let elos = "";
    for (let i = 0; i < 14; i++) {
      const x = 600 + i * 52;
      elos += i % 2 === 0
        ? `<ellipse id="${id}-e${i}" cx="${x}" cy="470" rx="34" ry="18" fill="none" stroke="${COR.ambar}" stroke-width="7" opacity="0"/>`
        : `<line id="${id}-e${i}" x1="${x - 20}" y1="470" x2="${x + 20}" y2="470" stroke="${COR.ambar}" stroke-width="7" stroke-linecap="round" opacity="0"/>`;
    }
    const svg = `
    <g transform="translate(-90 50)"><g id="${id}-maquina">
      <rect x="640" y="250" width="640" height="400" rx="40" fill="#14151b" stroke="${COR.ambar}" stroke-width="3"/>
      <rect x="690" y="290" width="540" height="20" rx="10" fill="${COR.grafite}"/>
      ${rolos}
      <rect x="700" y="580" width="520" height="34" rx="12" fill="${COR.grafite}"/>
      <g id="${id}-alavanca"><line x1="1310" y1="440" x2="1310" y2="270" stroke="${COR.nevoa}" stroke-width="10" stroke-linecap="round"/><circle cx="1310" cy="262" r="24" fill="${COR.sangue}"/></g>
      <rect x="1280" y="420" width="30" height="50" rx="8" fill="${COR.grafite}"/>
    </g></g>
    <path id="${id}-fio" d="M560,470 C760,420 860,520 960,470 S1160,420 1360,470" stroke="${COR.ambar}" stroke-width="3" fill="none" stroke-dasharray="900" stroke-dashoffset="900"/>
    <g id="${id}-corrente">${elos}</g>`;
    const giros = [at("l1"), at("l2"), at("l3", 1), at("l6")];
    let js = "";
    giros.forEach((t0, p) => {
      js += p === 0
        ? `\n    tl.fromTo("#${id}-alavanca", { rotation: 0, svgOrigin: "1310 440" }, { rotation: 35, svgOrigin: "1310 440", duration: 0.25, ease: "power2.in", yoyo: true, repeat: 1 }, ${r3(t0)});`
        : `\n    tl.to("#${id}-alavanca", { rotation: 35, svgOrigin: "1310 440", duration: 0.25, ease: "power2.in", yoyo: true, repeat: 1 }, ${r3(t0)});`;
      for (let k = 0; k < 3; k++) {
        js += p === 0
          ? `\n    tl.fromTo("#${id}-r${k}", { y: 0 }, { y: ${alvos(k)[p] * S}, duration: ${(1.4 + k * 0.45).toFixed(2)}, ease: "power3.out" }, ${r3(t0 + 0.2)});`
          : `\n    tl.to("#${id}-r${k}", { y: ${alvos(k)[p] * S}, duration: ${(1.4 + k * 0.45).toFixed(2)}, ease: "power3.out" }, ${r3(t0 + 0.2)});`;
      }
    });
    const tv = at("vinculo");
    js += `
    tl.to("#${id}-maquina", { opacity: 0, y: -40, duration: 0.9, ease: "power2.in" }, ${r3(tv)});
    tl.to("#${id}-fio", { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" }, ${r3(tv + 0.8)});
    tl.to("#${id}-fio", { opacity: 0, duration: 1.2 }, ${r3(tv + 3.4)});`;
    for (let i = 0; i < 14; i++) js += `\n    tl.fromTo("#${id}-e${i}", { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, ${r3(tv + 2.8 + i * 0.09)});`;
    return { svg, js };
  },

  sinal5(id, at, dur) {
    const P = [[960, 200], [700, 640], [1220, 640]];
    const r = prng(55);
    const plateia = Array.from({ length: 70 }, (_, i) => {
      const a = r() * Math.PI * 2, d = 380 + r() * 300;
      return `<circle id="${id}-p${i}" cx="${(960 + Math.cos(a) * d * 1.3).toFixed(0)}" cy="${(470 + Math.sin(a) * d * 0.62).toFixed(0)}" r="${(2 + r() * 3).toFixed(1)}" fill="${COR.nevoa}" opacity="0"/>`;
    }).join("");
    const linhas = [[0, 1], [1, 2], [2, 0]].map(([a, b], i) => `<line id="${id}-l${i}" x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" stroke="${COR.ambar}" stroke-width="3" opacity="0.15"/>`).join("");
    const pontos = P.map(([x, y], i) => `<g id="${id}-v${i}"><circle cx="${x}" cy="${y}" r="60" fill="url(#${id}-glow)"/><circle cx="${x}" cy="${y}" r="15" fill="${COR.off}"/></g>`).join("");
    const svg = `<defs><radialGradient id="${id}-glow"><stop offset="0%" stop-color="${COR.off}" stop-opacity="0.45"/><stop offset="100%" stop-color="${COR.off}" stop-opacity="0"/></radialGradient></defs>
      <g id="${id}-plateia">${plateia}</g><g id="${id}-tri">${linhas}${pontos}</g>`;
    let js = "";
    let t = 0.6;
    const ord = [0, 2, 1, 0, 1, 2];
    let i = 0;
    const fora = at("l5");
    while (t < fora) {
      const l = ord[i++ % ord.length];
      js += `\n    tl.to("#${id}-l${l}", { opacity: 1, duration: 0.5, yoyo: true, repeat: 1, ease: "sine.inOut" }, ${r3(t)});`;
      t += 1.1;
    }
    const tp = at("plateia");
    for (let k = 0; k < 70; k++) js += `\n    tl.fromTo("#${id}-p${k}", { opacity: 0 }, { opacity: ${(0.25 + (k % 5) * 0.08).toFixed(2)}, duration: 0.6 }, ${r3(tp - 1.8 + (k % 23) * 0.06)});`;
    js += `
    tl.to("#${id}-plateia", { opacity: 0.35, duration: 2 }, ${r3(fora - 3)});
    tl.to("#${id}-l1, #${id}-l2", { opacity: 0, duration: 1.2 }, ${r3(fora)});
    tl.to("#${id}-l0", { opacity: 0.8, duration: 1.2 }, ${r3(fora)});
    tl.to("#${id}-v2", { x: 260, y: 90, opacity: 0.3, duration: 3, ease: "power2.inOut" }, ${r3(fora)});`;
    return { svg, js };
  },

  sinal6(id, at, dur) {
    const fuga = [960, 330];
    let chao = "";
    for (let i = -6; i <= 6; i++) chao += `<line x1="${fuga[0]}" y1="${fuga[1]}" x2="${960 + i * 260}" y2="1080" stroke="${COR.linha}" stroke-width="2"/>`;
    const membro = (idm, x1, y1, x2, y2, w = 16) => `<line id="${idm}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#16171d" stroke-width="${w}" stroke-linecap="round"/>`;
    const svg = `
    <defs><linearGradient id="${id}-faixa" x1="0" x2="1"><stop offset="0%" stop-color="${COR.ambar}" stop-opacity="0"/><stop offset="50%" stop-color="#f3d47a"/><stop offset="100%" stop-color="${COR.ambar}" stop-opacity="0"/></linearGradient></defs>
    <g opacity="0.8">${chao}</g>
    <g id="${id}-chegada"><rect x="660" y="520" width="600" height="10" rx="5" fill="url(#${id}-faixa)"/><rect x="660" y="490" width="600" height="70" fill="url(#${id}-faixa)" opacity="0.12"/></g>
    <g id="${id}-ampulheta" transform="translate(420 330)">
      <path d="M-50,-90 L50,-90 L6,0 L50,90 L-50,90 L-6,0 Z" fill="none" stroke="${COR.nevoa}" stroke-width="4"/>
      <polygon id="${id}-areia1" points="-38,-80 38,-80 4,-6 -4,-6" fill="${COR.ambar}" opacity="0.8"/>
      <polygon id="${id}-areia2" points="-40,86 40,86 0,40" fill="${COR.ambar}" opacity="0.8"/>
      <line x1="0" y1="-4" x2="0" y2="84" stroke="${COR.ambar}" stroke-width="2" opacity="0.8"/>
    </g>
    <g id="${id}-corredor" stroke="${COR.linha}">
      <circle cx="960" cy="640" r="30" fill="#16171d" stroke="${COR.linha}" stroke-width="2"/>
      ${membro(`${id}-tronco`, 960, 672, 960, 790, 30)}
      ${membro(`${id}-bd`, 960, 690, 1010, 760)}${membro(`${id}-be`, 960, 690, 910, 760)}
      ${membro(`${id}-pd`, 960, 790, 1000, 900)}${membro(`${id}-pe`, 960, 790, 920, 900)}
    </g>`;
    const passo = 0.38;
    const n = Math.floor(dur / passo) - 1;
    let js = `
    tl.fromTo("#${id}-pd", { rotation: -28, svgOrigin: "960 790" }, { rotation: 28, svgOrigin: "960 790", duration: ${passo}, ease: "sine.inOut", repeat: ${n}, yoyo: true }, 0);
    tl.fromTo("#${id}-pe", { rotation: 28, svgOrigin: "960 790" }, { rotation: -28, svgOrigin: "960 790", duration: ${passo}, ease: "sine.inOut", repeat: ${n}, yoyo: true }, 0);
    tl.fromTo("#${id}-bd", { rotation: 30, svgOrigin: "960 690" }, { rotation: -30, svgOrigin: "960 690", duration: ${passo}, ease: "sine.inOut", repeat: ${n}, yoyo: true }, 0);
    tl.fromTo("#${id}-be", { rotation: -30, svgOrigin: "960 690" }, { rotation: 30, svgOrigin: "960 690", duration: ${passo}, ease: "sine.inOut", repeat: ${n}, yoyo: true }, 0);
    tl.fromTo("#${id}-corredor", { y: 0 }, { y: -10, duration: ${passo / 2}, ease: "sine.inOut", repeat: ${n * 2 + 1}, yoyo: true }, 0);
    tl.fromTo("#${id}-areia1", { scaleY: 1, transformOrigin: "50% 100%" }, { scaleY: 0.15, transformOrigin: "50% 100%", duration: ${r3(dur)}, ease: "none" }, 0);
    tl.fromTo("#${id}-areia2", { scaleY: 0.2, transformOrigin: "50% 100%" }, { scaleY: 1, transformOrigin: "50% 100%", duration: ${r3(dur)}, ease: "none" }, 0);`;
    // A linha de chegada se afasta a cada nova exigência.
    const marcos = [at("l1", 2), at("tom"), at("tom", 1.6), at("tom", 3.2), at("stark", 2), at("agradar")];
    let y = 520, s = 1;
    js += `\n    tl.fromTo("#${id}-chegada", { y: 0, scaleX: 1, svgOrigin: "960 525" }, { y: 120, scaleX: 1.25, svgOrigin: "960 525", duration: ${r3(marcos[0])}, ease: "sine.in" }, 0);`;
    marcos.forEach((t0, i) => {
      y = 120 - (i + 1) * 30; s = 1.25 - (i + 1) * 0.12;
      js += `\n    tl.to("#${id}-chegada", { y: ${y}, scaleX: ${s.toFixed(2)}, svgOrigin: "960 525", duration: 0.9, ease: "power3.out" }, ${r3(t0)});`;
    });
    return { svg, js };
  },

  sinal7(id, at, dur) {
    const msgs = ["Oi, tudo bem?", "Aconteceu algo?", "Fala comigo…"];
    const bolhas = msgs.map((m, i) => `<g id="${id}-m${i}" opacity="0"><rect x="${1236 - m.length * 15}" y="${296 + i * 92}" width="${m.length * 15 + 34}" height="54" rx="20" fill="${COR.grafite}" stroke="${COR.ambar}" stroke-width="1.5"/>
      <text x="${1253 - m.length * 15}" y="${332 + i * 92}" font-family="Inter" font-weight="500" font-size="28" fill="${COR.off}">${escapar(m)}</text>
      <text x="1270" y="${374 + i * 92}" text-anchor="end" font-family="Inter" font-weight="500" font-size="18" fill="${COR.nevoa}" data-layout-ignore>Visualizada</text></g>`).join("");
    const dias = ["1 dia", "2 dias", "3 dias", "5 dias"].map((d, i) => `<text id="${id}-d${i}" x="520" y="500" text-anchor="middle" font-family="Bebas Neue" font-size="56" letter-spacing="4" fill="${COR.nevoa}" opacity="0">${d}</text>`).join("");
    const svg = `
    <path d="M520,700 Q520,520 600,520 L1460,520 Q1540,520 1540,700 L1540,820 L520,820 Z" fill="#111217" stroke="${COR.linha}" stroke-width="2"/>
    <path d="M600,690 Q900,670 1200,700 M520,740 Q980,720 1400,760" stroke="#1d1e25" stroke-width="3" fill="none"/>
    <g id="${id}-celular" transform="translate(-170 60)"><rect x="960" y="200" width="340" height="470" rx="40" fill="#101116" stroke="#34353e" stroke-width="3"/>
      <rect x="974" y="216" width="312" height="438" rx="30" fill="#17181e"/>${bolhas}
      <g id="${id}-digitando" opacity="0"><rect x="990" y="600" width="80" height="36" rx="16" fill="#2a2b33"/><circle cx="1012" cy="618" r="5" fill="${COR.nevoa}"/><circle cx="1030" cy="618" r="5" fill="${COR.nevoa}"/><circle cx="1048" cy="618" r="5" fill="${COR.nevoa}"/></g></g>
    <g id="${id}-relogio"><circle cx="520" cy="320" r="100" fill="#111217" stroke="${COR.nevoa}" stroke-width="4"/>
      ${Array.from({ length: 12 }, (_, i) => `<line x1="520" y1="232" x2="520" y2="${i % 3 ? 242 : 252}" stroke="${COR.nevoa}" stroke-width="3" transform="rotate(${i * 30} 520 320)"/>`).join("")}
      <line id="${id}-hora" x1="520" y1="320" x2="520" y2="268" stroke="${COR.off}" stroke-width="7" stroke-linecap="round"/>
      <line id="${id}-min" x1="520" y1="320" x2="520" y2="244" stroke="${COR.ambar}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="520" cy="320" r="7" fill="${COR.off}"/></g>
    ${dias}`;
    const t2 = at("l2");
    let js = "";
    msgs.forEach((_, i) => {
      js += `\n    tl.fromTo("#${id}-m${i}", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, ${r3(0.8 + i * 2.2)});`;
    });
    js += `
    tl.fromTo("#${id}-digitando", { opacity: 0 }, { opacity: 1, duration: 0.3, yoyo: true, repeat: 3, repeatDelay: 0.6 }, ${r3(at("l1"))});
    tl.fromTo("#${id}-min", { rotation: 0, svgOrigin: "520 320" }, { rotation: ${360 * 30}, svgOrigin: "520 320", duration: ${r3(dur)}, ease: "none" }, 0);
    tl.fromTo("#${id}-hora", { rotation: 0, svgOrigin: "520 320" }, { rotation: ${30 * 30}, svgOrigin: "520 320", duration: ${r3(dur)}, ease: "none" }, 0);`;
    [0, 1, 2, 3].forEach((i) => {
      const t0 = t2 + i * 1.6;
      js += `\n    tl.fromTo("#${id}-d${i}", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${r3(t0)});`;
      if (i < 3) js += `\n    tl.to("#${id}-d${i}", { opacity: 0, duration: 0.3 }, ${r3(t0 + 1.4)});`;
    });
    return { svg, js };
  },

  conexao(id, at, dur) {
    const icones = [
      (x, y) => `<path d="M${x},${y + 16} C${x - 30},${y - 4} ${x - 18},${y - 28} ${x},${y - 12} C${x + 18},${y - 28} ${x + 30},${y - 4} ${x},${y + 16} Z" fill="${COR.ambar}"/>`,
      (x, y) => `<path d="M${x},${y - 24} Q${x + 16},${y} ${x},${y + 22} Q${x - 16},${y} ${x},${y - 24} Z" fill="${COR.ambar}"/>`,
      (x, y) => `<rect x="${x - 16}" y="${y - 24}" width="32" height="48" fill="none" stroke="${COR.ambar}" stroke-width="4"/><rect x="${x + 6}" y="${y - 20}" width="6" height="40" fill="${COR.ambar}"/>`,
      (x, y) => [-14, 0, 14].map((d) => `<rect x="${x + d - 5}" y="${y - 18}" width="10" height="36" rx="3" fill="${COR.ambar}"/>`).join(""),
      (x, y) => `<polygon points="${x},${y - 22} ${x - 22},${y + 16} ${x + 22},${y + 16}" fill="none" stroke="${COR.ambar}" stroke-width="4"/>`,
      (x, y) => `<line x1="${x - 24}" y1="${y + 18}" x2="${x + 24}" y2="${y + 18}" stroke="${COR.ambar}" stroke-width="4"/><line x1="${x - 8}" y1="${y + 18}" x2="${x - 8}" y2="${y - 22}" stroke="${COR.ambar}" stroke-width="4"/><path d="M${x - 8},${y - 22} L${x + 18},${y - 12} L${x - 8},${y - 2} Z" fill="${COR.ambar}"/>`,
      (x, y) => `<path d="M${x - 22},${y - 16} h44 v26 h-28 l-12,10 v-10 h-4 Z" fill="none" stroke="${COR.ambar}" stroke-width="4"/><circle cx="${x - 9}" cy="${y - 3}" r="3" fill="${COR.ambar}"/><circle cx="${x}" cy="${y - 3}" r="3" fill="${COR.ambar}"/><circle cx="${x + 9}" cy="${y - 3}" r="3" fill="${COR.ambar}"/>`,
    ];
    const xs = icones.map((_, i) => 480 + i * 160);
    const y = 440;
    const svg = `
    <defs><radialGradient id="${id}-luz"><stop offset="0%" stop-color="${COR.off}" stop-opacity="0.22"/><stop offset="100%" stop-color="${COR.off}" stop-opacity="0"/></radialGradient></defs>
    <circle id="${id}-luzsuave" cx="960" cy="440" r="760" fill="url(#${id}-luz)" opacity="0"/>
    <path id="${id}-fioe" d="M${xs[0]},${y} L${xs[3] + 80},${y}" stroke="${COR.nevoa}" stroke-width="2.5" fill="none" stroke-dasharray="700" stroke-dashoffset="700"/>
    <path id="${id}-fiod" d="M${xs[3] + 80},${y} L${xs[6]},${y}" stroke="${COR.nevoa}" stroke-width="2.5" fill="none" stroke-dasharray="700" stroke-dashoffset="700"/>
    ${icones.map((f, i) => `<g id="${id}-i${i}" opacity="0"><circle cx="${xs[i]}" cy="${y}" r="52" fill="${COR.preto}" stroke="${COR.nevoa}" stroke-width="2.5"/>${f(xs[i], y)}</g>`).join("")}`;
    let js = "";
    icones.forEach((_, i) => {
      js += `\n    tl.fromTo("#${id}-i${i}", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, ${r3(0.5 + i * 0.35)});`;
    });
    const ruptura = at("l2", -0.4);
    js += `
    tl.to("#${id}-fioe", { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut" }, ${r3(at("l1"))});
    tl.to("#${id}-fiod", { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut" }, ${r3(at("l1", 1.0))});
    tl.to("#${id}-fioe", { rotation: 6, svgOrigin: "${xs[0]} ${y}", opacity: 0, duration: 1.4, ease: "power2.in" }, ${r3(ruptura)});
    tl.to("#${id}-fiod", { rotation: -6, svgOrigin: "${xs[6]} ${y}", opacity: 0, duration: 1.4, ease: "power2.in" }, ${r3(ruptura)});
    tl.fromTo("#${id}-luzsuave", { opacity: 0 }, { opacity: 1, duration: 3, ease: "sine.inOut" }, ${r3(ruptura + 0.8)});`;
    return { svg, js };
  },

  cuidado(id, at, dur) {
    const svg = `
    <defs>
      <linearGradient id="${id}-aurora" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1b2030"/><stop offset="60%" stop-color="#6a4a2a"/><stop offset="100%" stop-color="#e2b65a"/></linearGradient>
      <radialGradient id="${id}-sol"><stop offset="0%" stop-color="#fbe3a0" stop-opacity="0.95"/><stop offset="100%" stop-color="#fbe3a0" stop-opacity="0"/></radialGradient>
      <clipPath id="${id}-vidro"><rect x="700" y="160" width="520" height="560"/></clipPath>
      <linearGradient id="${id}-chao" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${COR.ambar}" stop-opacity="0.25"/><stop offset="100%" stop-color="${COR.ambar}" stop-opacity="0"/></linearGradient>
    </defs>
    <g id="${id}-janela">
      <polygon id="${id}-feixe" points="700,720 1220,720 1500,1080 420,1080" fill="url(#${id}-chao)" opacity="0"/>
      <g clip-path="url(#${id}-vidro)">
        <rect x="700" y="160" width="520" height="560" fill="#0e1018"/>
        <rect id="${id}-ceu" x="700" y="160" width="520" height="560" fill="url(#${id}-aurora)" opacity="0"/>
        <circle id="${id}-astro" cx="960" cy="860" r="220" fill="url(#${id}-sol)"/>
        <path d="M700,640 Q820,600 930,632 T1220,620 L1220,720 L700,720 Z" fill="#0b0c10"/>
      </g>
      <rect x="700" y="160" width="520" height="560" fill="none" stroke="#3a3b44" stroke-width="12"/>
      <polygon id="${id}-folhae" points="706,166 960,166 960,714 706,714" fill="#15161b" stroke="#3a3b44" stroke-width="6"/>
      <polygon id="${id}-folhad" points="960,166 1214,166 1214,714 960,714" fill="#15161b" stroke="#3a3b44" stroke-width="6"/>
    </g>`;
    const tc = at("cvv");
    const js = `
    tl.to("#${id}-folhae", { scaleX: 0.12, svgOrigin: "706 440", duration: 3.2, ease: "power2.inOut" }, 1.2);
    tl.to("#${id}-folhad", { scaleX: 0.12, svgOrigin: "1214 440", duration: 3.2, ease: "power2.inOut" }, 1.4);
    tl.fromTo("#${id}-ceu", { opacity: 0 }, { opacity: 1, duration: ${r3(dur * 0.7)}, ease: "sine.inOut" }, 2);
    tl.fromTo("#${id}-astro", { y: 0 }, { y: -260, duration: ${r3(dur - 2)}, ease: "sine.out" }, 2);
    tl.fromTo("#${id}-feixe", { opacity: 0 }, { opacity: 1, duration: 4 }, 3);
    tl.to("#${id}-janela", { scale: 0.62, y: -150, svgOrigin: "960 440", duration: 1.4, ease: "power3.inOut" }, ${r3(tc - 0.8)});`;
    return { svg, js };
  },

  cta(id, at, dur) {
    const svg = `
    <defs><radialGradient id="${id}-brilho"><stop offset="0%" stop-color="${COR.ambar}" stop-opacity="0.35"/><stop offset="100%" stop-color="${COR.ambar}" stop-opacity="0"/></radialGradient></defs>
    <ellipse id="${id}-aura" cx="960" cy="330" rx="620" ry="220" fill="url(#${id}-brilho)"/>
    <g id="${id}-like" opacity="0"><circle cx="830" cy="560" r="52" fill="none" stroke="${COR.ambar}" stroke-width="3"/>
      <path d="M806,584 L806,556 L816,556 L832,526 Q842,522 844,534 L840,552 L860,552 Q868,554 866,564 L860,584 Z" fill="${COR.ambar}"/></g>
    <g id="${id}-inscrever" opacity="0"><rect x="920" y="520" width="260" height="80" rx="40" fill="none" stroke="${COR.ambar}" stroke-width="3"/>
      <text x="1050" y="572" text-anchor="middle" font-family="Bebas Neue" font-size="40" letter-spacing="3" fill="${COR.off}">INSCREVA-SE</text></g>`;
    const html = `<div id="${id}-logo" class="logo cta"><span data-var-text="canal">${escapar(CANAL_PADRAO)}</span><i id="${id}-traco"></i></div>`;
    const js = `
    tl.fromTo("#${id}-logo span", { opacity: 0, filter: "blur(16px)" }, { opacity: 1, filter: "blur(0px)", duration: 1.6, ease: "power3.out" }, 0.3);
    tl.fromTo("#${id}-traco", { scaleX: 0 }, { scaleX: 1, duration: 1, ease: "expo.out" }, 1.2);
    tl.fromTo("#${id}-aura", { opacity: 0.3 }, { opacity: 1, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: ${Math.max(1, Math.floor(dur / 2.4) - 1)} }, 0);
    tl.fromTo("#${id}-like", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, ${r3(at("l0", 3))});
    tl.fromTo("#${id}-like", { scale: 1, transformOrigin: "50% 50%" }, { scale: 1.15, duration: 0.18, yoyo: true, repeat: 1 }, ${r3(at("l0", 4.2))});
    tl.fromTo("#${id}-inscrever", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, ${r3(at("l1"))});
    tl.fromTo("#${id}-inscrever", { scale: 1, transformOrigin: "50% 50%" }, { scale: 1.08, duration: 0.18, yoyo: true, repeat: 1 }, ${r3(at("l1", 1.2))});`;
    return { svg, html, js };
  },
};

// ---------------------------------------------------------------- cena (sub-composição)
const FONTES_CSS = `
    @font-face { font-family: "Bebas Neue"; src: url("assets/fonts/bebas-neue.woff2") format("woff2"); font-weight: 400; }
    @font-face { font-family: "Cormorant Garamond"; src: url("assets/fonts/cormorant-garamond-italic.woff2") format("woff2"); font-style: italic; font-weight: 500; }`;

function cena(id, bloco, primeiraDaParte) {
  const T = tempos[id];
  if (!T) throw new Error(`Sem tempos para ${id}: rode scripts/gerar_voz.py`);
  const dur = T.duracao;
  const linhas = T.linhas;
  const ids = Object.keys(linhas);
  const at = (lid, d = 0) => {
    const l = linhas[lid] ?? linhas[ids[Number(String(lid).replace("l", ""))]];
    if (!l) throw new Error(`${id}: linha ${lid} não existe`);
    return l.ini + d;
  };
  const motivo = MOTIVOS[id](id, at, dur);
  const numerado = bloco.numero != null;
  const inicioMotivo = numerado ? at("l0", 0) + (linhas[ids[0]].fim - linhas[ids[0]].ini) + 0.2 : 0;

  // Poeira: posições fixas (sorteio com semente) e deriva lenta para cima.
  const r = prng(id.length * 97 + dur * 10);
  const poeira = Array.from({ length: 26 }, (_, i) => {
    const x = r() * 1920, y = r() * 1080, s = 1.5 + r() * 3;
    return `<circle id="${id}-po${i}" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${s.toFixed(1)}" fill="${COR.off}" opacity="${(0.08 + r() * 0.22).toFixed(2)}"/>`;
  }).join("");

  // Textos na tela: cada um fica até o próximo, até 9 s, ou até o fim do bloco.
  const textos = (bloco.textos ?? []).map((c) => ({ ...c, ini: at(c.em, c.atraso ?? 0) }));
  textos.forEach((c, i) => {
    const prox = textos[i + 1]?.ini ?? Infinity;
    c.fim = Math.min(prox - 0.2, c.ini + (c.estilo === "cvv" ? 60 : 9), dur - FADE);
  });
  const textosHtml = textos
    .filter((c) => c.estilo !== "celular")
    .map((c, i) => {
      let miolo;
      if (c.estilo === "lista") {
        miolo = `<div class="lista-titulo">${comEnfase(c.texto)}</div><div class="lista">${c.itens.map((it, k) => `<span id="${id}-it${k}">${escapar(it)}</span>`).join("")}</div>`;
      } else if (c.estilo === "cvv") {
        miolo = `<div class="cvv-linha1">CVV · ligue <em>188</em></div><div class="cvv-linha2">gratuito, 24 horas, com sigilo</div><div class="cvv-linha3">cvv.org.br</div>`;
      } else if (c.estilo === "comentario") {
        miolo = `<svg width="64" height="56" viewBox="0 0 64 56"><path d="M6,6 h52 v32 h-34 l-14,12 v-12 h-4 Z" fill="none" stroke="${COR.ambar}" stroke-width="4"/></svg><span>${comEnfase(c.texto)}</span>`;
      } else {
        miolo = comEnfase(c.texto);
      }
      return `<div id="${id}-t${i}" class="clip cue cue-${c.estilo}" data-start="${r3(c.ini)}" data-duration="${r3(c.fim - c.ini)}" data-track-index="2"><div class="cue-in">${miolo}</div></div>`;
    })
    .join("\n      ");
  const textosVisiveis = textos.filter((c) => c.estilo !== "celular");

  const fontes = (bloco.fontes ?? []).map((f) => ({ ...f, ini: at(f.em, f.atraso ?? 0) }));
  const fontesHtml = fontes
    .map((f, i) => `<div id="${id}-fonte${i}" class="clip fonte" data-start="${r3(f.ini)}" data-duration="4" data-track-index="3"><div class="fonte-in"><div class="fonte-autor">${escapar(f.autor)}</div><div class="fonte-ano">${escapar(f.ano)}</div><div class="fonte-revista">${escapar(f.revista)}</div></div></div>`)
    .join("\n      ");

  const tituloHtml = numerado
    ? `<div id="${id}-titulo" class="titulo-sinal"><div class="num">Sinal ${bloco.numero}</div><div class="nome">${escapar(bloco.nome)}</div></div>
      <div id="${id}-tag" class="tag"><b>${bloco.numero}</b> · ${escapar(bloco.nome)}</div>`
    : "";

  let js = `
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#${id}-luz", { x: -120, opacity: 0.7 }, { x: 120, opacity: 1, duration: ${r3(dur)}, ease: "sine.inOut" }, 0);
    tl.fromTo("#${id}-motivo", { scale: 1 }, { scale: 1.04, duration: ${r3(dur)}, ease: "none" }, 0);`;
  for (let i = 0; i < 26; i++) {
    js += `\n    tl.fromTo("#${id}-po${i}", { y: 0, x: 0 }, { y: ${-(30 + ((i * 37) % 60))}, x: ${((i * 23) % 40) - 20}, duration: ${r3(dur)}, ease: "none" }, 0);`;
  }
  if (numerado) {
    const sai = inicioMotivo;
    js += primeiraDaParte
      ? `\n    tl.fromTo("#${id}-titulo", { opacity: 0.4, filter: "blur(10px)", y: 20 }, { opacity: 1, filter: "blur(0px)", y: 0, duration: 1.0, ease: "power3.out" }, 0);`
      : `\n    tl.fromTo("#${id}-titulo", { opacity: 0, filter: "blur(10px)", y: 20 }, { opacity: 1, filter: "blur(0px)", y: 0, duration: 1.0, ease: "power3.out" }, 0.3);`;
    js += `
    tl.to("#${id}-titulo", { opacity: 0, y: -30, filter: "blur(8px)", duration: 0.7, ease: "power2.in" }, ${r3(sai - 0.5)});
    tl.fromTo("#${id}-tag", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.6, ease: "power2.out" }, ${r3(sai)});
    tl.fromTo("#${id}-motivo", { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "power1.out" }, ${r3(sai - 0.2)});`;
  }
  js += motivo.js;
  textosVisiveis.forEach((c, i) => {
    js += `\n    tl.fromTo("#${id}-t${i} .cue-in", { opacity: 0, y: 18, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8, ease: "power3.out" }, ${r3(c.ini)});`;
    if (c.estilo === "lista") c.itens.forEach((_, k) => (js += `\n    tl.fromTo("#${id}-it${k}", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, ${r3(c.ini + 1.6 + k * 1.1)});`));
    js += `\n    tl.to("#${id}-t${i} .cue-in", { opacity: 0, filter: "blur(6px)", duration: 0.4, ease: "power2.in" }, ${r3(c.fim - 0.42)});`;
  });
  fontes.forEach((f, i) => {
    js += `\n    tl.fromTo("#${id}-fonte${i} .fonte-in", { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, ${r3(f.ini)});`;
    js += `\n    tl.to("#${id}-fonte${i} .fonte-in", { opacity: 0, x: 20, duration: 0.4, ease: "power2.in" }, ${r3(f.ini + 3.55)});`;
  });
  if (!primeiraDaParte) js += `\n    tl.fromTo("#${id}-preto", { opacity: 1 }, { opacity: 0, duration: ${FADE}, ease: "power1.out" }, 0);`;
  else js += `\n    tl.set("#${id}-preto", { opacity: 0 }, 0);`;
  js += `\n    tl.to("#${id}-preto", { opacity: 1, duration: ${FADE - 0.1}, ease: "power1.in" }, ${r3(dur - FADE)});`;
  js += `\n    window.__timelines["${id}"] = tl;`;

  const variaveis = motivo.html?.includes("data-var-text")
    ? ` data-composition-variables='[{"id":"canal","type":"string","label":"Nome do canal","default":"${CANAL_PADRAO}"}]'`
    : "";

  return `<template>
  <style>${FONTES_CSS}
    #root { position: absolute; inset: 0; overflow: hidden; background: ${COR.preto}; font-family: "Inter", sans-serif; }
    #${id}-cena, #${id}-cena > svg, #${id}-motivo { position: absolute; inset: 0; }
    #${id}-luz { position: absolute; left: 50%; top: 40%; width: 1500px; height: 1100px; margin: -550px 0 0 -750px;
      background: radial-gradient(ellipse at center, rgba(201,162,39,0.13) 0%, rgba(201,162,39,0.04) 40%, rgba(201,162,39,0) 70%); }
    #${id}-preto { position: absolute; inset: 0; background: #000; pointer-events: none; }
    .assinatura-canto { position: absolute; left: 96px; bottom: 72px; width: 56px; height: 4px; background: ${COR.ambar}; opacity: 0.85; }
    .titulo-sinal { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .titulo-sinal .num { font-family: "Bebas Neue"; font-size: 64px; letter-spacing: 0.3em; color: ${COR.ambar}; }
    .titulo-sinal .nome { font-family: "Bebas Neue"; font-size: 190px; line-height: 0.95; letter-spacing: 0.02em; color: ${COR.off}; max-width: 1500px; }
    .tag { position: absolute; left: 192px; top: 118px; font-family: "Bebas Neue"; font-size: 40px; letter-spacing: 0.12em; color: ${COR.nevoa}; }
    .tag b { color: ${COR.ambar}; font-weight: 400; }
    .cue { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 130px; }
    .cue::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 420px; background: linear-gradient(to top, rgba(11,11,15,0.92), rgba(11,11,15,0)); }
    .cue-in { position: relative; max-width: 1500px; text-align: center; color: ${COR.off}; }
    .cue em { font-style: normal; color: ${COR.ambar}; }
    .cue-frase .cue-in { font-weight: 600; font-size: 60px; line-height: 1.2; letter-spacing: -0.01em; }
    .cue-titulo .cue-in { font-family: "Bebas Neue"; font-size: 170px; line-height: 1; letter-spacing: 0.03em; }
    .cue-citacao .cue-in { font-family: "Cormorant Garamond"; font-style: italic; font-weight: 500; font-size: 92px; line-height: 1.1; }
    .cue-lista .lista-titulo { font-family: "Bebas Neue"; font-size: 84px; letter-spacing: 0.04em; margin-bottom: 22px; }
    .cue-lista .lista { display: flex; gap: 56px; justify-content: center; font-weight: 600; font-size: 40px; color: ${COR.off}; }
    .cue-lista .lista span::before { content: ""; display: inline-block; width: 12px; height: 12px; border-radius: 6px; background: ${COR.ambar}; margin-right: 14px; vertical-align: middle; }
    .cue-cvv { padding-bottom: 150px; }
    .cue-cvv .cvv-linha1 { font-family: "Bebas Neue"; font-size: 140px; line-height: 1; letter-spacing: 0.04em; }
    .cue-cvv .cvv-linha2 { font-size: 40px; font-weight: 500; color: ${COR.nevoa}; margin-top: 10px; }
    .cue-cvv .cvv-linha3 { font-size: 52px; font-weight: 600; margin-top: 16px; }
    .cue-comentario .cue-in { display: flex; align-items: center; gap: 28px; font-weight: 600; font-size: 56px; }
    .fonte { position: absolute; inset: 0; pointer-events: none; }
    .fonte-in { position: absolute; right: 192px; top: 118px; width: 600px; padding: 30px 36px; background: ${COR.grafite}; border-left: 5px solid ${COR.ambar}; border-radius: 6px; }
    .fonte-autor { font-family: "Cormorant Garamond"; font-style: italic; font-weight: 500; font-size: 48px; line-height: 1.1; color: ${COR.off}; }
    .fonte-ano { font-weight: 700; font-size: 30px; letter-spacing: 0.08em; color: ${COR.ambar}; margin-top: 10px; }
    .fonte-revista { font-weight: 500; font-size: 30px; line-height: 1.35; color: ${COR.nevoa}; margin-top: 6px; }
    .nevoa { position: absolute; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(138,141,152,0.09) 0%, rgba(138,141,152,0.03) 45%, rgba(138,141,152,0) 70%); }
    .logo { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; }
    .logo span { font-family: "Bebas Neue"; font-size: 150px; letter-spacing: 0.14em; color: ${COR.off}; text-shadow: 0 0 40px rgba(201,162,39,0.35); }
    .logo i { display: block; width: 260px; height: 5px; background: ${COR.ambar}; }
    .logo.cta { justify-content: flex-start; padding-top: 220px; }
  </style>
  <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080"${variaveis}>
    <div id="${id}-cena">
      <div id="${id}-luz"></div>
      <svg viewBox="0 0 1920 1080" width="1920" height="1080">${poeira}</svg>
      <div id="${id}-motivo">
        <svg viewBox="0 0 1920 1080" width="1920" height="1080">${motivo.svg}
        </svg>
        ${motivo.html ?? ""}
      </div>
      ${tituloHtml}
      <div class="assinatura-canto"></div>
      ${textosHtml}
      ${fontesHtml}
      <div id="${id}-preto"></div>
    </div>
  </div>
  <script>${js}
  </script>
</template>
`;
}

// ---------------------------------------------------------------- partes (raiz)
function raiz(compId, titulo, blocosIds) {
  let t = 0;
  const hosts = [], audios = [];
  for (const b of blocosIds) {
    const T = tempos[b];
    const d = T.duracao;
    hosts.push(`<div id="${b}" class="clip" data-composition-id="${b}" data-composition-src="compositions/${b}.html" data-start="${r3(t)}" data-duration="${r3(d)}" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`);
    if (T.voz) audios.push(`<audio id="voz-${b}" src="${T.voz}" data-start="${r3(t)}" data-duration="${r3(d)}" data-track-index="1" data-volume="1"></audio>`);
    if (b === "assinatura") audios.push(`<audio id="sfx-${b}" src="assets/sfx/assinatura.m4a" data-start="${r3(t)}" data-duration="2.8" data-track-index="3" data-volume="1"></audio>`);
    // Trilha: na nota de cuidado o roteiro pede volume menor.
    const vol = b === "cuidado" ? 0.45 : 1;
    audios.push(`<audio id="trilha-${b}" src="assets/trilha/drone.m4a" data-start="${r3(t)}" data-duration="${r3(d)}" data-media-start="${r3(t % 600)}" data-track-index="2" data-volume="${vol}" data-fade-in="0.8" data-fade-out="0.8"></audio>`);
    t += d;
  }
  return `<!doctype html>
<!-- Gerado por scripts/montar.mjs: ${escapar(titulo)} -->
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: ${COR.preto}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${compId}" data-start="0" data-duration="${r3(t)}" data-width="1920" data-height="1080">
      ${hosts.join("\n      ")}
      ${audios.join("\n      ")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["${compId}"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
}

fs.mkdirSync(path.join(AQUI, "compositions"), { recursive: true });
const primeiros = new Set(roteiro.partes.map((p) => p.blocos[0]));
for (const [id, bloco] of Object.entries(roteiro.blocos)) {
  if (!tempos[id]) { console.warn(`pulei ${id}: sem tempos`); continue; }
  fs.writeFileSync(path.join(AQUI, `compositions/${id}.html`), cena(id, bloco, primeiros.has(id)));
}
const resumo = [];
for (const parte of roteiro.partes) {
  if (!parte.blocos.every((b) => tempos[b])) { console.warn(`pulei ${parte.id}: faltam tempos`); continue; }
  fs.mkdirSync(path.join(AQUI, "partes"), { recursive: true });
  fs.writeFileSync(path.join(AQUI, `partes/${parte.id}.html`), raiz("main", parte.titulo, parte.blocos));
  const d = parte.blocos.reduce((s, b) => s + tempos[b].duracao, 0);
  resumo.push(`${parte.id}: ${parte.blocos.join(" + ")} = ${d.toFixed(1)}s`);
}
// O HyperFrames usa só um arquivo raiz: index.html recebe a parte 1 (scripts/renderizar.sh troca a cada parte).
if (fs.existsSync(path.join(AQUI, "partes/parte-1.html"))) fs.copyFileSync(path.join(AQUI, "partes/parte-1.html"), path.join(AQUI, "index.html"));
console.log(resumo.join("\n"));
