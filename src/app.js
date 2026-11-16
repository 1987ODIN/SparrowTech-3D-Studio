'use strict';
/* SparrowTech 3D Studio v5 — interface, visualização WebGL, navegação e exportação.
 * A geometria é calculada por SparrowModel/SparrowGeo (vetorial) num Web Worker, para
 * não bloquear a interface. Ver docs/ARQUITETURA-V5.md. */
const $ = id => document.getElementById(id);
const S = { name: 'Filipa', font: 'Pacifico', textWeight: 0, letterSpacing: 0, nozzle: .4, layer: .2, favorites: [], shape: 'contour', front: 'raised', back: 'smooth', backText: '', outline: true, outlineWidth: .8, border: 3.5, letterHeight: .6, bodyThickness: 2.4, nameSize: 100, baseColor: '#348cf0', letterColor: '#ffffff', outlineColor: '#090c13', hasRing: true, ringOuter: 7.2, ringInner: 3.0, ringManual: false, ringX: 0, ringY: 0, fillHoles: true, holeArea: 1.5, selected: 'letters', pro: true, ringReinforce: true, printer: 'A1', plateSize: 256, positionX: 0, positionY: 0, printMode: 'layers', plateView: false, quality: 'fine', copies: 1 };
const FONTS = [];            // nomes, pela ordem da galeria (a roda do rato percorre esta lista)
const FONT_GROUP = {};       // nome → 'nomes' | 'imprensa' | 'fina' | 'importadas'
const GROUPS = [['nomes', 'Recomendadas para nomes', 'manuscritas, ligadas'], ['imprensa', 'Letra de imprensa (grossas)', 'à máquina, muito legíveis'], ['fina', 'Finas e elegantes', 'pedem letra grande ou bico fino'], ['importadas', 'Importadas', '']];
let fontScan = {};           // nome → resultado de imprimibilidade para o nome atual
const SHAPES = [['contour', '✦ Segue letras'], ['cloud', '☁ Nuvem'], ['rounded', '▣ Tablet arredondado'], ['square', '▭ Tablet quadrado'], ['oval', '⬭ Oval'], ['none', '✎ Só letras']];
const FRONT = [['raised', '↑ Relevo'], ['flush', '▰ À face'], ['engraved', '↓ Gravado'], ['cutout', '◯ Vazado']];
const BACK = [['smooth', '▱ Liso'], ['inlay', '▰ À face'], ['raised', '↑ Relevo'], ['engraved', '↓ Gravado'], ['through', '↕ Passante']];
const PRINTERS = { A1: ['Bambu Lab A1', 256], A1Mini: ['Bambu Lab A1 Mini', 180], K1C: ['Creality K1C', 220] };
const QUALITY_LABEL = { draft: 'Rascunho', normal: 'Normal', fine: 'Fina', ultra: 'Muito fina' };
const QUALITY_TOL = { draft: .05, normal: .02, fine: .01, ultra: .004 };
const PERSPECTIVE = 320;
let model = null, components = [], gl = null, fallbackCtx = null, shader = null, attrib = {}, uniform = {}, plateBuffer = null, gridBuffer = null, renderQueued = false, rebuildTimeout = null, dragAction = null;
let camera = { yaw: .12, pitch: -.20, scale: 6.8, panX: 0, panY: 0, cx: 0, cy: 0, cz: 0 };
let autoFitAfterRebuild = true;
const FONT_BYTES = {};

function fmt(n) { return (+n).toFixed(1).replace('.', ',') }
function fmtTol(n) { return String(n).replace('.', ',') }
function rgb(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) }

