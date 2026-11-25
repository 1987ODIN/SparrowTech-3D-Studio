/*
 * Testes do motor vetorial: estanquidade, orientação, triângulos degenerados,
 * desvio em relação às curvas Bézier reais e tempos de geração.
 * Executar: node tests/geometry.test.cjs
 */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'src/geometry.js'));
const M = require(path.join(ROOT, 'src/model.js'));
const opentype = require(path.join(ROOT, 'vendor/opentype.min.js'));

const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'fonts/catalog.json'), 'utf8'));
const fonts = {};
for (const c of CATALOG) { const buf = fs.readFileSync(path.join(ROOT, 'fonts', c.file)); fonts[c.name] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); }
const COMBO_FONTS = ['Pacifico', 'Lobster', 'Lobster Two', 'Courgette', 'Kaushan Script', 'Great Vibes'];

const BASE_STATE = { name: 'Filipa', font: 'Lobster', shape: 'contour', front: 'raised', back: 'smooth', backText: '', outline: true, outlineWidth: 0.8, border: 3.5, letterHeight: 0.6, bodyThickness: 2.4, nameSize: 100, baseColor: '#348cf0', letterColor: '#ffffff', outlineColor: '#090c13', hasRing: true, ringOuter: 7.2, ringInner: 3.0, ringManual: false, ringX: 0, ringY: 0, fillHoles: true, holeArea: 1.5 };

let failures = 0, checks = 0;
function check(cond, msg) { checks++; if (!cond) { failures++; console.log('  ✗ ' + msg); } }

function checkMesh(mesh, label) {
  const st = G.meshStats(mesh);
  check(st.watertight, `${label}: malha não estanque ${JSON.stringify({ b: st.boundary, nm: st.nonManifold, o: st.badOrientation })}`);
  check(st.degenerate === 0, `${label}: ${st.degenerate} triângulos degenerados`);
  check(st.volume > 0, `${label}: volume não positivo (${st.volume})`);
  return st;
}

// 1) Desvio geométrico: distância máxima de pontos da curva Bézier real ao contorno poligonal.
function bezierDeviation(font, text, tol, angle) {
  const p = font.getPath(text, 0, 0, 27);
  const contours = G.flattenCommands(p.commands, tol, (x, y) => [x, y], angle);
  const segs = []; for (const c of contours) for (let i = 0; i < c.length; i++) segs.push([c[i], c[(i + 1) % c.length]]);
  const dist = (pt) => { let best = Infinity; for (const [a, b] of segs) { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(a[0] + t * dx - pt[0], a[1] + t * dy - pt[1])); } return best; };
  let x = 0, y = 0, max = 0;
  for (const c of p.commands) {
    if (c.type === 'M' || c.type === 'L') { x = c.x; y = c.y; continue; }
    for (let i = 1; i < 40; i++) {
      const t = i / 40, u = 1 - t; let pt;
      if (c.type === 'Q') pt = [u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y];
      else if (c.type === 'C') pt = [u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y];
      else break;
      max = Math.max(max, dist(pt));
    }
    if (c.x !== undefined) { x = c.x; y = c.y; }
  }
  return max;
}

console.log('1) Desvio máximo entre a curva da fonte e o contorno exportado');
for (const fname of ['Pacifico', 'Lobster', 'Great Vibes']) {
  for (const qk of ['normal', 'fine', 'ultra']) {
    const q = G.QUALITY[qk], dev = bezierDeviation(fonts[fname], 'Filipa', q.tol, q.angle);
    console.log(`   ${fname.padEnd(14)} ${qk.padEnd(7)} desvio ${dev.toFixed(4)} mm (limite ${q.tol})`);
    check(dev <= q.tol * 1.05 + 1e-4, `${fname}/${qk}: desvio ${dev} > ${q.tol}`);
  }
}

// A pausa para trocar de filamento deve cair entre duas partes, sem altura partilhada.
{
  const regions = M.regionsFor(BASE_STATE, { front: fonts.Lobster }, G.QUALITY.fine);
  const { base, outline, letters } = M.solidsFor(BASE_STATE, regions);
  check(base[0].z1 === outline[0].z0, 'contorno começa depois da base');
  check(outline[0].z1 === letters[0].z0, 'letras começam depois do contorno');
  check(!G.difference(letters[0].paths, outline[0].paths).length, 'contorno preenche a área sob as letras');
}

