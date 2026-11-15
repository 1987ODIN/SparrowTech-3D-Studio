/*
 * SparrowTech 3D Studio — motor de geometria vetorial (v5)
 *
 * Percurso: contornos Bézier da fonte (opentype.js) → amostragem adaptativa com
 * tolerância em mm → polígonos inteiros (Clipper, 1 unidade = 0,1 µm) → uniões,
 * diferenças e offsets arredondados → extrusão em camadas com tampas trianguladas
 * (earcut) → reparação de T-junctions → malha indexada fechada (2-manifold).
 *
 * Não depende do canvas nem de píxeis: a suavidade está na geometria exportada.
 * Funciona no browser (globais ClipperLib e earcut) e em Node (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../vendor/clipper.js'), require('../vendor/earcut.min.js'));
  else root.SparrowGeo = factory(root.ClipperLib, root.earcut);
})(typeof self !== 'undefined' ? self : this, function (ClipperLib, earcut) {
  'use strict';
  const C = ClipperLib;
  if (earcut && earcut.default) earcut = earcut.default;
  const SCALE = 10000;               // unidades Clipper por mm
  const FILL = C.PolyFillType.pftNonZero;

  // ---------------------------------------------------------------- utilidades 2D
  const toInt = v => Math.round(v * SCALE);
  function pathArea(p) { return C.Clipper.Area(p) / (SCALE * SCALE); }
  function regionArea(paths) { let a = 0; for (const p of paths) a += pathArea(p); return a; }
  function bounds(paths) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of paths) for (const q of p) { if (q.X < minX) minX = q.X; if (q.X > maxX) maxX = q.X; if (q.Y < minY) minY = q.Y; if (q.Y > maxY) maxY = q.Y; }
    if (minX === Infinity) return null;
    return { minX: minX / SCALE, minY: minY / SCALE, maxX: maxX / SCALE, maxY: maxY / SCALE, width: (maxX - minX) / SCALE, height: (maxY - minY) / SCALE };
  }
  function exec(type, subj, clip) {
    const c = new C.Clipper(); c.StrictlySimple = true;
    if (subj && subj.length) c.AddPaths(subj, C.PolyType.ptSubject, true);
    if (clip && clip.length) c.AddPaths(clip, C.PolyType.ptClip, true);
    let out = new C.Paths(); c.Execute(type, out, FILL, FILL); out = dropSlivers(out);
    // Com arestas coincidentes, o Clipper pode devolver anéis que se tocam ao longo de arestas
    // (furo encostado ao contorno exterior). Uma união extra resolve-os; repete no máx. 2 vezes.
    for (let i = 0; i < 2 && hasSharedVertices(out); i++) {
      const u = new C.Clipper(); u.StrictlySimple = true; u.AddPaths(out, C.PolyType.ptSubject, true);
      const r = new C.Paths(); u.Execute(C.ClipType.ctUnion, r, FILL, FILL); out = dropSlivers(r);
    }
    return out;
  }
  function hasSharedVertices(paths) {
    if (paths.length < 2) return false;
    const seen = new Map();
    for (let r = 0; r < paths.length; r++) for (const q of paths[r]) {
      const k = q.X * 16777216 + q.Y, o = seen.get(k);
      if (o !== undefined && o !== r) return true;
      seen.set(k, r);
    }
    return false;
  }
  // Remove só anéis degenerados (área praticamente nula); lascas finas reais têm de ficar
  // porque as tampas têm de coincidir exatamente com as paredes.
  function dropSlivers(paths) {
    const res = [];
    for (const p of paths) {
      if (p.length < 3) continue;
      const a = Math.abs(C.Clipper.Area(p)) / (SCALE * SCALE);
      if (a < 1e-6) continue;
      let per = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; per += Math.hypot(r.X - q.X, r.Y - q.Y); }
      if (a / (per / SCALE) < 5e-5) continue;   // largura < ~0,1 µm
      res.push(p);
    }
    return res;
  }
  const union = (a, b) => exec(C.ClipType.ctUnion, a, b || []);
  const difference = (a, b) => (!a.length ? [] : !b || !b.length ? a : exec(C.ClipType.ctDifference, a, b));
  const intersection = (a, b) => (!a.length || !b.length ? [] : exec(C.ClipType.ctIntersection, a, b));
  // Limpeza (remove pontos quase coincidentes/colineares) seguida de união estritamente simples.
  function finalize(paths, tol) {
    const d = Math.max(4, tol * SCALE * 0.2);
    return union(C.Clipper.CleanPolygons(paths, d).filter(p => p.length >= 3));
  }
  function offset(paths, deltaMm, tol, maxAngle) {
    if (!paths.length) return [];
    if (Math.abs(deltaMm) < 1e-9) return paths;
    let arcTol = tol;
    if (maxAngle) arcTol = Math.min(tol, Math.abs(deltaMm) * (1 - Math.cos(maxAngle / 2)));
    const co = new C.ClipperOffset(2, Math.max(1, arcTol * SCALE));
    co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    const out = new C.Paths(); co.Execute(out, deltaMm * SCALE);
    return finalize(out, tol);
  }
  function mirrorX(paths) { return paths.map(p => p.map(q => ({ X: -q.X, Y: q.Y })).reverse()); }
  function translate(paths, dx, dy) { const X = toInt(dx), Y = toInt(dy); return paths.map(p => p.map(q => ({ X: q.X + X, Y: q.Y + Y }))); }
  function scalePaths(paths, k) { return paths.map(p => p.map(q => ({ X: Math.round(q.X * k), Y: Math.round(q.Y * k) }))); }
  // Ponto dentro da região (par-ímpar sobre caminhos estritamente simples).
  function contains(paths, xMm, yMm) {
    const pt = { X: toInt(xMm), Y: toInt(yMm) }; let inside = 0;
    for (const p of paths) if (C.Clipper.PointInPolygon(pt, p) !== 0) inside ^= 1;
    return inside === 1;
  }
  // Agrupa caminhos em polígonos {outer, holes} através de uma PolyTree.
  function toPolygons(paths) {
    const c = new C.Clipper(); c.StrictlySimple = true; c.AddPaths(paths, C.PolyType.ptSubject, true);
    const tree = new C.PolyTree(); c.Execute(C.ClipType.ctUnion, tree, FILL, FILL);
    const polys = [];
    const walk = node => {
      for (const ch of node.Childs()) {
        if (ch.IsHole()) continue;
        const holes = ch.Childs().map(h => h.Contour());
        polys.push({ outer: ch.Contour(), holes });
        for (const h of ch.Childs()) walk(h);
      }
    };
    walk(tree);
    return polys;
  }
  // Fecha furos com área inferior ao limite (mm²).
  function fillSmallHoles(paths, maxArea) {
    if (!(maxArea > 0)) return paths;
    const out = [];
    for (const poly of toPolygons(paths)) {
      out.push(poly.outer);
      for (const h of poly.holes) if (Math.abs(pathArea(h)) >= maxArea) out.push(h);
    }
    // As ilhas dentro de furos mantidos voltam a aparecer como polígonos próprios em toPolygons.
    return union(out);
  }

  // ---------------------------------------------------------------- curvas → polígonos
  // Número de segmentos pela fórmula de Wang: garante desvio máximo ≤ tol em relação à curva real.
  function segCount(m, deg, tol) { return Math.max(1, Math.min(256, Math.ceil(Math.sqrt(deg * (deg - 1) / 8 * m / tol)))); }
  // Ângulo entre dois vetores do polígono de controlo (estimativa da curvatura total).
  function turn(ax, ay, bx, by) { const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (la < 1e-12 || lb < 1e-12) return 0; return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))); }
  // Qualidade: desvio de corda (mm) e ângulo máximo entre segmentos (rad).
  const QUALITY = {
    draft: { tol: 0.05, angle: 12 * Math.PI / 180 },
    normal: { tol: 0.02, angle: 6 * Math.PI / 180 },
    fine: { tol: 0.01, angle: 3.5 * Math.PI / 180 },
    ultra: { tol: 0.004, angle: 2 * Math.PI / 180 }
  };
  function flattenCommands(cmds, tol, map, maxAngle) {
    maxAngle = maxAngle || Math.PI;
    const contours = []; let cur = null, x = 0, y = 0, sx = 0, sy = 0;
    const push = (px, py) => { const q = map(px, py); cur.push(q); };
    for (const c of cmds) {
      if (c.type === 'M') { if (cur && cur.length > 2) contours.push(cur); cur = []; x = sx = c.x; y = sy = c.y; push(x, y); }
      else if (c.type === 'L') { x = c.x; y = c.y; push(x, y); }
      else if (c.type === 'Q') {
        const m = Math.hypot(x - 2 * c.x1 + c.x, y - 2 * c.y1 + c.y);
        const n = Math.max(segCount(m, 2, tol), Math.min(256, Math.ceil(turn(c.x1 - x, c.y1 - y, c.x - c.x1, c.y - c.y1) / maxAngle)));
        for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; push(u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y); }
        x = c.x; y = c.y;
      } else if (c.type === 'C') {
        const m = Math.max(Math.hypot(x - 2 * c.x1 + c.x2, y - 2 * c.y1 + c.y2), Math.hypot(c.x1 - 2 * c.x2 + c.x, c.y1 - 2 * c.y2 + c.y));
        const tr = turn(c.x1 - x, c.y1 - y, c.x2 - c.x1, c.y2 - c.y1) + turn(c.x2 - c.x1, c.y2 - c.y1, c.x - c.x2, c.y - c.y2);
        const n = Math.max(segCount(m, 3, tol), Math.min(256, Math.ceil(tr / maxAngle)));
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
          push(a * x + b * c.x1 + d * c.x2 + e * c.x, a * y + b * c.y1 + d * c.y2 + e * c.y);
        }
        x = c.x; y = c.y;
      } else if (c.type === 'Z') { if (cur && cur.length > 2) contours.push(cur); cur = null; x = sx; y = sy; }
    }
    if (cur && cur.length > 2) contours.push(cur);
    return contours;
  }
  /**
   * Texto → região (caminhos inteiros, y para cima, centrada na caixa do texto).
   * font: objeto opentype.js; emMm: tamanho do em em mm; tol: desvio máximo em mm.
   */
  function textRegion(font, text, emMm, tol, maxAngle) {
    const path = font.getPath(text, 0, 0, emMm, { kerning: true, features: { liga: true, rlig: true } });
    const contours = flattenCommands(path.commands, tol, (px, py) => ({ X: toInt(px), Y: toInt(-py) }), maxAngle);
    let region = finalize(contours, tol);
    const b = bounds(region);
    if (!b) return { paths: [], bounds: null };
    region = translate(region, -(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2);
    return { paths: region, bounds: bounds(region) };
  }

  // ---------------------------------------------------------------- formas básicas
  function arcSegments(r, tol, sweep, maxAngle) { return Math.max(8, Math.ceil(sweep / Math.min(maxAngle || Math.PI, 2 * Math.acos(Math.max(-1, 1 - tol / Math.max(r, tol)))))); }
  function circle(cx, cy, r, tol, maxAngle) {
    const n = arcSegments(r, tol, 2 * Math.PI, maxAngle), p = [];
    for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; p.push({ X: toInt(cx + r * Math.cos(a)), Y: toInt(cy + r * Math.sin(a)) }); }
    return [p];
  }
  function ellipse(cx, cy, rx, ry, tol, maxAngle) {
    const n = arcSegments(Math.max(rx, ry), tol, 2 * Math.PI, maxAngle), p = [];
    for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; p.push({ X: toInt(cx + rx * Math.cos(a)), Y: toInt(cy + ry * Math.sin(a)) }); }
    return [p];
  }
  function rect(x0, y0, x1, y1) { return [[{ X: toInt(x0), Y: toInt(y0) }, { X: toInt(x1), Y: toInt(y0) }, { X: toInt(x1), Y: toInt(y1) }, { X: toInt(x0), Y: toInt(y1) }]]; }
  function roundRect(x0, y0, x1, y1, r, tol, maxAngle) {
    r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)); if (r < 1e-6) return rect(x0, y0, x1, y1);
    const n = arcSegments(r, tol, Math.PI / 2, maxAngle), p = [];
    const corner = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; p.push({ X: toInt(cx + r * Math.cos(a)), Y: toInt(cy + r * Math.sin(a)) }); } };
    corner(x1 - r, y0 + r, -Math.PI / 2); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, Math.PI / 2); corner(x0 + r, y0 + r, Math.PI);
    return finalize([p], tol);
  }
  function cloud(cx, cy, rx, ry, tol, maxAngle) {
    const n = Math.max(360, arcSegments(Math.max(rx, ry), tol, 2 * Math.PI, maxAngle) * 4), p = [];
    for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI, k = 1 + 0.065 * Math.sin(a * 11); p.push({ X: toInt(cx + Math.cos(a) * rx * k), Y: toInt(cy + Math.sin(a) * ry * k) }); }
    return finalize([p], tol);
  }

  // ---------------------------------------------------------------- extrusão em camadas
  /**
   * Constrói um sólido fechado a partir de lajes horizontais {z0, z1, paths} sem sobreposição em z.
   * Paredes: cada aresta de cada anel → 2 triângulos. Tampas em cada nível: XOR das lajes
   * de baixo e de cima, trianguladas. Depois remove triângulos degenerados e divide arestas
   * com vértices intermédios (T-junctions) para garantir uma malha estanque.
   */
  function buildSolid(slabs, opts = {}) {
    const smoothDeg = opts.smoothAngle == null ? 38 : opts.smoothAngle, cosSmooth = Math.cos(smoothDeg * Math.PI / 180);
    slabs = slabs.filter(s => s.paths && s.paths.length && s.z1 - s.z0 > 1e-6).sort((a, b) => a.z0 - b.z0);
    // Funde lajes consecutivas iguais (mesma região e contíguas).
    const merged = [];
    for (const s of slabs) {
      const last = merged[merged.length - 1];
      // (comparação por receita/referência: evita operações booleanas entre regiões idênticas, que no Clipper são lentas)
      if (last && Math.abs(last.z1 - s.z0) < 1e-7 && (last.paths === s.paths || (last.key != null && last.key === s.key))) { last.z1 = s.z1; continue; }
      merged.push({ z0: s.z0, z1: s.z1, paths: s.paths, key: s.key, recipe: s.recipe });
    }
    slabs = merged;
    const zKey = z => Math.round(z * 1e6);
    const levelMap = new Map(), levels = [];
    for (const s of slabs) for (const z of [s.z0, s.z1]) if (!levelMap.has(zKey(z))) { levelMap.set(zKey(z), -1); levels.push(z); }
    levels.sort((a, b) => a - b); levels.forEach((z, i) => levelMap.set(zKey(z), i));
    const L = z => levelMap.get(zKey(z));

    const vx = [], vy = [], vl = [], vmap = new Map();
    const vid = (X, Y, li) => { const k = X + ',' + Y + ',' + li; let id = vmap.get(k); if (id === undefined) { id = vx.length; vx.push(X); vy.push(Y); vl.push(li); vmap.set(k, id); } return id; };
    const tris = [];   // [a,b,c, nax,nay,naz, nbx,..., ncz]
    const addTri = (a, b, c, na, nb, nc) => tris.push([a, b, c, na, nb, nc]);

    // Paredes
    for (const s of slabs) {
      const l0 = L(s.z0), l1 = L(s.z1);
      for (const path of s.paths) {
        const n = path.length; if (n < 3) continue;
        const en = new Array(n);
        for (let i = 0; i < n; i++) { const a = path[i], b = path[(i + 1) % n]; const dx = b.X - a.X, dy = b.Y - a.Y, len = Math.hypot(dx, dy) || 1; en[i] = [dy / len, -dx / len, 0]; }
        // Normal por vértice (suaviza curvas, mantém esquinas vivas) — só para a pré-visualização.
        const vn = new Array(n);
        for (let i = 0; i < n; i++) {
          const p = en[(i - 1 + n) % n], q = en[i];
          if (p[0] * q[0] + p[1] * q[1] > cosSmooth) { const x = p[0] + q[0], y = p[1] + q[1], l = Math.hypot(x, y) || 1; vn[i] = [x / l, y / l, 0]; } else vn[i] = null;
        }
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, a = path[i], b = path[j];
          const a0 = vid(a.X, a.Y, l0), b0 = vid(b.X, b.Y, l0), b1 = vid(b.X, b.Y, l1), a1 = vid(a.X, a.Y, l1);
          const na = vn[i] || en[i], nb = vn[j] || en[i];
          addTri(a0, b0, b1, na, nb, nb); addTri(a0, b1, a1, na, nb, na);
        }
      }
    }
    // Tampas
    const CELL = 2000, TOL = 3; // índice espacial: 0,2 mm por célula; tolerância de soldadura 0,3 µm
    const UP = [0, 0, 1], DOWN = [0, 0, -1];
    function cap(region, li, up) {
      if (!region.length) return;
      for (const poly of toPolygons(region)) {
        const rings = [poly.outer, ...poly.holes], flat = [], holeIdx = [], ids = [];
        for (let r = 0; r < rings.length; r++) {
          if (r > 0) holeIdx.push(ids.length);
          for (const q of rings[r]) { flat.push(q.X, q.Y); ids.push(vid(q.X, q.Y, li)); }
        }
        const t = earcut(flat, holeIdx, 2);
        for (let k = 0; k < t.length; k += 3) {
          const i0 = t[k], i1 = t[k + 1], i2 = t[k + 2];
          const ar = (flat[2 * i1] - flat[2 * i0]) * (flat[2 * i2 + 1] - flat[2 * i0 + 1]) - (flat[2 * i2] - flat[2 * i0]) * (flat[2 * i1 + 1] - flat[2 * i0 + 1]);
          // Degenerado ou agulha (altura < tolerância): omitido; a divisão de T-junctions
          // na aresta vizinha recupera o vértice e mantém a malha fechada.
          const e01 = Math.hypot(flat[2 * i1] - flat[2 * i0], flat[2 * i1 + 1] - flat[2 * i0 + 1]), e12 = Math.hypot(flat[2 * i2] - flat[2 * i1], flat[2 * i2 + 1] - flat[2 * i1 + 1]), e20 = Math.hypot(flat[2 * i0] - flat[2 * i2], flat[2 * i0 + 1] - flat[2 * i2 + 1]);
          if (Math.abs(ar) <= TOL * Math.max(e01, e12, e20)) continue;
          if ((ar > 0) === up) addTri(ids[i0], ids[i1], ids[i2], up ? UP : DOWN, up ? UP : DOWN, up ? UP : DOWN);
          else addTri(ids[i0], ids[i2], ids[i1], up ? UP : DOWN, up ? UP : DOWN, up ? UP : DOWN);
        }
      }
    }
    for (let li = 0; li < levels.length; li++) {
      const z = levels[li];
      const below = slabs.find(s => zKey(s.z1) === zKey(z)), above = slabs.find(s => zKey(s.z0) === zKey(z));
      const capFn = opts.capDifference || ((a, b) => difference(a.paths, b.paths));
      if (below) cap(above ? capFn(below, above) : below.paths, li, true);
      if (above) cap(below ? capFn(above, below) : above.paths, li, false);
    }

    // T-junctions: só arestas abertas (sem gémea) são divididas, e apenas por vértices
    // que também pertencem a arestas abertas do mesmo nível. Repete até estabilizar.
    const lerpN = (a, b, t) => { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t, l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    // Soldadura: vértices do mesmo nível a ≤ TOL (pontos de interseção calculados em operações
    // booleanas diferentes podem diferir 1 unidade = 0,1 µm) passam a ser o mesmo vértice.
    const rep = new Int32Array(vx.length); for (let i = 0; i < rep.length; i++) rep[i] = i;
    {
      const g = new Map(), W = TOL * 4;
      const find = i => { while (rep[i] !== i) { rep[i] = rep[rep[i]]; i = rep[i]; } return i; };
      for (let i = 0; i < vx.length; i++) {
        const cx = Math.floor(vx[i] / W), cy = Math.floor(vy[i] / W);
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const cell = g.get(vl[i] + ':' + (cx + ox) + ',' + (cy + oy)); if (!cell) continue;
          for (const j of cell) if (Math.abs(vx[j] - vx[i]) <= TOL && Math.abs(vy[j] - vy[i]) <= TOL) { const a = find(i), b = find(j); if (a !== b) rep[Math.max(a, b)] = Math.min(a, b); }
        }
        const k = vl[i] + ':' + cx + ',' + cy; let a = g.get(k); if (!a) g.set(k, a = []); a.push(i);
      }
      for (let i = 0; i < rep.length; i++) rep[i] = find(i);
    }
    let cur = [];
    for (const t of tris) { const a = rep[t[0]], b = rep[t[1]], c = rep[t[2]]; if (a !== b && b !== c && a !== c) cur.push([a, b, c, t[3], t[4], t[5]]); }
    for (let iter = 0; iter < 12; iter++) {
      const half = new Set();
      for (const t of cur) { half.add(t[0] + '>' + t[1]); half.add(t[1] + '>' + t[2]); half.add(t[2] + '>' + t[0]); }
      const openEdges = [], openVerts = new Set();
      for (let i = 0; i < cur.length; i++) {
        const t = cur[i];
        for (let e = 0; e < 3; e++) { const u = t[e], v = t[(e + 1) % 3]; if (!half.has(v + '>' + u)) { openEdges.push([i, e]); openVerts.add(u); openVerts.add(v); } }
      }
      if (!openEdges.length) break;
      const grids = new Map();
      for (const i of openVerts) {
        let g = grids.get(vl[i]); if (!g) grids.set(vl[i], g = new Map());
        const k = Math.floor(vx[i] / CELL) + ',' + Math.floor(vy[i] / CELL); let a = g.get(k); if (!a) g.set(k, a = []); a.push(i);
      }
      const onSegment = (u, v, skip) => {
        if (vl[u] !== vl[v]) return null;
        const g = grids.get(vl[u]); if (!g) return null;
        const x0 = vx[u], y0 = vy[u], dx = vx[v] - x0, dy = vy[v] - y0, len2 = dx * dx + dy * dy; if (!len2) return null;
        const len = Math.sqrt(len2);
        const cx0 = Math.floor((Math.min(x0, vx[v]) - TOL) / CELL), cx1 = Math.floor((Math.max(x0, vx[v]) + TOL) / CELL);
        const cy0 = Math.floor((Math.min(y0, vy[v]) - TOL) / CELL), cy1 = Math.floor((Math.max(y0, vy[v]) + TOL) / CELL);
        let found = null;
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
          const cell = g.get(cx + ',' + cy); if (!cell) continue;
          for (const w of cell) {
            if (w === u || w === v || w === skip) continue;
            const px = vx[w] - x0, py = vy[w] - y0, t = (px * dx + py * dy) / len2;
            if (t <= 0 || t >= 1 || t * len < TOL || (1 - t) * len < TOL) continue;
            if (Math.abs(dx * py - dy * px) / len > TOL) continue;
            (found || (found = [])).push([t, w]);
          }
        }
        if (found) found.sort((a, b) => a[0] - b[0]);
        return found;
      };
      const splitAt = new Map();
      for (const [i, e] of openEdges) {
        if (splitAt.has(i)) continue;
        const t = cur[i], u = t[e], v = t[(e + 1) % 3], w = t[(e + 2) % 3];
        const pts = onSegment(u, v, w); if (pts) splitAt.set(i, [e, pts]);
      }
      if (!splitAt.size) break;
      const next = [];
      for (let i = 0; i < cur.length; i++) {
        const t = cur[i], sp = splitAt.get(i);
        if (!sp) { next.push(t); continue; }
        const [e, pts] = sp, V = [t[0], t[1], t[2]], N = [t[3], t[4], t[5]];
        const u = V[e], v = V[(e + 1) % 3], w = V[(e + 2) % 3], nu = N[e], nv = N[(e + 1) % 3], nw = N[(e + 2) % 3];
        let prev = u, nprev = nu;
        for (const [tt, p] of pts) { const np = lerpN(nu, nv, tt); next.push([prev, p, w, nprev, np, nw]); prev = p; nprev = np; }
        next.push([prev, v, w, nprev, nv, nw]);
      }
      cur = next;
    }
    const out = [];
    for (const t of cur) out.push(t[0], t[1], t[2], t[3], t[4], t[5]);

    // Saída: posições em mm (Float32), índices, normais por canto (para a GPU).
    const nTri = out.length / 6;
    // Compacta: só os vértices usados (a soldadura deixa alguns órfãos).
    const remap = new Int32Array(vx.length).fill(-1); let nv = 0;
    for (let k = 0; k < nTri; k++) for (let j = 0; j < 3; j++) { const v = out[6 * k + j]; if (remap[v] < 0) remap[v] = nv++; }
    const positions = new Float32Array(nv * 3);
    for (let i = 0; i < vx.length; i++) { const r = remap[i]; if (r < 0) continue; positions[3 * r] = vx[i] / SCALE; positions[3 * r + 1] = vy[i] / SCALE; positions[3 * r + 2] = levels[vl[i]]; }
    const indices = new Uint32Array(nTri * 3), cornerNormals = new Float32Array(nTri * 9);
    for (let k = 0; k < nTri; k++) {
      indices[3 * k] = remap[out[6 * k]]; indices[3 * k + 1] = remap[out[6 * k + 1]]; indices[3 * k + 2] = remap[out[6 * k + 2]];
      for (let j = 0; j < 3; j++) { const n = out[6 * k + 3 + j]; cornerNormals[9 * k + 3 * j] = n[0]; cornerNormals[9 * k + 3 * j + 1] = n[1]; cornerNormals[9 * k + 3 * j + 2] = n[2]; }
    }
    return { positions, indices, cornerNormals, triangleCount: nTri, vertexCount: nv };
  }

  /**
   * Sólido a partir de volumes {paths, z0, z1} (união) menos bolsas {paths, z0, z1} (diferença).
   * Divide em intervalos de z e calcula a região de cada intervalo.
   */
  function buildPart(solids, pockets = [], opts = {}) {
    const zs = new Set();
    for (const s of [...solids, ...pockets]) { zs.add(+s.z0.toFixed(6)); zs.add(+s.z1.toFixed(6)); }
    const levels = [...zs].sort((a, b) => a - b), slabs = [];
    const cache = new Map();
    // União de um conjunto de volumes/bolsas, com cache por conjunto de índices.
    const unionOf = (list, idx, tag) => {
      if (!idx.length) return [];
      const k = tag + idx.join(','); if (cache.has(k)) return cache.get(k);
      const r = idx.length === 1 ? list[idx[0]].paths : union([].concat(...idx.map(i => list[i].paths)));
      cache.set(k, r); return r;
    };
    for (let i = 0; i + 1 < levels.length; i++) {
      const z0 = levels[i], z1 = levels[i + 1], mid = (z0 + z1) / 2;
      const add = [], sub = [];
      solids.forEach((s, j) => { if (s.z0 < mid && s.z1 > mid && s.paths.length) add.push(j); });
      pockets.forEach((s, j) => { if (s.z0 < mid && s.z1 > mid && s.paths.length) sub.push(j); });
      if (!add.length) continue;
      const U = unionOf(solids, add, 'U'), P = unionOf(pockets, sub, 'P');
      const key = add.join(',') + '|' + sub.join(',');
      let region = cache.get('R' + key);
      if (!region) { region = P.length ? difference(U, P) : U; cache.set('R' + key, region); }
      if (region.length) slabs.push({ z0, z1, paths: region, key, recipe: { add, sub, U, P } });
    }
    // Tampa entre duas lajes calculada pelas receitas:
    //   A − B = [(Ua − Ub) − Pa] ∪ [Ua ∩ (Pb − Pa)],  com Ua − Ub = ∪(só em a) − Ub  e  Pb − Pa = ∪(só em b) − Pa.
    // Assim nunca se subtraem regiões quase idênticas (arestas comuns), que no Clipper são lentas e frágeis.
    const only = (x, y) => x.filter(v => y.indexOf(v) < 0);
    const capDifference = (a, b) => {
      const ra = a.recipe, rb = b.recipe;
      if (!ra || !rb) return difference(a.paths, b.paths);
      const out = [];
      const aOnly = only(ra.add, rb.add);
      if (aOnly.length) { let d = difference(unionOf(solids, aOnly, 'U'), rb.U); if (ra.P.length) d = difference(d, ra.P); out.push(...d); }
      const bOnly = only(rb.sub, ra.sub);
      if (bOnly.length) { let d = unionOf(pockets, bOnly, 'P'); if (ra.P.length) d = difference(d, ra.P); out.push(...intersection(ra.U, d)); }
      return out.length && aOnly.length && bOnly.length ? union(out) : out;
    };
    let mesh = buildSolid(slabs, Object.assign({}, opts, { capDifference }));
    // Plano B: se ainda houver arestas abertas, recalcula as tampas por diferença direta das lajes.
    if (!isClosed(mesh)) {
      const alt = buildSolid(slabs, opts);
      if (isClosed(alt)) mesh = alt; else mesh.closed = false;
    }
    return mesh;
  }
  function isClosed(mesh) {
    const I = mesh.indices, half = new Map();
    for (let k = 0; k < I.length; k += 3) for (let e = 0; e < 3; e++) { const u = I[k + e], v = I[k + (e + 1) % 3], key = u * 4194304 + v; half.set(key, (half.get(key) || 0) + 1); }
    for (const [key, n] of half) { if (n !== 1) return false; const u = Math.floor(key / 4194304), v = key - u * 4194304; if (half.get(v * 4194304 + u) !== 1) return false; }
    return true;
  }

  // ---------------------------------------------------------------- verificação da malha
  function meshStats(mesh) {
    const { positions: P, indices: I } = mesh, edges = new Map();
    let degenerate = 0, volume = 0, minEdge = Infinity;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2];
      const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2], bx = P[3 * b], by = P[3 * b + 1], bz = P[3 * b + 2], cx = P[3 * c], cy = P[3 * c + 1], cz = P[3 * c + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (Math.hypot(nx, ny, nz) < 1e-12 || a === b || b === c || a === c) degenerate++;
      volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      minEdge = Math.min(minEdge, Math.hypot(ux, uy, uz), Math.hypot(wx, wy, wz));
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const key = u < v ? u + '_' + v : v + '_' + u, e = edges.get(key) || { n: 0, fwd: 0 };
        e.n++; if (u < v) e.fwd++; edges.set(key, e);
      }
    }
    let boundary = 0, nonManifold = 0, badOrientation = 0;
    for (const e of edges.values()) { if (e.n === 1) boundary++; else if (e.n > 2) nonManifold++; else if (e.fwd !== 1) badOrientation++; }
    return { triangles: I.length / 3, vertices: P.length / 3, edges: edges.size, boundary, nonManifold, badOrientation, degenerate, volume, minEdge, watertight: boundary === 0 && nonManifold === 0 && badOrientation === 0 };
  }

  return { SCALE, QUALITY, union, difference, intersection, offset, finalize, mirrorX, translate, scalePaths, contains, toPolygons, fillSmallHoles,
    regionArea, bounds, flattenCommands, textRegion, circle, ellipse, rect, roundRect, cloud, buildSolid, buildPart, meshStats, isClosed };
});