// ---------------------------------------------------------------- painéis
function selectTab(tab) {
  if (tab === 'print') { S.plateView = true; setView('front'); requestAnimationFrame(() => { fitCamera(); requestRender() }) }
  else if (S.plateView) { S.plateView = false; requestAnimationFrame(() => { fitCamera(); requestRender() }) }
  S.selected = tab;
  ['letters', 'base', 'ring', 'print'].forEach(t => { $(t + 'Panel').classList.toggle('hidden', t !== tab); $('tab' + t[0].toUpperCase() + t.slice(1)).classList.toggle('on', t === tab) });
  $('selectionLabel').textContent = selectionText(tab);
}
function selectionText(tab) { return { letters: '✎ Selecionado: letras · roda o rato para trocar de fonte', base: '▱ Selecionado: base · formato e rebordo', ring: '◉ Selecionado: argola · agarra e arrasta', print: '⚙ Pro (beta): impressora, cópias, bico e formatos' }[tab] }
function optionButtons(id, items, current, callback) { const node = $(id); node.textContent = ''; for (const [value, label] of items) { const b = document.createElement('button'); b.textContent = label; b.classList.toggle('on', value === current); b.addEventListener('click', () => { callback(value); updateControls(); scheduleRebuild() }); node.appendChild(b) } }
function explanation(kind) { let title = '', msg = ''; if (kind === 'raised') { title = 'Relevo'; msg = 'As letras ficam salientes sobre a base. A face com relevo deve ficar virada para cima na impressão.' } if (kind === 'flush') { title = 'Ao nível'; msg = 'As letras ficam encaixadas na superfície da base, sem degrau. Ideal para impressões multicolor.' } if (kind === 'engraved') { title = 'Gravado'; msg = 'As letras são cavadas na base e mostram profundidade real.' } if (kind === 'cutout') { title = 'Vazado'; msg = 'As letras atravessam a base como recortes vazios.' } if (kind === 'smooth') { title = 'Liso'; msg = 'O verso fica totalmente liso, sem letras.' } if (kind === 'inlay') { title = 'Ao nível'; msg = 'O texto do verso é embutido na base.' } if (kind === 'through') { title = 'Passante'; msg = 'As letras atravessam toda a base. Visto por trás, o nome original aparece espelhado, como acontece numa peça real.' } return `<svg viewBox="0 0 96 56" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="24" width="84" height="26" rx="5" fill="#378ff3"/><rect x="28" y="${kind === 'raised' ? 13 : kind === 'cutout' ? 24 : kind === 'engraved' ? 30 : 23}" width="41" height="${kind === 'raised' ? 17 : kind === 'cutout' ? 26 : kind === 'engraved' ? 12 : 20}" rx="4" fill="${kind === 'cutout' ? '#121a28' : '#fff'}" stroke="${kind === 'engraved' ? '#1e507b' : '#e9eef8'}" stroke-width="1"/><text x="48" y="${kind === 'raised' ? 26 : 38}" text-anchor="middle" font-size="12" fill="${kind === 'cutout' ? '#89beff' : '#122438'}">Aa</text></svg><span><b>${title}</b><br>${msg}</span>` }
function updateControls() {
  document.body.classList.add('pro');
  $('inputName').value = S.name; $('backText').value = S.backText;
  renderGallery();
  optionButtons('shapeButtons', SHAPES, S.shape, v => { S.shape = v; S.ringManual = false }); optionButtons('finishFront', FRONT, S.front, v => S.front = v); optionButtons('finishBack', BACK, S.back, v => { S.back = v; if (v !== 'smooth') setTimeout(() => setView('back'), 20) }); optionButtons('printModeButtons', [['layers', 'Por camadas'], ['sequential', 'Um objeto de cada vez']], S.printMode, v => { S.printMode = v; updateModeNotice() });
  $('frontExplain').innerHTML = explanation(S.front); $('backExplain').innerHTML = explanation(S.back);
  $('hasOutline').checked = S.outline; $('outlineControls').classList.toggle('hidden', !S.outline);
  updateRangeLabels();
  $('baseColor').value = S.baseColor; $('letterColor').value = S.letterColor; $('outlineColor').value = S.outlineColor; $('borderWidth').value = S.border; $('bodyThickness').value = S.bodyThickness; $('letterHeight').value = S.letterHeight; $('outlineWidth').value = S.outlineWidth; $('nameSize').value = S.nameSize; $('ringOuter').value = S.ringOuter; $('ringInner').value = S.ringInner; $('fillHoles').checked = S.fillHoles; $('smallHole').value = S.holeArea; $('hasRing').checked = S.hasRing; $('ringReinforce').checked = S.ringReinforce; $('printer').value = S.printer; $('textWeight').value = S.textWeight; $('letterSpacing').value = S.letterSpacing; $('nozzle').value = String(S.nozzle); $('layer').value = String(S.layer); $('quality').value = S.quality; $('copyCount').value = S.copies; $('qualityVal').textContent = QUALITY_LABEL[S.quality]; updateQualityBadge();
  $('machineBadge').textContent = PRINTERS[S.printer][0] + ' · ' + S.plateSize + ' × ' + S.plateSize + ' mm'; updateModeNotice(); drawMiniPlate();
}
function renderGallery() {
  const box = $('fontCards'), keep = box.scrollTop; box.textContent = '';
  for (const [g, title, sub] of GROUPS) {
    const names = FONTS.filter(f => FONT_GROUP[f] === g); if (!names.length) continue;
    const h = document.createElement('div'); h.className = 'fontgroup'; h.innerHTML = `${title} <small>${sub}</small>`; box.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'fontcards'; box.appendChild(grid);
    for (const font of names) {
      const b = document.createElement('button'); b.className = 'fontcard' + (font === S.font ? ' on' : ''); b.dataset.font = font;
      const preview = document.createElement('span'); preview.style.fontFamily = `'${font}'`; preview.textContent = S.name || 'Nome';
      const small = document.createElement('small'); small.textContent = font;
      const star = document.createElement('i'); star.className = 'star' + (S.favorites.includes(font) ? ' on' : ''); star.textContent = S.favorites.includes(font) ? '★' : '☆'; star.title = 'Marcar para a placa de teste';
      star.onclick = e => { e.stopPropagation(); toggleFavorite(font) };
      const badge = document.createElement('i'); badge.className = 'badge';
      b.append(badge, star, preview, small); b.onclick = () => chooseFont(font); grid.appendChild(b);
    }
  }
  box.scrollTop = keep; updateBadges(); updateFontSwitch();
  $('testPlate').textContent = `⬇ Placa de teste (★ ${S.favorites.length})`;
}
function updateBadges() {
  for (const b of document.querySelectorAll('.fontcard')) {
    const r = fontScan[b.dataset.font], el = b.querySelector('.badge'); if (!el) continue;
    el.className = 'badge' + (r ? ' ' + r.status : ''); el.textContent = r ? (r.status === 'ok' ? '✓' : '⚠') : '';
    el.title = r ? `Bico ${fmt2(S.nozzle)} mm: ${Math.round(r.stroke * 100)}% do traço mais fino que o bico, ${Math.round(r.gap * 100)}% de espaços apertados` : '';
  }
}
function fmt2(n) { return (+n).toFixed(1).replace('.', ',') }
function toggleFavorite(font) { const i = S.favorites.indexOf(font); if (i >= 0) S.favorites.splice(i, 1); else if (S.favorites.length < 12) S.favorites.push(font); else alert('Máximo de 12 fontes na placa de teste.'); renderGallery(); $('testPlate').textContent = `⬇ Placa de teste (★ ${S.favorites.length})` }
// Troca de fonte: atualiza só o necessário e calcula primeiro uma pré-visualização rápida.
let fontSettle = null;
function chooseFont(font, quick) {
  S.font = font;
  for (const b of document.querySelectorAll('.fontcard')) b.classList.toggle('on', b.dataset.font === font);
  const on = document.querySelector('.fontcard.on'); if (on && quick) on.scrollIntoView({ block: 'nearest' });
  updateFontSwitch();
  if (quick) { interactiveBuild = true; scheduleRebuild(false, 40); clearTimeout(fontSettle); fontSettle = setTimeout(() => { interactiveBuild = false; scheduleRebuild(true) }, 650) }
  else { interactiveBuild = false; scheduleRebuild(true) }
}
function stepFont(dir) { const i = FONTS.indexOf(S.font); chooseFont(FONTS[(i + dir + FONTS.length) % FONTS.length], true) }
function updateFontSwitch() { const n = $('fontName'); if (!n) return; n.textContent = S.font; n.style.fontFamily = `'${S.font}'`; $('fontCount').textContent = `${FONTS.indexOf(S.font) + 1}/${FONTS.length}`; $('fontSwitch').classList.toggle('active', fontMode) }
let fontMode = false;
function setFontMode(on) { fontMode = on; updateFontSwitch(); $('selectionLabel').textContent = on ? '✎ Modo fonte: roda o rato para trocar · Esc ou clique fora para sair' : selectionText(S.selected) }
function updateQualityBadge() { $('qualityBadge').textContent = 'Vetorial · ±' + fmtTol(QUALITY_TOL[S.quality]) + ' mm' }
function bindControls() {
  [['inputName', 'name'], ['backText', 'backText']].forEach(([id, key]) => $(id).addEventListener('input', () => { S[key] = $(id).value; if (key === 'name') { S.ringManual = false; document.querySelectorAll('.fontcard span').forEach(el => el.textContent = S.name || 'Nome'); scheduleScan() } scheduleRebuild() }));
  [['textWeight', 'textWeight'], ['letterSpacing', 'letterSpacing'], ['borderWidth', 'border'], ['bodyThickness', 'bodyThickness'], ['letterHeight', 'letterHeight'], ['outlineWidth', 'outlineWidth'], ['nameSize', 'nameSize'], ['ringOuter', 'ringOuter'], ['ringInner', 'ringInner'], ['smallHole', 'holeArea']].forEach(([id, key]) => $(id).addEventListener('input', () => { S[key] = +$(id).value; if (key === 'ringInner' && S.ringInner > S.ringOuter - 2) { S.ringInner = S.ringOuter - 2; $('ringInner').value = S.ringInner } if (key === 'ringOuter' && S.ringOuter < S.ringInner + 2) { S.ringInner = S.ringOuter - 2; $('ringInner').value = S.ringInner } updateRangeLabels(); scheduleRebuild(); if (key === 'textWeight' || key === 'letterSpacing' || key === 'nameSize') scheduleScan() }));
  [['hasOutline', 'outline'], ['fillHoles', 'fillHoles'], ['hasRing', 'hasRing'], ['ringReinforce', 'ringReinforce']].forEach(([id, key]) => $(id).addEventListener('change', () => { S[key] = $(id).checked; updateRangeLabels(); scheduleRebuild() }));
  [['baseColor', 'baseColor'], ['letterColor', 'letterColor'], ['outlineColor', 'outlineColor']].forEach(([id, key]) => $(id).addEventListener('input', () => { S[key] = $(id).value; refreshMeshColors(); requestRender() }));
  for (const key of ['letters', 'base', 'ring', 'print']) $('tab' + key[0].toUpperCase() + key.slice(1)).onclick = () => selectTab(key);
  $('quickPrint').onclick = () => export3MF();
  $('editBack').onclick = () => setView('back'); $('btnFlip').onclick = () => setView(Math.cos(camera.yaw) < 0 ? 'front' : 'back');
  $('frontView').onclick = () => setView('front'); $('backView').onclick = () => setView('back'); $('resetCam').onclick = () => { camera.yaw = .23; camera.pitch = -.32; requestRender() };
  $('btnFit').onclick = () => { S.plateView = false; fitCamera(); requestRender() }; $('btnPlate').onclick = () => { S.plateView = true; fitCamera(); requestRender() };
  $('autoRing').onclick = () => { S.ringManual = false; scheduleRebuild(true) };
  $('printer').onchange = () => { S.printer = $('printer').value; S.plateSize = PRINTERS[S.printer][1]; clampToPlate(); updateControls(); rebuildBed(); if (S.plateView) fitCamera(); requestRender() };
  $('quality').onchange = () => { S.quality = $('quality').value; $('qualityVal').textContent = QUALITY_LABEL[S.quality]; updateQualityBadge(); scheduleRebuild(true) };
  $('copyCount').oninput = () => { S.copies = +$('copyCount').value; drawMiniPlate(); if (S.plateView) fitCamera(); requestRender() };
  $('autoArrange').onclick = () => { S.positionX = 0; S.positionY = 0; drawMiniPlate(); requestRender(); selectTab('print') };
  $('export3MF').onclick = () => export3MF(); $('exportSTL').onclick = () => exportMeshes('combined'); $('exportParts').onclick = () => exportMeshes('separate');
  $('importFont').onclick = () => $('fontFile').click();
  $('nozzle').onchange = () => { S.nozzle = +$('nozzle').value; scheduleRebuild(true); scheduleScan() };
  $('layer').onchange = () => { S.layer = +$('layer').value; if (model) updatePrintCheck() };
  $('testPlate').onclick = () => exportTestPlate();
  $('fontPrev').onclick = () => stepFont(-1); $('fontNext').onclick = () => stepFont(1);
  $('fontName').onclick = () => setFontMode(!fontMode);
  let acc = 0;
  $('fontSwitch').addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); acc += e.deltaY; if (Math.abs(acc) >= 40) { stepFont(acc > 0 ? 1 : -1); acc = 0 } }, { passive: false });
  document.addEventListener('keydown', e => { if (!fontMode || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; if (e.key === 'Escape') setFontMode(false); if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { stepFont(1); e.preventDefault() } if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { stepFont(-1); e.preventDefault() } });
  $('fontFile').onchange = async () => { const f = $('fontFile').files[0]; $('fontFile').value = ''; if (f) await importFont(f) };
  initPlateDrag(); bindViewCube();
}
function updateRangeLabels() { $('borderVal').textContent = fmt(S.border) + ' mm'; $('bodyVal').textContent = fmt(S.bodyThickness) + ' mm'; $('heightVal').textContent = fmt(S.letterHeight) + ' mm'; $('outlineVal').textContent = fmt(S.outlineWidth) + ' mm'; $('nameSizeVal').textContent = S.nameSize + '%'; $('outerVal').textContent = fmt(S.ringOuter) + ' mm'; $('innerVal').textContent = fmt(S.ringInner) + ' mm'; $('holeVal').textContent = fmt(S.holeArea) + ' mm²'; $('weightVal').textContent = (S.textWeight >= 0 ? '+' : '') + S.textWeight.toFixed(2).replace('.', ',') + ' mm'; $('spacingVal').textContent = (S.letterSpacing > 0 ? '+' : '') + S.letterSpacing + '%'; $('outlineControls').classList.toggle('hidden', !S.outline) }
function updateModeNotice() { $('printModeNotice').textContent = S.printMode === 'layers' ? 'O slicer imprime cada camada de todos os objetos. Recomendado para letras salientes, multicolor e peças próximas.' : 'Modo sequencial: o slicer imprime um objeto completo antes do próximo. A distância segura depende do volume da cabeça e do pórtico da impressora. O editor NÃO valida colisões com a cabeça nem o pórtico: confirma no slicer e ativa lá a impressão por objeto.' }

