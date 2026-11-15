/*
 * SparrowTech 3D Studio — construção do modelo a partir do estado da interface (v5).
 * Traduz as opções (forma da base, acabamento da frente/verso, contorno, argola) em
 * regiões 2D vetoriais e em sólidos por parte/cor, sem sobreposições entre partes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geometry.js'));
  else root.SparrowModel = factory(root.SparrowGeo);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';
  const INLAY_DEPTH = 0.4;     // profundidade de embutidos (frente «à face» e verso «à face»)
  const OUTLINE_HEIGHT = 0.2;  // espessura do contorno saliente / embutido
  const MIN_FLOOR = 0.6;       // chão mínimo que fica por baixo de uma gravação

  // Escolhe a zona da base para a argola: canto superior esquerdo, tocando na peça.
  function autoRing(base, S) {
    const b = G.bounds(base); if (!b) return { x: 0, y: 0 };
    let best = Infinity, bx = b.minX, by = b.maxY;
    const step = Math.max(0.2, Math.min(b.width, b.height) / 120);
    for (let y = b.maxY; y >= b.maxY - b.height * 0.5; y -= step)
      for (let x = b.minX; x <= b.minX + b.width * 0.36; x += step) {
        if (!G.contains(base, x, y)) continue;
        const dx = (x - b.minX) / b.width, dy = (b.maxY - y) / b.height, v = dx * 0.8 + dy * 1.4 + Math.abs(dx - 0.14) * 0.2;
        if (v < best) { best = v; bx = x; by = y; }
      }
    return { x: bx + S.ringOuter * 0.05, y: by - S.ringOuter * 0.05 };
  }

  // Garante que a forma envolve as letras (ovais/nuvens podiam cortar os cantos do texto).
  function growToContain(make, text) {
    let k = 1, shape = make(k);
    const total = Math.abs(G.regionArea(text)) || 1;
    for (let i = 0; i < 16 && Math.abs(G.regionArea(G.difference(text, shape))) > total * 1e-4; i++) { k *= 1.05; shape = make(k); }
    return shape;
  }

  function regionsFor(S, fonts, q) {
    const tol = q.tol, ang = q.angle;
    const name = (S.name || '').trim() || 'Nome', em = 27 * S.nameSize / 100;
    const T0 = G.textRegion(fonts.front, name, em, tol, ang);
    const text = T0.paths, tb = T0.bounds || { minX: -20, maxX: 20, minY: -8, maxY: 8, width: 40, height: 16 };
    // Base (sem argola)
    let shape;
    if (S.shape === 'contour') shape = G.offset(text, S.border, tol, ang);
    else if (S.shape === 'none') shape = G.offset(text, 1.4, tol, ang);
    else {
      const pad = S.border + 1, x0 = tb.minX - pad, x1 = tb.maxX + pad, y0 = tb.minY - pad, y1 = tb.maxY + pad;
      const bw = x1 - x0, bh = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (S.shape === 'rounded') shape = G.roundRect(x0, y0, x1, y1, Math.min(12, bh * 0.3), tol, ang);
      else if (S.shape === 'square') shape = G.rect(x0, y0, x1, y1);
      else if (S.shape === 'oval') shape = growToContain(k => G.ellipse(cx, cy, bw / 2 * k, bh / 2 * k, tol, ang), text);
      else if (S.shape === 'cloud') shape = growToContain(k => G.cloud(cx, cy, bw / 2 * k, bh / 2 * k, tol, ang), text);
      else shape = G.offset(text, S.border, tol, ang);
    }
    if (S.fillHoles) shape = G.fillSmallHoles(shape, S.holeArea);
    // Argola
    let ring = null, base = shape, ringOverlap = 0;
    if (S.hasRing) {
      const pos = S.ringManual ? { x: S.ringX, y: S.ringY } : autoRing(shape, S);
      const outer = G.circle(pos.x, pos.y, S.ringOuter / 2, tol, ang), inner = G.circle(pos.x, pos.y, S.ringInner / 2, tol, ang);
      ringOverlap = Math.abs(G.regionArea(G.intersection(G.difference(outer, inner), shape)));
      base = G.difference(G.union(shape, outer), inner);
      ring = { x: pos.x, y: pos.y };
    }
    const letters = G.intersection(text, base);
    // Pegada do contorno (letras + contorno) sem recorte: usada como bolsa na base, evita arestas coincidentes.
    let outline = [], outlineFoot = [];
    if (S.outline) { outlineFoot = G.offset(text, S.outlineWidth, tol, ang); outline = G.intersection(G.difference(outlineFoot, text), base); }
    // Verso (espelhado em X para ler corretamente depois de virar a peça)
    let back = [];
    if (S.back !== 'smooth' && S.back !== 'through') {
      const backName = (S.backText || '').trim() || name;
      const fontFor = fonts.back || fonts.front;
      const wordWidth = Math.min(218, Math.max(65, tb.width + 25));
      let backEm = Math.min(em, (wordWidth - 5) * 1.8 / Math.max(1, backName.length));
      const bb = G.bounds(shape) || tb, cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
      const inset = G.offset(base, -0.8, tol, ang), margin = G.offset(base, -0.5, tol, ang);
      let K = [];
      for (let i = 0; i < 14; i++) {
        K = G.translate(G.mirrorX(G.textRegion(fontFor, backName, backEm, tol, ang).paths), cx, cy);
        const area = Math.abs(G.regionArea(K)) || 1;
        if (Math.abs(G.regionArea(G.difference(K, inset))) <= area * 0.002) break;
        backEm *= 0.92;
      }
      back = G.intersection(K, margin);   // o verso fica sempre ≥ 0,5 mm afastado do rebordo
    }
    return { name, text, letters, shape, base, outline, outlineFoot, back, ring, ringOverlap, bounds: G.bounds(base), textBounds: tb };
  }

  function solidsFor(S, R0) {
    let R = R0;
    const b = S.bodyThickness, fh = S.letterHeight, d = INLAY_DEPTH, oh = Math.min(OUTLINE_HEIGHT, b / 4);
    let eh = Math.min(fh, b - MIN_FLOOR);
    if (S.front === 'engraved' && S.back === 'engraved') eh = Math.min(eh, (b - 0.4) / 2);
    eh = Math.max(0.2, eh);
    const L = [], O = [], K = [], pockets = [], extra = [];
    const through = S.back === 'through';
    const T = R.text, Tp = R.letters, F = R.outline.length ? R.outlineFoot : [];
    // Com letras vazadas, o verso não pode ficar a flutuar dentro dos furos: a parte do verso
    // é recortada, mas a bolsa na base usa o texto original (evita arestas coincidentes).
    const backPocket = R.back;
    if (S.front === 'cutout' && !through && R.back.length) R = Object.assign({}, R, { back: G.difference(R.back, G.offset(T, 0.05, 0.01)) }); // folga de 0,05 mm: sem arestas coincidentes
    const push = (arr, paths, z0, z1) => { if (paths && paths.length && z1 > z0 + 1e-6) arr.push({ paths, z0, z1 }); };
    // L/O/K: volumes das partes; pockets: o que é retirado à base (pegadas sem recorte);
    // extra: volumes adicionais para o sólido único (STL completo) acima/abaixo da base.
    if (S.front === 'raised') {
      push(L, Tp, b, b + fh); push(O, R.outline, b, b + oh);
      push(extra, Tp, b, b + fh); push(extra, F.length ? G.intersection(F, R.base) : [], b, b + oh);
    } else if (S.front === 'flush') {
      push(L, Tp, b - d, b); push(O, R.outline, b - d, b); push(pockets, F.length ? F : T, b - d, b);
    } else if (S.front === 'engraved') {
      if (!through) push(pockets, T, b - eh, b);
      push(O, R.outline, b - oh, b); if (F.length) push(pockets, F, b - oh, b);
    } else if (S.front === 'cutout') {
      if (!through) push(pockets, T, 0, b);
      push(O, R.outline, b - oh, b); if (F.length) push(pockets, F, b - oh, b);
    }
    if (through) { push(L, Tp, 0, b); push(pockets, T, 0, b); }
    if (S.back === 'inlay') { push(K, R.back, 0, d); push(pockets, backPocket, 0, d); }
    else if (S.back === 'raised') { push(K, R.back, -fh, 0); push(extra, R.back, -fh, 0); }
    else if (S.back === 'engraved') push(pockets, backPocket, 0, eh);
    const zShift = S.back === 'raised' && R.back.length ? fh : 0;
    const shift = arr => arr.map(s => ({ paths: s.paths, z0: s.z0 + zShift, z1: s.z1 + zShift }));
    // Bolsas «puras» (sem material de outra cor): só contam para o sólido único.
    const filled = S.front === 'flush' || through || S.back === 'inlay';
    const purePockets = [];
    if (S.front === 'engraved' && !through) push(purePockets, T, b - eh, b);
    if (S.front === 'cutout' && !through) push(purePockets, T, 0, b);
    if (S.back === 'engraved') push(purePockets, backPocket, 0, eh);
    return { base: [{ paths: R.base, z0: zShift, z1: b + zShift }], letters: shift(L), outline: shift(O), back: shift(K), pockets: shift(pockets), extra: shift(extra), purePockets: shift(purePockets), zShift, filled };
  }

  /**
   * Constrói todas as partes. Devolve regiões (para seleção e desenho 2D) e malhas por cor.
   * fonts: {front: opentype.Font, back?: opentype.Font}; quality: chave de G.QUALITY ou {tol, angle}.
   */
  function build(S, fonts, quality) {
    const q = typeof quality === 'string' ? G.QUALITY[quality] || G.QUALITY.fine : quality;
    const t0 = Date.now();
    const R = regionsFor(S, fonts, q);
    const Z = solidsFor(S, R);
    const t1 = Date.now();
    const defs = [
      { id: 'base', label: 'Base e argola', color: S.baseColor, solids: Z.base, pockets: Z.pockets },
      { id: 'letters', label: 'Letras da frente', color: S.letterColor, solids: Z.letters, pockets: [] },
      { id: 'outline', label: 'Contorno', color: S.outlineColor, solids: Z.outline, pockets: [] },
      { id: 'back', label: 'Letras do verso', color: S.letterColor, solids: Z.back, pockets: [] }
    ];
    const parts = [];
    for (const d of defs) {
      if (!d.solids.length) continue;
      const mesh = G.buildPart(d.solids, d.pockets);
      if (mesh.triangleCount) parts.push({ id: d.id, label: d.label, color: d.color, mesh });
    }
    const t2 = Date.now();
    const top = Math.max(...parts.map(p => { let m = 0; const P = p.mesh.positions; for (let i = 2; i < P.length; i += 3) if (P[i] > m) m = P[i]; return m; }), 0);
    return {
      regions: R, parts, zShift: Z.zShift, height: top, quality: q,
      timing: { regions: t1 - t0, meshes: t2 - t1 },
      // União de todas as partes num único sólido (STL «completo»).
      unionMesh: () => G.buildPart([...Z.base, ...Z.extra], Z.purePockets)
    };
  }

  return { build, regionsFor, solidsFor, INLAY_DEPTH, OUTLINE_HEIGHT };
});
