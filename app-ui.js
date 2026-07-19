/* ================================================================
   INTERACCIÓN
   ================================================================ */
const SNAP = 0.5;
const snap = v => Math.round(v / SNAP) * SNAP;
const TACTIL = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

function nodoEn(px, py) {
  let mejor = -1, dMin = TACTIL ? 24 : 11;
  for (let i = 0; i < S.nodos.length; i++) {
    const [sx, sy] = w2s(S.nodos[i].x, S.nodos[i].y);
    const d = Math.hypot(sx - px, sy - py);
    if (d < dMin) { dMin = d; mejor = i; }
  }
  return mejor;
}
function barraEn(px, py) {
  let mejor = -1, dMin = TACTIL ? 18 : 8;
  for (let i = 0; i < S.barras.length; i++) {
    const b = S.barras[i];
    const A = S.nodos[b.a], B = S.nodos[b.b];
    const [ax, ay] = w2s(A.x, A.y), [bx, by] = w2s(B.x, B.y);
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    if (L2 < 1) continue;
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < dMin) { dMin = d; mejor = i; }
  }
  return mejor;
}

cv.addEventListener('contextmenu', e => e.preventDefault());

cv.addEventListener('mousedown', e => {
  const [wx, wy] = s2w(e.offsetX, e.offsetY);
  const ocupado = S.sim || S.colapso;

  if (e.button === 2 || e.button === 1 || ocupado) {
    S.arrastre = { tipo: 'pan', x: e.offsetX, y: e.offsetY };
    return;
  }
  const hn = nodoEn(e.offsetX, e.offsetY);
  const hb = hn < 0 ? barraEn(e.offsetX, e.offsetY) : -1;

  switch (S.herr) {
    case 'seleccionar':
      if (hn >= 0) {
        S.selNodo = hn; S.selBarra = -1;
        S.arrastre = { tipo: 'nodo', i: hn };
        mostrarInfoBarra(-1);
      } else if (hb >= 0) {
        S.selBarra = hb; S.selNodo = -1;
        mostrarInfoBarra(hb);
      } else {
        S.selBarra = S.selNodo = -1;
        mostrarInfoBarra(-1);
        S.arrastre = { tipo: 'pan', x: e.offsetX, y: e.offsetY };
      }
      break;

    case 'nodo': {
      const x = snap(wx), y = snap(wy);
      if (nodoEn(e.offsetX, e.offsetY) < 0) {
        const i = nuevoNodo(x, y);
        log(`Nudo #${i} en (${fmt(x, 1)}, ${fmt(y, 1)})`, 'info');
        S.resultados = null; actualizarStats();
      }
      break;
    }

    case 'barra': {
      let i = hn;
      if (i < 0) i = nuevoNodo(snap(wx), snap(wy));
      if (S.pendienteNodo < 0) {
        S.pendienteNodo = i;
      } else {
        const j = nuevaBarra(S.pendienteNodo, i, S.mat);
        if (j >= 0) {
          log(`Barra #${j} (${MATERIALS[S.mat].nombre}, L = ${fmt(longitudBarra(S.barras[j]), 2)} m)`, 'info');
          actualizarStats();
        }
        S.pendienteNodo = i; // encadenar siguiente barra desde este nudo
      }
      break;
    }

    case 'apoyo':
      if (hn >= 0) {
        const n = S.nodos[hn];
        if (!soportePermitido(n.x, n.y)) {
          log('Solo se puede cimentar sobre roca (zonas sombreadas del terreno).', 'warn');
          break;
        }
        n.apoyo = n.apoyo === 'ninguno' ? 'articulado' : n.apoyo === 'articulado' ? 'rodillo' : 'ninguno';
        log(`Nudo #${hn}: apoyo → ${n.apoyo}`, 'info');
        S.resultados = null;
      }
      break;

    case 'tablero':
      if (hb >= 0) {
        S.barras[hb].tablero = !S.barras[hb].tablero;
        log(`Barra #${hb} ${S.barras[hb].tablero ? 'marcada como' : 'desmarcada de'} tablero`, 'info');
      }
      break;

    case 'borrar':
      if (hb >= 0) { borrarBarra(hb); log(`Barra #${hb} eliminada`, 'info'); }
      else if (hn >= 0) { borrarNodo(hn); log(`Nudo #${hn} eliminado`, 'info'); }
      break;
  }
});