// ---------------------------------------------------------------- fontes
function b64ToBuffer(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer }
async function registerFont(name, buffer, group) {
  FONT_BYTES[name] = buffer;
  if (!FONTS.includes(name)) FONTS.push(name); FONT_GROUP[name] = group || 'importadas';
  try { const face = new FontFace(name, buffer.slice(0)); await face.load(); document.fonts.add(face) } catch (e) { console.warn('Pré-visualização da fonte', name, e) }
  await geometryCall({ type: 'font', name, buffer: buffer.slice(0) });
}
async function importFont(file) {
  const buffer = await file.arrayBuffer();
  let name = file.name.replace(/\.(ttf|otf|woff)$/i, '').replace(/[^\p{L}\p{N} _-]/gu, ' ').trim() || 'Fonte importada';
  while (FONTS.includes(name)) name += ' ·';
  try { await geometryCall({ type: 'check', buffer: buffer.slice(0) }); await registerFont(name, buffer, 'importadas') } catch (e) { const i = FONTS.indexOf(name); if (i >= 0) FONTS.splice(i, 1); alert('Não foi possível ler esta fonte (' + e.message.split('\n')[0] + '). Usa TTF, OTF ou WOFF — WOFF2 não é suportado.'); return }
  S.font = name; updateControls(); scheduleRebuild(true); scheduleScan();
  $('qualityNotice').textContent = `Fonte «${name}» importada. Confirma a licença da fonte antes de vender peças.`;
}

// ---------------------------------------------------------------- motor de geometria (Worker)
const WORKER_MAIN = `
const raw = {}, fonts = {};
const getFont = n => { if (!fonts[n] && raw[n]) fonts[n] = opentype.parse(raw[n]); return fonts[n] || getFont(Object.keys(raw)[0]); };
self.onmessage = e => {
  const m = e.data;
  if (m.type === 'ping') return;
  try {
    if (m.type === 'font') { raw[m.name] = m.buffer; delete fonts[m.name]; self.postMessage({ id: m.id, ok: true }); return; }
    if (m.type === 'check') { opentype.parse(m.buffer); self.postMessage({ id: m.id, ok: true }); return; }
    if (m.type === 'scan') { const out = {}; for (const n of m.names) { try { out[n] = SparrowModel.scanFont(m.S, getFont(n)); } catch (err) { } } self.postMessage({ id: m.id, ok: true, result: out }); return; }
    if (m.type === 'build') {
      const font = getFont(m.S.font);
      const res = SparrowModel.build(m.S, { front: font }, m.quality);
      const parts = res.parts.map(p => ({ id: p.id, label: p.label, color: p.color, mesh: p.mesh }));
      const transfer = [];
      for (const p of parts) transfer.push(p.mesh.positions.buffer, p.mesh.indices.buffer, p.mesh.cornerNormals.buffer);
      let union = null;
      if (m.union) { union = res.unionMesh(); transfer.push(union.positions.buffer, union.indices.buffer, union.cornerNormals.buffer); }
      const R = res.regions;
      self.postMessage({ id: m.id, ok: true, result: { parts, union, height: res.height, zShift: res.zShift, timing: res.timing,
        regions: { text: R.letters, base: R.base, outline: R.outline, back: R.back, ring: R.ring, ringOverlap: R.ringOverlap, print: R.print, bounds: R.bounds } } }, transfer);
    }
  } catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.stack || err) }); }
};`;
let worker = null, workerSeq = 0;
const pending = new Map(), localFonts = {}, localRaw = {};
// Algumas páginas (ex.: a pré-visualização do Claude, alguns sandboxes) proíbem Workers criados a
// partir de blob:. Tenta blob:, depois data:, e confirma com um «ping»; se nada funcionar, a geometria
// corre na própria página (funciona igual, só que a interface pode engasgar em cálculos grandes).
const WORKER_PING = `self.addEventListener('message', e => { if (e.data && e.data.type === 'ping') self.postMessage({ id: e.data.id, ok: true }); });`;
function tryWorker(url) {
  return new Promise(resolve => {
    let w; try { w = new Worker(url) } catch (e) { resolve(null); return }
    const timer = setTimeout(() => { w.terminate(); resolve(null) }, 4000);
    w.onerror = e => { e.preventDefault && e.preventDefault(); clearTimeout(timer); w.terminate(); resolve(null) };
    w.onmessage = e => { if (e.data && e.data.id === -1) { clearTimeout(timer); resolve(w) } };
    w.postMessage({ type: 'ping', id: -1 });
  });
}
async function startWorker() {
  const src = $('sparrowLibs').textContent + '\n' + WORKER_PING + '\n' + WORKER_MAIN;
  const urls = [];
  try { urls.push(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))) } catch (e) { }
  try { urls.push('data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(src)))) } catch (e) { }
  for (const url of urls) {
    const w = await tryWorker(url);
    if (w) {
      worker = w;
      worker.onmessage = e => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error)) };
      worker.onerror = e => { console.error('Worker', e) };
      return;
    }
  }
  worker = null;
  console.info('SparrowTech: este ambiente não permite Web Workers; a geometria corre na página (modo compatível).');
  $('status').textContent = 'Modo compatível: este ambiente não permite cálculo em segundo plano. Abre o ficheiro HTML diretamente no Chrome/Edge para a interface mais fluida.';
}
function geometryCall(msg) {
  if (worker) return new Promise((resolve, reject) => { const id = ++workerSeq; pending.set(id, { resolve, reject }); worker.postMessage({ ...msg, id }) });
  // Alternativa síncrona (sem Worker)
  return new Promise((resolve, reject) => setTimeout(() => {
    try {
      if (msg.type === 'font') { localRaw[msg.name] = msg.buffer; resolve(); return }
      if (msg.type === 'check') { opentype.parse(msg.buffer); resolve(); return }
      const getF = n => { if (!localFonts[n] && localRaw[n]) localFonts[n] = opentype.parse(localRaw[n]); return localFonts[n] || getF(Object.keys(localRaw)[0]) };
      if (msg.type === 'scan') { const out = {}; for (const n of msg.names) out[n] = SparrowModel.scanFont(msg.S, getF(n)); resolve(out); return }
      const res = SparrowModel.build(msg.S, { front: getF(msg.S.font) }, msg.quality), R = res.regions;
      resolve({ parts: res.parts, union: msg.union ? res.unionMesh() : null, height: res.height, zShift: res.zShift, timing: res.timing, regions: { text: R.letters, base: R.base, outline: R.outline, back: R.back, ring: R.ring, ringOverlap: R.ringOverlap, print: R.print, bounds: R.bounds } });
    } catch (e) { reject(e) }
  }, 0));
}
function geometryState() {
  const k = ['name', 'font', 'textWeight', 'letterSpacing', 'nozzle', 'shape', 'front', 'back', 'backText', 'outline', 'outlineWidth', 'border', 'letterHeight', 'bodyThickness', 'nameSize', 'baseColor', 'letterColor', 'outlineColor', 'hasRing', 'ringOuter', 'ringInner', 'ringManual', 'ringX', 'ringY', 'ringReinforce', 'fillHoles', 'holeArea'];
  const o = {}; for (const key of k) o[key] = S[key]; return o;
}

