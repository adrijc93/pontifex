/* ================================================================
   MOTOR DE ENSAYO
   Combinación ELU: 1,35·G + 1,5·φ·Q  (φ = factor de impacto)
   ELS (flecha): combinación característica 1,0·G + φ·Q
   ================================================================ */
function barrasModelo() {
  return S.barras.map(b => ({ a: b.a, b: b.b, mat: b.mat, activa: !b.rota }));
}

/* Un paso de análisis ELU con rotura progresiva.
   Devuelve { inestable, res, us, eventos } */
function pasoELU(cargasQ, eventos = []) {
  for (let iter = 0; iter < 12; iter++) {
    const cargas = [
      ...cargasPesoPropio(S.nodos, barrasModelo(), GAMMA_G),
      ...cargasQ.map(c => ({ nodo: c.nodo, fx: 0, fy: c.fy * GAMMA_Q }))
    ];
    const res = analizarConCables(S.nodos, barrasModelo(), cargas);
    if (res.inestable) return { inestable: true, eventos };

    const us = S.barras.map((b, i) => {
      if (b.rota) return null;
      if (res.activas && !res.activas[i])
        return { u: 0, NRd: 0, modo: 'cable aflojado', chi: 0, lambdaBar: 0 };
      const N = res.axiles[i];
      const cap = capacidad(MATERIALS[b.mat], longitudBarra(b), N);
      const u = cap.NRd > 0 ? Math.abs(N) / cap.NRd : (Math.abs(N) > 1 ? Infinity : 0);
      return { ...cap, u };
    });

    let peor = -1, uMax = 1;
    us.forEach((u, i) => { if (u && u.u > uMax) { uMax = u.u; peor = i; } });
    if (peor < 0) return { inestable: false, res, us, eventos };

    S.barras[peor].rota = true;
    eventos.push({ tipo: 'rotura', barra: peor, u: us[peor], N: res.axiles[peor] });
  }
  return { inestable: true, eventos, agotado: true };
}

/* Flecha en ELS (característica, sin coeficientes parciales) */
function pasoELS(cargasQ) {
  const cargas = [
    ...cargasPesoPropio(S.nodos, barrasModelo(), 1),
    ...cargasQ
  ];
  const res = analizarConCables(S.nodos, barrasModelo(), cargas);
  return res.inestable ? 0 : res.maxDesp;
}

/* ---------------- Tablero y reparto de cargas de eje ---------------- */
function nudosTablero() {
  const set = new Set();
  S.barras.forEach(b => { if (b.tablero && !b.rota) { set.add(b.a); set.add(b.b); } });
  return [...set].map(i => ({ i, x: S.nodos[i].x, y: S.nodos[i].y })).sort((p, q) => p.x - q.x);
}
function intervalosTablero() {
  // cobertura rodable real: intervalos [x0,x1] de barras-tablero no rotas, fusionados
  const iv = [];
  S.barras.forEach(b => {
    if (!b.tablero || b.rota) return;
    const xa = S.nodos[b.a].x, xb = S.nodos[b.b].x;
    iv.push([Math.min(xa, xb), Math.max(xa, xb)]);
  });
  iv.sort((p, q) => p[0] - q[0]);
  const fus = [];
  for (const [a, b] of iv) {
    if (fus.length && a <= fus[fus.length - 1][1] + 0.3) fus[fus.length - 1][1] = Math.max(fus[fus.length - 1][1], b);
    else fus.push([a, b]);
  }
  return fus;
}
function huecoEn(x) {
  // devuelve el x de inicio del hueco si la posición x está en un hueco del tablero
  const iv = intervalosTablero();
  for (let k = 0; k < iv.length - 1; k++)
    if (x > iv[k][1] + 0.25 && x < iv[k + 1][0] - 0.25) return iv[k][1];
  return null;
}
function cargasEjes(xFrontal, veh) {
  const tab = nudosTablero();
  const cargas = new Map();
  const add = (nodo, fy) => cargas.set(nodo, (cargas.get(nodo) || 0) + fy);
  for (const e of veh.ejes) {
    const xa = xFrontal - e.x, p = -e.p * veh.impacto;
    if (tab.length === 0) break;
    if (xa < tab[0].x - 1.2) continue;                    // aún no ha entrado
    if (xa > tab[tab.length - 1].x + 1.2) continue;       // ya salió
    if (xa <= tab[0].x) { add(tab[0].i, p); continue; }
    if (xa >= tab[tab.length - 1].x) { add(tab[tab.length - 1].i, p); continue; }
    for (let k = 0; k < tab.length - 1; k++) {
      if (xa >= tab[k].x && xa <= tab[k + 1].x) {
        const f = (xa - tab[k].x) / (tab[k + 1].x - tab[k].x);
        add(tab[k].i, p * (1 - f));
        add(tab[k + 1].i, p * f);
        break;
      }
    }
  }
  return [...cargas].map(([nodo, fy]) => ({ nodo, fx: 0, fy }));
}