console.log('2) Todas as combinações de acabamento × fontes × formas (qualidade fina)');
const FRONT = ['raised', 'flush', 'engraved', 'cutout'], BACK = ['smooth', 'inlay', 'raised', 'engraved', 'through'], SHAPES = ['contour', 'cloud', 'rounded', 'square', 'oval', 'none'];
let worst = 0, totalBuilds = 0;
const t0 = Date.now();
for (const fname of COMBO_FONTS) {
  for (const front of FRONT) for (const back of BACK) {
    const shape = SHAPES[(FRONT.indexOf(front) * 5 + BACK.indexOf(back)) % SHAPES.length];
    const S = { ...BASE_STATE, font: fname, front, back, shape, backText: back === 'smooth' ? '' : '912 345 678', outline: (FRONT.indexOf(front) + BACK.indexOf(back)) % 3 !== 2 };
    const s0 = Date.now();
    const model = M.build(S, { front: fonts[fname] }, 'fine');
    const ms = Date.now() - s0; worst = Math.max(worst, ms); totalBuilds++;
    for (const p of model.parts) checkMesh(p.mesh, `${fname}/${front}/${back}/${shape}/${p.id}`);
    checkMesh(model.unionMesh(), `${fname}/${front}/${back}/${shape}/união`);
    check(model.parts.some(p => p.id === 'base'), `${fname}/${front}/${back}: sem base`);
    if (front === 'raised' || front === 'flush' || back === 'through') check(model.parts.some(p => p.id === 'letters'), `${fname}/${front}/${back}: sem letras`);
    if (back === 'inlay' || back === 'raised') check(model.parts.some(p => p.id === 'back'), `${fname}/${front}/${back}: sem verso`);
    let minZ = Infinity; for (const p of model.parts) for (let i = 2; i < p.mesh.positions.length; i += 3) minZ = Math.min(minZ, p.mesh.positions[i]);
    check(Math.abs(minZ) < 1e-6, `${fname}/${front}/${back}: z mínimo ${minZ} ≠ 0`);
  }
}
console.log(`   ${totalBuilds} modelos, pior tempo ${worst} ms, total ${Date.now() - t0} ms`);

console.log(`2b) Todas as ${CATALOG.length} fontes do catálogo (relevo + contorno, espessura e espaçamento)`);
{
  const t1 = Date.now(); let worstF = 0;
  for (const c of CATALOG) {
    for (const extra of [{}, { textWeight: 0.3, letterSpacing: -5 }, { textWeight: -0.1, letterSpacing: 12, back: 'inlay', backText: 'Ana' }]) {
      const s0 = Date.now(); const model = M.build({ ...BASE_STATE, name: 'Constança', ...extra }, { front: fonts[c.name] }, 'fine'); worstF = Math.max(worstF, Date.now() - s0);
      for (const p of model.parts) checkMesh(p.mesh, `${c.name}/${JSON.stringify(extra)}/${p.id}`);
    }
  }
  console.log(`   ${CATALOG.length * 3} modelos, pior ${worstF} ms, total ${Date.now() - t1} ms`);
  // espaçamento muda mesmo a largura; espessura muda a área
  const w = sp => M.build({ ...BASE_STATE, letterSpacing: sp }, { front: fonts.Pacifico }, 'draft').regions.textBounds.width;
  check(w(15) > w(0) + 5 && w(-8) < w(0) - 3, 'espaçamento entre letras não altera a largura');
  const a = wt => Math.abs(G.regionArea(M.build({ ...BASE_STATE, textWeight: wt }, { front: fonts.Pacifico }, 'draft').regions.text));
  check(a(0.4) > a(0) * 1.1, 'espessura das letras não engrossa o traço');
  // imprimibilidade: fonte fina com bico 0,8 deve avisar; Pacifico com 0,4 não
  check(M.scanFont({ ...BASE_STATE, nozzle: 0.8 }, fonts['Great Vibes']).status !== 'ok', 'Great Vibes com bico 0,8 devia ter aviso');
  check(M.scanFont({ ...BASE_STATE, nozzle: 0.4 }, fonts.Pacifico).status === 'ok', 'Pacifico com bico 0,4 devia estar OK');
  check(M.scanFont({ ...BASE_STATE, nozzle: 0.6, letterSpacing: -10, textWeight: 0.6 }, fonts.Pacifico).gap > M.scanFont({ ...BASE_STATE, nozzle: 0.6 }, fonts.Pacifico).gap, 'letras apertadas deviam aumentar os espaços estreitos');
}