// ---------------------------------------------------------------- reconstrução
let building = false, buildAgain = false, interactiveBuild = false;
function scheduleRebuild(now = false, delay) { if (rebuildTimeout) clearTimeout(rebuildTimeout); rebuildTimeout = setTimeout(rebuildModel, now ? 0 : delay != null ? delay : worker ? 120 : 350) }
// Análise de imprimibilidade de todas as fontes para o nome atual (marcas ✓/⚠ na galeria).
let scanTimer = null, scanSeq = 0;
function scheduleScan() { clearTimeout(scanTimer); scanTimer = setTimeout(runScan, worker ? 700 : 2500) }
async function runScan() {
  if (building) { scheduleScan(); return }
  const seq = ++scanSeq;
  try { const r = await geometryCall({ type: 'scan', S: geometryState(), names: FONTS.slice() }); if (seq === scanSeq) { fontScan = r; updateBadges() } } catch (e) { console.warn('Análise de fontes', e) }
}
async function rebuildModel() {
  if (building) { buildAgain = true; return }
  building = true; buildAgain = false;
  let quality = interactiveBuild && (S.quality === 'fine' || S.quality === 'ultra') ? 'normal' : S.quality;
  if (!worker && quality === 'ultra') quality = 'fine';   // modo compatível: «Muito fina» só na exportação
  $('overlayStatus').textContent = 'A calcular geometria vetorial…';
  try {
    const r = await geometryCall({ type: 'build', S: geometryState(), quality });
    if (buildAgain) return;
    applyModel(r, quality);
  } catch (err) { console.error(err); $('qualityNotice').textContent = 'Erro na geração: ' + err.message.split('\n')[0]; $('qualityNotice').classList.add('warn') }
  finally { building = false; if (buildAgain) { buildAgain = false; scheduleRebuild(true) } }
}
function applyModel(r, quality) {
  releaseMeshBuffers();
  model = r;
  if (!S.ringManual && r.regions.ring) { S.ringX = r.regions.ring.x; S.ringY = r.regions.ring.y }
  components = r.parts.map(p => ({ ...p, color: partColor(p.id) }));
  uploadMeshBuffers();
  const total = components.reduce((s, c) => s + c.mesh.triangleCount, 0), b = r.regions.bounds || { width: 0, height: 0 };
  $('triangleBadge').textContent = total.toLocaleString('pt-PT') + ' triângulos';
  $('sizeBadge').textContent = `${fmt(b.width)} × ${fmt(b.height)} × ${fmt(r.height)} mm`;
  let msg = `Geometria vetorial · desvio ≤ ${fmtTol(QUALITY_TOL[quality])} mm · ${components.length} partes fechadas · ${r.timing.regions + r.timing.meshes} ms`;
  if (quality !== S.quality) msg = interactiveBuild ? 'Pré-visualização rápida durante o arrasto…' : `Pré-visualização em «Fina»; a exportação usa «${QUALITY_LABEL[S.quality]}».`;
  if (S.front === 'raised' && S.back === 'raised') msg = '⚠ Relevo nas duas faces: a orientação pode exigir suportes ou impressão em partes.';
  if (S.back === 'through') msg = '⚠ Letras passantes: exige troca de filamento em muitas camadas.';
  const ri = S.hasRing && r.regions.ring;
  if (ri && ri.status === 'solta') msg = '⚠ A argola está solta da peça! Arrasta a bola para cima da base ou carrega em «◎ Reposicionar automaticamente».';
  else if (ri && ri.status === 'fraca') msg = `⚠ Argola frágil: só ${Math.round(ri.frac * 100)}% da bola está em cima da peça — vai partir com o peso das chaves. Arrasta-a mais para dentro (≥ 30%) ou usa «◎ Reposicionar».`;
  else if (ri && ri.holeCuts) msg = '⚠ O furo da argola corta letras. Arrasta a argola para outra zona.';
  if (Math.abs(S.positionX) + b.width / 2 > S.plateSize / 2 || Math.abs(S.positionY) + b.height / 2 > S.plateSize / 2) msg = '⚠ A peça está parcialmente fora dos limites do tabuleiro.';
  $('qualityNotice').textContent = msg; $('qualityNotice').classList.toggle('warn', msg.startsWith('⚠'));
  $('overlayStatus').textContent = msg.startsWith('⚠') ? msg : `Modelo 3D · ${fmt(S.bodyThickness)} mm de base`;
  updatePrintCheck(); updateRingCheck();
  clampToPlate(); drawMiniPlate();
  if (autoFitAfterRebuild) { fitCamera(); autoFitAfterRebuild = false }
  requestRender();
}
// Mensagem de imprimibilidade: bico, camadas e sugestões concretas.
function updatePrintCheck() {
  const p = model && model.regions.print; if (!p) return;
  const n = fmt2(S.nozzle), layers = S.letterHeight / S.layer, exact = Math.abs(layers - Math.round(layers)) < 1e-6;
  let html, cls = p.status;
  if (p.status === 'ok') html = `✓ <b>Bico ${n} mm</b>: traços e espaços das letras imprimíveis.`;
  else {
    const parts = [];
    if (p.stroke > 0.02) parts.push(`${Math.round(p.stroke * 100)}% do traço é mais fino que o bico (as letras podem falhar ou partir)`);
    if (p.gap > 0.015) parts.push(`há espaços mais estreitos que o bico (as letras podem ficar «fechadas»/coladas)`);
    const tips = [];
    if (p.stroke > 0.02) tips.push('aumenta a «Espessura das letras»', 'aumenta o tamanho do nome', 'usa um bico mais fino');
    if (p.gap > 0.015) tips.push('aumenta o «Espaçamento entre letras»', 'diminui a espessura', 'usa um bico mais fino');
    tips.push('ou escolhe uma fonte com ✓ na galeria');
    html = `⚠ <b>Bico ${n} mm</b>: ${parts.join('; ')}. Sugestão: ${[...new Set(tips)].join(', ')}.`;
  }
  html += `<br>Altura das letras ${fmt(S.letterHeight)} mm = ${exact ? Math.round(layers) : layers.toFixed(1).replace('.', ',')} camada(s) de ${String(S.layer).replace('.', ',')} mm${exact ? '' : ' ⚠ não é múltiplo da camada: o slicer arredonda'}. Contorno ${fmt(S.outlineWidth)} mm${S.outline && S.outlineWidth < S.nozzle * 1.1 ? ' ⚠ mais estreito que o bico' : ''}.`;
  if (FONT_GROUP[S.font] === 'fina') html += '<br>Fonte fina: imprime melhor com letra grande, bico 0,2–0,4 e espessura +0,2 mm ou mais.';
  for (const id of ['printCheck', 'printCheck2']) { const el = $(id); el.className = 'printcheck ' + cls + (id === 'printCheck' && cls === 'ok' ? ' hidden' : ''); el.innerHTML = html }
}
function updateRingCheck() {
  const el = $('ringCheck'), ri = model && model.regions.ring;
  if (!S.hasRing || !ri) { el.className = 'printcheck hidden'; return }
  const pct = Math.round(ri.frac * 100), cls = ri.status === 'ok' && !ri.holeCuts ? 'ok' : ri.status === 'ok' ? 'aviso' : 'mau';
  let html = ri.status === 'solta' ? '✗ <b>Argola solta</b>: não está ligada à peça.' : ri.status === 'fraca' ? `⚠ <b>Ligação frágil</b>: só ${pct}% da bola assenta na peça.` : `✓ <b>Ligação segura</b>: ${pct}% da bola assenta na peça${S.ringReinforce && ri.web > 0.05 ? ', com reforço' : ''}.`;
  if (ri.status !== 'ok') html += ' Arrasta a bola mais para dentro da base (ideal 30–50%) ou carrega em «◎ Reposicionar automaticamente».';
  if (ri.holeCuts) html += ' ⚠ O furo corta letras.';
  if (ri.wall < 1.6) html += ` ⚠ Parede da argola fina (${fmt(ri.wall)} mm): aumenta o diâmetro exterior ou diminui o furo.`;
  el.className = 'printcheck ' + cls; el.innerHTML = html;
}
// Etiqueta junto à argola no ecrã: ensina a arrastar e mostra o aviso de fragilidade.
let ringTagUntil = Date.now() + 15000, ringDragged = false;
function updateRingTag() {
  const tag = $('ringTag'), ri = model && model.regions.ring;
  if (!tag || !S.hasRing || !ri || !gl && !fallbackCtx) { tag && tag.classList.add('hidden'); return }
  const weak = ri.status !== 'ok', show = weak || (!ringDragged && Date.now() < ringTagUntil) || S.selected === 'ring';
  if (!show || Math.cos(camera.yaw) < 0) { tag.classList.add('hidden'); return }
  const pos = objectPositions()[0], p = project(ri.x + pos.x, ri.y + pos.y + S.ringOuter / 2 + 1, (model.zShift || 0) + S.bodyThickness);
  tag.style.left = p.x + 'px'; tag.style.top = p.y + 'px';
  tag.className = 'ringtag ' + (weak ? ri.status : '');
  tag.textContent = ri.status === 'solta' ? '⚠ argola solta — arrasta-a para a peça' : ri.status === 'fraca' ? '⚠ argola frágil — arrasta-a para dentro' : '◉ arrasta a argola';
}
setInterval(() => { if (!ringDragged && Date.now() > ringTagUntil) updateRingTag() }, 1000);
function partColor(id) { return { base: S.baseColor, letters: S.letterColor, outline: S.outlineColor, back: S.letterColor }[id] }
function refreshMeshColors() { for (const c of components) { c.color = partColor(c.id); if (gl) uploadOneMesh(c) } }