cv.addEventListener('mousemove', e => {
  const [wx, wy] = s2w(e.offsetX, e.offsetY);
  S._raton = [snap(wx), snap(wy)];
  if (S.arrastre) {
    if (S.arrastre.tipo === 'pan') {
      const dx = (e.offsetX - S.arrastre.x) / S.cam.esc;
      const dy = (e.offsetY - S.arrastre.y) / S.cam.esc;
      S.cam.x -= dx; S.cam.y += dy;
      S.arrastre.x = e.offsetX; S.arrastre.y = e.offsetY;
    } else if (S.arrastre.tipo === 'nodo') {
      const n = S.nodos[S.arrastre.i];
      n.x = snap(wx); n.y = snap(wy);
      if (n.apoyo !== 'ninguno' && !soportePermitido(n.x, n.y)) {
        n.apoyo = 'ninguno';
        log('Apoyo retirado: el nudo ya no está sobre roca.', 'warn');
      }
      S.resultados = null; actualizarStats();
    }
    return;
  }
  S.hoverNodo = nodoEn(e.offsetX, e.offsetY);
  S.hoverBarra = S.hoverNodo < 0 ? barraEn(e.offsetX, e.offsetY) : -1;
  cv.style.cursor = S.hoverNodo >= 0 || S.hoverBarra >= 0 ? 'pointer' : 'crosshair';
});

window.addEventListener('mouseup', () => { S.arrastre = null; });

cv.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const [wx, wy] = s2w(e.offsetX, e.offsetY);
  S.cam.esc = Math.max(4, Math.min(220, S.cam.esc * f));
  // mantener el punto bajo el cursor
  const [nx, ny] = s2w(e.offsetX, e.offsetY);
  S.cam.x += wx - nx; S.cam.y += wy - ny;
}, { passive: false });

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (S.sim) detenerEnsayo('Ensayo interrumpido.');
    S.pendienteNodo = -1;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !S.sim && !S.colapso) {
    if (S.selBarra >= 0) { borrarBarra(S.selBarra); mostrarInfoBarra(-1); }
    else if (S.selNodo >= 0) borrarNodo(S.selNodo);
    else if (S.hoverBarra >= 0) borrarBarra(S.hoverBarra);
    else if (S.hoverNodo >= 0) borrarNodo(S.hoverNodo);
    actualizarStats();
  }
});

/* ---------- Soporte táctil: 1 dedo = herramienta · 2 dedos = zoom/pan ---------- */
let pellizco = null;
cv.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const r = cv.getBoundingClientRect();
    pellizco = {
      d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY),
      cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
      cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top
    };
    S.arrastre = null;
    return;
  }
  const t = e.changedTouches[0];
  cv.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY, button: 0, bubbles: true }));
}, { passive: false });
cv.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2 && pellizco) {
    const r = cv.getBoundingClientRect();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
    const [wx, wy] = s2w(pellizco.cx, pellizco.cy);
    S.cam.esc = Math.max(4, Math.min(220, S.cam.esc * (d / pellizco.d)));
    const [nx, ny] = s2w(cx, cy);
    S.cam.x += wx - nx; S.cam.y += wy - ny;
    pellizco = { d, cx, cy };
    return;
  }
  const t = e.changedTouches[0];
  cv.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY, bubbles: true }));
}, { passive: false });
cv.addEventListener('touchend', e => {
  e.preventDefault();
  if (e.touches.length < 2) pellizco = null;
  if (e.touches.length === 0) window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}, { passive: false });

