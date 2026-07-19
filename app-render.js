/* ================================================================
   RENDER
   ================================================================ */
const cv = $('cv'), ctx = cv.getContext('2d');
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
  if (u == null) return '#8fa3c8';
  if (u > 1) return '#fa5252';
  if (u > 0.85) return '#ff922b';
  if (u > 0.6) return '#ffd43b';
  if (u > 0.35) return '#a9e34b';
  return '#51cf66';
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const W = cv.clientWidth, H = cv.clientHeight;

  // cielo
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0b1626'); grad.addColorStop(1, '#12233d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  S._escDef = S.colapso ? 0 : escalaDeformada();

  if ($('ver-rejilla').checked && !S.colapso) dibujarRejilla();
  dibujarTerreno();
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
    ctx.strokeStyle = mayor ? 'rgba(80,110,160,.25)' : 'rgba(80,110,160,.10)';
    const [sx] = w2s(x, 0);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
  }
  for (let y = Math.floor(y0w); y <= y1w; y++) {
    const mayor = y % 5 === 0;
    ctx.strokeStyle = mayor ? 'rgba(80,110,160,.25)' : 'rgba(80,110,160,.10)';
    const [, sy] = w2s(0, y);
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
  }
  // eje y = 0 (rasante)
  const [, sy0] = w2s(0, 0);
  ctx.strokeStyle = 'rgba(77,171,247,.35)';
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(0, sy0); ctx.lineTo(W, sy0); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(77,171,247,.5)';
  ctx.font = '10px ' + 'monospace';
  ctx.fillText('rasante y=0', 8, sy0 - 5);
}