// ---------------------------------------------------------------- WebGL
function glCompile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s)); return s }
function init3D() {
  const canvas = $('gl'); gl = canvas.getContext('webgl2', { antialias: true, alpha: false }) || canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) { fallbackCtx = canvas.getContext('2d'); new ResizeObserver(() => { resizeCanvas(); requestRender() }).observe($('viewport')); resizeCanvas(); bindViewerEvents(); $('status').textContent = 'Pré-visualização simplificada (sem WebGL); a exportação STL/3MF usa a mesma geometria 3D vetorial.'; return }
  const v = glCompile(gl.VERTEX_SHADER, `attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;
 uniform float uYaw,uPitch,uScale,uDistance;uniform vec2 uViewport,uPan,uOffset;uniform vec3 uModelCenter;
 varying vec3 vNormal,vColor;
 void main(){vec3 p=aPosition+vec3(uOffset,0.0)-uModelCenter;
 float cy=cos(uYaw),sy=sin(uYaw),cx=cos(uPitch),sx=sin(uPitch);
 vec3 r=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);r=vec3(r.x,cx*r.y-sx*r.z,sx*r.y+cx*r.z);
 float f=uDistance/max(10.0,uDistance-r.z);vec2 xy=vec2(r.x,-r.y)*uScale*f+uViewport*.5+uPan;
 gl_Position=vec4(xy.x/uViewport.x*2.0-1.0,1.0-xy.y/uViewport.y*2.0,clamp(-r.z/uDistance,-.99,.99),1.0);
 vec3 nr=vec3(cy*aNormal.x+sy*aNormal.z,aNormal.y,-sy*aNormal.x+cy*aNormal.z);
 vNormal=normalize(vec3(nr.x,cx*nr.y-sx*nr.z,sx*nr.y+cx*nr.z));vColor=aColor;}`);
  const f = glCompile(gl.FRAGMENT_SHADER, `precision mediump float;varying vec3 vNormal,vColor;void main(){vec3 n=normalize(vNormal);float d=max(0.0,dot(n,normalize(vec3(-.35,.45,.82))));float s=pow(max(0.0,dot(reflect(-normalize(vec3(-.35,.45,.82)),n),vec3(0,0,1))),24.0);gl_FragColor=vec4(vColor*(.58+.42*d)+vec3(.10*s),1.0);}`);
  shader = gl.createProgram(); gl.attachShader(shader, v); gl.attachShader(shader, f); gl.linkProgram(shader); if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(shader));
  for (const [k, name] of Object.entries({ position: 'aPosition', normal: 'aNormal', color: 'aColor' })) attrib[k] = gl.getAttribLocation(shader, name);
  for (const [k, name] of Object.entries({ yaw: 'uYaw', pitch: 'uPitch', scale: 'uScale', distance: 'uDistance', viewport: 'uViewport', pan: 'uPan', offset: 'uOffset', center: 'uModelCenter' })) uniform[k] = gl.getUniformLocation(shader, name);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clearColor(.052, .08, .123, 1);
  new ResizeObserver(() => { resizeCanvas(); requestRender() }).observe($('viewport')); resizeCanvas(); rebuildBed(); bindViewerEvents();
}
// Intercala posição, normal (suave nas paredes curvas) e cor por vértice.
function packMesh(mesh, col) {
  const P = mesh.positions, I = mesh.indices, N = mesh.cornerNormals, c = rgb(col), data = new Float32Array(I.length * 9);
  for (let k = 0, o = 0; k < I.length; k++) { const v = I[k] * 3; data[o++] = P[v]; data[o++] = P[v + 1]; data[o++] = P[v + 2]; data[o++] = N[k * 3]; data[o++] = N[k * 3 + 1]; data[o++] = N[k * 3 + 2]; data[o++] = c[0]; data[o++] = c[1]; data[o++] = c[2] }
  return data;
}
function uploadOneMesh(c) { if (!gl) return; if (c.glBuffer) gl.deleteBuffer(c.glBuffer); c.glBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, c.glBuffer); gl.bufferData(gl.ARRAY_BUFFER, packMesh(c.mesh, c.color), gl.STATIC_DRAW); c.vertexCount = c.mesh.indices.length }
function uploadMeshBuffers() { if (gl) for (const c of components) uploadOneMesh(c) }
function releaseMeshBuffers() { if (gl) for (const c of components) if (c.glBuffer) gl.deleteBuffer(c.glBuffer) }
function packRaw(vertices, col) { const arr = new Float32Array(vertices.length * 9), c = rgb(col); for (let k = 0; k < vertices.length; k++) { const p = vertices[k]; arr.set([p[0], p[1], p[2], p[3] || 0, p[4] || 0, p[5] || 1, c[0], c[1], c[2]], k * 9) } return arr }
function makeBuffer(data) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return { buf: b, n: data.length / 9 } }
function rebuildBed() {
  if (!gl) return; if (plateBuffer) gl.deleteBuffer(plateBuffer.buf); if (gridBuffer) gl.deleteBuffer(gridBuffer.buf);
  const half = S.plateSize / 2, z = -1.3; plateBuffer = makeBuffer(packRaw([[-half, -half, z], [half, -half, z], [half, half, z], [-half, -half, z], [half, half, z], [-half, half, z]], '#1e3345'));
  const lines = [], line = (a, b) => { lines.push([...a, 0, 0, 1], [...b, 0, 0, 1]) };
  for (let p = -half; p <= half + 1e-6; p += 10) { line([p, -half, z + .05], [p, half, z + .05]); line([-half, p, z + .05], [half, p, z + .05]) }
  const pts = [[-half, -half], [half, -half], [half, half], [-half, half]]; for (let i = 0; i < 4; i++) line([...pts[i], z + .08], [...pts[(i + 1) % 4], z + .08]);
  gridBuffer = makeBuffer(packRaw(lines, '#41607b'));
}
// Escala do canvas: px do dispositivo por px CSS. O V4 usava `devicePixelRatio||1>2?2:…`, que dava
// sempre 2: num ecrã 1× o modelo era desenhado a dobrar e o zoom/clique não coincidiam com o cursor.
function pixelRatio() { return Math.min(window.devicePixelRatio || 1, 2) }
function resizeCanvas() { const r = $('viewport').getBoundingClientRect(), ratio = pixelRatio(); $('gl').width = Math.max(1, Math.round(r.width * ratio)); $('gl').height = Math.max(1, Math.round(r.height * ratio)); if (gl) gl.viewport(0, 0, $('gl').width, $('gl').height) }
function bindBufferAndDraw(buffer, n, mode, offset) { if (!buffer) return; gl.bindBuffer(gl.ARRAY_BUFFER, buffer); const stride = 36; for (const [key, i] of [['position', 0], ['normal', 3], ['color', 6]]) { gl.enableVertexAttribArray(attrib[key]); gl.vertexAttribPointer(attrib[key], 3, gl.FLOAT, false, stride, i * 4) } gl.uniform2f(uniform.offset, offset[0], offset[1]); gl.drawArrays(mode, 0, n) }
function requestRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render3D() }) }
function render3D() {
  if (!gl || !shader) { renderFallback(); return }
  const c = $('gl'), ratio = c.width / Math.max(1, c.clientWidth);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(shader);
  gl.uniform1f(uniform.yaw, camera.yaw); gl.uniform1f(uniform.pitch, camera.pitch); gl.uniform1f(uniform.scale, camera.scale * ratio);
  gl.uniform1f(uniform.distance, PERSPECTIVE); gl.uniform2f(uniform.viewport, c.width, c.height); gl.uniform2f(uniform.pan, camera.panX * ratio, camera.panY * ratio); gl.uniform3f(uniform.center, camera.cx, camera.cy, camera.cz);
  if (Math.cos(camera.yaw) > -.18) { bindBufferAndDraw(plateBuffer && plateBuffer.buf, plateBuffer && plateBuffer.n, gl.TRIANGLES, [0, 0]); bindBufferAndDraw(gridBuffer && gridBuffer.buf, gridBuffer && gridBuffer.n, gl.LINES, [0, 0]) }
  for (const pos of objectPositions()) for (const m of components) if (m.glBuffer) bindBufferAndDraw(m.glBuffer, m.vertexCount, gl.TRIANGLES, [pos.x, pos.y]);
  updateRingTag();
}