console.log('2c) Letras redondas: topo arredondado (3D) e pontas arredondadas');
for (const fname of COMBO_FONTS) for (const extra of [{ roundTop: true }, { roundTop: true, letterRound: 0.4, letterHeight: 1.0, back: 'raised', backText: 'Ana' }, { letterRound: 0.6, front: 'flush' }]) {
  const model = M.build({ ...BASE_STATE, ...extra }, { front: fonts[fname] }, 'fine');
  for (const p of model.parts) checkMesh(p.mesh, `${fname}/${JSON.stringify(extra)}/${p.id}`);
  checkMesh(model.unionMesh(), `${fname}/${JSON.stringify(extra)}/união`);
}
{ // o topo arredondado tem de ficar mais estreito em cima do que em baixo
  const m = M.build({ ...BASE_STATE, roundTop: true, letterHeight: 1.0 }, { front: fonts.Pacifico }, 'fine'), L = m.parts.find(p => p.id === 'letters').mesh, P = L.positions;
  let top = 0; for (let i = 2; i < P.length; i += 3) top = Math.max(top, P[i]);
  const at = z => { let n = 0; for (let i = 2; i < P.length; i += 3) if (Math.abs(P[i] - z) < 1e-4) n++; return n };
  check(at(top) > 0 && G.meshStats(L).volume < G.meshStats(M.build({ ...BASE_STATE, letterHeight: 1.0 }, { front: fonts.Pacifico }, 'fine').parts.find(p => p.id === 'letters').mesh).volume * 0.97, 'topo arredondado não reduz o volume das letras');
}

console.log('2c2) Letras «almofada» (altas e abauladas)');
for (const fname of COMBO_FONTS) for (const extra of [{ letterStyle: 'puffy', letterHeight: 1.6, letterRound: 0.3 }, { letterStyle: 'puffy', letterHeight: 2.4, roundBase: true, back: 'raised', backText: 'Ana' }]) {
  const model = M.build({ ...BASE_STATE, ...extra }, { front: fonts[fname], back: fonts[fname] }, 'normal');
  for (const p of model.parts) checkMesh(p.mesh, `${fname}/${JSON.stringify(extra)}/${p.id}`);
  checkMesh(model.unionMesh(), `${fname}/${JSON.stringify(extra)}/união`);
}
{ // a almofada tira bem mais material do que a aresta suave, e a letra continua a chegar à altura pedida
  const v = st => { const L = M.build({ ...BASE_STATE, letterHeight: 1.6, ...st }, { front: fonts.Pacifico }, 'normal').parts.find(p => p.id === 'letters').mesh; let top = 0; for (let i = 2; i < L.positions.length; i += 3) top = Math.max(top, L.positions[i]); return [G.meshStats(L).volume, top] };
  const [vf, tf] = v({}), [vs] = v({ letterStyle: 'soft' }), [vp, tp] = v({ letterStyle: 'puffy' });
  check(vp < vs * 0.9 && vs < vf && vp > vf * 0.45, `volumes direitas/suaves/almofada: ${vf.toFixed(0)} / ${vs.toFixed(0)} / ${vp.toFixed(0)} mm³`);
  check(Math.abs(tp - tf) < 0.15, `a almofada chega ao topo (${tp.toFixed(2)} vs ${tf.toFixed(2)} mm)`);
}