/* ---------- Cajones laterales (móvil) ---------- */
function cajon(nombre, abrir) {
  const panel = $(nombre === 'izq' ? 'panel-izq' : 'panel-der');
  const fab = $(nombre === 'izq' ? 'fab-tools' : 'fab-log');
  panel.classList.toggle('abierto', abrir);
  fab.classList.toggle('on', abrir);
  $('backdrop').classList.toggle('on',
    $('panel-izq').classList.contains('abierto') || $('panel-der').classList.contains('abierto'));
}
function cerrarCajones() { cajon('izq', false); cajon('der', false); }

/* ---------------- Ejemplo: cercha Pratt ---------------- */
function cargarPratt() {
  cargarEscenario(S.escenario);
  const apoyos = esc().apoyos;
  const xA = apoyos[0].x, xB = apoyos[apoyos.length - 1].x;
  const yA = apoyos[0].y;
  const luz = xB - xA;
  const nP = Math.max(4, 2 * Math.round(luz / 8));
  const panel = luz / nP;
  const h = Math.max(2.5, luz / 10);

  const inf = [], sup = [];
  for (let i = 0; i <= nP; i++) {
    const x = xA + i * panel;
    if (i === 0) inf.push(0);
    else if (i === nP) inf.push(1);
    else inf.push(nuevoNodo(x, yA));
  }
  for (let i = 0; i <= nP; i++) sup.push(nuevoNodo(xA + i * panel, yA + h));

  const MC = 'acero355', MA = 'acero275'; // cordones S355, alma S275
  for (let i = 0; i < nP; i++) {
    const j = nuevaBarra(inf[i], inf[i + 1], MC);
    if (j >= 0) S.barras[j].tablero = true;          // cordón inferior = tablero
    nuevaBarra(sup[i], sup[i + 1], MC);              // cordón superior
  }
  nuevaBarra(inf[0], sup[0], MA);                    // postes de extremo
  nuevaBarra(inf[nP], sup[nP], MA);
  const mid = nP / 2;
  for (let i = 1; i < nP; i++) nuevaBarra(inf[i], sup[i], MA); // montantes
  for (let i = 0; i < mid; i++) nuevaBarra(sup[i], inf[i + 1], MA);     // diagonales Pratt (izq.)
  for (let i = mid; i < nP; i++) nuevaBarra(sup[i + 1], inf[i], MA);    // diagonales Pratt (dcha.)

  ajustarVista();
  actualizarStats();
  log(`Cercha Pratt cargada: luz ${fmt(luz, 0)} m, ${nP} paños de ${fmt(panel, 1)} m, altura ${fmt(h, 1)} m. Cordones S355, alma S275. Pruébala con ▶ Ensayar.`, 'ok');
}

