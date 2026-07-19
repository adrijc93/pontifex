/* ================================================================
   RENDER — estética de juego (día), motor técnico intacto
   ================================================================ */
const cv = $('cv'), ctx = cv.getContext('2d');
const TACTIL_RENDER = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
let DPR = 1;
function redimensionar() {
  DPR = window.devicePixelRatio || 1;
  cv.width = cv.clientWidth * DPR;
  cv.height = cv.clientHeight * DPR;
}
window.addEventListener('resize', redimensionar);

function w2s(x, y) {
  return [(x - S.cam.x) * S.cam.esc + cv.clientWidth / 2,
          (S.cam.y - y) * S.cam.esc + cv.clientHeight / 2];
}
function s2w(px, py) {
  return [(px - cv.clientWidth / 2) / S.cam.esc + S.cam.x,
          S.cam.y - (py - cv.clientHeight / 2) / S.cam.esc];
}

function escalaDeformada() {
  if (!$('ver-deformada').checked || !S.resultados || !S.resultados.desp) return 0;
  let md = 1e-9;
  for (const d of S.resultados.desp) md = Math.max(md, Math.hypot(d.ux, d.uy));
  const span = esc().fin - esc().inicio;
  return Math.min(500, Math.max(1, 0.06 * span / md));
}
function posNodo(i) {
  const n = S.nodos[i];
  if (S._escDef && S.resultados && S.resultados.desp) {
    const d = S.resultados.desp[i];
    return { x: n.x + d.ux * S._escDef, y: n.y + d.uy * S._escDef };
  }
  return n;
}
function colorUtil(u) {
  if (u == null) return '#5c7cfa';
  if (u > 1) return '#e03131';
  if (u > 0.85) return '#f08c00';
  if (u > 0.6) return '#e6b800';
  if (u > 0.35) return '#74b816';
  return '#2f9e44';
}

/* ---------- nubes (parallax + deriva) ---------- */
const NUBES = [
  { x: 0.08, y: 0.10, s: 1.15, v: 5.5 },
  { x: 0.34, y: 0.20, s: 0.80, v: 8.0 },
  { x: 0.58, y: 0.07, s: 1.35, v: 4.2 },
  { x: 0.80, y: 0.16, s: 0.95, v: 6.6 },
  { x: 1.02, y: 0.26, s: 0.70, v: 9.5 },
];
function dibujarNube(x, y, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, 7);
  ctx.arc(24, -8, 26, 0, 7);
  ctx.arc(52, 0, 20, 0, 7);
  ctx.arc(26, 8, 24, 0, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(190,215,235,.55)';
  ctx.beginPath(); ctx.ellipse(26, 12, 34, 10, 0, 0, 7); ctx.fill();
  ctx.restore();
}

/* ---------- texto con halo (legible sobre fondo claro) ---------- */
function textoHalo(txt, x, y, color, font, align) {
  ctx.font = font || '10px monospace';
  ctx.textAlign = align || 'left';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = color;
  ctx.fillText(txt, x, y);
  ctx.textAlign = 'left';
}