console.log('2d) Tudo redondo (peluche): base e argola com borda redonda, chanfro leve no verso');
{
  const FR = ['raised', 'flush', 'engraved', 'cutout'], BK = ['smooth', 'inlay', 'raised', 'engraved', 'through'], SH = [...new Set(['contour', BASE_STATE.shape])];
  let n = 0;
  for (const fname of COMBO_FONTS) for (const front of FR) for (const back of BK) for (const extra of [{ roundBase: true }, { roundBase: true, roundBack: true, roundTop: true, roundAmount: 1 }, { roundBack: true, roundAmount: 0.3, roundBase: true, hasRing: false }]) {
    if ((n++ % 6) && fname !== COMBO_FONTS[0]) continue;                       // amostra nas outras fontes
    const st = { ...BASE_STATE, front, back, backText: back === 'smooth' ? '' : 'Ana', ...extra }, label = `${fname}/${front}/${back}/${JSON.stringify(extra)}`;
    const model = M.build(st, { front: fonts[fname], back: fonts[fname] }, 'normal');
    for (const p of model.parts) checkMesh(p.mesh, `${label}/${p.id}`);
    checkMesh(model.unionMesh(), `${label}/união`);
  }
  const plain = M.build({ ...BASE_STATE }, { front: fonts.Pacifico }, 'fine'), round = M.build({ ...BASE_STATE, roundBase: true, roundAmount: 0.6 }, { front: fonts.Pacifico }, 'fine');
  const vb = m => G.meshStats(m.parts.find(p => p.id === 'base').mesh).volume, zmax = m => { const P = m.parts.find(p => p.id === 'base').mesh.positions; let t = 0; for (let i = 2; i < P.length; i += 3) t = Math.max(t, P[i]); return t };
  check(round.round.rb > 0.3 && round.round.rb <= 0.66, `raio da base limitado pela parede da argola (rb = ${round.round.rb})`);
  check(Math.abs(zmax(round) - (BASE_STATE.bodyThickness + round.round.extra)) < 1e-6 && round.round.extra >= 0.15, 'a base engrossa para compensar');
  check(vb(round) > vb(plain) * 0.98, `a base redonda não perde material (${vb(round).toFixed(0)} vs ${vb(plain).toFixed(0)} mm³)`);
  const ch = M.build({ ...BASE_STATE, roundBack: true }, { front: fonts.Pacifico }, 'fine');
  check(ch.round.cb > 0.2 && ch.round.cb <= 0.3 && ch.round.rb === 0, 'chanfro do verso limitado a 0,3 mm');
  check(M.build({ ...BASE_STATE, roundBack: true, back: 'raised', backText: 'Ana' }, { front: fonts.Pacifico, back: fonts.Pacifico }, 'draft').round.cb === 0, 'sem chanfro quando o verso tem letras em relevo (a base não assenta no tabuleiro)');
}

{
  const state = { ...BASE_STATE, name: 'André', border: 1.5, fillHoles: false };
  const fontsForName = { front: fonts.Pacifico };
  const before = M.build(state, fontsForName, 'fine');
  const after = M.build({ ...state, fillLetterHoles: true }, fontsForName, 'fine');
  const countHoles = paths => G.toPolygons(paths).reduce((sum, poly) => sum + poly.holes.length, 0);
  check(countHoles(before.regions.shape) > 0, 'André precisa de ter aberturas na base no teste');
  check(countHoles(after.regions.shape) === 0, 'fechar aberturas por dentro das letras');
  check(countHoles(after.regions.base) === 1, 'preservar o furo da argola');
  check(countHoles(after.regions.letters) === countHoles(before.regions.letters), 'preservar o desenho das letras');
  for (const part of after.parts) checkMesh(part.mesh, 'André/base sem aberturas/' + part.id);
  checkMesh(after.unionMesh(), 'André/base sem aberturas/STL');
}

console.log('3) Partes sem sobreposição (volume da união = soma das partes)');
for (const front of FRONT) for (const back of ['smooth', 'inlay', 'raised', 'through']) {
  const S = { ...BASE_STATE, front, back, backText: 'Teste' };
  const model = M.build(S, { front: fonts.Lobster }, 'fine');
  const sum = model.parts.reduce((s, p) => s + G.meshStats(p.mesh).volume, 0), uni = G.meshStats(model.unionMesh()).volume;
  check(Math.abs(sum - uni) < 1e-3 * uni, `${front}/${back}: soma ${sum.toFixed(3)} ≠ união ${uni.toFixed(3)} mm³`);
}

console.log('4) Nomes longos, acentos e qualidade máxima (desempenho)');
for (const [name, qk] of [['Maria João', 'ultra'], ['Constança Margarida', 'fine'], ['Ana', 'draft'], ['Sebastião', 'ultra']]) {
  const s0 = Date.now(); const model = M.build({ ...BASE_STATE, name, font: 'Great Vibes', back: 'inlay', backText: name }, { front: fonts['Great Vibes'] }, qk);
  const ms = Date.now() - s0, tris = model.parts.reduce((s, p) => s + p.mesh.triangleCount, 0);
  console.log(`   ${name.padEnd(20)} ${qk.padEnd(6)} ${String(tris).padStart(7)} triângulos  ${ms} ms`);
  for (const p of model.parts) checkMesh(p.mesh, `${name}/${qk}/${p.id}`);
  check(ms < 6000, `${name}/${qk}: demasiado lento (${ms} ms)`);
}

console.log(`\n${checks - failures}/${checks} verificações OK${failures ? ` — ${failures} FALHAS` : ''}`);
process.exit(failures ? 1 : 0);
