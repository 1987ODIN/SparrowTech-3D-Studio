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

  /**
   * Argola automática num sítio SEGURO: perto do canto superior esquerdo, mas com 30–50 % do disco
   * da argola dentro da peça (bem agarrada), sem o furo cortar letras e, de preferência, sem a
   * argola tapar letras. Pesquisa grossa + refinamento.
   */
  function autoRing(shape, text, S) {
    const b = G.bounds(shape); if (!b) return { x: 0, y: 0 };
    const ro = S.ringOuter / 2, ri = S.ringInner / 2, disc = Math.PI * ro * ro, coarse = 0.3, ang = 20 * Math.PI / 180;
    // Versões simplificadas (±0,1 mm) só para a pesquisa: muito mais rápidas.
    shape = G.simplify(shape, 0.1); text = G.simplify(text, 0.1);
    const tb = G.bounds(text);
    const cost = (x, y) => {
      const outer = G.circle(x, y, ro, coarse, ang), f = Math.abs(G.regionArea(G.intersection(outer, shape))) / disc;
      if (f < 0.12 || f > 0.85) return Infinity;
      const nearText = tb && x + ro > tb.minX && x - ro < tb.maxX && y + ro > tb.minY && y - ro < tb.maxY;
      if (nearText && Math.abs(G.regionArea(G.intersection(G.circle(x, y, ri + 0.6, coarse, ang), text))) > 0.05) return Infinity; // o furo não pode cortar letras
      const cover = nearText ? Math.abs(G.regionArea(G.intersection(outer, text))) / disc : 0;                                    // argola por cima das letras
      const dx = (x - b.minX) / b.width, dy = (b.maxY - y) / b.height;
      return Math.abs(f - 0.42) * 5 + cover * 6 + dx * 0.8 + dy * 1.4;
    };
    let best = { c: Infinity, x: b.minX + ro * 0.4, y: b.maxY - ro * 0.4 };
    const scan = (x0, x1, y0, y1, step) => { for (let y = y1; y >= y0; y -= step) for (let x = x0; x <= x1; x += step) { const c = cost(x, y); if (c < best.c) best = { c, x, y }; } };
    scan(b.minX - ro, b.minX + b.width * 0.4, b.maxY - b.height * 0.6, b.maxY + ro, 1.2);
    if (best.c === Infinity) scan(b.minX - ro, b.maxX + ro, b.minY - ro, b.maxY + ro, 1.5);   // qualquer sítio seguro
    if (best.c < Infinity) scan(best.x - 1.2, best.x + 1.2, best.y - 1.2, best.y + 1.2, 0.3);
    return { x: best.x, y: best.y };
  }
  /**
   * Avalia e reforça a ligação da argola. O reforço é um «filete» (fecho morfológico local) que
   * enche o pescoço estreito entre a argola e a peça, como uma solda arredondada.
   */
  function ringJoin(shape, text, S, pos, tol, ang) {
    const ro = S.ringOuter / 2, ri = S.ringInner / 2, disc = Math.PI * ro * ro;
    const outer = G.circle(pos.x, pos.y, ro, tol, ang), inner = G.circle(pos.x, pos.y, ri, tol, ang);
    const overlap = Math.abs(G.regionArea(G.intersection(outer, shape))), frac = overlap / disc;
    let joined = G.union(shape, outer), web = 0;
    if (S.ringReinforce !== false && overlap > 0.05) {
      const R = Math.max(1.5, ro * 0.6);
      const closed = G.offset(G.offset(joined, R, tol, ang), -R, tol, ang);
      let extra = G.intersection(G.difference(closed, joined), G.circle(pos.x, pos.y, ro + R * 1.6, tol, ang));
      // O fecho também deixa lascas finíssimas ao longo de todo o contorno (aproximação dos arcos):
      // ficam só os «filetes» reais do pescoço (área > 0,05 mm² e espessura média > 0,08 mm).
      extra = extra.filter(p => { const a = Math.abs(G.regionArea([p])); let per = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; per += Math.hypot(r.X - q.X, r.Y - q.Y) / G.SCALE; } return a > 0.05 && a / per > 0.04; });
      web = Math.abs(G.regionArea(extra));
      // Cresce 0,05 mm para sobrepor bem a peça (sem arestas tangentes) antes de unir.
      if (web > 0.05) joined = G.union(joined, G.offset(extra, 0.05, tol, ang));
    }
    const wall = ro - ri, holeCuts = Math.abs(G.regionArea(G.intersection(inner, text))) > 0.05, cover = Math.abs(G.regionArea(G.intersection(outer, text))) / disc;
    let status = 'ok';
    if (overlap < 0.3) status = 'solta';
    else if (frac < 0.2 || wall < 1.2) status = 'fraca';
    return { base: G.difference(joined, inner), info: { frac, overlap, web, wall, holeCuts, cover, status } };
  }

  // Garante que a forma envolve as letras (ovais/nuvens podiam cortar os cantos do texto).
  function growToContain(make, text) {
    let k = 1, shape = make(k);
    const total = Math.abs(G.regionArea(text)) || 1;
    for (let i = 0; i < 16 && Math.abs(G.regionArea(G.difference(text, shape))) > total * 1e-4; i++) { k *= 1.05; shape = make(k); }
    return shape;
  }

  /**
   * Imprimibilidade das letras para um bico: com raio r = bico/2,
   *  • traços: «abertura» (erosão r + dilatação r) — o que desaparece é mais fino do que o bico;
   *  • espaços: «fecho» (dilatação r + erosão r) — o que aparece são aberturas/furos mais estreitos
   *    do que o bico, que o slicer tende a colar (letras «fechadas»).
   * Devolve as frações perdidas/ganhas da área das letras e um estado ok/aviso/mau.
   */
  function printability(text, nozzle) {
    if (!text.length) return { stroke: 0, gap: 0, status: 'ok', nozzle };
    // Traço: pelo menos 2 linhas do bico (2 perímetros) → abertura de raio = bico. Espaços: ≥ 1 bico → fecho de raio bico/2.
    const r = nozzle / 2, a = Math.abs(G.regionArea(text)) || 1, tolP = 0.02;
    const opened = G.offset(G.offset(text, -nozzle, tolP), nozzle, tolP), closed = G.offset(G.offset(text, r, tolP), -r, tolP);
    const stroke = Math.max(0, 1 - Math.abs(G.regionArea(opened)) / a), gap = Math.max(0, Math.abs(G.regionArea(closed)) / a - 1);
    const worst = Math.max(stroke, gap * 1.5);
    return { stroke, gap, nozzle, status: worst < 0.025 ? 'ok' : worst < 0.08 ? 'aviso' : 'mau' };
  }
  // Análise rápida de uma fonte (galeria): mesmo nome/tamanho/espessura, qualidade de rascunho.
  function scanFont(S, font) {
    const q = G.QUALITY.draft, em = 27 * S.nameSize / 100, name = (S.name || '').trim() || 'Nome';
    let text = G.textRegion(font, name, em, q.tol, q.angle, { letterSpacing: (S.letterSpacing || 0) / 100 }).paths;
    if (Math.abs(S.textWeight || 0) > 1e-3 && text.length) text = G.offset(text, S.textWeight, q.tol, q.angle);
    const b = G.bounds(text);
    return Object.assign(printability(text, S.nozzle || 0.4), { width: b ? b.width : 0, height: b ? b.height : 0 });
  }

  function regionsFor(S, fonts, q) {
    const tol = q.tol, ang = q.angle;
    const name = (S.name || '').trim() || 'Nome', em = 27 * S.nameSize / 100;
    const spacing = (S.letterSpacing || 0) / 100;
    const T0 = G.textRegion(fonts.front, name, em, tol, ang, { letterSpacing: spacing });
    let text = T0.paths;
    // Espessura: engrossa (ou afina) o traço das letras, como nos geradores de porta-chaves.
    const weight = S.textWeight || 0;
    if (Math.abs(weight) > 1e-3 && text.length) text = G.offset(text, weight, tol, ang);
    // Pontas arredondadas: «abertura» (encolhe e volta a crescer) tira os bicos das terminações.
    const tipR = Math.max(0, S.letterRound || 0);
    if (tipR > 1e-3 && text.length) text = G.offset(G.offset(text, -tipR, tol, ang), tipR, tol, ang);
    text = G.depinch(text);
    const tb = G.bounds(text) || { minX: -20, maxX: 20, minY: -8, maxY: 8, width: 40, height: 16 };
    const print = printability(text, S.nozzle || 0.4);
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
      const pos = S.ringManual ? { x: S.ringX, y: S.ringY } : autoRing(shape, text, S);
      const J = ringJoin(shape, text, S, pos, tol, ang);
      base = J.base; ringOverlap = J.info.overlap;
      ring = Object.assign({ x: pos.x, y: pos.y }, J.info);
    }
    base = G.depinch(base);
    const letters = G.depinch(G.intersection(text, base));
    // Pegada do contorno (letras + contorno) sem recorte: usada como bolsa na base, evita arestas coincidentes.
    let outline = [], outlineFoot = [];
    if (S.outline) { outlineFoot = G.offset(text, S.outlineWidth, tol, ang); outline = G.depinch(G.intersection(G.difference(outlineFoot, text), base)); }
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
        let Kt = G.textRegion(fontFor, backName, backEm, tol, ang, { letterSpacing: spacing }).paths;
        if (Math.abs(weight) > 1e-3 && Kt.length) Kt = G.offset(Kt, weight * backEm / em, tol, ang);
        K = G.translate(G.mirrorX(Kt), cx, cy);
        const area = Math.abs(G.regionArea(K)) || 1;
        if (Math.abs(G.regionArea(G.difference(K, inset))) <= area * 0.002) break;
        backEm *= 0.92;
      }
      back = G.depinch(G.intersection(K, margin));   // o verso fica sempre ≥ 0,5 mm afastado do rebordo
    }
    return { name, text, letters, shape, base, outline, outlineFoot, back, ring, ringOverlap, print, quality: q, bounds: G.bounds(base), textBounds: tb };
  }

  /**
   * Topo arredondado («almofadado»): a parte saliente é feita de camadas finas cada vez mais
   * estreitas, seguindo um quarto de círculo de raio rr. Os degraus (≤ 0,08 mm) ficam abaixo da
   * altura de camada da impressora, por isso o slicer vê uma curva.
   * up = true: arredonda em cima (z1); false: em baixo (z0, letras em relevo no verso).
   */
  function domed(paths, z0, z1, up, tol, ang) {
    const h = z1 - z0, rr = Math.min(h, 0.8);
    if (!paths.length || rr < 0.15) return [{ paths, z0, z1 }];
    const n = Math.max(3, Math.min(8, Math.ceil(rr / 0.08))), out = [];
    if (h - rr > 1e-6) out.push(up ? { paths, z0, z1: z1 - rr } : { paths, z0: z0 + rr, z1 });
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, inset = rr * (1 - Math.sqrt(1 - t * t));
      const reg = inset < 0.012 ? paths : G.depinch(G.offset(paths, -inset, tol, ang));   // recuos < 12 µm não contam (evita faixas finíssimas)
      if (!reg.length) break;
      const a = rr * i / n, b2 = rr * (i + 1) / n;
      out.push(up ? { paths: reg, z0: z1 - rr + a, z1: z1 - rr + b2 } : { paths: reg, z0: z0 + rr - b2, z1: z0 + rr - a });
    }
    return out;
  }

  /**
   * Base «peluche»: arredonda a aresta de cima (rb, quarto de círculo) e, se pedido, um chanfro
   * leve a 45° em baixo (cb) — em baixo não pode ser curva: junto ao tabuleiro ficaria no ar.
   * O recuo negativo encolhe o contorno exterior e alarga os furos (entrada do furo da argola).
   */
  function roundedBase(paths, b, rb, cb, tol, ang) {
    const out = [], inset = d => d < 0.012 ? paths : G.depinch(G.offset(paths, -d, tol, ang));
    if (cb > 0) { const n = Math.max(2, Math.round(cb / 0.1)); for (let i = 0; i < n; i++) { const reg = inset(cb * (1 - (i + 0.5) / n)); if (reg.length) out.push({ paths: reg, z0: cb * i / n, z1: cb * (i + 1) / n }); } }
    if (b - rb - cb > 1e-6) out.push({ paths, z0: cb, z1: b - rb });
    if (rb > 0) { const n = Math.max(3, Math.min(8, Math.ceil(rb / 0.08))); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, reg = inset(rb * (1 - Math.sqrt(1 - t * t))); if (!reg.length) break; out.push({ paths: reg, z0: b - rb + rb * i / n, z1: b - rb + rb * (i + 1) / n }); } }
    return out;
  }
  /** Quanto se pode arredondar a base sem enfraquecer: devolve {rb, cb, extra} (extra = espessura somada para compensar). */
  function roundPlan(S, R) {
    const b0 = S.bodyThickness; let rb = 0, cb = 0;
    if (S.roundBase) {
      rb = Math.min(Math.max(0.2, Math.min(1, S.roundAmount || 0.6)), b0 * 0.4);
      // A parede da argola tem de ficar com ≥ 0,8 mm planos em cima.
      if (S.hasRing) rb = Math.min(rb, Math.max(0, ((S.ringOuter - S.ringInner) / 2 - 0.8) / 2));
      // O que assenta em cima da base (letras, contorno) não pode ficar sem chão.
      if (R) { const foot = G.union([...(R.text || []), ...(R.outline || [])]); for (let k = 0; k < 4 && rb >= 0.15 && foot.length; k++) { const miss = G.difference(G.offset(foot, 0.15, 0.02), G.offset(R.base, -rb, 0.02)); if (!miss.length) break; rb *= 0.6; } }
      if (rb < 0.15) rb = 0;
    }
    if (S.roundBack && !(S.back === 'raised' && R && R.back && R.back.length)) cb = Math.min(0.3, b0 * 0.15);
    return { rb, cb, extra: Math.round((rb / 2 + cb / 3) * 20) / 20 };
  }

  function solidsFor(S, R0) {
    let R = R0;
    const plan = roundPlan(S, R0);
    const b = S.bodyThickness + plan.extra, fh = S.letterHeight, d = INLAY_DEPTH, oh = Math.min(OUTLINE_HEIGHT, b / 4);
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
    const q = R.quality || { tol: 0.01, angle: 0.06 };
    const raisedSolids = (paths, z0, z1, up) => S.roundTop ? domed(paths, z0, z1, up, q.tol, q.angle) : [{ paths, z0, z1 }];
    if (S.front === 'raised') {
      for (const sl of raisedSolids(Tp, b, b + fh, true)) { push(L, sl.paths, sl.z0, sl.z1); push(extra, sl.paths, sl.z0, sl.z1); }
      push(O, R.outline, b, b + oh); push(extra, F.length ? G.intersection(F, R.base) : [], b, b + oh);
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
    else if (S.back === 'raised') { for (const sl of raisedSolids(R.back, -fh, 0, false)) { push(K, sl.paths, sl.z0, sl.z1); push(extra, sl.paths, sl.z0, sl.z1); } }
    else if (S.back === 'engraved') push(pockets, backPocket, 0, eh);
    const zShift = S.back === 'raised' && R.back.length ? fh : 0;
    const shift = arr => arr.map(s => ({ paths: s.paths, z0: s.z0 + zShift, z1: s.z1 + zShift }));
    // Bolsas «puras» (sem material de outra cor): só contam para o sólido único.
    const filled = S.front === 'flush' || through || S.back === 'inlay';
    const purePockets = [];
    if (S.front === 'engraved' && !through) push(purePockets, T, b - eh, b);
    if (S.front === 'cutout' && !through) push(purePockets, T, 0, b);
    if (S.back === 'engraved') push(purePockets, backPocket, 0, eh);
    const baseSolids = plan.rb || plan.cb ? roundedBase(R.base, b, plan.rb, plan.cb, q.tol, q.angle) : [{ paths: R.base, z0: 0, z1: b }];
    return { round: plan, base: shift(baseSolids), letters: shift(L), outline: shift(O), back: shift(K), pockets: shift(pockets), extra: shift(extra), purePockets: shift(purePockets), zShift, filled };
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
      regions: R, parts, zShift: Z.zShift, height: top, quality: q, round: Z.round,
      timing: { regions: t1 - t0, meshes: t2 - t1 },
      // União de todas as partes num único sólido (STL «completo»).
      unionMesh: () => G.buildPart([...Z.base, ...Z.extra], Z.purePockets)
    };
  }

  /** Menor tamanho do nome (%) com que as letras ficam imprimíveis para o bico (pesquisa binária). */
  function minScaleFor(S, font, maxPct = 400) {
    const ok = pct => scanFont(Object.assign({}, S, { nameSize: pct }), font).status === 'ok';
    let lo = S.nameSize, hi = maxPct;
    if (ok(lo)) return lo;
    if (!ok(hi)) return null;
    while (hi - lo > 2) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    return Math.ceil(hi / 5) * 5;
  }
  return { build, regionsFor, solidsFor, printability, scanFont, minScaleFor, INLAY_DEPTH, OUTLINE_HEIGHT };
});