/* ---------------- Boot ---------------- */
function boot() {
  const selE = $('sel-escenario');
  for (const [id, e] of Object.entries(ESCENARIOS)) selE.add(new Option(e.nombre, id));
  selE.addEventListener('change', () => { cargarEscenario(selE.value); log(`Escenario: ${ESCENARIOS[selE.value].nombre}`, 'info'); });

  const selV = $('sel-vehiculo');
  for (const [id, v] of Object.entries(VEHICULOS)) selV.add(new Option(v.nombre, id));
  selV.value = S.vehiculo;
  selV.addEventListener('change', () => { S.vehiculo = selV.value; if (TACTIL) cerrarCajones(); });

  const mats = $('lista-mats');
  for (const m of Object.values(MATERIALS)) {
    const d = document.createElement('div');
    d.className = 'mat-item' + (m.id === S.mat ? ' activo' : '');
    d.dataset.mat = m.id;
    d.innerHTML = `<span class="punto" style="background:${m.color}"></span>${m.nombre}` +
      `<small>${m.costeM} €/m · ${m.kgM} kg/m · fy ${(m.ft / 1e6).toFixed(0)} MPa</small>`;
    d.addEventListener('click', () => {
      S.mat = m.id;
      mats.querySelectorAll('.mat-item').forEach(x => x.classList.toggle('activo', x.dataset.mat === m.id));
      if (TACTIL) cerrarCajones();
    });
    mats.appendChild(d);
  }

  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => {
    S.herr = b.dataset.h;
    S.pendienteNodo = -1;
    document.querySelectorAll('.herr').forEach(x => x.classList.toggle('activo', x === b));
    if (TACTIL) cerrarCajones();
  }));

  $('fab-tools').addEventListener('click', () => cajon('izq', !$('panel-izq').classList.contains('abierto')));
  $('fab-log').addEventListener('click', () => cajon('der', !$('panel-der').classList.contains('abierto')));
  $('backdrop').addEventListener('click', cerrarCajones);

  $('btn-ensayar').addEventListener('click', () => { cerrarCajones(); iniciarEnsayo(); });
  $('btn-detener').addEventListener('click', () => detenerEnsayo('Ensayo detenido.'));
  $('btn-reparar').addEventListener('click', reparar);
  $('btn-limpiar').addEventListener('click', () => {
    if (!confirm('¿Demoler toda la estructura?')) return;
    cargarEscenario(S.escenario);
    log('Estructura demolida. Apoyos de estribo conservados.', 'info');
  });
  $('btn-ejemplo').addEventListener('click', () => { cerrarCajones(); cargarPratt(); });
  $('btn-pesopropio').addEventListener('click', () => {
    if (S.barras.length === 0) { log('No hay estructura.', 'warn'); return; }
    const r = pasoELU([]);
    if (r.inestable) { log('INESTABLE bajo peso propio (ELU). Revisa la triangulación.', 'err'); estado('INESTABLE', 'mal'); return; }
    let uMax = 0;
    r.us.forEach(u => { if (u && u.u > uMax) uMax = u.u; });
    S.resultados = {
      desp: r.res.desp, axiles: r.res.axiles, us: r.us,
      reacciones: r.res.reacciones, activas: r.res.activas,
      uMax, flecha: pasoELS([])
    };
    for (const ev of r.eventos) logRotura(ev);
    estado(uMax > 1 ? 'NO CUMPLE (PP)' : 'ESTABLE (PP)', uMax > 1 ? 'mal' : 'ok');
    log(`Peso propio (ELU 1,35G): u_máx = ${fmt(uMax, 2)} · flecha ELS = ${fmt(S.resultados.flecha * 1000, 1)} mm`, uMax > 1 ? 'err' : 'ok');
    $('btn-reparar').disabled = !S.barras.some(b => b.rota);
    actualizarStats();
    if (S.selBarra >= 0) mostrarInfoBarra(S.selBarra);
  });
  $('vel').addEventListener('input', () => {
    S.velocidad = parseFloat($('vel').value);
    $('vel-txt').textContent = fmt(S.velocidad, 2).replace('.', ',') + '×';
  });

  redimensionar();
  cargarEscenario('vado16');
  log('PONTIFEX listo. Flujo: ① nodos/barras (o carga la Pratt de ejemplo) → ② marca el tablero → ③ ▶ Ensayar.', 'ok');
  log('Chequeo ELU: tracción fy/γM y pandeo EC3 (curvas χ). Cables solo a tracción. Apoyos solo sobre roca sombreada.', 'info');
  cargarPratt(); // auto-carga: el puente se ve nada más abrir
  requestAnimationFrame(bucle);
}

let ultT = 0;
function bucle(t) {
  const dt = Math.min(0.05, ultT ? (t - ultT) / 1000 : 0.016);
  ultT = t;
  if (S.sim) pasoSim(dt * S.velocidad);
  if (S.colapso) pasoColapso(dt);
  render(t);
  requestAnimationFrame(bucle);
}

boot();
