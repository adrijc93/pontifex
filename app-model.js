'use strict';
/* ================================================================
   PONTIFEX — aplicación (editor + ensayo + render)
   ================================================================ */
const { MATERIALS, VEHICULOS, G, capacidad, analizarConCables, cargasPesoPropio } = window.PontSolver;

const GAMMA_G = 1.35;   // coef. parcial peso propio (ELU)
const GAMMA_Q = 1.50;   // coef. parcial sobrecarga (ELU)

/* ---------------- Escenarios ---------------- */
const ESCENARIOS = {
  vado16: {
    nombre: 'Vado de 16 m — vano único',
    terreno: [[-20,0],[8,0],[9,-3],[23,-3],[24,0],[60,0]],
    agua: { y: -1.2, x0: 9, x1: 23 },
    roca: [[-20, 8], [24, 60]],
    apoyos: [{ x: 8, y: 0, tipo: 'articulado' }, { x: 24, y: 0, tipo: 'rodillo' }],
    inicio: -2, fin: 34, presupuesto: 4000
  },
  valle32: {
    nombre: 'Valle de 32 m — pináculo central',
    terreno: [[-20,0],[8,0],[11,-8],[22,-8],[22.5,-4],[25.5,-4],[26,-8],[37,-8],[40,0],[80,0]],
    agua: null,
    roca: [[-20, 8], [22.5, 25.5], [40, 80]],
    apoyos: [{ x: 8, y: 0, tipo: 'articulado' }, { x: 40, y: 0, tipo: 'rodillo' }],
    inicio: -2, fin: 50, presupuesto: 9000
  },
  rio48: {
    nombre: 'Río de 48 m — dos islas',
    terreno: [[-20,0],[8,0],[10,-7],[22,-7],[22,-2],[26,-2],[26,-7],[38,-7],[38,-2],[42,-2],[42,-7],[54,-7],[56,0],[96,0]],
    agua: { y: -1.0, x0: 10, x1: 54 },
    roca: [[-20, 8], [22, 26], [38, 42], [56, 96]],
    apoyos: [{ x: 8, y: 0, tipo: 'articulado' }, { x: 56, y: 0, tipo: 'rodillo' }],
    inicio: -2, fin: 66, presupuesto: 16000
  }
};

/* ---------------- Estado ---------------- */
const S = {
  escenario: 'vado16',
  nodos: [],      // {x, y, apoyo}
  barras: [],     // {a, b, mat, tablero, rota}
  herr: 'seleccionar',
  mat: 'acero275',
  vehiculo: 'camion',
  cam: { x: 16, y: -1, esc: 30 },
  hoverNodo: -1, hoverBarra: -1,
  selNodo: -1, selBarra: -1,
  pendienteNodo: -1,       // para herramienta barra
  arrastre: null,
  resultados: null,        // último análisis válido {desp, axiles, us, reacciones, activas, uMax, maxDesp}
  sim: null,               // estado del ensayo en curso
  colapso: null,
  velocidad: 1
};
/* ---------------- Utilidades ---------------- */
const $ = id => document.getElementById(id);
const fmt = (v, d = 1) => v.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtE = v => Math.round(v).toLocaleString('es-ES');

function log(txt, tipo = 'info') {
  const d = document.createElement('div');
  d.className = 'l ' + tipo;
  d.textContent = txt;
  $('log').appendChild(d);
  $('log').scrollTop = $('log').scrollHeight;
}

function esc() { return ESCENARIOS[S.escenario]; }

