/* ===== solver.js (inline) ===== */
/* ============================================================
   PONTIFEX — solver.js
   Análisis estructural de reticulados planos (nudos articulados)
   Método de rigidez directa. Unidades SI: N, m, Pa.
   Comprobaciones: tracción (fy/γM) y pandeo EC3 (curva χ).
   ============================================================ */
(function (global) {
  'use strict';

  const G = 9.81; // m/s²

  /* ---------- Materiales (datos de catálogo, SI) ---------- */
  const MATERIALS = {
    madera: {
      id: 'madera', nombre: 'Madera GL24h 140×140',
      E: 11.5e9,            // Pa
      ft: 20e6, fc: 24e6,   // Pa (tracción / compresión)
      A: 0.0196,            // m²
      I: 3.2013e-5,         // m⁴
      kgM: 8.23,            // kg/m
      costeM: 13.7,         // €/m
      alpha: 0.49,          // curva de pandeo c
      gamma: 1.3,
      soloTraccion: false,
      color: '#c98a44', grosor: 6
    },
    acero275: {
      id: 'acero275', nombre: 'Acero S275 · RHS 100×100×4',
      E: 210e9,
      ft: 275e6, fc: 275e6,
      A: 1.49e-3,
      I: 2.26e-6,
      kgM: 11.7,
      costeM: 42,
      alpha: 0.34,          // curva b (perfil hueco conformado)
      gamma: 1.1,
      soloTraccion: false,
      color: '#5aa0e8', grosor: 4
    },
    acero355: {
      id: 'acero355', nombre: 'Acero S355 · RHS 120×120×5',
      E: 210e9,
      ft: 355e6, fc: 355e6,
      A: 2.29e-3,
      I: 4.90e-6,
      kgM: 18.0,
      costeM: 72,
      alpha: 0.34,
      gamma: 1.1,
      soloTraccion: false,
      color: '#2e6fb0', grosor: 5
    },
    cable: {
      id: 'cable', nombre: 'Cable acero ⌀16 (solo tracción)',
      E: 160e9,
      ft: 1770e6, fc: 0,
      A: 1.20e-4,
      I: 1.0e-9,            // despreciable: en compresión se afloja
      kgM: 0.95,
      costeM: 5.5,
      alpha: 0.49,
      gamma: 1.5,
      soloTraccion: true,
      color: '#d8d8d8', grosor: 2
    }
  };

  /* ---------- Vehículos (cargas por eje en N, posiciones en m) ---------- */
  const VEHICULOS = {
    furgoneta: {
      id: 'furgoneta', nombre: 'Furgoneta · 2,8 t',
      ejes: [{ x: 0, p: 13734 }, { x: 2.8, p: 13734 }],
      longitud: 4.6, impacto: 1.15, color: '#e8a13a'
    },
    camion: {
      id: 'camion', nombre: 'Camión 2 ejes · 16 t',
      ejes: [{ x: 0, p: 58860 }, { x: 4.0, p: 98100 }],
      longitud: 7.5, impacto: 1.15, color: '#d9544d'
    },
    convoy: {
      id: 'convoy', nombre: 'Transporte especial · 40 t',
      ejes: [{ x: 0, p: 98100 }, { x: 2.2, p: 98100 }, { x: 4.4, p: 98100 }, { x: 6.6, p: 98100 }],
      longitud: 10.5, impacto: 1.10, color: '#9b59b6'
    }
  };

  /* ---------- Capacidad resistente de una barra ----------
     Devuelve { NRd, chi, lambdaBar, modo } para axil N (N, +tracción).
     Pandeo según EC3: Ncr = π²EI/L² ; λ̄ = √(A·fc/Ncr) ;
     χ = 1/(Φ + √(Φ²−λ̄²)) ≤ 1 ; Φ = 0.5(1+α(λ̄−0.2)+λ̄²)      */
  function capacidad(mat, L, N) {
    if (N >= 0) {
      const NRd = mat.A * mat.ft / mat.gamma;
      return { NRd, chi: 1, lambdaBar: 0, modo: 'tracción' };
    }
    if (mat.soloTraccion) {
      return { NRd: 0, chi: 0, lambdaBar: Infinity, modo: 'aflojado' };
    }
    const Ncr = Math.PI * Math.PI * mat.E * mat.I / (L * L);
    const lambdaBar = Math.sqrt(mat.A * mat.fc / Ncr);
    const phi = 0.5 * (1 + mat.alpha * (lambdaBar - 0.2) + lambdaBar * lambdaBar);
    const chi = Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi * phi - lambdaBar * lambdaBar, 0))));
    const NRd = chi * mat.A * mat.fc / mat.gamma;
    const modo = chi < 0.98 ? 'pandeo' : 'compresión';
    return { NRd, chi, lambdaBar, modo };
  }

  /* ---------- Eliminación gaussiana con pivoteo parcial ----------
     Resuelve K·u = F in situ. Devuelve u o null si singular. */
  function resolver(K, F, n, tolRel) {
    let maxAbs = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = Math.abs(K[i][j]);
        if (v > maxAbs) maxAbs = v;
      }
    const tol = (maxAbs || 1) * (tolRel || 1e-10);

    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++)
        if (Math.abs(K[r][col]) > Math.abs(K[piv][col])) piv = r;
      if (Math.abs(K[piv][col]) < tol) return null; // mecanismo / inestable
      if (piv !== col) {
        const tmp = K[piv]; K[piv] = K[col]; K[col] = tmp;
        const tf = F[piv]; F[piv] = F[col]; F[col] = tf;
      }
      for (let r = col + 1; r < n; r++) {
        const f = K[r][col] / K[col][col];
        if (f === 0) continue;
        for (let c = col; c < n; c++) K[r][c] -= f * K[col][c];
        F[r] -= f * F[col];
      }
    }
    const u = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = F[i];
      for (let j = i + 1; j < n; j++) s -= K[i][j] * u[j];
      u[i] = s / K[i][i];
    }
    return u;
  }

  /* ---------- Análisis global ----------
     modelo = {
       nodos:  [{x, y, apoyo: 'ninguno'|'articulado'|'rodillo'}],
       barras: [{a, b, mat (id), activa (bool)}],
       cargas: [{nodo, fx, fy}]
     }
     Devuelve:
     { inestable, desp: [{ux,uy}], axiles: [N...], reacciones: [{nodo,rx,ry}],
       maxDesp }                                                        */
  function analizar(modelo) {
    const nN = modelo.nodos.length;
    const ndof = nN * 2;
    const K = [];
    for (let i = 0; i < ndof; i++) K.push(new Float64Array(ndof));
    const F = new Float64Array(ndof);

    // Cargas nodales
    for (const c of modelo.cargas) {
      F[c.nodo * 2] += c.fx;
      F[c.nodo * 2 + 1] += c.fy;
    }

    // Ensamblaje de barras activas (elemento biarticulado)
    const elemK = [];
    for (const b of modelo.barras) {
      if (!b.activa) { elemK.push(null); continue; }
      const na = modelo.nodos[b.a], nb = modelo.nodos[b.b];
      const dx = nb.x - na.x, dy = nb.y - na.y;
      const L = Math.hypot(dx, dy);
      if (L < 1e-9) { elemK.push(null); continue; }
      const mat = MATERIALS[b.mat];
      const c = dx / L, s = dy / L;
      const k = mat.E * mat.A / L;
      const ke = [
        [k * c * c, k * c * s, -k * c * c, -k * c * s],
        [k * c * s, k * s * s, -k * c * s, -k * s * s],
        [-k * c * c, -k * c * s, k * c * c, k * c * s],
        [-k * c * s, -k * s * s, k * c * s, k * s * s]
      ];
      const dofs = [b.a * 2, b.a * 2 + 1, b.b * 2, b.b * 2 + 1];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
          K[dofs[i]][dofs[j]] += ke[i][j];
      elemK.push({ ke, dofs, c, s, L, k });
    }

    // GDL restringidos
    const restringido = new Array(ndof).fill(false);
    for (let i = 0; i < nN; i++) {
      const ap = modelo.nodos[i].apoyo;
      if (ap === 'articulado') { restringido[i * 2] = restringido[i * 2 + 1] = true; }
      else if (ap === 'rodillo') { restringido[i * 2 + 1] = true; } // libre en x
    }
    const mapa = new Int32Array(ndof).fill(-1);
    let nLibres = 0;
    for (let i = 0; i < ndof; i++) if (!restringido[i]) mapa[i] = nLibres++;

    // Sistema reducido
    const Kf = [];
    for (let i = 0; i < nLibres; i++) Kf.push(new Float64Array(nLibres));
    const Ff = new Float64Array(nLibres);
    for (let i = 0; i < ndof; i++) {
      if (mapa[i] < 0) continue;
      Ff[mapa[i]] = F[i];
      for (let j = 0; j < ndof; j++)
        if (mapa[j] >= 0) Kf[mapa[i]][mapa[j]] = K[i][j];
    }

    const uf = resolver(Kf, Ff, nLibres);
    if (uf === null) return { inestable: true };

    // Desplazamientos completos
    const u = new Float64Array(ndof);
    for (let i = 0; i < ndof; i++) if (mapa[i] >= 0) u[i] = uf[mapa[i]];
    const desp = [];
    let maxDesp = 0;
    for (let i = 0; i < nN; i++) {
      desp.push({ ux: u[i * 2], uy: u[i * 2 + 1] });
      const m = Math.hypot(u[i * 2], u[i * 2 + 1]);
      if (m > maxDesp) maxDesp = m;
    }

    // Axiles: N = (EA/L)·[−c −s c s]·ue   (+ tracción)
    const axiles = [];
    for (const e of elemK) {
      if (!e) { axiles.push(0); continue; }
      const ue = e.dofs.map(d => u[d]);
      const N = e.k * (-e.c * ue[0] - e.s * ue[1] + e.c * ue[2] + e.s * ue[3]);
      axiles.push(N);
    }

    // Reacciones en apoyos: R = K·u − F (en GDL restringidos)
    const reacciones = [];
    for (let i = 0; i < nN; i++) {
      const ap = modelo.nodos[i].apoyo;
      if (ap === 'ninguno') continue;
      let rx = 0, ry = 0;
      for (let j = 0; j < ndof; j++) {
        rx += K[i * 2][j] * u[j];
        ry += K[i * 2 + 1][j] * u[j];
      }
      rx -= F[i * 2]; ry -= F[i * 2 + 1];
      reacciones.push({ nodo: i, rx, ry });
    }

    return { inestable: false, desp, axiles, reacciones, maxDesp };
  }

  /* ---------- Peso propio: cargas nodales desde barras activas ---------- */
  function cargasPesoPropio(nodos, barras, factor) {
    const f = factor === undefined ? 1 : factor;
    const cargas = new Map();
    for (const b of barras) {
      if (!b.activa) continue;
      const na = nodos[b.a], nb = nodos[b.b];
      const L = Math.hypot(nb.x - na.x, nb.y - na.y);
      const w = MATERIALS[b.mat].kgM * G * L * f / 2;
      cargas.set(b.a, (cargas.get(b.a) || 0) - w);
      cargas.set(b.b, (cargas.get(b.b) || 0) - w);
    }
    const out = [];
    for (const [nodo, fy] of cargas) out.push({ nodo, fx: 0, fy });
    return out;
  }

  /* ---------- Análisis completo con cables (iteración de aflojamiento) ---- */
  function analizarConCables(nodos, barras, cargas) {
    const activas = barras.map(b => b.activa);
    const slack = [];
    let res = null;
    for (let iter = 0; iter < 5; iter++) {
      const modelo = {
        nodos,
        barras: barras.map((b, i) => ({ a: b.a, b: b.b, mat: b.mat, activa: activas[i] })),
        cargas
      };
      res = analizar(modelo);
      if (res.inestable) return { inestable: true, slack };
      const nuevosSlack = [];
      barras.forEach((b, i) => {
        if (!activas[i]) return;
        if (MATERIALS[b.mat].soloTraccion && res.axiles[i] < -1) nuevosSlack.push(i);
      });
      if (nuevosSlack.length === 0) { res.activas = activas; res.slack = slack; return res; }
      for (const i of nuevosSlack) { activas[i] = false; slack.push(i); }
    }
    res.activas = activas; res.slack = slack;
    return res;
  }

  const API = { G, MATERIALS, VEHICULOS, capacidad, analizar, analizarConCables, cargasPesoPropio, _resolver: resolver };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.PontSolver = API;
})(typeof window !== 'undefined' ? window : globalThis);