function dibujarTerreno() {
  const t = esc().terreno;
  const H = cv.clientHeight;
  // masa de terreno
  ctx.beginPath();
  let [sx0, sy0] = w2s(t[0][0], t[0][1]);
  ctx.moveTo(sx0, sy0);
  for (const [x, y] of t) { const [sx, sy] = w2s(x, y); ctx.lineTo(sx, sy); }
  ctx.lineTo(sx0 + (t[t.length - 1][0] - t[0][0]) * S.cam.esc, H + 50);
  ctx.lineTo(sx0, H + 50);
  ctx.closePath();
  ctx.fillStyle = '#233327';
  ctx.fill();
  // superficie
  ctx.beginPath();
  for (let i = 0; i < t.length; i++) {
    const [sx, sy] = w2s(t[i][0], t[i][1]);
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = '#3f5a3a'; ctx.lineWidth = 3; ctx.stroke();

  // zonas de roca (cimentable) — sombreado
  ctx.fillStyle = 'rgba(150,150,150,.18)';
  for (const [a, b] of esc().roca) {
    for (let x = a; x < b; x += 0.8) {
      const y = sueloY(x);
      const [sx, sy] = w2s(x, y);
      ctx.fillRect(sx, sy, 3, 3 + 0.35 * S.cam.esc);
    }
  }
  // calzada en los estribos (zonas de roca a rasante)
  ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = Math.max(3, 0.35 * S.cam.esc);
  for (const [a, b] of [esc().roca[0], esc().roca[esc().roca.length - 1]]) {
    ctx.beginPath();
    for (let x = a; x <= b; x += 1) {
      const [sx, sy] = w2s(x, sueloY(x) + 0.05);
      x === a ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
  // agua
  if (esc().agua) {
    const ag = esc().agua;
    const [ax, ay] = w2s(ag.x0, ag.y);
    const [bx] = w2s(ag.x1, ag.y);
    const g = ctx.createLinearGradient(0, ay, 0, H);
    g.addColorStop(0, 'rgba(40,110,180,.55)');
    g.addColorStop(1, 'rgba(15,50,95,.75)');
    ctx.fillStyle = g;
    ctx.fillRect(ax, ay, bx - ax, H - ay);
    ctx.strokeStyle = 'rgba(120,190,255,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.stroke();
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

    if (b.rota) {
      ctx.strokeStyle = 'rgba(250,82,82,.35)'; ctx.lineWidth = Math.max(1.5, m.grosor * 0.8);
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.strokeStyle = '#fa5252'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx - 6, my - 6); ctx.lineTo(mx + 6, my + 6);
      ctx.moveTo(mx + 6, my - 6); ctx.lineTo(mx - 6, my + 6);
      ctx.stroke();
      continue;
    }

    let color = m.color, dash = false;
    if (R && R.us && R.us[i]) {
      if (R.activas && !R.activas[i]) { color = 'rgba(140,140,140,.4)'; dash = true; } // cable aflojado
      else color = colorUtil(R.us[i].u);
    }
    if (i === S.hoverBarra || i === S.selBarra) {
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = Math.max(6, m.grosor + 5);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, Math.min(8, m.grosor * S.cam.esc / 25));
    if (dash) ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);

    // tablero: banda de rodadura
    if (b.tablero) {
      ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = Math.max(3, 0.32 * S.cam.esc);
      ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // etiqueta de axil
    if (R && R.us && R.us[i] && $('ver-axiles').checked && S.cam.esc > 12 && !(R.activas && !R.activas[i])) {
      const N = R.axiles[i];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.font = '10px monospace';
      ctx.fillStyle = N >= 0 ? '#69db7c' : '#74c0fc';
      const txt = (N >= 0 ? '+' : '−') + fmt(Math.abs(N) / 1e3, 0) + (N >= 0 ? ' T' : ' C');
      ctx.fillText(txt, mx + 4, my - 4);
    }
  }

  // nudos y apoyos
  for (let i = 0; i < S.nodos.length; i++) {
    const p = posNodo(i), n = S.nodos[i];
    const [sx, sy] = w2s(p.x, p.y);
    if (n.apoyo !== 'ninguno') dibujarApoyo(sx, sy, n.apoyo);
    ctx.beginPath();
    ctx.arc(sx, sy, i === S.hoverNodo || i === S.pendienteNodo ? 5.5 : 3.5, 0, 7);
    ctx.fillStyle = i === S.pendienteNodo ? '#ffd43b' : (i === S.hoverNodo ? '#fff' : '#9db4d8');
    ctx.fill();
  }

  // reacciones
  if (R && R.reacciones && $('ver-reacciones').checked) {
    ctx.font = '10px monospace'; ctx.fillStyle = '#e599f7';
    for (const r of R.reacciones) {
      const p = posNodo(r.nodo);
      const [sx, sy] = w2s(p.x, p.y);
      let txt = `Ry=${fmt(r.ry / 1e3, 0)}kN`;
      if (Math.abs(r.rx) > 500) txt += ` Rx=${fmt(r.rx / 1e3, 0)}kN`;
      ctx.fillText(txt, sx - 18, sy + 22);
    }
  }

  // barra pendiente (preview)
  if (S.pendienteNodo >= 0 && S._raton) {
    const p = posNodo(S.pendienteNodo);
    const [ax, ay] = w2s(p.x, p.y);
    const [bx, by] = w2s(S._raton[0], S._raton[1]);
    ctx.strokeStyle = MATERIALS[S.mat].color; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
  }

  // leyenda deformada
  if (S._escDef) {
    ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(215,226,244,.7)';
    const fd = S.resultados.maxDespPaso !== undefined ? S.resultados.maxDespPaso : 0;
    ctx.fillText(`Deformada ×${fmt(S._escDef, 0)} (flecha ELS paso: ${fmt(fd * 1000, 1)} mm)`, 10, cv.clientHeight - 28);
  }
}

function dibujarApoyo(sx, sy, tipo) {
  const e = S.cam.esc;
  const w = Math.max(8, 0.55 * e), h = Math.max(8, 0.5 * e);
  ctx.strokeStyle = '#ced4da'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(206,212,218,.15)';
  ctx.beginPath();
  ctx.moveTo(sx - w, sy + h); ctx.lineTo(sx + w, sy + h); ctx.lineTo(sx, sy);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (tipo === 'rodillo') {
    ctx.beginPath();
    ctx.arc(sx - w * 0.4, sy + h + 3, 3, 0, 7);
    ctx.arc(sx + w * 0.4, sy + h + 3, 3, 0, 7);
    ctx.stroke();
  }
  // rayado de suelo
  ctx.strokeStyle = 'rgba(206,212,218,.4)'; ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + i * w * 0.45, sy + h + (tipo === 'rodillo' ? 7 : 1));
    ctx.lineTo(sx + i * w * 0.45 - 4, sy + h + (tipo === 'rodillo' ? 13 : 7));
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
  // ruedas (posiciones relativas al eje delantero)
  ctx.fillStyle = '#1a1d24';
  for (const ej of veh.ejes) {
    ctx.beginPath(); ctx.arc(-ej.x * e, 0, ruedaR * e, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a3f4a';
    ctx.beginPath(); ctx.arc(-ej.x * e, 0, ruedaR * e * 0.45, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a1d24';
  }
  // caja
  const L = veh.longitud * e, alto = 1.9 * e;
  ctx.fillStyle = veh.color;
  ctx.fillRect(-L + 0.8 * e, -alto, L * 0.82, alto - ruedaR * e * 0.4);
  // cabina
  ctx.fillStyle = '#f1f3f5';
  ctx.fillRect(0.2 * e, -alto * 0.85, 1.1 * e, alto * 0.55);
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
    ctx.strokeStyle = m.color;
    ctx.lineWidth = Math.max(1.5, Math.min(8, m.grosor * S.cam.esc / 25));
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    if (b.tablero) {
      ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = Math.max(2, 0.3 * S.cam.esc);
      ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke();
    }
  }
  for (const pt of c.parts) {
    const [sx, sy] = w2s(pt.x, pt.y);
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 7);
    ctx.fillStyle = '#9db4d8'; ctx.fill();
  }
}

function dibujarEscala() {
  const e = S.cam.esc;
  const [x0, y0] = [cv.clientWidth - 5 * e - 20, cv.clientHeight - 16];
  ctx.strokeStyle = 'rgba(215,226,244,.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 5 * e, y0); ctx.stroke();
  ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(215,226,244,.6)';
  ctx.fillText('5 m', x0 + 2.5 * e - 8, y0 - 5);
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