// ---------------------------------------------------------------- câmara: projeção igual à do shader
function project(x, y, z) {
  const rect = $('gl').getBoundingClientRect(), W = rect.width, H = rect.height;
  const px = x - camera.cx, py = y - camera.cy, pz = z - camera.cz, cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), cx = Math.cos(camera.pitch), sx = Math.sin(camera.pitch);
  const rx = cy * px + sy * pz, ry0 = py, rz0 = -sy * px + cy * pz, ry = cx * ry0 - sx * rz0, rz = sx * ry0 + cx * rz0;
  const f = PERSPECTIVE / Math.max(10, PERSPECTIVE - rz);
  return { x: rx * camera.scale * f + W / 2 + camera.panX, y: -ry * camera.scale * f + H / 2 + camera.panY };
}
// Ponto do ecrã (px CSS no canvas) → ponto do mundo no plano z = zPlane (Newton 2D).
function unproject(sx, sy, zPlane) {
  let x = camera.cx, y = camera.cy;
  for (let i = 0; i < 8; i++) {
    const p = project(x, y, zPlane), h = .01, px = project(x + h, y, zPlane), py = project(x, y + h, zPlane);
    const a = (px.x - p.x) / h, b = (py.x - p.x) / h, c = (px.y - p.y) / h, d = (py.y - p.y) / h, det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return null;
    const ex = sx - p.x, ey = sy - p.y; x += (d * ex - b * ey) / det; y += (-c * ex + a * ey) / det;
    if (Math.abs(ex) + Math.abs(ey) < .01) break;
  }
  return { x, y };
}
function pieceCenter() {
  const b = model && model.regions.bounds;
  return b ? { x: S.positionX + (b.minX + b.maxX) / 2, y: S.positionY + (b.minY + b.maxY) / 2, z: (model.height || 3) / 2 } : { x: S.positionX, y: S.positionY, z: 1.5 };
}
function fitCamera() {
  const r = $('viewport').getBoundingClientRect(); if (!r.width || !r.height) return;
  const b = model && model.regions.bounds;
  if (S.plateView) { camera.cx = 0; camera.cy = 0; camera.cz = 0 }
  else { const c = pieceCenter(); camera.cx = c.x; camera.cy = c.y; camera.cz = c.z }
  const width = S.plateView ? S.plateSize + 23 : Math.max(65, b ? b.width : 80) * 1.45, height = S.plateView ? S.plateSize + 23 : Math.max(33, b ? b.height : 40) * 1.9;
  camera.scale = Math.max(.6, Math.min(r.width / width, r.height / height, 12)); camera.panX = 0; camera.panY = 0;
}
function setView(side) { camera.yaw = side === 'back' ? Math.PI : 0; camera.pitch = 0; $('frontView').classList.toggle('on', side === 'front'); $('backView').classList.toggle('on', side === 'back'); $('btnFlip').textContent = side === 'front' ? '↻ Ver verso' : '↻ Ver frente'; requestRender() }
function screenLocal(evt, z) { const rect = $('gl').getBoundingClientRect(), p = unproject(evt.clientX - rect.left, evt.clientY - rect.top, z); return p ? { x: p.x - S.positionX, y: p.y - S.positionY } : null }
function inRegion(paths, p) { return paths && paths.length && SparrowGeo.contains(paths, p.x, p.y) }
function selectAt(evt) {
  if (!model) return '';
  const back = Math.cos(camera.yaw) < 0, z = back ? 0 : (model.zShift || 0) + S.bodyThickness, p = screenLocal(evt, z); if (!p) return '';
  const R = model.regions;
  if (S.hasRing && Math.hypot(p.x - S.ringX, p.y - S.ringY) < S.ringOuter / 2 + 2) return 'ring';
  if (back && inRegion(R.back, p)) return 'letters';
  if (!back && (inRegion(R.text, p) || inRegion(R.outline, p))) return 'letters';
  if (inRegion(R.base, p)) return 'base';
  return '';
}

// ---------------------------------------------------------------- rato
// Esquerdo: rodar · Esquerdo + direito, direito, roda premida ou Shift+esquerdo: deslocar a VISTA (pan)
// Ctrl+arrastar no plate: mover a peça · Roda: zoom em torno do cursor · Clique: selecionar.
// Botões em event.buttons: esquerdo = 1, direito = 2, meio = 4; esquerdo+direito = 3.
function bindViewerEvents() {
  const canvas = $('gl');
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('auxclick', e => e.preventDefault());
  const startPan = d => {
    // Repõe o que o primeiro botão possa ter mexido antes de o segundo ser premido.
    if (d.kind === 'rotate') { camera.yaw = d.yaw; camera.pitch = d.pitch }
    if (d.kind === 'move') { S.positionX = d.originalX; S.positionY = d.originalY; clampToPlate(); drawMiniPlate() }
    if (d.kind === 'ring') { S.ringX = d.ringX; S.ringY = d.ringY; S.ringManual = d.ringManual; interactiveBuild = false; if (d.moved) scheduleRebuild(true) }
    d.kind = 'pan'; d.chord = true; canvas.parentElement.classList.add('dragging'); requestRender();
  };
  canvas.addEventListener('pointerdown', e => {
    if (dragAction) { if ((e.buttons & 3) === 3 && dragAction.kind !== 'pan') startPan(dragAction); return }
    const both = (e.buttons & 3) === 3, left = e.button === 0 && !both;
    const clicked = left ? selectAt(e) : '';
    let kind = 'rotate';
    if (!left || e.shiftKey) kind = 'pan';
    else if (e.ctrlKey && S.plateView) kind = 'move';
    else if (clicked === 'ring') kind = 'ring';
    dragAction = { id: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, kind, clicked, yaw: camera.yaw, pitch: camera.pitch, originalX: S.positionX, originalY: S.positionY, ringX: S.ringX, ringY: S.ringY, ringManual: S.ringManual, moved: false };
    canvas.setPointerCapture(e.pointerId);
    if (kind === 'pan') canvas.parentElement.classList.add('dragging');
  });
  // Um segundo botão premido durante um arrasto chega como pointermove (eventos «chorded») e como mousedown.
  canvas.addEventListener('mousedown', e => { if (dragAction && (e.buttons & 3) === 3 && dragAction.kind !== 'pan') startPan(dragAction) });
  let hoverT = 0;
  canvas.addEventListener('pointermove', e => {
    if (!dragAction && e.buttons === 0 && performance.now() - hoverT > 60) { hoverT = performance.now(); canvas.style.cursor = selectAt(e) === 'ring' ? 'move' : fontMode ? 'ns-resize' : '' }
  });
  canvas.addEventListener('pointermove', e => {
    const d = dragAction; if (!d || e.pointerId !== d.id) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { endDrag(); return }
    if ((e.buttons & 3) === 3 && d.kind !== 'pan') startPan(d);
    const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY; d.lastX = e.clientX; d.lastY = e.clientY;
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) { d.moved = true; if (d.kind === 'ring') { selectTab('ring'); ringDragged = true } }
    if (!d.moved) return;
    if (d.kind === 'pan') { camera.panX += dx; camera.panY += dy; requestRender() }
    else if (d.kind === 'ring') { const p = screenLocal(e, (model && model.zShift || 0) + S.bodyThickness); if (p) { S.ringX = p.x; S.ringY = p.y; S.ringManual = true; interactiveBuild = true; scheduleRebuild(false) } }
    else if (d.kind === 'move') { S.positionX = d.originalX + (e.clientX - d.startX) / camera.scale; S.positionY = d.originalY - (e.clientY - d.startY) / camera.scale; clampToPlate(); drawMiniPlate(); requestRender() }
    else { camera.yaw += dx * .008; camera.pitch = Math.max(-1.1, Math.min(1.1, camera.pitch + dy * .008)); requestRender() }
  });
  const endDrag = () => {
    const d = dragAction; if (!d) return; dragAction = null; canvas.parentElement.classList.remove('dragging');
    if (!d.moved && !d.chord) { if (d.clicked) selectTab(d.clicked); setFontMode(d.clicked === 'letters') }
    if (d.kind === 'ring' && d.moved) { interactiveBuild = false; scheduleRebuild(true) }
  };
  canvas.addEventListener('pointerup', e => { if (dragAction && e.pointerId === dragAction.id && e.buttons === 0) endDrag() });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', () => { if (dragAction) endDrag() });
  let wheelAcc = 0;
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (fontMode) { wheelAcc += e.deltaY; if (Math.abs(wheelAcc) >= 40) { stepFont(wheelAcc > 0 ? 1 : -1); wheelAcc = 0 } return }
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const before = camera.scale, after = Math.min(80, Math.max(.3, before * Math.exp(-e.deltaY * k * .0012)));
    // O ponto sob o cursor fica no mesmo sítio do ecrã: pan' = m − (m − pan)·s'/s
    camera.panX = mx - (mx - camera.panX) * after / before; camera.panY = my - (my - camera.panY) * after / before; camera.scale = after; requestRender();
  }, { passive: false });
  // Duplo clique: centra o ponto clicado e aproxima.
  canvas.addEventListener('dblclick', e => { const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2, after = Math.min(80, camera.scale * 1.65), k = after / camera.scale; camera.panX = (camera.panX - mx) * k; camera.panY = (camera.panY - my) * k; camera.scale = after; requestRender() });
}