function render(t) {
  const tms = (t || 0) / 1000;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const W = cv.clientWidth, H = cv.clientHeight;

  // cielo diurno
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#5aa9e6');
  grad.addColorStop(0.55, '#a5d8f5');
  grad.addColorStop(1, '#dff2fd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // sol con halo
  const solX = W - 90, solY = 70;
  const glow = ctx.createRadialGradient(solX, solY, 8, solX, solY, 78);
  glow.addColorStop(0, 'rgba(255,236,150,.95)');
  glow.addColorStop(0.35, 'rgba(255,224,130,.45)');
  glow.addColorStop(1, 'rgba(255,224,130,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(solX - 80, solY - 80, 160, 160);
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath(); ctx.arc(solX, solY, 26, 0, 7); ctx.fill();

  // nubes con parallax y deriva
  const par = -S.cam.x * S.cam.esc * 0.12;
  for (const n of NUBES) {
    const ancho = W + 260;
    let nx = (n.x * W + par + tms * n.v) % ancho;
    if (nx < -130) nx += ancho;
    dibujarNube(nx - 130, n.y * H, n.s);
  }

  S._escDef = S.colapso ? 0 : escalaDeformada();

  if ($('ver-rejilla').checked && !S.colapso) dibujarRejilla();
  dibujarTerreno(tms);
  if (S.colapso) dibujarColapso();
  else dibujarEstructura();
  dibujarVehiculo();
  dibujarEscala();
}

function dibujarRejilla() {
  const W = cv.clientWidth, H = cv.clientHeight;
  const [x0w] = s2w(0, 0), [x1w] = s2w(W, 0);
  const [, y0w] = s2w(0, H), [, y1w] = s2w(0, 0);
  ctx.lineWidth = 1;
  for (let x = Math.floor(x0w); x <= x1w; x++) {
    const mayor = x % 5 === 0;
    ctx.strokeStyle = mayor ? 'rgba(40,80,130,.20)' : 'rgba(40,80,130,.08)';
    const [sx] = w2s(x, 0);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
  }
  for (let y = Math.floor(y0w); y <= y1w; y++) {
    const mayor = y % 5 === 0;
    ctx.strokeStyle = mayor ? 'rgba(40,80,130,.20)' : 'rgba(40,80,130,.08)';
    const [, sy] = w2s(0, y);
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
  }
  // eje y = 0 (rasante)
  const [, sy0] = w2s(0, 0);
  ctx.strokeStyle = 'rgba(20,60,110,.45)';
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(0, sy0); ctx.lineTo(W, sy0); ctx.stroke();
  ctx.setLineDash([]);
  textoHalo('rasante y=0', 8, sy0 - 5, 'rgba(20,60,110,.8)', '10px monospace');
}

function dibujarTerreno(tms) {
  const t = esc().terreno;
  const H = cv.clientHeight;
  // masa de terreno (tierra)
  ctx.beginPath();
  let [sx0, sy0] = w2s(t[0][0], t[0][1]);
  ctx.moveTo(sx0, sy0);
  for (const [x, y] of t) { const [sx, sy] = w2s(x, y); ctx.lineTo(sx, sy); }
  ctx.lineTo(sx0 + (t[t.length - 1][0] - t[0][0]) * S.cam.esc, H + 50);
  ctx.lineTo(sx0, H + 50);
  ctx.closePath();
  const gTierra = ctx.createLinearGradient(0, sy0, 0, H);
  gTierra.addColorStop(0, '#97764e');
  gTierra.addColorStop(1, '#6b4f33');
  ctx.fillStyle = gTierra;
  ctx.fill();
  // hierba en la superficie
  ctx.beginPath();
  for (let i = 0; i < t.length; i++) {
    const [sx, sy] = w2s(t[i][0], t[i][1]);
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = '#5da24e'; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = '#82cc6f'; ctx.lineWidth = 2; ctx.stroke();

  // zonas de roca (cimentable) — bloques grises
  for (const [a, b] of esc().roca) {
    for (let x = a; x < b; x += 1.6) {
      const y = sueloY(x);
      const [sx, sy] = w2s(x, y);
      const w = 1.5 * S.cam.esc, h = 0.4 * S.cam.esc;
      ctx.fillStyle = 'rgba(160,168,178,.85)';
      ctx.fillRect(sx, sy + 2, w, Math.max(5, h));
      ctx.strokeStyle = 'rgba(90,98,108,.8)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy + 2, w, Math.max(5, h));
    }
  }
  // calzada en los estribos (asfalto con línea discontinua)
  for (const [a, b] of [esc().roca[0], esc().roca[esc().roca.length - 1]]) {
    ctx.strokeStyle = '#4a4f58'; ctx.lineWidth = Math.max(4, 0.4 * S.cam.esc);
    ctx.beginPath();
    for (let x = a; x <= b; x += 1) {
      const [sx, sy] = w2s(x, sueloY(x) + 0.05);
      x === a ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    for (let x = a; x <= b; x += 1) {
      const [sx, sy] = w2s(x, sueloY(x) + 0.05);
      x === a ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // agua animada
  if (esc().agua) {
    const ag = esc().agua;
    const [ax, ay] = w2s(ag.x0, ag.y);
    const [bx] = w2s(ag.x1, ag.y);
    const g = ctx.createLinearGradient(0, ay, 0, H);
    g.addColorStop(0, 'rgba(66,152,225,.80)');
    g.addColorStop(1, 'rgba(21,84,155,.92)');
    ctx.fillStyle = g;
    ctx.fillRect(ax, ay, bx - ax, H - ay);
    // oleaje superficial
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let sx = ax; sx <= bx; sx += 6) {
      const sy = ay + 1.5 * Math.sin(sx * 0.06 + tms * 2.2);
      sx === ax ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    // brillos que se desplazan
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.28 - k * 0.07})`;
      ctx.beginPath();
      const yk = ay + 8 + k * 9;
      for (let sx = ax; sx <= bx; sx += 8) {
        const sy = yk + 2 * Math.sin(sx * 0.045 + tms * (1.6 + k * 0.4) + k * 2);
        sx === ax ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
  }
}

function dibujarEstructura() {
  const R = S.resultados;
  // barras
  for (let i = 0; i < S.barras.length; i++) {
    const b = S.barras[i];
    const A = posNodo(b.a), B = posNodo(b.b);
    const [ax, ay] = w2s(A.x, A.y), [bx, by] = w2s(B.x, B.y);
    const m = MATERIALS[b.mat];
    const w = Math.max(2.5, Math.min(9, m.grosor * S.cam.esc / 25));

    if (b.rota) {
      ctx.strokeStyle = 'rgba(224,49,49,.4)'; ctx.lineWidth = Math.max(1.5, w * 0.8);
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.strokeStyle = '#c92a2a'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(mx - 7, my - 7); ctx.lineTo(mx + 7, my + 7);
      ctx.moveTo(mx + 7, my - 7); ctx.lineTo(mx - 7, my + 7);
      ctx.stroke();
      continue;
    }

    let color = m.color, dash = false;
    if (R && R.us && R.us[i]) {
      if (R.activas && !R.activas[i]) { color = 'rgba(120,125,130,.5)'; dash = true; } // cable aflojado
      else color = colorUtil(R.us[i].u);
    }
    // resaltado hover/selección
    if (i === S.hoverBarra || i === S.selBarra) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = w + 7;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    // contorno oscuro + núcleo de color (estilo cartoon)
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2f38';
    ctx.lineWidth = w + 2.6;
    if (dash) ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';

    // tablero: banda de rodadura asfaltada
    if (b.tablero) {
      ctx.strokeStyle = '#343a40'; ctx.lineWidth = Math.max(4, 0.34 * S.cam.esc);
      ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // etiqueta de axil
    if (R && R.us && R.us[i] && $('ver-axiles').checked && S.cam.esc > 12 && !(R.activas && !R.activas[i])) {
      const N = R.axiles[i];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const txt = (N >= 0 ? '+' : '−') + fmt(Math.abs(N) / 1e3, 0) + (N >= 0 ? ' T' : ' C');
      textoHalo(txt, mx + 5, my - 5, N >= 0 ? '#2b8a3e' : '#1971c2', 'bold 10px monospace');
    }
  }

  // nudos y apoyos
  for (let i = 0; i < S.nodos.length; i++) {
    const p = posNodo(i), n = S.nodos[i];
    const [sx, sy] = w2s(p.x, p.y);
    if (n.apoyo !== 'ninguno') dibujarApoyo(sx, sy, n.apoyo);
    ctx.beginPath();
    ctx.arc(sx, sy, i === S.hoverNodo || i === S.pendienteNodo ? 6 : 4.2, 0, 7);
    ctx.fillStyle = i === S.pendienteNodo ? '#ffd43b' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = 1.6; ctx.stroke();
  }

  // reacciones
  if (R && R.reacciones && $('ver-reacciones').checked) {
    for (const r of R.reacciones) {
      const p = posNodo(r.nodo);
      const [sx, sy] = w2s(p.x, p.y);
      let txt = `Ry=${fmt(r.ry / 1e3, 0)}kN`;
      if (Math.abs(r.rx) > 500) txt += ` Rx=${fmt(r.rx / 1e3, 0)}kN`;
      textoHalo(txt, sx - 18, sy + 24, '#862e9c', 'bold 10px monospace');
    }
  }

  // barra pendiente (preview)
  if (S.pendienteNodo >= 0 && S._raton) {
    const p = posNodo(S.pendienteNodo);
    const [ax, ay] = w2s(p.x, p.y);
    const [bx, by] = w2s(S._raton[0], S._raton[1]);
    ctx.strokeStyle = MATERIALS[S.mat].color; ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
  }

  // leyenda deformada (elevada en táctil para no chocar con los FAB)
  if (S._escDef) {
    const fd = S.resultados.maxDespPaso !== undefined ? S.resultados.maxDespPaso : 0;
    const yLey = cv.clientHeight - (TACTIL_RENDER ? 92 : 28);
    textoHalo(`Deformada ×${fmt(S._escDef, 0)} (flecha ELS paso: ${fmt(fd * 1000, 1)} mm)`,
      10, yLey, 'rgba(30,50,80,.85)', '11px monospace');
  }
}

function dibujarApoyo(sx, sy, tipo) {
  const e = S.cam.esc;
  const w = Math.max(9, 0.55 * e), h = Math.max(9, 0.5 * e);
  // bloque de hormigón
  ctx.beginPath();
  ctx.moveTo(sx - w, sy + h); ctx.lineTo(sx + w, sy + h); ctx.lineTo(sx, sy);
  ctx.closePath();
  ctx.fillStyle = '#adb5bd'; ctx.fill();
  ctx.strokeStyle = '#495057'; ctx.lineWidth = 1.8; ctx.stroke();
  if (tipo === 'rodillo') {
    ctx.fillStyle = '#868e96';
    ctx.beginPath();
    ctx.arc(sx - w * 0.4, sy + h + 3.5, 3.5, 0, 7);
    ctx.arc(sx + w * 0.4, sy + h + 3.5, 3.5, 0, 7);
    ctx.fill();
  }
  // base y rayado de suelo
  ctx.strokeStyle = '#495057'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - w - 3, sy + h + (tipo === 'rodillo' ? 8 : 1));
  ctx.lineTo(sx + w + 3, sy + h + (tipo === 'rodillo' ? 8 : 1));
  ctx.stroke();
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + i * w * 0.45, sy + h + (tipo === 'rodillo' ? 8 : 1));
    ctx.lineTo(sx + i * w * 0.45 - 4, sy + h + (tipo === 'rodillo' ? 14 : 7));
    ctx.stroke();
  }
}

function dibujarVehiculo() {
  let x = null, yBase = 0, rot = 0, veh = null;
  if (S.sim) {
    veh = S.sim.veh;
    x = S.sim.x;
    if (S.sim.fase === 'caida') { yBase = S.sim.caidaY; rot = -0.25; }
    else yBase = yTableroEn(x, true);
  } else if (S.colapso && S.colapso.veh) {
    veh = S.colapso.vehiculo;
    x = S.colapso.veh.x; yBase = S.colapso.veh.y; rot = S.colapso.veh.rot;
  }
  if (x === null || !veh) return;
  const ruedaR = 0.42;
  const yRueda = yBase + ruedaR;
  const [cx, cy] = w2s(x, yRueda);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const e = S.cam.esc;
  const L = veh.longitud * e, alto = 1.9 * e;
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(-L * 0.4, ruedaR * e * 0.9, L * 0.55, 4, 0, 0, 7); ctx.fill();
  // caja de carga (cartoon, con brillo superior)
  const cajaX = -L + 0.8 * e, cajaW = L * 0.82, cajaH = alto - ruedaR * e * 0.4;
  ctx.fillStyle = veh.color;
  ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = 2;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cajaX, -alto, cajaW, cajaH, 5); ctx.fill(); ctx.stroke(); }
  else { ctx.fillRect(cajaX, -alto, cajaW, cajaH); ctx.strokeRect(cajaX, -alto, cajaW, cajaH); }
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(cajaX + 3, -alto + 3, cajaW - 6, 4);
  // cabina
  ctx.fillStyle = '#f1f3f5';
  ctx.strokeStyle = '#2b2f38';
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0.15 * e, -alto * 0.85, 1.15 * e, alto * 0.55, 4); ctx.fill(); ctx.stroke(); }
  else { ctx.fillRect(0.15 * e, -alto * 0.85, 1.15 * e, alto * 0.55); ctx.strokeRect(0.15 * e, -alto * 0.85, 1.15 * e, alto * 0.55); }
  ctx.fillStyle = '#a5d8f5';
  ctx.fillRect(0.28 * e, -alto * 0.78, 0.85 * e, alto * 0.26);
  // ruedas
  for (const ej of veh.ejes) {
    ctx.fillStyle = '#212529';
    ctx.beginPath(); ctx.arc(-ej.x * e, 0, ruedaR * e, 0, 7); ctx.fill();
    ctx.fillStyle = '#ced4da';
    ctx.beginPath(); ctx.arc(-ej.x * e, 0, ruedaR * e * 0.45, 0, 7); ctx.fill();
    ctx.fillStyle = '#868e96';
    ctx.beginPath(); ctx.arc(-ej.x * e, 0, ruedaR * e * 0.16, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function dibujarColapso() {
  const c = S.colapso;
  for (const lk of c.links) {
    if (lk.roto) continue;
    const A = c.parts[lk.a], B = c.parts[lk.b];
    const [ax, ay] = w2s(A.x, A.y), [bx, by] = w2s(B.x, B.y);
    const b = S.barras[lk.i];
    const m = MATERIALS[b.mat];
    const w = Math.max(2.5, Math.min(9, m.grosor * S.cam.esc / 25));
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = w + 2.6;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = m.color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.lineCap = 'butt';
    if (b.tablero) {
      ctx.strokeStyle = '#343a40'; ctx.lineWidth = Math.max(3, 0.3 * S.cam.esc);
      ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke();
    }
  }
  for (const pt of c.parts) {
    const [sx, sy] = w2s(pt.x, pt.y);
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 7);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = 1.4; ctx.stroke();
  }
}

function dibujarEscala() {
  const e = S.cam.esc;
  const [x0, y0] = [cv.clientWidth - 5 * e - 20, cv.clientHeight - 16];
  ctx.strokeStyle = 'rgba(30,50,80,.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 5 * e, y0); ctx.stroke();
  textoHalo('5 m', x0 + 2.5 * e - 8, y0 - 5, 'rgba(30,50,80,.8)', '10px monospace');
}

function yTableroEn(x, deformada) {
  const tab = nudosTablero();
  if (!tab.length) return 0;
  const py = tab.map(p => {
    if (deformada && S._escDef && S.resultados && S.resultados.desp) {
      const d = S.resultados.desp[p.i];
      return { x: p.x + d.ux * S._escDef, y: p.y + d.uy * S._escDef };
    }
    return { x: p.x, y: p.y };
  }).sort((a, b) => a.x - b.x);
  if (x <= py[0].x) return py[0].y;
  if (x >= py[py.length - 1].x) return py[py.length - 1].y;
  for (let k = 0; k < py.length - 1; k++)
    if (x >= py[k].x && x <= py[k + 1].x) {
      const f = (x - py[k].x) / (py[k + 1].x - py[k].x);
      return py[k].y * (1 - f) + py[k + 1].y * f;
    }
  return 0;
}