function sueloY(x) {
  const t = esc().terreno;
  if (x <= t[0][0]) return t[0][1];
  for (let i = 0; i < t.length - 1; i++) {
    const [x0, y0] = t[i], [x1, y1] = t[i + 1];
    if (x >= x0 && x <= x1) return x1 === x0 ? Math.max(y0, y1) : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return t[t.length - 1][1];
}
function enRoca(x) { return esc().roca.some(([a, b]) => x >= a - 0.01 && x <= b + 0.01); }
function soportePermitido(x, y) { return enRoca(x) && Math.abs(y - sueloY(x)) < 0.45; }

/* ---------------- Modelo: altas y bajas ---------------- */
function nuevoNodo(x, y, apoyo = 'ninguno') {
  const r = 0.75;
  for (let i = 0; i < S.nodos.length; i++) {
    if (Math.hypot(S.nodos[i].x - x, S.nodos[i].y - y) < r) return i;
  }
  S.nodos.push({ x, y, apoyo });
  return S.nodos.length - 1;
}
function nuevaBarra(a, b, mat, tablero = false) {
  if (a === b) return -1;
  for (let i = 0; i < S.barras.length; i++) {
    const bb = S.barras[i];
    if ((bb.a === a && bb.b === b) || (bb.a === b && bb.b === a)) return -1;
  }
  const na = S.nodos[a], nb = S.nodos[b];
  if (Math.hypot(nb.x - na.x, nb.y - na.y) < 0.3) return -1;
  S.barras.push({ a, b, mat, tablero, rota: false });
  S.resultados = null;
  return S.barras.length - 1;
}
function borrarBarra(i) { S.barras.splice(i, 1); S.selBarra = -1; S.resultados = null; actualizarStats(); }
function borrarNodo(i) {
  S.barras = S.barras.filter(b => b.a !== i && b.b !== i);
  S.nodos.splice(i, 1);
  for (const b of S.barras) { if (b.a > i) b.a--; if (b.b > i) b.b--; }
  S.selNodo = -1; S.resultados = null; actualizarStats();
}
function longitudBarra(b) {
  const na = S.nodos[b.a], nb = S.nodos[b.b];
  return Math.hypot(nb.x - na.x, nb.y - na.y);
}
function costeTotal() { return S.barras.reduce((s, b) => s + longitudBarra(b) * MATERIALS[b.mat].costeM, 0); }
function pesoTotal() { return S.barras.reduce((s, b) => s + longitudBarra(b) * MATERIALS[b.mat].kgM, 0); }

/* ---------------- Carga de escenario ---------------- */
function cargarEscenario(id) {
  S.escenario = id;
  S.nodos = []; S.barras = [];
  S.resultados = null; S.sim = null; S.colapso = null;
  S.selNodo = S.selBarra = S.pendienteNodo = -1;
  for (const ap of esc().apoyos) nuevoNodo(ap.x, ap.y, ap.tipo);
  ajustarVista();
  banner(null);
  estado('SIN ENSAYAR', '');
  actualizarStats();
  $('btn-reparar').disabled = true;
}

function ajustarVista() {
  const t = esc().terreno;
  const xsA = esc().apoyos.map(a => a.x);
  let x0 = Math.min(...xsA) - 14, x1 = Math.max(...xsA) + 14;
  let y0 = Math.min(...t.map(p => p[1])) - 1, y1 = 7;
  for (const n of S.nodos) {
    x0 = Math.min(x0, n.x - 3); x1 = Math.max(x1, n.x + 3);
    y0 = Math.min(y0, n.y - 2); y1 = Math.max(y1, n.y + 3);
  }
  const W = $('cv').clientWidth || 900, H = $('cv').clientHeight || 600;
  S.cam.x = (x0 + x1) / 2;
  S.cam.y = (y0 + y1) / 2;
  S.cam.esc = Math.min(W / (x1 - x0), H / (y1 - y0));
  S.cam.esc = Math.min(S.cam.esc, 60);
  // en pantalla vertical (móvil): tablero al ~64% de altura, como en los juegos
  if (H > W) S.cam.y = 0.14 * H / S.cam.esc;
}

/* ---------------- HUD ---------------- */
function estado(txt, cls) {
  const e = $('estado');
  e.textContent = txt; e.className = cls || '';
}
function banner(txt, cls) {
  const b = $('banner');
  if (!txt) { b.style.display = 'none'; return; }
  b.textContent = txt; b.className = cls; b.style.display = 'block';
}
function actualizarStats() {
  $('st-coste').textContent = fmtE(costeTotal()) + ' €';
  $('st-peso').textContent = fmtE(pesoTotal()) + ' kg';
  const presu = esc().presupuesto;
  $('st-coste').className = costeTotal() > presu ? 'mal' : '';
  if (S.resultados && !S.resultados.inestable) {
    const u = S.resultados.uMax;
    $('st-u').textContent = fmt(u, 2);
    $('st-u').className = u > 1 ? 'mal' : (u > 0.85 ? '' : 'bien');
    $('st-flecha').textContent = fmt(S.resultados.flecha * 1000, 0) + ' mm';
    $('st-flecha').className = '';
  } else {
    $('st-u').textContent = '—'; $('st-u').className = '';
    $('st-flecha').textContent = '—';
  }
}

/* ---------------- Info de barra (chequeo EC3) ---------------- */
function mostrarInfoBarra(i) {
  const el = $('info-barra');
  if (i < 0 || !S.barras[i]) {
    el.innerHTML = '<span style="color:var(--txt2)">Selecciona una barra para ver su chequeo EC3…</span>';
    return;
  }
  const b = S.barras[i], m = MATERIALS[b.mat], L = longitudBarra(b);
  let html = `<div style="color:var(--acc);font-weight:700;margin-bottom:4px">BARRA #${i} — ${m.nombre}</div>`;
  html += fila('Longitud', fmt(L, 2) + ' m');
  html += fila('Sección A', (m.A * 1e4).toFixed(1) + ' cm²');
  html += fila('Peso', fmt(L * m.kgM, 1) + ' kg');
  html += fila('Coste', fmt(L * m.costeM, 1) + ' €');
  if (S.resultados && !S.resultados.inestable && S.resultados.us && S.resultados.us[i]) {
    const u = S.resultados.us[i];
    const N = S.resultados.axiles[i];
    if (b.rota) {
      html += `<div class="u-grande" style="color:var(--err)">✕ ROTA — ${u.modo}</div>`;
    } else {
      const col = u.u > 1 ? 'var(--err)' : u.u > 0.85 ? 'var(--warn)' : 'var(--ok)';
      html += `<div class="u-grande" style="color:${col}">u = ${fmt(u.u, 3)}</div>`;
    }
    html += fila('Axil N', fmt(N / 1e3, 1) + ' kN (' + (N >= 0 ? 'tracción' : 'compresión') + ')');
    html += fila('Tensión σ', fmt(Math.abs(N) / m.A / 1e6, 1) + ' MPa');
    if (N < 0 && !m.soloTraccion) {
      html += fila('Esbeltez λ̄', fmt(u.lambdaBar, 2));
      html += fila('Coef. pandeo χ', fmt(u.chi, 3));
    }
    html += fila('NRd', fmt(u.NRd / 1e3, 1) + ' kN');
    html += fila('Modo', u.modo);
  } else {
    html += '<div style="color:var(--txt2);margin-top:6px">Sin ensayo en curso.</div>';
  }
  el.innerHTML = html;
  function fila(k, v) { return `<div class="fila"><span>${k}</span><span>${v}</span></div>`; }
}