// ---------------------------------------------------------------- pré-visualização sem WebGL
function renderFallback() {
  if (!fallbackCtx || !model) return;
  const c = $('gl'), ctx = fallbackCtx, r = c.width / Math.max(1, c.clientWidth), back = Math.cos(camera.yaw) < 0, R = model.regions;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d1520'; ctx.fillRect(0, 0, c.width, c.height); ctx.setTransform(r, 0, 0, r, 0, 0);
  const drawPaths = (paths, dx, dy, fill) => { if (!paths || !paths.length) return; ctx.beginPath(); for (const p of paths) p.forEach((q, i) => { const s = project(q.X / SparrowGeo.SCALE + dx, q.Y / SparrowGeo.SCALE + dy, 0); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y) }), ctx.closePath(); ctx.fillStyle = fill; ctx.fill('evenodd') };
  if (Math.cos(camera.yaw) > -.18) { const h = S.plateSize / 2; drawPaths([[{ X: -h * 1e4, Y: -h * 1e4 }, { X: h * 1e4, Y: -h * 1e4 }, { X: h * 1e4, Y: h * 1e4 }, { X: -h * 1e4, Y: h * 1e4 }]], 0, 0, '#1e3345') }
  for (const pos of objectPositions()) {
    drawPaths(R.base, pos.x, pos.y, S.baseColor);
    if (back) drawPaths(R.back, pos.x, pos.y, S.back === 'engraved' ? '#16416b' : S.letterColor);
    else { drawPaths(R.outline, pos.x, pos.y, S.outlineColor); drawPaths(R.text, pos.x, pos.y, S.front === 'engraved' ? '#1b5684' : S.front === 'cutout' ? '#102030' : S.letterColor) }
  }
}

// ---------------------------------------------------------------- tabuleiro
const PLATE_MARGIN = 5;
function modelBounds() { const b = model && model.regions.bounds; return b ? { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, width: b.width, height: b.height } : { minX: -35, maxX: 35, minY: -16, maxY: 16, width: 70, height: 32 } }
function clampToPlate() {
  if (!model) return;
  const b = modelBounds(), h = S.plateSize / 2 - PLATE_MARGIN, loX = -h - b.minX, hiX = h - b.maxX, loY = -h - b.minY, hiY = h - b.maxY;
  if (loX > hiX) S.positionX = (loX + hiX) / 2; else S.positionX = Math.min(hiX, Math.max(loX, S.positionX));
  if (loY > hiY) S.positionY = (loY + hiY) / 2; else S.positionY = Math.min(hiY, Math.max(loY, S.positionY));
  for (const side of [loX, hiX]) if (Math.abs(S.positionX - side) < 1.4) S.positionX = side;
  for (const side of [loY, hiY]) if (Math.abs(S.positionY - side) < 1.4) S.positionY = side;
}
function layoutPlan() {
  const b = modelBounds(), gap = S.printMode === 'sequential' ? 32 : 6, inner = S.plateSize - PLATE_MARGIN * 2;
  const cols = Math.max(0, Math.floor((inner + gap) / (b.width + gap))), rows = Math.max(0, Math.floor((inner + gap) / (b.height + gap)));
  const capacity = cols * rows, count = Math.min(S.copies, capacity);
  if (S.copies === 1) return { positions: [{ x: S.positionX, y: S.positionY }], capacity: capacity >= 1 ? capacity : 0, gap, b };
  const useCols = Math.min(cols, Math.max(1, Math.ceil(count / Math.max(1, rows)))), useRows = Math.ceil(count / useCols), positions = [];
  for (let i = 0; i < count; i++) { const c = i % useCols, r = Math.floor(i / useCols), rowCount = Math.min(useCols, count - r * useCols); positions.push({ x: (c - (rowCount - 1) / 2) * (b.width + gap) - (b.minX + b.maxX) / 2, y: ((useRows - 1) / 2 - r) * (b.height + gap) - (b.minY + b.maxY) / 2 }) }
  return { positions, capacity, gap, b };
}
function objectPositions() { return layoutPlan().positions }
function drawMiniPlate() {
  const mini = $('miniPlate'), el = $('plateObject'); if (!mini || !el || !model) return;
  const data = layoutPlan(), size = S.plateSize, b = data.b;
  $('platePreset').textContent = PRINTERS[S.printer][0].toUpperCase(); $('plateXY').textContent = `${size} × ${size} mm`; $('copyVal').textContent = S.copies === 1 ? '1 peça' : `${S.copies} peças`;
  mini.querySelectorAll('.extraPlateObject').forEach(e => e.remove());
  data.positions.forEach((pos, i) => { const node = i === 0 ? el : document.createElement('div'); if (i > 0) { node.className = 'extraPlateObject'; mini.appendChild(node) } node.style.width = `${100 * b.width / size}%`; node.style.height = `${100 * b.height / size}%`; node.style.left = `${(50 + (pos.x + b.minX) / size * 100).toFixed(3)}%`; node.style.top = `${(50 - (pos.y + b.maxY) / size * 100).toFixed(3)}%`; node.textContent = S.copies === 1 ? (S.name || 'Peça') : String(i + 1) });
  el.classList.toggle('multi', S.copies > 1);
  const tooBig = b.width > size - PLATE_MARGIN * 2 || b.height > size - PLATE_MARGIN * 2;
  let msg = `Área útil estimada: ${size - 2 * PLATE_MARGIN} × ${size - 2 * PLATE_MARGIN} mm · margem de ${PLATE_MARGIN} mm. `;
  if (tooBig) msg += '⚠ A peça é demasiado grande para este tabuleiro.'; else if (data.positions.length < S.copies) msg += `⚠ Só cabem ${data.positions.length} das ${S.copies} cópias com este espaçamento estimado.`; else msg += `Cabem ${data.positions.length} peça(s) no planeamento atual.`;
  if (S.printMode === 'sequential') msg += ' ⚠ Os 32 mm de separação são apenas uma estimativa: verifica as colisões da cabeça e o pórtico no slicer.';
  $('plateWarnings').textContent = msg;
}
function initPlateDrag() {
  const mini = $('miniPlate'), obj = $('plateObject'); let pointer = null;
  obj.addEventListener('pointerdown', e => { if (S.copies > 1) return; pointer = { x: e.clientX, y: e.clientY, startX: S.positionX, startY: S.positionY }; obj.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault() });
  obj.addEventListener('pointermove', e => { if (!pointer) return; const r = mini.getBoundingClientRect(); S.positionX = pointer.startX + (e.clientX - pointer.x) / r.width * S.plateSize; S.positionY = pointer.startY - (e.clientY - pointer.y) / r.height * S.plateSize; clampToPlate(); drawMiniPlate(); requestRender() });
  for (const ev of ['pointerup', 'pointercancel']) obj.addEventListener(ev, () => { pointer = null; drawMiniPlate() });
  mini.addEventListener('pointerdown', e => { if (S.copies > 1 || e.target !== mini) return; const r = mini.getBoundingClientRect(), b = modelBounds(); S.positionX = ((e.clientX - r.left) / r.width - .5) * S.plateSize - (b.minX + b.maxX) / 2; S.positionY = (.5 - (e.clientY - r.top) / r.height) * S.plateSize - (b.minY + b.maxY) / 2; clampToPlate(); drawMiniPlate(); requestRender() });
}
function bindViewCube() {
  document.querySelectorAll('.viewCube button').forEach(b => b.onclick = () => {
    const v = b.dataset.view;
    if (v === 'zoomIn' || v === 'zoomOut') { camera.scale = Math.max(.3, Math.min(80, camera.scale * (v === 'zoomIn' ? 1.3 : 1 / 1.3))); requestRender(); return }
    if (v === 'front' || v === 'back') setView(v); else if (v === 'iso') { camera.yaw = .28; camera.pitch = -.38; requestRender() } else { camera.yaw = 0; camera.pitch = 0; requestRender() }
    document.querySelectorAll('.viewCube button').forEach(x => x.classList.toggle('active', x === b));
  });
}