/* ---------------- Ensayo: cruce del vehículo ---------------- */
function iniciarEnsayo() {
  if (S.barras.length === 0) { log('No hay estructura que ensayar.', 'warn'); return; }
  if (nudosTablero().length < 2) { log('Marca el tablero (herramienta ▬) para que el vehículo tenga por dónde circular.', 'warn'); return; }
  let habiaRotas = false;
  for (const b of S.barras) if (b.rota) { b.rota = false; habiaRotas = true; }
  if (habiaRotas) log('Estructura reparada para el nuevo ensayo.', 'info');
  const veh = VEHICULOS[S.vehiculo];
  S.colapso = null;
  S.sim = {
    x: esc().inicio, fase: 'cruce', uMax: 0, flecha: 0,
    veh, caidaY: 0, caidaV: 0, t: 0
  };
  S.resultados = null;
  banner(null);
  estado('ENSAYANDO…', 'trabajando');
  $('btn-ensayar').disabled = true;
  $('btn-detener').disabled = false;
  $('btn-reparar').disabled = true;
  log(`— Ensayo: ${veh.nombre} · φ = ${veh.impacto} · ELU 1,35G + 1,5φQ —`, 'info');
}

function detenerEnsayo(txt) {
  S.sim = null;
  $('btn-ensayar').disabled = false;
  $('btn-detener').disabled = true;
  $('btn-reparar').disabled = !S.barras.some(b => b.rota);
  if (txt) log(txt, 'info');
  actualizarStats();
}

function pasoSim(dt) {
  const sim = S.sim;
  if (!sim) return;
  sim.t += dt;

  if (sim.fase === 'caida') {
    sim.caidaV += G * dt;
    sim.caidaY -= sim.caidaV * dt;
    const suelo = sueloY(sim.x) + 0.9;
    if (sim.caidaY <= suelo || sim.t > 6) { detenerEnsayo('El vehículo se ha precipitado: tablero discontinuo.'); estado('CAÍDA POR HUECO', 'mal'); banner('✕ VEHÍCULO PRECIPITADO', 'mal'); }
    return;
  }

  const v = 3.5; // m/s
  sim.x += v * dt;

  // ¿hueco en el tablero? (cobertura por intervalos de barras-tablero)
  const hueco = huecoEn(sim.x);
  if (hueco !== null) {
    sim.fase = 'caida';
    sim.caidaY = yTableroEn(hueco, false); sim.caidaV = 0; sim.t = 0;
    log(`Tablero interrumpido en x = ${fmt(hueco, 1)} m — el vehículo cae al vacío.`, 'err');
    return;
  }

  const cargasQ = cargasEjes(sim.x, sim.veh);
  const r = pasoELU(cargasQ);

  if (r.inestable) {
    for (const ev of r.eventos) logRotura(ev);
    iniciarColapso(r.agotado ? 'cascada de roturas (>12)' : 'mecanismo tras redistribución de axiles');
    return;
  }

  // registrar roturas de este paso
  for (const ev of r.eventos) logRotura(ev);

  // métricas del paso
  let uPaso = 0;
  r.us.forEach(u => { if (u && u.u > uPaso) uPaso = u.u; });
  sim.uMax = Math.max(sim.uMax, uPaso);
  const flechaPaso = pasoELS(cargasQ);
  sim.flecha = Math.max(sim.flecha, flechaPaso);

  S.resultados = {
    desp: r.res.desp, axiles: r.res.axiles, us: r.us,
    reacciones: r.res.reacciones, activas: r.res.activas,
    uMax: sim.uMax, flecha: sim.flecha, maxDespPaso: flechaPaso
  };
  actualizarStats();
  if (S.selBarra >= 0) mostrarInfoBarra(S.selBarra);

  // ¿ha salido por completo?
  const ultimoEje = sim.veh.ejes[sim.veh.ejes.length - 1].x;
  if (sim.x - ultimoEje > esc().fin) {
    const presu = esc().presupuesto;
    const coste = costeTotal();
    const cumple = sim.uMax <= 1;
    log(`✔ CRUCE COMPLETADO · u_máx = ${fmt(sim.uMax, 2)} · flecha máx (ELS) = ${fmt(sim.flecha * 1000, 0)} mm · coste ${fmtE(coste)} € ${coste > presu ? '(⚠ supera presupuesto: ' + fmtE(presu) + ' €)' : '(dentro de presupuesto)'}`, cumple ? 'ok' : 'warn');
    banner(`✔ CRUCE OK — u = ${fmt(sim.uMax, 2)} · flecha ${fmt(sim.flecha * 1000, 0)} mm`, 'ok');
    estado('CUMPLE', 'ok');
    detenerEnsayo();
  }
}

