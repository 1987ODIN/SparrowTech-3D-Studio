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

const FONT_FILES = { Pacifico: 'Pacifico-Regular.ttf', Lobster: 'Lobster.otf', 'Lobster Two': 'LobsterTwo.otf', Courgette: 'Courgette-Regular.ttf', 'Kaushan Script': 'KaushanScript-Regular.ttf', 'Great Vibes': 'GreatVibes-Regular.ttf' };
const fonts = {};
for (const [k, f] of Object.entries(FONT_FILES)) { const buf = fs.readFileSync(path.join(ROOT, 'fonts', f)); fonts[k] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); }

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

console.log('2) Todas as combinações de acabamento × fontes × formas (qualidade fina)');
const FRONT = ['raised', 'flush', 'engraved', 'cutout'], BACK = ['smooth', 'inlay', 'raised', 'engraved', 'through'], SHAPES = ['contour', 'cloud', 'rounded', 'square', 'oval', 'none'];
let worst = 0, totalBuilds = 0;
const t0 = Date.now();
for (const fname of Object.keys(fonts)) {
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