// ---------------------------------------------------------------- exportação
function download(data, filename, type) { const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })), a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000) }
function safeName(n) { return (n || 'nome').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 28) }
function stlBytes(meshes) {
  const positions = objectPositions(), count = meshes.reduce((s, m) => s + m.indices.length / 3, 0) * positions.length; if (!count) return null;
  const ab = new ArrayBuffer(84 + count * 50), view = new DataView(ab), hdr = new TextEncoder().encode('SparrowTech 3D Studio v5 / malha vetorial fechada, milimetros');
  new Uint8Array(ab, 0, Math.min(80, hdr.length)).set(hdr.slice(0, 80)); view.setUint32(80, count, true); let off = 84;
  for (const pos of positions) for (const m of meshes) {
    const P = m.positions, I = m.indices;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const vals = [nx, ny, nz, P[a] + pos.x, P[a + 1] + pos.y, P[a + 2], P[b] + pos.x, P[b + 1] + pos.y, P[b + 2], P[c] + pos.x, P[c + 1] + pos.y, P[c + 2]];
      for (let i = 0; i < 12; i++) view.setFloat32(off + i * 4, vals[i], true); off += 50;
    }
  }
  return new Blob([ab], { type: 'model/stl' });
}
async function withBusy(button, label, fn) { const old = button.textContent; button.disabled = true; button.textContent = label; try { await fn() } catch (e) { console.error(e); alert('Erro na exportação: ' + e.message.split('\n')[0]) } finally { button.disabled = false; button.textContent = old } }
async function exportMeshes(mode) {
  if (!components.length) { alert('Ainda não existe modelo.'); return }
  if (mode === 'combined') return withBusy($('exportSTL'), '⏳ A unir…', async () => {
    const r = await geometryCall({ type: 'build', S: geometryState(), quality: S.quality, union: true });
    const b = stlBytes([r.union]); if (b) download(b, `SparrowTech_${safeName(S.name)}_modelo.stl`);
    $('qualityNotice').textContent = 'STL completo exportado: um único sólido fechado (sem cores).';
  });
  const fresh = await finalComponents();
  for (const c of fresh) { const b = stlBytes([c.mesh]); if (b) download(b, `SparrowTech_${safeName(S.name)}_${c.id}.stl`) }
  $('qualityNotice').textContent = 'Exportados STLs separados. No slicer, importa-os juntos como partes do mesmo objeto («Sim» quando perguntar se é um objeto com várias partes) para manter a posição e atribuir cores.';
}
// Garante que a exportação usa a qualidade escolhida (não a pré-visualização rápida do arrasto).
async function finalComponents() { if (building || interactiveBuild || (!worker && S.quality === 'ultra')) { interactiveBuild = false; const r = await geometryCall({ type: 'build', S: geometryState(), quality: S.quality }); applyModel(r, S.quality) } return components }
async function export3MF() {
  if (!components.length || !model) { alert('Não existe malha para exportar.'); return }
  const plan = layoutPlan(), b = plan.b;
  if (plan.positions.length < S.copies || b.width > S.plateSize - PLATE_MARGIN * 2 || b.height > S.plateSize - PLATE_MARGIN * 2) { alert('Há peças fora do espaço disponível. Diminui o número de cópias ou o nome.'); return }
  await withBusy($('export3MF'), '⏳ A criar 3MF…', async () => {
    await new Promise(r => setTimeout(r, 30));
    const parts = (await finalComponents()).map(c => ({ id: c.id, label: c.label + ' (' + c.color.toUpperCase() + ')', color: c.color, mesh: c.mesh }));
    const res = Sparrow3MF.build(parts, plan.positions, { name: S.name || 'SparrowTech', printerName: PRINTERS[S.printer][0], plateSize: S.plateSize });
    const bytes = await Sparrow3MF.zip(res.entries);
    download(bytes, `SparrowTech_${safeName(S.name)}_${PRINTERS[S.printer][0].replace(/[^A-Za-z0-9]/g, '')}.3mf`, 'model/3mf');
    const list = parts.map(p => `${p.label.replace(/ \(#.*/, '')} → filamento ${res.extruders[p.id]}`).join(' · ');
    $('qualityNotice').textContent = `3MF exportado (${plan.positions.length} cópia(s)). ${list}. No slicer, escolhe as cores desses filamentos.`;
  });
}

// Placa de teste: o mesmo nome em várias fontes (★), lado a lado, para imprimir e comparar.
async function exportTestPlate() {
  const list = S.favorites.length ? S.favorites.slice() : [S.font];
  if (!S.favorites.length && !confirm('Ainda não marcaste fontes com ★. Exportar só a fonte atual?')) return;
  await withBusy($('testPlate'), '⏳ A gerar…', async () => {
    const built = [];
    for (const font of list) {
      const st = geometryState(); st.font = font; st.ringManual = false;
      const r = await geometryCall({ type: 'build', S: st, quality: S.quality });
      built.push({ font, r });
    }
    // Arruma em linhas dentro do tabuleiro (6 mm entre peças, 5 mm de margem).
    const gap = 6, inner = S.plateSize - 2 * PLATE_MARGIN, placed = []; let x = -inner / 2, y = inner / 2, rowH = 0, skipped = [];
    for (const { font, r } of built) {
      const b = r.regions.bounds; if (!b) continue;
      if (x + b.width > inner / 2) { x = -inner / 2; y -= rowH + gap; rowH = 0 }
      if (b.width > inner || y - b.height < -inner / 2) { skipped.push(font); continue }
      placed.push({ font, r, pos: { x: x - b.minX, y: y - b.maxY } }); x += b.width + gap; rowH = Math.max(rowH, b.height);
    }
    const objects = placed.map(({ font, r, pos }) => ({ name: `${S.name || 'Nome'} — ${font}`, placements: [pos], parts: r.parts.map(p => ({ id: p.id, label: `${partLabel(p)} (${partColor(p.id).toUpperCase()})`, color: partColor(p.id), mesh: p.mesh })) }));
    const res = Sparrow3MF.buildObjects(objects, { name: `Teste de fontes — ${S.name}`, printerName: PRINTERS[S.printer][0], plateSize: S.plateSize });
    download(await Sparrow3MF.zip(res.entries), `SparrowTech_teste_fontes_${safeName(S.name)}.3mf`, 'model/3mf');
    $('qualityNotice').textContent = `Placa de teste: ${placed.length} fonte(s) (${placed.map(p => p.font).join(', ')}).` + (skipped.length ? ` Não couberam: ${skipped.join(', ')}.` : '') + ` Bico ${fmt2(S.nozzle)} mm, camada ${String(S.layer).replace('.', ',')} mm.`;
  });
}
function partLabel(p) { return { base: 'Base e argola', letters: 'Letras da frente', outline: 'Contorno', back: 'Letras do verso' }[p.id] || p.label }

// ---------------------------------------------------------------- arranque
async function boot() {
  bindControls(); updateControls();
  try { init3D() } catch (e) { console.error(e); $('qualityNotice').textContent = 'Erro WebGL: ' + e.message }
  await startWorker();
  const data = window.SPARROW_FONTS || [];
  await Promise.all(data.map(f => registerFont(f.name, b64ToBuffer(f.data), f.group)));
  FONTS.sort((a, b) => data.findIndex(f => f.name === a) - data.findIndex(f => f.name === b));
  updateControls(); scheduleScan();
  autoFitAfterRebuild = true; await rebuildModel(); fitCamera(); requestRender();
}
boot();