function logRotura(ev) {
  const b = S.barras[ev.barra], m = MATERIALS[b.mat], L = longitudBarra(b);
  const N = ev.N;
  let causa;
  if (N >= 0) causa = `ROTURA A TRACCIÓN — N = +${fmt(N / 1e3, 0)} kN > NRd = ${fmt(ev.u.NRd / 1e3, 0)} kN`;
  else if (ev.u.modo === 'pandeo') causa = `PANDEO — N = ${fmt(N / 1e3, 0)} kN · λ̄ = ${fmt(ev.u.lambdaBar, 2)} · χ = ${fmt(ev.u.chi, 2)} · NRd = ${fmt(ev.u.NRd / 1e3, 0)} kN`;
  else causa = `APLASTAMIENTO — N = ${fmt(N / 1e3, 0)} kN · NRd = ${fmt(ev.u.NRd / 1e3, 0)} kN`;
  log(`✕ Barra #${ev.barra} (${m.nombre.split('·')[0].trim()}, L = ${fmt(L, 1)} m): ${causa}`, 'err');
}

/* ================================================================
   COLAPSO (visualización dinámica post-fallo: Verlet)
   El chequeo es elástico-lineal; esto solo anima lo que ya falló.
   ================================================================ */
function iniciarColapso(motivo) {
  const parts = S.nodos.map(n => ({
    x: n.x, y: n.y, px: n.x, py: n.y,
    fijo: n.apoyo !== 'ninguno', m: 40
  }));
  S.barras.forEach(b => {
    const w = longitudBarra(b) * MATERIALS[b.mat].kgM / 2;
    parts[b.a].m += w; parts[b.b].m += w;
  });
  const links = [];
  S.barras.forEach((b, i) => {
    if (b.rota) return;
    const L = longitudBarra(b), m = MATERIALS[b.mat];
    links.push({
      i, a: b.a, b: b.b, L0: L, E: m.E, A: m.A,
      NT: m.A * m.ft / m.gamma,
      NC: m.soloTraccion ? 0 : capacidad(m, L, -1).NRd,
      roto: false
    });
  });
  const sim = S.sim;
  let veh = null;
  if (sim && sim.fase !== 'caida') {
    veh = { x: sim.x, y: 0.55, vy: 0, rot: 0 };
  } else if (sim) {
    veh = { x: sim.x, y: sim.caidaY || 0.55, vy: -Math.abs(sim.caidaV || 0), rot: 0 };
  }
  S.colapso = { parts, links, veh, t: 0, vehiculo: sim ? sim.veh : VEHICULOS[S.vehiculo] };
  S.sim = null;
  estado('COLAPSO', 'mal');
  banner('✕ COLAPSO ESTRUCTURAL', 'mal');
  log(`✕ ESTRUCTURA INESTABLE (${motivo}). Colapso en curso.`, 'err');
  $('btn-ensayar').disabled = false;
  $('btn-detener').disabled = true;
  $('btn-reparar').disabled = false;
}

function pasoColapso(dt) {
  const c = S.colapso;
  if (!c || c.t > 8) return;
  const pasos = Math.max(1, Math.round(dt / (1 / 60)));
  const h = 1 / 60;
  for (let p = 0; p < pasos; p++) {
    c.t += h;
    for (const pt of c.parts) {
      if (pt.fijo) continue;
      const nx = pt.x + (pt.x - pt.px) * 0.992;
      const ny = pt.y + (pt.y - pt.py) * 0.992 - G * h * h;
      pt.px = pt.x; pt.py = pt.y;
      pt.x = nx; pt.y = ny;
      const gy = sueloY(pt.x);
      if (pt.y < gy) { pt.y = gy; pt.py = gy + (pt.y - pt.py) * -0.25; pt.px = pt.x; }
    }
    for (let it = 0; it < 3; it++) {
      for (const lk of c.links) {
        if (lk.roto) continue;
        const A = c.parts[lk.a], B = c.parts[lk.b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const L = Math.hypot(dx, dy) || 1e-9;
        const dif = (L - lk.L0) / L;
        const fx = dx * dif * 0.5, fy = dy * dif * 0.5;
        if (!A.fijo) { A.x += fx; A.y += fy; }
        if (!B.fijo) { B.x -= fx; B.y -= fy; }
        const N = lk.E * lk.A * (L - lk.L0) / lk.L0;
        if (N > lk.NT || -N > lk.NC) lk.roto = true;
      }
    }
    if (c.veh) {
      c.veh.vy -= G * h;
      c.veh.y += c.veh.vy * h;
      c.veh.rot += 0.12 * h * Math.sign(c.veh.vy);
      const gy = sueloY(c.veh.x) + 0.55;
      if (c.veh.y < gy) { c.veh.y = gy; c.veh.vy = 0; }
    }
  }
}

function reparar() {
  for (const b of S.barras) b.rota = false;
  S.colapso = null; S.sim = null; S.resultados = null;
  banner(null); estado('SIN ENSAYAR', '');
  $('btn-reparar').disabled = true;
  $('btn-ensayar').disabled = false;
  log('Estructura reparada. Lista para un nuevo ensayo.', 'info');
  actualizarStats();
}
