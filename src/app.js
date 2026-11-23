'use strict';
/* SparrowTech 3D Studio v5 — interface, visualização WebGL, navegação e exportação.
 * A geometria é calculada por SparrowModel/SparrowGeo (vetorial) num Web Worker, para
 * não bloquear a interface. Ver docs/ARQUITETURA-V5.md. */
const $ = id => document.getElementById(id);
const S = { name: 'Name', font: 'Pacifico', roundTop: false, letterStyle: 'flat', roundBase: false, roundBack: false, roundAmount: .6, letterRound: 0, textWeight: 0, letterSpacing: 0, nozzle: .4, favorites: [], shape: 'contour', front: 'raised', back: 'smooth', backText: '', backScale: 100, backX: 0, backY: 0, outline: true, outlineWidth: .8, border: 3.5, letterHeight: .6, bodyThickness: 2.4, nameSize: 50, baseColor: '#348cf0', letterColor: '#ffffff', outlineColor: '#090c13', hasRing: true, ringOuter: 7.5, ringInner: 3.6, ringManual: false, ringX: 0, ringY: 0, fillHoles: true, fillLetterHoles: false, holeArea: 1.5, selected: 'letters', pro: true, ringReinforce: true, filaments: {}, printer: '256', positionX: 0, positionY: 0, plateView: false, printMode: 'layers', quality: 'fine', copies: 1 };
const FONTS = [];            // nomes, pela ordem da galeria (a roda do rato percorre esta lista)
const FONT_GROUP = {};       // nome → 'nomes' | 'imprensa' | 'fina' | 'importadas'
const GROUPS = [['nomes', 'Recomendadas para nomes', 'manuscritas, ligadas'], ['imprensa', 'Letra de imprensa (grossas)', 'à máquina, muito legíveis'], ['fina', 'Finas e elegantes', 'pedem letra grande ou bico fino'], ['importadas', 'Importadas', '']];
let fontScan = {};           // nome → resultado de imprimibilidade para o nome atual
const SHAPES = [['contour', 'Segue as letras'], ['rounded', 'Tag arredondada'], ['softRectangle', 'Retangular · ajustar cantos']];
const FRONT = [['raised', '↑ Relevo'], ['flush', '▰ À face'], ['engraved', '↓ Gravado'], ['cutout', '◯ Vazado']];
const BACK = [['smooth', '▱ Liso'], ['inlay', '▰ À face'], ['raised', '↑ Relevo'], ['engraved', '↓ Gravado'], ['through', '↕ Passante']];
const EXPORT_LAYER_HEIGHT = .16;
const PLATE_SIZES = { 180: [180, 180], 220: [220, 220], 256: [256, 256], '300x320': [300, 320], '325x320': [325, 320], '330x320': [330, 320], '340x320': [340, 320], custom: [256, 256] };
const plateW = () => PLATE_SIZES[S.printer][0], plateH = () => PLATE_SIZES[S.printer][1];
const plateLabel = () => `${plateW()} × ${plateH()} mm`;
// Filamentos oficiais (src/filaments.js, gerado a partir das listas do Bambu Studio e do Creality Print).
const FILAMENTS = window.SPARROW_FILAMENTS || {};
const MAIN_SERIES = { 'Bambu Lab': 'PLA Basic', 'Creality': 'Hyper PLA' };
const PARTS = [['base', 'Base', 'baseColor'], ['letters', 'Letras', 'letterColor'], ['outline', 'Contorno', 'outlineColor']];
const brand = () => 'Bambu Lab';
function hexDist(a, b) { const x = rgb(a), y = rgb(b); return (x[0] - y[0]) ** 2 * 0.3 + (x[1] - y[1]) ** 2 * 0.59 + (x[2] - y[2]) ** 2 * 0.11 }
function nearestFilament(hex, br, series) { const list = (FILAMENTS[br] || {})[series || MAIN_SERIES[br]] || []; let best = null; for (const f of list) if (!best || hexDist(f.hex, hex) < hexDist(best.hex, hex)) best = f; return best && { brand: br, series: series || MAIN_SERIES[br], ...best } }
function setPartFilament(part, fil) { const key = PARTS.find(p => p[0] === part)[2]; S.filaments[part] = fil; if (fil) S[key] = fil.hex.toLowerCase(); $(key).value = S[key] }
function matchFilamentsToBrand() { for (const [part, , key] of PARTS) { const cur = S.filaments[part]; if (cur && cur.brand === brand()) continue; const f = nearestFilament(S[key], brand(), cur && cur.brand === brand() ? cur.series : null); if (f) setPartFilament(part, f) } }
function filamentLabel(part, state = S) { const f = state.filaments[part === 'back' ? 'letters' : part]; return f ? `${f.brand} ${f.series} ${f.name}${f.brand === 'Bambu Lab' ? ' (' + f.code + ')' : ''}` : 'cor livre' }
let pickerPart = null;
function bindFilamentNumber(input, part) {
  Object.assign(input, {type:'number',min:1,max:99,step:1,placeholder:'Auto'});
  input.value = S.slots?.[part] || '';
  input.onchange = () => {
    const n = input.valueAsNumber;
    S.slots = { ...S.slots, [part]:Number.isFinite(n) ? Math.min(99,Math.max(1,Math.round(n))) : undefined };
    input.value = S.slots[part] || '';
    renderFilaChips();
    const paired = $(input.id === 'pickerFilamentNumber' ? 'slot-'+part : 'pickerFilamentNumber');
    if (paired && (input.id === 'pickerFilamentNumber' || pickerPart === part)) paired.value = input.value;
  };
}
function renderFilaChips() {
  const box = $('filaChips'); box.textContent = '';
  for (const [part, title, key] of PARTS) {
    if (part === 'outline' && !S.outline) continue;
    const f = S.filaments[part], b = document.createElement('button'); b.className = 'filachip' + (pickerPart === part ? ' on' : '');
    b.innerHTML = `<i style="background:${S[key]}"></i><span>${title} · ${S.slots?.[part] || 'Auto'}<small>${f ? f.name : 'cor livre'}</small></span>`;
    b.title = `${title}: ${filamentLabel(part)} ${S[key].toUpperCase()}`;
    b.onclick = () => { pickerPart = pickerPart === part ? null : part; renderFilaChips(); renderPicker() };
    box.appendChild(b);
  }
}
function renderPicker() {
  const box = $('filaPicker'); if (!pickerPart) { box.classList.add('hidden'); return }
  box.classList.remove('hidden'); box.textContent = '';
  const part = pickerPart, key = PARTS.find(p => p[0] === part)[2], br = brand(), cur = S.filaments[part];
  const series = cur && cur.brand === br ? cur.series : MAIN_SERIES[br];
  const sel = document.createElement('select'); sel.id = 'filaSeries';
  for (const sname of Object.keys(FILAMENTS[br] || {})) { const o = document.createElement('option'); o.value = sname; o.textContent = `${br} ${sname} (${FILAMENTS[br][sname].length} cores)`; sel.appendChild(o) }
  const free = document.createElement('option'); free.value = '__free'; free.textContent = '🎨 Cor livre (qualquer cor)'; sel.appendChild(free);
  sel.value = cur ? series : '__free';
  const grid = document.createElement('div'); grid.className = 'swatches';
  const name = document.createElement('div'); name.className = 'filaname'; name.textContent = `${PARTS.find(p => p[0] === part)[1]}: ${filamentLabel(part)} · ${S[key].toUpperCase()}`;
  const fill = sname => {
    grid.textContent = '';
    if (sname === '__free') { const inp = document.createElement('input'); inp.type = 'color'; inp.value = S[key]; inp.oninput = () => { S.filaments[part] = null; S[key] = inp.value; $(key).value = inp.value; refreshMeshColors(); requestRender(); renderFilaChips(); name.textContent = 'Cor livre ' + inp.value.toUpperCase() }; grid.appendChild(inp); return }
    for (const f of FILAMENTS[br][sname]) {
      const sw = document.createElement('button'); sw.className = 'swatch' + (cur && cur.series === sname && cur.code === f.code && cur.hex === f.hex ? ' on' : ''); sw.style.background = f.hex;
      sw.title = `${br} ${sname} — ${f.name}${br === 'Bambu Lab' ? ' · código ' + f.code : ''} · ${f.hex}`;
      sw.onclick = () => { setPartFilament(part, { brand: br, series: sname, ...f }); refreshMeshColors(); requestRender(); renderFilaChips(); renderPicker() };
      grid.appendChild(sw);
    }
  };
  sel.onchange = () => fill(sel.value); fill(sel.value);
  const numberRow = document.createElement('label');
  numberRow.className = 'filaname';
  numberRow.textContent = 'N.º do filamento no Bambu Studio ';
  const number = document.createElement('input');
  number.id = 'pickerFilamentNumber';
  number.style.width = '5em';
  bindFilamentNumber(number, part);
  numberRow.append(number);
  box.append(numberRow, sel, grid, name);
}
function updatePrintBar() { }
function infoText() {
  return 'O 3MF inclui as peças, as posições, as cores e uma altura de camada de 0,16 mm por objeto para slicers compatíveis. Podes ajustar a camada e o bico no slicer.';
}
let infoSkip = false; try { infoSkip = localStorage.getItem('st3d_info3mf') === '1' } catch (e) { }
function openStudioAfter() {
  const f = document.createElement('iframe'); f.style.display = 'none'; f.src = 'bambustudio://open'; document.body.appendChild(f); setTimeout(() => f.remove(), 4000);
  $('qualityNotice').textContent = 'O 3MF foi descarregado e pedi ao computador para abrir o Bambu Studio. Arrasta o ficheiro das transferências para a janela do Bambu Studio (ou Ficheiro → Abrir projeto).';
}
function bindCards() {
  const close = () => { $('infoCard').classList.add('hidden'); if ($('infoSkip').checked) { infoSkip = true; try { localStorage.setItem('st3d_info3mf', '1') } catch (e) { } } };
  $('dlSTL').onclick = () => exportSTL();
  $('dl3MF').onclick = () => { if (infoSkip) return export3MF(); $('infoBody').innerHTML = infoText(); $('infoCard').classList.remove('hidden') };
  $('infoCancel').onclick = () => $('infoCard').classList.add('hidden');
  $('infoGo').onclick = () => { close(); export3MF() };
  // Uma página local não consegue entregar o ficheiro ao Bambu Studio: descarrega e pede ao sistema para o iniciar (bambustudio://).
  $('infoStudio').onclick = async () => { close(); if (await export3MF()) openStudioAfter() };
  let seen = /semintro/.test(location.hash); try { seen = seen || localStorage.getItem('st3d_intro') === '1' } catch (e) { }
  if (!seen) $('introCard').classList.remove('hidden');
  $('introGo').onclick = () => { $('introCard').classList.add('hidden'); try { localStorage.setItem('st3d_intro', '1') } catch (e) { } };
}

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
let addingName = false, showExampleName = true;
function selectTab(tab) {
  if (!activePiece && tab !== 'print' && tab !== 'plate') tab = 'letters';
  const layout = tab === 'plate' || tab === 'letters';
  const viewChanged = S.plateView !== layout;
  S.plateView = layout;
  S.selected = tab;
  if (viewChanged) {
    $('viewport').classList.toggle('plate-view', S.plateView);
    $('viewerHelp').classList.toggle('hidden', S.plateView);
    if (S.plateView) { setView('front'); setFontMode(false) }
    else setPlateSelection(null);
    requestAnimationFrame(() => { fitCamera(); requestRender() });
  }
  for (const t of ['letters', 'base', 'ring', 'print', 'plate']) $(t + 'Panel').classList.toggle('hidden', !['letters','base'].includes(t) && t !== tab);
  for (const t of ['letters', 'base', 'ring', 'print']) $('tab' + t[0].toUpperCase() + t.slice(1)).classList.toggle('on', t === tab);
  $('btnPlate').classList.toggle('on', tab === 'plate');
  $('fontsPanel').classList.remove('hidden');
  $('selectionLabel').textContent = selectionText(tab);
  updateRingMenu(); if (tab !== partMenuFor) partMenuFor = null; updatePartMenu();
  updatePlatePanel();
}
function selectionText(tab) { return { letters: 'Arrasta o fundo para rodar · roda do rato para zoom', base: '▱ Selecionado: base · formato e rebordo', ring: '◉ Selecionado: argola · agarra e arrasta', print: '⚙ Detalhe da malha exportada', plate: 'Arrasta uma peça para a posicionar' }[tab] }
function optionButtons(id, items, current, callback) { const node = $(id); node.textContent = ''; for (const [value, label] of items) { const b = document.createElement('button'); b.textContent = label; b.classList.toggle('on', value === current); b.addEventListener('click', () => { callback(value); updateControls(); scheduleRebuild() }); node.appendChild(b) } }
function explanation(kind) { let title = '', msg = ''; if (kind === 'raised') { title = 'Relevo'; msg = 'As letras ficam salientes sobre a base. A face com relevo deve ficar virada para cima na impressão.' } if (kind === 'flush') { title = 'Ao nível'; msg = 'As letras ficam encaixadas na superfície da base, sem degrau. Ideal para impressões multicolor.' } if (kind === 'engraved') { title = 'Gravado'; msg = 'As letras são cavadas na base e mostram profundidade real.' } if (kind === 'cutout') { title = 'Vazado'; msg = 'As letras atravessam a base como recortes vazios.' } if (kind === 'smooth') { title = 'Liso'; msg = 'O verso fica totalmente liso, sem letras.' } if (kind === 'inlay') { title = 'Ao nível'; msg = 'O texto do verso é embutido na base.' } if (kind === 'through') { title = 'Passante'; msg = 'As letras atravessam toda a base. Visto por trás, o nome original aparece espelhado, como acontece numa peça real.' } return `<svg viewBox="0 0 96 56" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="24" width="84" height="26" rx="5" fill="#378ff3"/><rect x="28" y="${kind === 'raised' ? 13 : kind === 'cutout' ? 24 : kind === 'engraved' ? 30 : 23}" width="41" height="${kind === 'raised' ? 17 : kind === 'cutout' ? 26 : kind === 'engraved' ? 12 : 20}" rx="4" fill="${kind === 'cutout' ? '#121a28' : '#fff'}" stroke="${kind === 'engraved' ? '#1e507b' : '#e9eef8'}" stroke-width="1"/><text x="48" y="${kind === 'raised' ? 26 : 38}" text-anchor="middle" font-size="12" fill="${kind === 'cutout' ? '#89beff' : '#122438'}">Aa</text></svg><span><b>${title}</b><br>${msg}</span>` }
function updateControls() {
  document.body.classList.add('pro');
  syncNameEntry();
  $('backScale').value = S.backScale || 100;
  $('backScaleValue').textContent = $('backScale').value + '%';
  $('backText').value = S.backText;
  renderGallery();
  optionButtons('shapeButtons', SHAPES, S.shape, v => { S.shape = v; S.ringManual = false }); optionButtons('finishFront', FRONT, S.front, v => S.front = v); optionButtons('finishBack', BACK, S.back, v => { S.back = v; if (v !== 'smooth') setTimeout(() => setView('back'), 20) });
  $('frontExplain').innerHTML = explanation(S.front); $('backExplain').innerHTML = explanation(S.back);
  $('hasOutline').checked = S.outline; $('outlineControls').classList.toggle('hidden', !S.outline);
  $('cornerControl').classList.toggle('hidden', S.shape !== 'softRectangle');
  $('cornerRadius').value = S.cornerRadius || 5;
  $('cornerValue').textContent = fmt($('cornerRadius').value) + ' mm';
  updateRangeLabels();
  $('baseColor').value = S.baseColor; $('letterColor').value = S.letterColor; $('outlineColor').value = S.outlineColor; $('roundBase').checked = S.roundBase; $('roundBack').checked = S.roundBack; $('roundAmount').value = S.roundAmount; $('borderWidth').value = S.border; $('bodyThickness').value = S.bodyThickness; $('letterHeight').value = S.letterHeight; $('outlineWidth').value = S.outlineWidth; $('nameSize').value = S.nameSize; $('ringOuter').value = S.ringOuter; $('ringInner').value = S.ringInner; $('fillHoles').checked = S.fillHoles; $('fillLetterHoles').checked = S.fillLetterHoles; $('smallHole').value = S.holeArea; $('hasRing').checked = S.hasRing; $('letterRound').value = S.letterRound; $('ringReinforce').checked = S.ringReinforce; $('printer').value = S.printer; $('textWeight').value = S.textWeight; $('letterSpacing').value = S.letterSpacing; $('quality').value = S.quality; $('copyTop').value = S.copies; updateQualityBadge();
  $('machineBadge').textContent = plateLabel(); updatePlatePanel();
  renderFilaChips(); renderPicker(); updatePrintBar();
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
  if (!quick) activePiece.chosenFont = font;
  S.font = font;
  for (const b of document.querySelectorAll('.fontcard')) b.classList.toggle('on', b.dataset.font === font);
  // Rola só a galeria (não a página: no telemóvel o modelo sairia do ecrã).
  const on = document.querySelector('.fontcard.on'), box = $('fontCards'); if (on && quick) { const r = on.getBoundingClientRect(), br = box.getBoundingClientRect(); if (r.top < br.top || r.bottom > br.bottom) box.scrollTop += r.top - br.top - br.height / 2 + r.height / 2 }
  updateFontSwitch();
  if (quick) { interactiveBuild = true; scheduleRebuild(false, 40); clearTimeout(fontSettle); fontSettle = setTimeout(() => { interactiveBuild = false; scheduleRebuild(true) }, 650) }
  else { interactiveBuild = false; scheduleRebuild(true) }
}
function stepFont(dir) { const i = FONTS.indexOf(S.font); chooseFont(FONTS[(i + dir + FONTS.length) % FONTS.length], true) }
function updateFontSwitch() { const n = $('fontName'); if (!n) return; n.textContent = S.font; n.style.fontFamily = `'${S.font}'`; $('fontCount').textContent = `${FONTS.indexOf(S.font) + 1}/${FONTS.length}`; $('fontRestore').disabled = !activePiece || S.font === (activePiece.chosenFont || 'Pacifico') }
let fontMode = false;
function setFontMode(on) { fontMode = on; updateFontSwitch(); $('selectionLabel').textContent = on ? '✎ Modo fonte: roda o rato para trocar · Esc ou clique fora para sair' : selectionText(S.selected) }
function updateQualityBadge() { $('qualityBadge').textContent = 'Vetorial · ±' + fmtTol(QUALITY_TOL[S.quality]) + ' mm' }
function bindControls() {
  $('nameSection').ontoggle = () => {
    if (!$('nameSection').open) $('printbarSuggestions').classList.add('hidden');
  };
  $('cornerRadius').oninput = () => {
    S.cornerRadius = +$('cornerRadius').value;
    $('cornerValue').textContent = fmt(S.cornerRadius) + ' mm';
    scheduleRebuild();
  };
  $('closeBackTools').onclick = () => setView('front');
  $('backScale').oninput = () => {
    S.backScale = +$('backScale').value;
    $('backScaleValue').textContent = S.backScale + '%';
    scheduleRebuild();
  };
  $('moveBack').onclick = () => {
    if (['smooth','through'].includes(S.back)) { S.back = 'inlay'; updateControls(); scheduleRebuild(true) }
    setView('back');
    const center = pieceCenter(), r = $('viewport').getBoundingClientRect();
    if (model) {
      camera.cx = center.x; camera.cy = center.y; camera.panX = camera.panY = 0;
      const b = model.regions.bounds;
      camera.scale = Math.min(r.width / (b.width * 1.4), r.height / (b.height * 2), 20);
    }
    $('viewport').scrollIntoView({block:'nearest'});
    requestRender();
  };
  $('centerBack').onclick = () => { S.backX = S.backY = 0; scheduleRebuild(true) };
  $('backText').oninput = () => { S.backText = $('backText').value; scheduleRebuild() };
  [['letterRound', 'letterRound'], ['roundAmount', 'roundAmount'], ['textWeight', 'textWeight'], ['letterSpacing', 'letterSpacing'], ['borderWidth', 'border'], ['bodyThickness', 'bodyThickness'], ['letterHeight', 'letterHeight'], ['outlineWidth', 'outlineWidth'], ['nameSize', 'nameSize'], ['ringOuter', 'ringOuter'], ['ringInner', 'ringInner'], ['smallHole', 'holeArea']].forEach(([id, key]) => $(id).addEventListener('input', () => { S[key] = +$(id).value; if (key === 'ringInner' && S.ringInner > S.ringOuter - 2) { S.ringInner = S.ringOuter - 2; $('ringInner').value = S.ringInner } if (key === 'ringOuter' && S.ringOuter < S.ringInner + 2) { S.ringInner = S.ringOuter - 2; $('ringInner').value = S.ringInner } updateRangeLabels(); scheduleRebuild(); if (key === 'textWeight' || key === 'letterSpacing' || key === 'nameSize' || key === 'letterRound') scheduleScan() }));
  [['hasOutline', 'outline'], ['fillHoles', 'fillHoles'], ['fillLetterHoles', 'fillLetterHoles'], ['hasRing', 'hasRing'], ['ringReinforce', 'ringReinforce'], ['roundBase', 'roundBase'], ['roundBack', 'roundBack']].forEach(([id, key]) => $(id).addEventListener('change', () => { S[key] = $(id).checked; updateRangeLabels(); scheduleRebuild(); if (key === 'outline') { if (pickerPart === 'outline') pickerPart = null; renderFilaChips(); renderPicker(); updatePrintBar() } }));
  [['baseColor', 'baseColor'], ['letterColor', 'letterColor'], ['outlineColor', 'outlineColor']].forEach(([id, key]) => $(id).addEventListener('input', () => { S[key] = $(id).value; S.filaments[PARTS.find(p => p[2] === key)[0]] = null; refreshMeshColors(); requestRender(); renderFilaChips(); renderPicker(); updatePrintBar() }));
  for (const key of ['letters', 'base', 'ring', 'print']) $('tab' + key[0].toUpperCase() + key.slice(1)).onclick = () => selectTab(key);
  bindCards();
  $('editBack').onclick = () => setView(Math.cos(camera.yaw) < 0 ? 'front' : 'back'); $('btnFlip').onclick = () => setView(Math.cos(camera.yaw) < 0 ? 'front' : 'back');
  $('resetCam').onclick = () => { camera.yaw = .23; camera.pitch = -.32; requestRender() };
  $('btnFit').onclick = () => { if (S.plateView) selectTab('letters'); fitCamera(); requestRender() };
  $('btnPlate').onclick = () => revealOnPlate(activePiece);
  $('autoRing').onclick = () => { S.ringManual = false; scheduleRebuild(true) };
  $('printer').onchange = () => { S.printer = $('printer').value; changePlateSize() };
  for (const [id, axis] of [['plateWidth', 0], ['plateDepth', 1]]) $(id).onchange = () => {
    const field = $(id);
    field.value = Math.min(1000, Math.max(30, Math.round(field.valueAsNumber || PLATE_SIZES.custom[axis])));
    PLATE_SIZES.custom[axis] = +field.value;
    changePlateSize();
  };
  $('printMode').onchange = () => {
    S.printMode = $('printMode').value;
    $('printModeNotice').classList.toggle('hidden', S.printMode !== 'sequential');
    plateChanged();
  };
  $('quality').onchange = () => { S.quality = $('quality').value; updateQualityBadge(); scheduleRebuild(true) };
  $('copyTop').oninput = () => {
    const piece = selectedPlacement()?.piece || activePiece;
    if (!piece) return;
    const state = pieceState(piece);
    state.copies = Math.max(1, Math.min(40, Math.round(+$('copyTop').value) || 1));
    for (const index of piece.placements.keys()) if (index >= state.copies) piece.placements.delete(index);
    if (plateSelection?.piece === piece && plateSelection.index >= state.copies) setPlateSelection(null);
    plateChanged();
  };
  $('copyTop').onchange = () => { const piece = selectedPlacement()?.piece || activePiece; $('copyTop').value = piece ? pieceState(piece).copies : '' };
  updateRingMenu(); bindRingMenu(); bindPartMenu(); bindPlateControls(); bindPieceTools();
  $('importFont').onclick = () => $('fontFile').click();
  $('testPlate').onclick = () => exportTestPlate();
  $('fontRestore').onclick = () => chooseFont(activePiece.chosenFont || 'Pacifico');
  $('fontPrev').onclick = () => stepFont(-1); $('fontNext').onclick = () => stepFont(1);

  document.addEventListener('keydown', e => { if (!fontMode || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; if (e.key === 'Escape') setFontMode(false); if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { stepFont(1); e.preventDefault() } if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { stepFont(-1); e.preventDefault() } });
  $('fontFile').onchange = async () => { const f = $('fontFile').files[0]; $('fontFile').value = ''; if (f) await importFont(f) };
  bindViewCube();
}
// Estilos de letra (exemplos prontos): direitas · pontas redondas · aresta suave · almofada (alta e abaulada).
function currentStyle() { return S.letterStyle !== 'flat' ? S.letterStyle : S.letterRound > 0 ? 'tips' : 'flat' }
function setLetterStyle(v) {
  const was = S.letterStyle;
  if (v === 'puffy') { if (was !== 'puffy') { S._heightBefore = S.letterHeight; S._tipBefore = S.letterRound } S.letterStyle = 'puffy'; S.letterHeight = Math.max(S.letterHeight, 1.6); S.letterRound = 0 }
  else {
    if (was === 'puffy' && S._heightBefore) { S.letterHeight = S._heightBefore; S.letterRound = S._tipBefore || 0 }
    S.letterStyle = v === 'soft' ? 'soft' : 'flat';
    if (v === 'flat') S.letterRound = 0; else if (v === 'tips') S.letterRound = 0;
  }
  S.roundTop = false; updateControls(); updateRangeLabels(); scheduleRebuild(true);
}
let partMenuFor = null;
function updatePartMenu() {
  const cur = currentStyle(); for (const b of document.querySelectorAll('.stylecard[data-style]')) b.classList.toggle('on', b.dataset.style === cur);
  for (const b of document.querySelectorAll('.stylecard[data-base]')) b.classList.toggle('on', (b.dataset.base === '1') === !!S.roundBase);
  const m = $('partMenu'), on = (partMenuFor === 'letters' || partMenuFor === 'base') && S.selected === partMenuFor && !S.plateView;
  m.classList.toggle('hidden', !on); $('viewport').classList.toggle('partMenuOn', on);
  updatePieceTools();
  if (on) { $('pmTitle').textContent = partMenuFor === 'letters' ? 'Letras' : 'Base'; $('pmLetters').style.display = partMenuFor === 'letters' ? '' : 'none'; $('pmBase').style.display = partMenuFor === 'base' ? '' : 'none' }
}
function bindPartMenu() {
  const m = $('partMenu'); for (const t of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'click', 'touchstart']) m.addEventListener(t, e => e.stopPropagation());
  for (const b of document.querySelectorAll('.stylecard[data-style]')) b.onclick = () => setLetterStyle(b.dataset.style);
  for (const b of document.querySelectorAll('.stylecard[data-base]')) b.onclick = () => { S.roundBase = b.dataset.base === '1'; updateControls(); updateRangeLabels(); scheduleRebuild(true) };
  $('pmClose').onclick = () => { partMenuFor = null; updatePartMenu() };
}
function updateRangeLabels() { updatePartMenu(); $('roundAmountVal').textContent = fmt(S.roundAmount) + ' mm'; $('roundBaseBox').classList.toggle('hidden', !S.roundBase); $('borderVal').textContent = fmt(S.border) + ' mm'; $('bodyVal').textContent = fmt(S.bodyThickness) + ' mm'; $('heightVal').textContent = fmt(S.letterHeight) + ' mm'; $('outlineVal').textContent = fmt(S.outlineWidth) + ' mm'; $('nameSizeVal').textContent = S.nameSize + '%'; $('outerVal').textContent = fmt(S.ringOuter) + ' mm'; $('innerVal').textContent = fmt(S.ringInner) + ' mm'; $('holeVal').textContent = fmt(S.holeArea) + ' mm²'; $('tipVal').textContent = S.letterRound.toFixed(2).replace('.', ',') + ' mm'; $('weightVal').textContent = (S.textWeight >= 0 ? '+' : '') + S.textWeight.toFixed(2).replace('.', ',') + ' mm'; $('spacingVal').textContent = (S.letterSpacing > 0 ? '+' : '') + S.letterSpacing + '%'; $('outlineControls').classList.toggle('hidden', !S.outline) }

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
  if (!m || m.type === 'ping') return;
  try {
    if (m.type === 'font') { raw[m.name] = m.buffer; delete fonts[m.name]; self.postMessage({ id: m.id, ok: true }); return; }
    if (m.type === 'check') { opentype.parse(m.buffer); self.postMessage({ id: m.id, ok: true }); return; }
    if (m.type === 'minScale') { self.postMessage({ id: m.id, ok: true, result: SparrowModel.minScaleFor(m.S, getFont(m.S.font)) }); return; }
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
        regions: { text: R.letters, base: R.base, outline: R.outline, back: R.back, backX: R.backX, backY: R.backY, ring: R.ring, ringOverlap: R.ringOverlap, print: R.print, bounds: R.bounds } } }, transfer);
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
      if (msg.type === 'minScale') { resolve(SparrowModel.minScaleFor(msg.S, getF(msg.S.font))); return }
      if (msg.type === 'scan') { const out = {}; for (const n of msg.names) out[n] = SparrowModel.scanFont(msg.S, getF(n)); resolve(out); return }
      const res = SparrowModel.build(msg.S, { front: getF(msg.S.font) }, msg.quality), R = res.regions;
      resolve({ parts: res.parts, union: msg.union ? res.unionMesh() : null, height: res.height, zShift: res.zShift, timing: res.timing, regions: { text: R.letters, base: R.base, outline: R.outline, back: R.back, backX: R.backX, backY: R.backY, ring: R.ring, ringOverlap: R.ringOverlap, print: R.print, bounds: R.bounds } });
    } catch (e) { reject(e) }
  }, 0));
}
function geometryState(state = S) {
  const k = ['name', 'font', 'roundTop', 'letterStyle', 'roundBase', 'roundBack', 'roundAmount', 'letterRound', 'textWeight', 'letterSpacing', 'nozzle', 'shape', 'cornerRadius', 'front', 'back', 'backText', 'backScale', 'backX', 'backY', 'outline', 'outlineWidth', 'border', 'letterHeight', 'bodyThickness', 'nameSize', 'backColor', 'baseColor', 'letterColor', 'outlineColor', 'hasRing', 'ringOuter', 'ringInner', 'ringManual', 'ringX', 'ringY', 'ringReinforce', 'fillHoles', 'fillLetterHoles', 'holeArea'];
  const o = {}; for (const key of k) o[key] = state[key]; return o;
}

// ---------------------------------------------------------------- reconstrução
let building = false, buildAgain = false, interactiveBuild = false, ringDragging = false;
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
  if (!activePiece) return;
  if (building) { buildAgain = true; return }
  building = true; buildAgain = false;
  let quality = interactiveBuild ? (ringDragging ? 'draft' : (S.quality === 'fine' || S.quality === 'ultra') ? 'normal' : S.quality) : S.quality;
  if (!worker && quality === 'ultra') quality = 'fine';   // modo compatível: «Muito fina» só na exportação
  const piece = activePiece, state = geometryState();
  $('overlayStatus').textContent = 'A calcular geometria vetorial…';
  try {
    const r = await geometryCall({ type: 'build', S: state, quality });
    if (buildAgain || piece !== activePiece) return;
    applyModel(r, quality, state);
  } catch (err) { console.error(err); $('qualityNotice').textContent = 'Erro na geração: ' + err.message.split('\n')[0]; $('qualityNotice').classList.add('warn') }
  finally { building = false; if (buildAgain) { buildAgain = false; scheduleRebuild(true) } }
}
function applyModel(r, quality, state) {
  releaseMeshBuffers();
  model = r;
  if (!S.ringManual && r.regions.ring) { S.ringX = r.regions.ring.x; S.ringY = r.regions.ring.y }
  components = r.parts.map(p => ({ ...p, color: partColor(p.id) }));
  uploadMeshBuffers();
  activePiece.model = model; activePiece.components = components; activePiece.previewKey = previewKey(state, quality);
  const total = components.reduce((s, c) => s + c.mesh.triangleCount, 0), b = r.regions.bounds || { width: 0, height: 0 };
  $('triangleBadge').textContent = total.toLocaleString('pt-PT') + ' triângulos';
  $('sizeBadge').textContent = `${fmt(b.width)} × ${fmt(b.height)} × ${fmt(r.height)} mm`;
  $('tagMeasures').textContent = 'Tag atual · ' + $('sizeBadge').textContent;
  let msg = `Geometria vetorial · desvio ≤ ${fmtTol(QUALITY_TOL[quality])} mm · ${components.length} partes fechadas · ${r.timing.regions + r.timing.meshes} ms`;
  if (quality !== S.quality) msg = interactiveBuild ? 'Pré-visualização rápida durante o arrasto…' : `Pré-visualização em «Fina»; a exportação usa «${QUALITY_LABEL[S.quality]}».`;
  if (S.front === 'raised' && S.back === 'raised') msg = '⚠ Relevo nas duas faces: a orientação pode exigir suportes ou impressão em partes.';
  if (S.back === 'through') msg = '⚠ Letras passantes: exige troca de filamento em muitas camadas.';
  const ri = S.hasRing && r.regions.ring;
  if (ri && ri.status === 'solta') msg = '⚠ A argola está solta da peça! Arrasta a bola para cima da base ou carrega em «◎ Reposicionar automaticamente».';
  else if (ri && ri.status === 'fraca') msg = `⚠ Argola frágil: só ${Math.round(ri.frac * 100)}% da bola está em cima da peça — vai partir com o peso das chaves. Arrasta-a mais para dentro (≥ 30%) ou usa «◎ Reposicionar».`;
  else if (ri && ri.holeCuts) msg = '⚠ O furo da argola corta letras. Arrasta a argola para outra zona.';
  $('qualityNotice').textContent = msg; $('qualityNotice').classList.toggle('warn', msg.startsWith('⚠'));
  $('overlayStatus').textContent = msg.startsWith('⚠') ? msg : `Modelo 3D · ${fmt(S.bodyThickness)} mm de base`;
  updatePrintCheck(); updateRingCheck();
  plateChanged();
  if (autoFitAfterRebuild) { fitCamera(); autoFitAfterRebuild = false }
  requestRender();
}
// Os avisos de geometria usam 0,4 mm como referência. O bico real escolhe-se no slicer.
function updatePrintCheck() {
  const p = model && model.regions.print; if (!p) return;
  const el = $('printCheck');
  el.className = 'printcheck' + (p.status === 'ok' ? ' hidden' : ' ' + p.status);
  const problems = [];
  if (p.stroke > 0.02) problems.push(`${Math.round(p.stroke * 100)}% do traço é mais fino que o bico`);
  if (p.gap > 0.015) problems.push('há espaços mais estreitos que o bico');
  el.textContent = `⚠ Estimativa para bico de ${fmt2(S.nozzle)} mm: ${problems.join(' e ')}. Experimenta aumentar o nome ou escolher outra fonte.`;
}
function updateRingCheck() {
  const el = $('ringCheck'), ri = model && model.regions.ring;
  if (!S.hasRing || !ri) { el.className = 'printcheck hidden'; return }
  const pct = Math.round(ri.frac * 100), cls = ri.status === 'ok' && !ri.holeCuts ? 'ok' : ri.status === 'ok' ? 'aviso' : 'mau';
  let html = ri.status === 'solta' ? '✗ <b>Argola solta</b>: não está ligada à peça.' : ri.status === 'fraca' ? `⚠ <b>Ligação frágil</b>: só ${pct}% da bola assenta na peça.` : `✓ <b>Ligação segura</b>: ${pct}% da bola assenta na peça${S.ringReinforce && ri.web > 0.05 ? ', com reforço' : ''}.`;
  if (ri.status !== 'ok') html += ' Arrasta a bola mais para dentro da base (ideal 30–50%) ou carrega em «◎ Reposicionar automaticamente».';
  if (ri.holeCuts) html += ' ⚠ O furo corta letras.'; else if (ri.cover > .03) html += ' ⚠ A argola tapa parte das letras.';
  if (ri.wall < 1.6) html += ` ⚠ Parede da argola fina (${fmt(ri.wall)} mm): aumenta o diâmetro exterior ou diminui o furo.`;
  el.className = 'printcheck ' + cls; el.innerHTML = html;
}
// Etiqueta junto à argola no ecrã: ensina a arrastar e mostra o aviso de fragilidade.
let ringTagUntil = Date.now() + 15000, ringDragged = false;
// Menu da argola no próprio ecrã (toca na argola): tamanho e repor posição — essencial no telemóvel, onde o painel fica fora de vista.
let ringMenuClosed = true;
function updateRingMenu() {
  const m = $('ringMenu'); if (!m) return;
  m.classList.toggle('hidden', ringMenuClosed);
  $('rmSize').value = S.ringOuter;
  $('rmInner').max = Math.min(5.5, S.ringOuter - 2);
  $('rmInner').value = S.ringInner;
  $('rmVal').textContent = fmt(S.ringOuter) + ' mm';
  $('rmInnerVal').textContent = fmt(S.ringInner) + ' mm';
  $('rmEnabled').checked = S.hasRing;
  $('rmReinforce').checked = S.ringReinforce;
}
function bindRingMenu() {
  for (const [id, key] of [['rmSize','ringOuter'],['rmInner','ringInner']]) {
    $(id).oninput = () => {
      S[key] = +$(id).value;
      S.ringInner = Math.min(S.ringInner, S.ringOuter - 2);
      updateControls(); updateRingMenu(); scheduleRebuild();
    };
  }
  for (const [id,key] of [['rmEnabled','hasRing'],['rmReinforce','ringReinforce']]) {
    $(id).onchange = () => { S[key] = $(id).checked; updateControls(); scheduleRebuild(); };
  }
  for (const [button,slider,delta] of [['rmMinus','rmSize',-1],['rmPlus','rmSize',1],['rmInnerMinus','rmInner',-1],['rmInnerPlus','rmInner',1]]) {
    $(button).onclick = () => {
      const input = $(slider);
      if (delta > 0) input.stepUp(); else input.stepDown();
      input.oninput();
    };
  }
  $('rmReset').onclick = () => { S.ringManual = false; scheduleRebuild(true); };
  $('rmClose').onclick = () => { ringMenuClosed = true; updateRingMenu(); };
}
function updateRingTag() {
  updateRingMenu();
  const tag = $('ringTag'), ri = model && model.regions.ring;
  if (!tag || !S.hasRing || !ri || !gl && !fallbackCtx) { tag && tag.classList.add('hidden'); return }
  if (ringGhost) { const pos = activePosition(), p = project(ringGhost.x + pos.x, ringGhost.y + pos.y + S.ringOuter / 2 + 1, (model.zShift || 0) + S.bodyThickness); tag.style.left = p.x + 'px'; tag.style.top = p.y + 'px'; tag.className = 'ringtag ' + (ringGhost.status === 'ok' ? '' : ringGhost.status === 'tapa' ? 'fraca' : ringGhost.status); tag.textContent = ringGhost.status === 'ok' ? `✓ ${Math.round(ringGhost.frac * 100)}% na peça — solta aqui` : ringGhost.status === 'fraca' ? `⚠ só ${Math.round(ringGhost.frac * 100)}% na peça — frágil` : ringGhost.status === 'tapa' ? '⚠ a argola tapa letras' : '✗ fora da peça'; return }
  const weak = ri.status !== 'ok', show = weak; // só avisa quando a argola está frágil/solta; o resto explica-se no cartão inicial
  if (!show || Math.cos(camera.yaw) < 0) { tag.classList.add('hidden'); return }
  const pos = activePosition();
  if (!pos || S.plateView) { tag.classList.add('hidden'); return }
  const p = project(ri.x + pos.x, ri.y + pos.y + S.ringOuter / 2 + 1, (model.zShift || 0) + S.bodyThickness);
  tag.style.left = p.x + 'px'; tag.style.top = p.y + 'px';
  tag.className = 'ringtag ' + (weak ? ri.status : '');
  tag.textContent = ri.status === 'solta' ? '⚠ argola solta — arrasta-a para a peça' : ri.status === 'fraca' ? '⚠ argola frágil — arrasta-a para dentro' : '◉ arrasta a argola';
}
setInterval(() => { if (!ringDragged && Date.now() > ringTagUntil) updateRingTag() }, 1000);
function partColor(id, state = S) { return { base: state.baseColor, letters: state.letterColor, outline: state.outlineColor, back: state.backColor || state.letterColor }[id] }
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
  // Material por filamento: Basic (acetinado), Matte (baço), Silk (brilho sedoso), PETG (brilhante).
  const f = glCompile(gl.FRAGMENT_SHADER, `precision mediump float;varying vec3 vNormal,vColor;uniform vec3 uMat;uniform vec4 uTint;
  void main(){vec3 n=normalize(vNormal);vec3 L=normalize(vec3(-.35,.45,.82)),L2=normalize(vec3(.6,-.3,.5));
  float d=max(0.0,dot(n,L))*.75+max(0.0,dot(n,L2))*.25;float hemi=.5+.5*n.y;
  float s=pow(max(0.0,dot(reflect(-L,n),vec3(0,0,1))),uMat.y)*uMat.x;float rim=pow(1.0-max(0.0,n.z),3.0)*uMat.z;
  vec3 c=mix(vColor,uTint.rgb,uTint.a);gl_FragColor=vec4(c*(.42+.18*hemi+.48*d)+vec3(s+rim*.25),1.0);}`);
  shader = gl.createProgram(); gl.attachShader(shader, v); gl.attachShader(shader, f); gl.linkProgram(shader); if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(shader));
  for (const [k, name] of Object.entries({ position: 'aPosition', normal: 'aNormal', color: 'aColor' })) attrib[k] = gl.getAttribLocation(shader, name);
  for (const [k, name] of Object.entries({ yaw: 'uYaw', pitch: 'uPitch', scale: 'uScale', distance: 'uDistance', viewport: 'uViewport', pan: 'uPan', offset: 'uOffset', center: 'uModelCenter', mat: 'uMat', tint: 'uTint' })) uniform[k] = gl.getUniformLocation(shader, name);
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
function releaseMeshBuffers(meshes = components) { if (gl) for (const c of meshes) if (c.glBuffer) gl.deleteBuffer(c.glBuffer) }
function packRaw(vertices, col) { const arr = new Float32Array(vertices.length * 9), c = rgb(col); for (let k = 0; k < vertices.length; k++) { const p = vertices[k]; arr.set([p[0], p[1], p[2], p[3] || 0, p[4] || 0, p[5] || 1, c[0], c[1], c[2]], k * 9) } return arr }
function makeBuffer(data) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return { buf: b, n: data.length / 9 } }
function rebuildBed() {
  if (!gl) return; if (plateBuffer) gl.deleteBuffer(plateBuffer.buf); if (gridBuffer) gl.deleteBuffer(gridBuffer.buf);
  const hw = plateW() / 2, hh = plateH() / 2, z = -1.3; plateBuffer = makeBuffer(packRaw([[-hw, -hh, z], [hw, -hh, z], [hw, hh, z], [-hw, -hh, z], [hw, hh, z], [-hw, hh, z]], '#1e3345'));
  const lines = [], line = (a, b) => { lines.push([...a, 0, 0, 1], [...b, 0, 0, 1]) };
  for (let p = 0; p <= hw + 1e-6; p += 10) for (const q of p ? [p, -p] : [0]) line([q, -hh, z + .05], [q, hh, z + .05]);
  for (let p = 0; p <= hh + 1e-6; p += 10) for (const q of p ? [p, -p] : [0]) line([-hw, q, z + .05], [hw, q, z + .05]);
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]; for (let i = 0; i < 4; i++) line([...pts[i], z + .08], [...pts[(i + 1) % 4], z + .08]);
  gridBuffer = makeBuffer(packRaw(lines, '#41607b'));
}
// Escala do canvas: px do dispositivo por px CSS. O V4 usava `devicePixelRatio||1>2?2:…`, que dava
// sempre 2: num ecrã 1× o modelo era desenhado a dobrar e o zoom/clique não coincidiam com o cursor.
function pixelRatio() { return Math.min(window.devicePixelRatio || 1, 2) }
function resizeCanvas() { const r = $('viewport').getBoundingClientRect(), ratio = pixelRatio(); $('gl').width = Math.max(1, Math.round(r.width * ratio)); $('gl').height = Math.max(1, Math.round(r.height * ratio)); if (gl) gl.viewport(0, 0, $('gl').width, $('gl').height) }
function bindBufferAndDraw(buffer, n, mode, offset) { if (!buffer) return; gl.bindBuffer(gl.ARRAY_BUFFER, buffer); const stride = 36; for (const [key, i] of [['position', 0], ['normal', 3], ['color', 6]]) { gl.enableVertexAttribArray(attrib[key]); gl.vertexAttribPointer(attrib[key], 3, gl.FLOAT, false, stride, i * 4) } gl.uniform2f(uniform.offset, offset[0], offset[1]); gl.drawArrays(mode, 0, n) }
function requestRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render3D() }) }
function materialFor(id, state = S) {
  const f = state.filaments[id === 'back' ? 'letters' : id], sr = f ? f.series : '';
  if (/Silk/i.test(sr)) return [.55, 36, .9];
  if (/Matte/i.test(sr)) return [.02, 8, .15];
  if (/PETG/i.test(sr)) return [.35, 60, .4];
  return [.14, 24, .3];
}
function render3D() {
  if (!gl || !shader) { renderFallback(); return }
  const c = $('gl'), ratio = c.width / Math.max(1, c.clientWidth);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(shader);
  gl.uniform1f(uniform.yaw, camera.yaw); gl.uniform1f(uniform.pitch, camera.pitch); gl.uniform1f(uniform.scale, camera.scale * ratio);
  gl.uniform1f(uniform.distance, PERSPECTIVE); gl.uniform2f(uniform.viewport, c.width, c.height); gl.uniform2f(uniform.pan, camera.panX * ratio, camera.panY * ratio); gl.uniform3f(uniform.center, camera.cx, camera.cy, camera.cz);
  gl.uniform3f(uniform.mat, .05, 16, 0); gl.uniform4f(uniform.tint, 0, 0, 0, 0);
  if (Math.cos(camera.yaw) > -.18) { bindBufferAndDraw(plateBuffer && plateBuffer.buf, plateBuffer && plateBuffer.n, gl.TRIANGLES, [0, 0]); bindBufferAndDraw(gridBuffer && gridBuffer.buf, gridBuffer && gridBuffer.n, gl.LINES, [0, 0]) }
  for (const pos of objectPositions()) for (const m of (pos.piece === activePiece ? components : pos.piece.components)) if (m.glBuffer) { const mt = materialFor(m.id, pieceState(pos.piece)); gl.uniform3f(uniform.mat, mt[0], mt[1], mt[2]); bindBufferAndDraw(m.glBuffer, m.vertexCount, gl.TRIANGLES, [pos.x, pos.y]) }
  // Argola «fantasma» durante o arrasto: desenhada direto na GPU, segue o cursor sem recalcular a peça.
  if (S.plateView && plateSelection) {
    const selected = objectPositions().find(p => p.piece === plateSelection.piece && p.index === plateSelection.index);
    if (selected) {
      gl.uniform4f(uniform.tint, .15, .62, 1, .3);
      for (const mesh of selected.piece.components) bindBufferAndDraw(mesh.glBuffer, mesh.vertexCount, gl.TRIANGLES, [selected.x, selected.y]);
      gl.uniform4f(uniform.tint, 0, 0, 0, 0);
    }
  }
  if (ringGhost && ringGhostBuf) { const pos = activePosition(), st = ringGhost.status; gl.uniform3f(uniform.mat, .2, 30, .3); gl.uniform4f(uniform.tint, st === 'ok' ? .25 : 1, st === 'ok' ? .9 : st === 'solta' ? .3 : .75, st === 'ok' ? .45 : .15, .55); gl.disable(gl.DEPTH_TEST); bindBufferAndDraw(ringGhostBuf.buf, ringGhostBuf.n, gl.TRIANGLES, [pos.x + ringGhost.x, pos.y + ringGhost.y]); gl.enable(gl.DEPTH_TEST); gl.uniform4f(uniform.tint, 0, 0, 0, 0) }
  // Câmara da argola: desenha-se num canto, copia-se para o quadro fixo no topo e volta a desenhar-se a cena por cima.
  if (ringGhost && loupeOn) { if (!loupePass) { renderLoupe(c, ratio); loupePass = true; try { render3D() } finally { loupePass = false } return } } else $('loupe').classList.add('hidden');
  $('viewport').classList.toggle('loupeActive', !!(ringGhost && loupeOn));
  updateRingTag();
}
// Câmara secundária (lupa) durante o arrasto da argola com o dedo: vista de cima, ampliada, centrada
// na argola, no canto oposto ao dedo — o dedo deixa de tapar o sítio onde a argola vai ficar.
let loupeOn = false, loupePass = false, loupeFinger = { x: 0, y: 0 };
function renderLoupe(c, ratio) {
  // Lugar fixo: canto superior esquerdo do ecrã, por cima do título — nunca fica debaixo do dedo nem da palma.
  const size = Math.round(Math.min(150, innerWidth * 0.4, c.clientWidth, c.clientHeight)), ds = Math.round(size * ratio), dx = 0, dy = 0, pos = activePosition();
  const el = $('loupe'), cv = $('loupeCv'); el.classList.remove('hidden'); el.style.width = el.style.height = size + 'px';
  if (cv.width !== ds || cv.height !== ds) { cv.width = ds; cv.height = ds }
  gl.enable(gl.SCISSOR_TEST); gl.scissor(dx, dy, ds, ds); gl.viewport(dx, dy, ds, ds); gl.clearColor(.03, .06, .1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const zoom = Math.max(camera.scale * 2.2, size / (S.ringOuter * 4.2));
  gl.uniform1f(uniform.yaw, 0); gl.uniform1f(uniform.pitch, 0); gl.uniform1f(uniform.scale, zoom * ratio); gl.uniform2f(uniform.viewport, ds, ds); gl.uniform2f(uniform.pan, 0, 0);
  gl.uniform3f(uniform.center, pos.x + ringGhost.x, pos.y + ringGhost.y, 0);
  gl.uniform4f(uniform.tint, 0, 0, 0, 0);
  for (const mm of components) if (mm.glBuffer) { const mt = materialFor(mm.id); gl.uniform3f(uniform.mat, mt[0], mt[1], mt[2]); bindBufferAndDraw(mm.glBuffer, mm.vertexCount, gl.TRIANGLES, [pos.x, pos.y]) }
  const st = ringGhost.status; gl.uniform3f(uniform.mat, .2, 30, .3); gl.uniform4f(uniform.tint, st === 'ok' ? .25 : 1, st === 'ok' ? .9 : st === 'solta' ? .3 : .75, st === 'ok' ? .45 : .15, .55);
  gl.disable(gl.DEPTH_TEST); bindBufferAndDraw(ringGhostBuf.buf, ringGhostBuf.n, gl.TRIANGLES, [pos.x + ringGhost.x, pos.y + ringGhost.y]); gl.enable(gl.DEPTH_TEST);
  gl.uniform4f(uniform.tint, 0, 0, 0, 0); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, c.width, c.height); gl.clearColor(.052, .08, .123, 1);
  cv.getContext('2d').drawImage(c, 0, c.height - ds, ds, ds, 0, 0, ds, ds);
}

// Malha simples da argola (anel extrudido) para o arrasto em tempo real.
let ringGhost = null, ringGhostBuf = null, ringDragBase = null, ringDragText = null;
function buildRingGhost() {
  if (!gl) return; if (ringGhostBuf) gl.deleteBuffer(ringGhostBuf.buf);
  const ro = S.ringOuter / 2, ri = S.ringInner / 2, z0 = (model && model.zShift) || 0, z1 = z0 + S.bodyThickness, n = 64, v = [], c = rgb(S.baseColor);
  const push = (x, y, z, nx, ny, nz) => v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2]);
  for (let i = 0; i < n; i++) {
    const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    /* só a face de cima: é desenhada por cima de tudo, sem teste de profundidade */ for (const [z, nz] of [[z1 + .05, 1]]) { push(ro * c0, ro * s0, z, 0, 0, nz); push(ro * c1, ro * s1, z, 0, 0, nz); push(ri * c1, ri * s1, z, 0, 0, nz); push(ro * c0, ro * s0, z, 0, 0, nz); push(ri * c1, ri * s1, z, 0, 0, nz); push(ri * c0, ri * s0, z, 0, 0, nz) }
  }
  ringGhostBuf = makeBuffer(new Float32Array(v));
}
// Força da ligação calculada na página, ao vivo, contra a base sem argola (contornos simplificados).
function ghostStatus(x, y) {
  if (!ringDragBase) return 'ok';
  const ro = S.ringOuter / 2, disc = Math.PI * ro * ro, f = Math.abs(SparrowGeo.regionArea(SparrowGeo.intersection(SparrowGeo.circle(x, y, ro, .2, .35), ringDragBase))) / disc;
  ringGhost.frac = f; if (f * disc < .3) return 'solta'; if (f < .2) return 'fraca';
  ringGhost.cover = ringDragText ? Math.abs(SparrowGeo.regionArea(SparrowGeo.intersection(SparrowGeo.circle(x, y, ro, .2, .35), ringDragText))) / disc : 0;
  return ringGhost.cover > .03 ? 'tapa' : 'ok';
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
  return b ? { x: activePosition().x + (b.minX + b.maxX) / 2, y: activePosition().y + (b.minY + b.maxY) / 2, z: (model.height || 3) / 2 } : { x: activePosition().x, y: activePosition().y, z: 1.5 };
}
function fitCamera() {
  const r = $('viewport').getBoundingClientRect(); if (!r.width || !r.height) return;
  const b = model && model.regions.bounds;
  if (S.plateView) { camera.cx = 0; camera.cy = 0; camera.cz = 0 }
  else { const c = pieceCenter(); camera.cx = c.x; camera.cy = c.y; camera.cz = c.z }
  const width = S.plateView ? plateW() + 23 : Math.max(65, b ? b.width : 80) * 1.45, height = S.plateView ? plateH() + 23 : Math.max(33, b ? b.height : 40) * 1.9;
  const inset = S.plateView && moveToolsOpen && r.width >= 590 ? $('pieceTools').offsetWidth + 20 : 0;
  camera.scale = Math.max(.6, Math.min((r.width - inset) / width, r.height / height, 12));
  camera.panX = inset / 2;
  camera.panY = 0;
}
function setView(side) { $('editBack').textContent = side === 'back' ? '↻ Voltar à frente' : '↻ Ver verso'; $('backTools').classList.add('hidden'); camera.yaw = side === 'back' ? Math.PI : 0; camera.pitch = 0; $('btnFlip').innerHTML = '↻<span class="lbl"> ' + (side === 'front' ? 'Verso' : 'Frente') + '</span>'; $('btnFlip').title = side === 'front' ? 'Ver o verso' : 'Ver a frente'; requestRender() }
/**
 * Correção ao largar: ao levantar o dedo (ou soltar o botão) a ponta «rola» e os últimos ~100 ms
 * deslocam a argola uns milímetros. Usa-se a posição de ~100 ms antes de largar (60 ms com rato),
 * desde que esse movimento final seja pequeno (≤ 22 px no ecrã); um gesto intencional rápido conta.
 */
function releasePosition(d, upTime) {
  const h = d.hist; if (!h || h.length < 2) return null;
  const last = h[h.length - 1], tUp = upTime || performance.now(), windowMs = d.touch ? 110 : 60;
  // Amostras recentes perto do ponto final (≤ 22 px e ≤ 700 ms): é aí que pode estar o «rolar».
  const cand = [];
  for (let i = h.length - 1; i >= 0; i--) { const q = h[i]; if (tUp - q.t > 700 || Math.hypot(last.sx - q.sx, last.sy - q.sy) > 22) break; cand.push(i) }
  if (cand.length < 2) return null;
  // 1) Houve uma pausa (dedo parado ≥ 90 ms)? Fica a posição dessa pausa.
  // (Num aparelho lento os eventos já chegam espaçados; só conta como pausa um intervalo bem maior do que o habitual.)
  const gaps = []; for (let i = 1; i < h.length; i++) gaps.push(h[i].t - h[i - 1].t); gaps.sort((a, b) => a - b);
  const pause = Math.max(90, 2.5 * gaps[gaps.length >> 1]);
  for (const i of cand) if (i + 1 < h.length && h[i + 1].t - h[i].t >= pause) return { x: h[i].x, y: h[i].y };
  // 2) Sem pausa: ignora só os últimos ~100 ms (60 ms com rato).
  for (const i of cand) if (tUp - h[i].t >= windowMs) return { x: h[i].x, y: h[i].y };
  return null;
}
// Início do arrasto: a peça é recalculada (rascunho) SEM a argola e a argola passa a ser o fantasma na GPU.
function startRingGhost(d) {
  ringGhost = { x: S.ringX, y: S.ringY, status: 'ok', frac: 1 }; buildRingGhost();
  ringDragging = true; interactiveBuild = true;
  const st = geometryState(); st.hasRing = false;
  geometryCall({ type: 'build', S: st, quality: 'draft' }).then(r => {
    if (!ringGhost) return;
    ringDragBase = SparrowGeo.simplify(r.regions.base, .1); ringDragText = SparrowGeo.simplify(r.regions.text, .1);
    releaseMeshBuffers(); components = r.parts.map(p => ({ ...p, color: partColor(p.id) })); uploadMeshBuffers();
    ringGhost.status = ghostStatus(ringGhost.x, ringGhost.y); requestRender();
  }).catch(e => console.warn(e));
}
function endRingGhost() { loupeOn = false; ringGhost = null; ringDragBase = null; ringDragText = null; ringDragged = true }
function screenLocal(evt, z) { const rect = $('gl').getBoundingClientRect(), p = unproject(evt.clientX - rect.left, evt.clientY - rect.top, z); return p ? { x: p.x - activePosition().x, y: p.y - activePosition().y } : null }
function inRegion(paths, p) { return paths && paths.length && SparrowGeo.contains(paths, p.x, p.y) }
function hitsBackText(point) {
  if (!point) return false;
  const b = SparrowGeo.bounds(model.regions.back), pad = 3 / camera.scale;
  return point.x >= b.minX-pad && point.x <= b.maxX+pad && point.y >= b.minY-pad && point.y <= b.maxY+pad;
}
function selectAt(evt, extra = 0) {
  if (!model) return '';
  const back = Math.cos(camera.yaw) < 0, z = back ? 0 : (model.zShift || 0) + S.bodyThickness, p = screenLocal(evt, z); if (!p) return '';
  const R = model.regions;
  if (S.hasRing && Math.hypot(p.x - S.ringX, p.y - S.ringY) < S.ringOuter / 2 + 2 + extra) return 'ring';
  if (back && inRegion(R.back, p)) return 'letters';
  if (!back && (inRegion(R.text, p) || inRegion(R.outline, p))) return 'letters';
  if (inRegion(R.base, p)) return 'base';
  return '';
}

// ---------------------------------------------------------------- rato
// Esquerdo: rodar · Esquerdo + direito, direito, roda premida ou Shift+esquerdo: deslocar a VISTA (pan)
// Tabuleiro: arrastar uma peça para a mover. Roda: zoom em torno do cursor.
// Botões em event.buttons: esquerdo = 1, direito = 2, meio = 4; esquerdo+direito = 3.
function bindViewerEvents() {
  const canvas = $('gl');
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('auxclick', e => e.preventDefault());
  const startPan = d => {
    $('backGhost').classList.add('hidden');
    // Repõe o que o primeiro botão possa ter mexido antes de o segundo ser premido.
    if (d.kind === 'rotate') { camera.yaw = d.yaw; camera.pitch = d.pitch }
    if (d.kind === 'move' && d.moved) restorePlatePosition(d);
    if (d.kind === 'ring') { S.ringX = d.ringX; S.ringY = d.ringY; S.ringManual = d.ringManual; interactiveBuild = false; endRingGhost(); if (d.moved) scheduleRebuild(true) }
    d.kind = 'pan'; d.chord = true; canvas.parentElement.classList.add('dragging'); requestRender();
  };
  // Toque: 1 dedo roda / arrasta a argola / toca para selecionar; 2 dedos = aproximar/afastar + deslocar.
  const touches = new Map(); let touchLock = false;
  const pinchState = () => { const [a, b] = [...touches.values()], r = canvas.getBoundingClientRect(); return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left - r.width / 2, my: (a.y + b.y) / 2 - r.top - r.height / 2 } };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        $('backGhost').classList.add('hidden');
        const d = dragAction; if (d && d.kind !== 'pinch') { if (d.kind === 'move' && d.moved) restorePlatePosition(d); if (d.kind === 'rotate') { camera.yaw = d.yaw; camera.pitch = d.pitch } if (d.kind === 'ring') { S.ringX = d.ringX; S.ringY = d.ringY; S.ringManual = d.ringManual; endRingGhost(); scheduleRebuild(true) } }
        const p0 = pinchState(); dragAction = { kind: 'pinch', p0, s0: camera.scale, px: camera.panX, py: camera.panY, chord: true }; touchLock = true;
        try { canvas.setPointerCapture(e.pointerId) } catch (err) { }
        return;
      }
      if (touches.size > 2 || touchLock) return;
    }
    if (dragAction) { if ((e.buttons & 3) === 3 && dragAction.kind !== 'pan') startPan(dragAction); return }
    const both = (e.buttons & 3) === 3, left = e.button === 0 && !both;
    const point = S.plateView ? platePoint(e) : null;
    const hit = left && point ? plateHit(point) : null;
    const clicked = left && !S.plateView ? selectAt(e, e.pointerType === 'touch' ? 26 / camera.scale : 0) : '';
    $('backTools').classList.add('hidden');
    let kind = 'rotate';
    if (!left || e.shiftKey) kind = 'pan';
    else if (Math.cos(camera.yaw) < 0 && model?.regions.back.length &&
      (!hit || hit.piece === activePiece) && hitsBackText(screenLocal(e, 0))) kind = 'back';
    else if (S.plateView) {
      const ring = hit?.piece.model?.regions.ring;
      const atRing = ring && Math.hypot(point.x-hit.x-ring.x, point.y-hit.y-ring.y) <= pieceState(hit.piece).ringOuter/2 + 2;
      setPlateSelection(hit);
      kind = atRing || (hit && selectAt(e) === 'ring') ? 'ring' : hit ? 'move' : 'rotate';
    } else if (clicked === 'ring') kind = 'ring';
    ringMenuClosed = kind !== 'ring';
    updateRingMenu();
    dragAction = { touch: e.pointerType === 'touch', id: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, kind, clicked, backStart: kind === 'back' ? screenLocal(e,0) : null, backX: model?.regions.backX || 0, backY: model?.regions.backY || 0, yaw: camera.yaw, pitch: camera.pitch, hit, point, ringX: S.ringX, ringY: S.ringY, ringManual: S.ringManual, moved: false };
    canvas.setPointerCapture(e.pointerId);
    if (kind === 'pan') canvas.parentElement.classList.add('dragging');
  });
  // Um segundo botão premido durante um arrasto chega como pointermove (eventos «chorded») e como mousedown.
  canvas.addEventListener('mousedown', e => { if (dragAction && (e.buttons & 3) === 3 && dragAction.kind !== 'pan') startPan(dragAction) });
  let hoverT = 0;
  canvas.addEventListener('pointermove', e => {
    if (!dragAction && e.buttons === 0 && performance.now() - hoverT > 60) { hoverT = performance.now(); canvas.style.cursor = S.plateView ? (plateHit(platePoint(e)) ? 'move' : '') : selectAt(e) === 'ring' ? 'move' : fontMode ? 'ns-resize' : '' }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dragAction && dragAction.kind === 'pinch') {
        if (touches.size < 2) return;
        const d = dragAction, p = pinchState(), after = Math.min(80, Math.max(.3, d.s0 * p.d / d.p0.d)), k = after / d.s0;
        camera.panX = p.mx - (d.p0.mx - d.px) * k; camera.panY = p.my - (d.p0.my - d.py) * k; camera.scale = after; requestRender(); return;
      }
      if (touchLock) return;
      const rr = canvas.getBoundingClientRect(); loupeFinger = { x: e.clientX - rr.left, y: e.clientY - rr.top };
    }
    const d = dragAction; if (!d || e.pointerId !== d.id) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { endDrag(e); return }
    if ((e.buttons & 3) === 3 && d.kind !== 'pan') startPan(d);
    const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY; d.lastX = e.clientX; d.lastY = e.clientY;
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) { d.moved = true; if (d.kind === 'move') d.savedPlacements = pieces.map(piece => [piece, new Map(piece.placements)]); if (d.kind === 'ring') { ringDragged = true } }
    if (!d.moved) return;
    if (d.kind === 'pan') { camera.panX += dx; camera.panY += dy; requestRender() }
    else if (d.kind === 'ring') {
      let p = screenLocal(e, (model && model.zShift || 0) + S.bodyThickness);
      if (p) {
        if (!ringGhost) { startRingGhost(d); loupeOn = e.pointerType === 'touch' || window.SPARROW_LOUPE === true }
        // Dedo: amortece o tremor (média móvel exponencial curta, ~30 ms de atraso).
        if (e.pointerType === 'touch' && d.smooth) p = { x: d.smooth.x + (p.x - d.smooth.x) * 0.55, y: d.smooth.y + (p.y - d.smooth.y) * 0.55 };
        d.smooth = p;
        // Histórico com tempo, para corrigir o «rolar» do dedo ao largar.
        const now = e.timeStamp || performance.now(); (d.hist || (d.hist = [])).push({ t: now, x: p.x, y: p.y, sx: e.clientX, sy: e.clientY });
        if (d.hist.length > 40) d.hist.shift();   // por número, não por tempo: com o dedo parado não há eventos
        S.ringX = p.x; S.ringY = p.y; S.ringManual = true;
        ringGhost.x = p.x; ringGhost.y = p.y; ringGhost.status = ghostStatus(p.x, p.y); requestRender();
      }
    }
    else if (d.kind === 'back') {
      const p = screenLocal(e,0);
      if (p && d.backStart) {
        d.deltaX = p.x - d.backStart.x;
        d.deltaY = p.y - d.backStart.y;
        const ghost = $('backGhost');
        if (ghost.classList.contains('hidden')) {
          ghost.classList.remove('hidden');
          ghost.width = ghost.clientWidth; ghost.height = ghost.clientHeight;
          const ctx = ghost.getContext('2d'), origin = activePosition();
          ctx.beginPath();
          for (const path of model.regions.back) {
            path.forEach((v,i) => {
              const pt = project(origin.x + v.X / SparrowGeo.SCALE, origin.y + v.Y / SparrowGeo.SCALE, 0);
              if (i) ctx.lineTo(pt.x,pt.y); else ctx.moveTo(pt.x,pt.y);
            });
            ctx.closePath();
          }
          ctx.fillStyle = '#88d5ff'; ctx.fill('evenodd');
        }
        ghost.style.transform = 'translate('+(e.clientX-d.startX)+'px,'+(e.clientY-d.startY)+'px)';

      }
    }
    else if (d.kind === 'move') {
      const point = platePoint(e);
      if (point) movePlatePiece(d.hit, d.hit.x + point.x - d.point.x, d.hit.y + point.y - d.point.y);
    }
    else { camera.yaw += dx * .008; camera.pitch = Math.max(-1.1, Math.min(1.1, camera.pitch + dy * .008)); requestRender() }
  });
  const endDrag = e => {
    const d = dragAction; if (!d) return; dragAction = null; canvas.parentElement.classList.remove('dragging');
    if (d.kind === 'back') {
      $('backGhost').classList.add('hidden');
      if (d.moved) {
        S.backX = d.backX + (d.deltaX || 0);
        S.backY = d.backY + (d.deltaY || 0);
        scheduleRebuild(true);
      } else $('backTools').classList.remove('hidden');
      return;
    }
    if (!S.plateView && !d.moved && !d.chord) { partMenuFor = d.clicked || null; setFontMode(false); updatePartMenu() }
    if (d.kind === 'ring' && d.moved) {
      const fix = releasePosition(d, e && e.timeStamp); if (fix) { S.ringX = fix.x; S.ringY = fix.y }
      endRingGhost(); interactiveBuild = false; ringDragging = false; scheduleRebuild(true);
    }
  };
  const touchEnd = e => {
    if (e.pointerType !== 'touch') return false;
    touches.delete(e.pointerId);
    if (dragAction && dragAction.kind === 'pinch') { if (touches.size === 0) { dragAction = null; touchLock = false } return true }
    if (touches.size === 0) touchLock = false;
    return false;
  };
  canvas.addEventListener('pointerup', e => { if (touchEnd(e)) return; if (dragAction && e.pointerId === dragAction.id && e.buttons === 0) endDrag(e) });
  canvas.addEventListener('pointercancel', e => { if (touchEnd(e)) return; if (dragAction?.kind === 'move' && dragAction.moved) restorePlatePosition(dragAction); endDrag(e) });
  canvas.addEventListener('lostpointercapture', () => { if (dragAction && dragAction.kind !== 'pinch') endDrag() });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
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
  if (!fallbackCtx) return;
  const c = $('gl'), ctx = fallbackCtx, r = c.width / Math.max(1, c.clientWidth), back = Math.cos(camera.yaw) < 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d1520'; ctx.fillRect(0, 0, c.width, c.height); ctx.setTransform(r, 0, 0, r, 0, 0);
  const drawPaths = (paths, dx, dy, fill) => { if (!paths || !paths.length) return; ctx.beginPath(); for (const p of paths) p.forEach((q, i) => { const s = project(q.X / SparrowGeo.SCALE + dx, q.Y / SparrowGeo.SCALE + dy, 0); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y) }), ctx.closePath(); ctx.fillStyle = fill; ctx.fill('evenodd') };
  if (Math.cos(camera.yaw) > -.18) { const w = plateW() / 2 * 1e4, h = plateH() / 2 * 1e4; drawPaths([[{ X: -w, Y: -h }, { X: w, Y: -h }, { X: w, Y: h }, { X: -w, Y: h }]], 0, 0, '#1e3345') }
  for (const pos of objectPositions()) {
    const R = pos.piece.model.regions, state = pieceState(pos.piece);
    drawPaths(R.base, pos.x, pos.y, state.baseColor);
    if (back) drawPaths(R.back, pos.x, pos.y, state.back === 'engraved' ? '#16416b' : state.letterColor);
    else { drawPaths(R.outline, pos.x, pos.y, state.outlineColor); drawPaths(R.text, pos.x, pos.y, state.front === 'engraved' ? '#1b5684' : state.front === 'cutout' ? '#102030' : state.letterColor) }
  }
}

// ---------------------------------------------------------------- tabuleiro
const PLATE_MARGIN = 5;
const pieceGap = () => S.printMode === 'sequential' ? 32 : 6;
const EXAMPLE_NAMES = ['Ana', 'André', 'Beatriz', 'Carolina', 'David', 'Diogo', 'Filipe', 'Francisco', 'Inês', 'João', 'Leonor', 'Madalena', 'Manuel', 'Maria', 'Mariana', 'Miguel', 'Pedro', 'Rodrigo', 'Sofia', 'Tiago'];
const pieces = [];
let activePiece = makePiece();
let platePage = 0, plateSelection = null, cachedPlan = null, moveToolsOpen = false, removedPiece = null;

function makePiece(state = null) {
  const piece = { state, model: null, components: [], placements: new Map(), previewKey: null };
  pieces.push(piece);
  return piece;
}
function pieceState(piece) { return piece === activePiece ? S : piece.state }
function editableState() {
  return { ...geometryState(), copies: S.copies, slots: { ...S.slots }, filaments: { ...S.filaments }, _heightBefore: S._heightBefore, _tipBefore: S._tipBefore };
}
function previewKey(state, quality) {
  const keys = geometryState(state);
  if (!keys.ringManual) keys.ringX = keys.ringY = 0;
  return JSON.stringify([keys, quality]);
}
async function refreshInactivePiece(piece, state, quality) {
  const key = previewKey(state, quality);
  if (key === piece.previewKey) return;
  try {
    const result = await geometryCall({ type: 'build', S: state, quality });
    if (piece === activePiece || piece.state !== state || !pieces.includes(piece)) return;
    releaseMeshBuffers(piece.components);
    piece.model = result;
    piece.components = result.parts.map(part => ({ ...part, color: partColor(part.id, state) }));
    piece.components.forEach(uploadOneMesh);
    piece.previewKey = key;
    plateChanged();
  } catch (error) {
    console.error(error);
    $('qualityNotice').textContent = 'Erro na geração de «' + state.name + '»: ' + error.message.split('\n')[0];
  }
}
function activatePiece(piece, tab = 'letters') {
  if (piece !== activePiece) {
    pendingNamePiece = null;
    $('nameNotice').textContent = '';
    const previous = activePiece;
    if (previous) previous.state = editableState();
    activePiece = piece;
    showExampleName = false;
    if (previous) refreshInactivePiece(previous, previous.state, S.quality);
    Object.assign(S, piece.state);
    model = piece.model;
    components = piece.components;
    pickerPart = null;
    clearTimeout(fontSettle);
    interactiveBuild = false;
    ++scanSeq;
    fontScan = {};
    updateControls();
    scheduleRebuild(true);
    scheduleScan();
    autoFitAfterRebuild = tab !== 'plate';
  }
  selectTab(tab);
}

function fitsPlate(placement, neighbors, width = plateW(), height = plateH(), gap = pieceGap()) {
  const { left, right, top, bottom } = placement;
  if (left < -width / 2 + PLATE_MARGIN - 1e-6 || right > width / 2 - PLATE_MARGIN + 1e-6 ||
      bottom < -height / 2 + PLATE_MARGIN - 1e-6 || top > height / 2 - PLATE_MARGIN + 1e-6) return false;
  return neighbors.every(p => right + gap <= p.left + 1e-6 || p.right + gap <= left + 1e-6 ||
    top + gap <= p.bottom + 1e-6 || p.top + gap <= bottom + 1e-6);
}
function place(piece, index, bounds, x, y, plate) {
  return { piece, index, x, y, plate, left: x + bounds.minX, right: x + bounds.maxX, top: y + bounds.maxY, bottom: y + bounds.minY };
}
function arrangePiece(piece, index, bounds, neighbors, plate, width, height, gap) {
  const left = -width / 2 + PLATE_MARGIN - bounds.minX, top = height / 2 - PLATE_MARGIN - bounds.maxY;
  const xs = [left, ...neighbors.map(p => p.right + gap - bounds.minX)];
  const ys = [top, ...neighbors.map(p => p.bottom - gap - bounds.maxY)];
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => b - a);
  for (const y of ys) {
    for (const x of xs) {
      const candidate = place(piece, index, bounds, x, y, plate);
      if (fitsPlate(candidate, neighbors, width, height, gap)) return candidate;
    }
  }
  return null;
}
function layoutPlan(models, states, placements, { plateW: width, plateH: height, gap }) {
  const plates = [[]], pending = [], oversized = new Set();
  for (const [piece, result] of models) {
    const bounds = result?.regions.bounds;
    if (!bounds) continue;
    if (bounds.width > width - 2 * PLATE_MARGIN || bounds.height > height - 2 * PLATE_MARGIN) {
      oversized.add(piece);
      continue;
    }
    const copies = states.get(piece).copies;
    for (let index = 0; index < copies; index++) {
      const manual = placements.get(piece).get(index);
      if (manual) {
        const candidate = place(piece, index, bounds, manual.x, manual.y, manual.plate);
        if (fitsPlate(candidate, plates[manual.plate] || [], width, height, gap)) {
          while (plates.length <= manual.plate) plates.push([]);
          plates[manual.plate].push(candidate);
          continue;
        }
      }
      pending.push({ piece, index, bounds });
    }
  }
  for (const { piece, index, bounds } of pending) {
    const centered = place(piece, index, bounds, -(bounds.minX + bounds.maxX) / 2, -(bounds.minY + bounds.maxY) / 2, 0);
    if (pending.length === 1 && plates.length === 1 && !plates[0].length && fitsPlate(centered, [], width, height, gap)) {
      plates[0].push(centered);
      continue;
    }
    let candidate;
    for (let plate = 0; plate < plates.length && !candidate; plate++) {
      candidate = arrangePiece(piece, index, bounds, plates[plate], plate, width, height, gap);
    }
    if (!candidate && plates.length < 36) {
      candidate = arrangePiece(piece, index, bounds, [], plates.length, width, height, gap);
      if (candidate) plates.push([]);
    }
    if (!candidate) oversized.add(piece);
    else plates[candidate.plate].push(candidate);
  }
  return { plates, oversized };
}
function currentPlan() {
  return cachedPlan ||= layoutPlan(
    new Map(pieces.map(piece => [piece, piece.model])),
    new Map(pieces.map(piece => [piece, pieceState(piece)])),
    new Map(pieces.map(piece => [piece, piece.placements])),
    { plateW: plateW(), plateH: plateH(), gap: pieceGap() }
  );
}
function objectPositions() {
  return currentPlan().plates[platePage] || [];
}
function activePosition() {
  return selectedPlacement() || objectPositions().find(p => p.piece === activePiece) || { x: 0, y: 0 };
}
function updatePlatePanel() {
  const { plates, oversized } = currentPlan();
  platePage = Math.min(platePage, plates.length - 1);
  const positions = plates[platePage];
  $('platePage').textContent = `${platePage + 1} / ${plates.length}`;
  $('prevPlate').disabled = platePage === 0;
  $('nextPlate').disabled = platePage >= plates.length - 1;
  const overflow = [...oversized].map(piece => pieceState(piece).name || 'Nome').join(', ');
  $('plateWarnings').textContent = overflow ? `Peças fora da área disponível: ${overflow}.` :
    `${positions.length} peça(s) neste tabuleiro · margem de ${PLATE_MARGIN} mm`;
  const piece = selectedPlacement()?.piece || activePiece;
  $('copyTop').disabled = !piece;
  $('qualityNotice').classList.toggle('hidden', !pieces.length);
  if (document.activeElement !== $('copyTop')) $('copyTop').value = piece ? pieceState(piece).copies : '';
  $('undoRemoval').classList.toggle('hidden', !removedPiece);
  updatePieceTools();
  syncNameEntry();
}
function plateChanged() {
  cachedPlan = null;
  updatePlatePanel();
  requestRender();
}
function changePlateSize() {
  for (const piece of pieces) piece.placements.clear();
  platePage = 0;
  plateSelection = null;
  moveToolsOpen = false;
  $('customPlate').classList.toggle('hidden', S.printer !== 'custom');
  $('machineBadge').textContent = plateLabel();
  rebuildBed();
  plateChanged();
  if (S.plateView) fitCamera();
}
function setPlateSelection(selection) {
  plateSelection = selection;
  if (selection && selection.piece !== activePiece) activatePiece(selection.piece, S.selected);
  if (!selection) moveToolsOpen = false;
  $('pieceFeedback').classList.add('hidden');
  $('plateCorner').value = '';
  updatePlatePanel();
  requestRender();
}
function platePoint(event) {
  const rect = $('gl').getBoundingClientRect();
  return unproject(event.clientX - rect.left, event.clientY - rect.top, 0);
}
function plateHit(point) {
  if (!point) return null;
  return (currentPlan().plates[platePage] || []).find(p =>
    point.x >= p.left && point.x <= p.right && point.y >= p.bottom && point.y <= p.top) || null;
}
function movePlatePiece(hit, x, y) {
  const { piece, index, plate } = hit, bounds = piece.model.regions.bounds;
  const hx = plateW() / 2 - PLATE_MARGIN, hy = plateH() / 2 - PLATE_MARGIN;
  const candidate = place(piece, index, bounds,
    Math.min(hx - bounds.maxX, Math.max(-hx - bounds.minX, x)),
    Math.min(hy - bounds.maxY, Math.max(-hy - bounds.minY, y)), plate);
  const neighbors = currentPlan().plates[plate].filter(p => p.piece !== piece || p.index !== index);
  if (!fitsPlate(candidate, neighbors)) return false;
  // Reserva as outras posições deste tabuleiro para mover apenas a peça selecionada.
  for (const p of neighbors) p.piece.placements.set(p.index, { x: p.x, y: p.y, plate });
  piece.placements.set(index, { x: candidate.x, y: candidate.y, plate });
  plateChanged();
  return true;
}
function restorePlatePosition(drag) {
  for (const [p, placements] of drag.savedPlacements) p.placements = placements;
  plateChanged();
}
async function addName(name) {
  const state = { ...editableState(), name, ringManual: false, copies: 1 }, quality = S.quality;
  const submit = $('addName');
  if (submit.disabled) return false;
  submit.disabled = $('cancelName').disabled = true;
  try {
    const result = await geometryCall({ type: 'build', S: state, quality });
    const piece = makePiece(state);
    piece.model = result;
    piece.components = result.parts.map(part => ({ ...part, color: partColor(part.id, state) }));
    piece.components.forEach(uploadOneMesh);
    piece.previewKey = previewKey(state, quality);
    activatePiece(piece);
    plateChanged();
    selectTab('letters');
    selectPieceOnBoard(piece);
    return true;
  } catch (error) {
    console.error(error);
    $('qualityNotice').textContent = 'Erro ao adicionar nome: ' + error.message;
    return false;
  } finally {
    submit.disabled = $('cancelName').disabled = false;
  }
}
let pendingNamePiece = null;
function unavailableName(name) {
  return /gou?veia/i.test(name.normalize('NFKC'));
}
function rejectUnavailableName(input) {
  if (!unavailableName(input.value)) return false;
  $('nameNotice').textContent = 'Não é possível criar uma tag com este nome.';
  $('printbarSuggestions').classList.add('hidden');
  return true;
}
function syncNameEntry() {
  const input = $('inputName'), newName = addingName || !activePiece;
  $('nameLabel').textContent = addingName ? 'Novo nome' : 'Nome';
  $('addName').textContent = newName ? 'Adicionar' : '+ Adicionar nome';
  $('cancelName').classList.toggle('hidden', !addingName);
  const currentName = showExampleName ? '' : S.name;
  if (!newName && pendingNamePiece !== activePiece && input.value !== currentName) input.value = currentName;
}
function renameFromInput(input) {
  $('nameNotice').textContent = '';
  if (!activePiece || addingName) return;
  pendingNamePiece = unavailableName(input.value) ? activePiece : null;
  if (pendingNamePiece) return;
  showExampleName = false;
  S.name = input.value;
  S.ringManual = false;
  document.querySelectorAll('.fontcard span').forEach(el => el.textContent = S.name || 'Nome');
  scheduleScan();
  scheduleRebuild();
}
function bindPlateControls() {
  const form = $('nameEntry'), input = $('inputName'), options = $('printbarSuggestions');
  const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function updateSuggestions() {
    const query = fold(input.value.trim());
    const matches = EXAMPLE_NAMES.filter(name => fold(name).startsWith(query));
    options.replaceChildren();
    for (const name of matches) {
      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = name;
      option.onclick = () => {
        input.value = name;
        input.focus();
        renameFromInput(input);
        options.classList.add('hidden');
      };
      options.append(option);
    }
    options.classList.toggle('hidden', !matches.length);
  }
  function cancelNewName() {
    if ($('addName').disabled) return;
    addingName = false;
    pendingNamePiece = null;
    $('nameNotice').textContent = '';
    input.value = activePiece && !showExampleName ? S.name : '';
    options.classList.add('hidden');
    syncNameEntry();
  }
  $('tabLetters').onclick = () => {
    if ($('addName').disabled) return;
    cancelNewName();
    pickerPart = null;
    renderPicker();
    partMenuFor = null;
    moveToolsOpen = false;
    setFontMode(false);
    const piece = selectedPlacement()?.piece || activePiece;
    if (piece) activatePiece(piece, 'letters');
    else selectTab('letters');
    setView('front');
    fitCamera();
    requestRender();
  };
  $('cancelName').onclick = cancelNewName;
  input.onfocus = updateSuggestions;
  input.oninput = () => { renameFromInput(input); updateSuggestions() };
  input.onkeydown = event => {
    if (event.key === 'ArrowDown' && !options.classList.contains('hidden')) {
      event.preventDefault();
      options.firstElementChild?.focus();
    }
    if (event.key === 'Enter' && activePiece && !addingName) {
      event.preventDefault();
      rejectUnavailableName(input);
      options.classList.add('hidden');
    }
  };
  form.onkeydown = event => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (addingName) {
      cancelNewName();
      $('addName').focus();
    } else options.classList.add('hidden');
  };
  form.onfocusout = event => { if (!form.contains(event.relatedTarget)) options.classList.add('hidden') };
  form.onsubmit = async event => {
    event.preventDefault();
    if (rejectUnavailableName(input)) return;
    if (activePiece && !addingName) {
      addingName = true;
      input.value = '';
      syncNameEntry();
      input.focus();
      updateSuggestions();
      return;
    }
    const name = input.value.trim();
    if (!name) { input.focus(); return }
    if (!await addName(name)) return;
    addingName = false;
    input.value = name;
    options.classList.add('hidden');
    syncNameEntry();
    $('addName').focus();
  };
  $('prevPlate').onclick = () => { platePage--; setPlateSelection(null) };
  $('nextPlate').onclick = () => { platePage++; setPlateSelection(null) };
  $('autoArrange').onclick = () => {
    for (const piece of pieces) piece.placements.clear();
    platePage = 0;
    setPlateSelection(null);
    plateChanged();
  };
  $('plateCorner').onchange = () => {
    const choice = $('plateCorner').value;
    if (!choice || !plateSelection) return;
    const { piece } = plateSelection, bounds = piece.model.regions.bounds;
    const [x, y] = choice.split(',');
    const hx = plateW() / 2 - PLATE_MARGIN, hy = plateH() / 2 - PLATE_MARGIN;
    if (!movePlatePiece(plateSelection, x === 'left' ? -hx - bounds.minX : hx - bounds.maxX,
      y === 'top' ? hy - bounds.maxY : -hy - bounds.minY)) {
      $('pieceFeedback').textContent = 'Canto ocupado.';
      $('pieceFeedback').classList.remove('hidden');
    } else {
      $('pieceFeedback').classList.add('hidden');
    }
    $('plateCorner').value = '';
  };
}
function selectedPlacement() {
  return plateSelection && currentPlan().plates[platePage]?.find(
    p => p.piece === plateSelection.piece && p.index === plateSelection.index
  );
}
function selectedPiece() {
  return S.plateView ? selectedPlacement()?.piece : partMenuFor ? activePiece : null;
}
function updatePieceTools() {
  const piece = selectedPiece(), show = Boolean(piece);
  const tray = $('pieceTools');
  tray.classList.toggle('hidden', !show);
  tray.classList.toggle('moving', show && moveToolsOpen);
  $('movePanel').classList.toggle('hidden', !show || !moveToolsOpen);
  $('movePiece').classList.toggle('on', show && moveToolsOpen);
  $('movePiece').setAttribute('aria-expanded', String(show && moveToolsOpen));
  $('editPiece').classList.toggle('hidden', !S.plateView);
  if (!show) return;
  $('backColor').value = pieceState(piece).backColor || pieceState(piece).letterColor;
  for (const [id] of slotParts) $('slot-'+id).value = pieceState(piece).slots?.[id] || '';
  const state = pieceState(piece), base = !S.plateView && partMenuFor === 'base';
  $('pieceToolName').textContent = state.name || 'Nome';
  if (document.activeElement !== $('pieceSize')) $('pieceSize').value = state.nameSize;
  $('pieceSizeValue').textContent = state.nameSize + '%';
  $('pieceOutline').checked = state.outline;
  $('pieceColorLabel').textContent = base ? 'Cor da base' : 'Cor das letras';
  $('pieceColor').value = base ? state.baseColor : state.letterColor;
  $('pieceFillHoles').classList.toggle('on', Boolean(state.fillLetterHoles));
  $('pieceFillHoles').setAttribute('aria-pressed', String(Boolean(state.fillLetterHoles)));
}
function revealOnPlate(piece) {
  selectTab('plate');
  selectPieceOnBoard(piece);
}
function selectPieceOnBoard(piece) {
  const { plates } = currentPlan();
  const page = plates.findIndex(positions => positions.some(p => p.piece === piece));
  if (page < 0) return;
  platePage = page;
  setPlateSelection(plates[page].find(p => p.piece === piece));
}
function updateSelectedColor(color) {
  const piece = selectedPiece();
  if (!piece) return;
  const base = !S.plateView && partMenuFor === 'base', key = base ? 'baseColor' : 'letterColor';
  const state = pieceState(piece);
  state[key] = color;
  state.filaments[base ? 'base' : 'letters'] = null;
  if (piece === activePiece) {
    $(key).value = color;
    refreshMeshColors();
    renderFilaChips();
    renderPicker();
  } else {
    for (const part of piece.components) {
      part.color = partColor(part.id, state);
      uploadOneMesh(part);
    }
  }
  requestRender();
}
function deleteSelectedPiece() {
  const piece = selectedPiece();
  if (!piece || dragAction) return;
  const state = pieceState(piece), index = S.plateView ? selectedPlacement().index : 0;
  const at = pieces.indexOf(piece), placements = new Map(piece.placements), copies = state.copies;
  removedPiece = { piece, at, placements, copies };
  if (copies > 1) {
    state.copies--;
    piece.placements = new Map([...placements].filter(([i]) => i !== index).map(([i, p]) => [i > index ? i - 1 : i, p]));
  } else {
    if (piece === activePiece) piece.state = editableState();
    pieces.splice(at, 1);
    releaseMeshBuffers(piece.components);
    if (piece === activePiece) {
      const next = pieces[Math.min(at, pieces.length - 1)];
      activePiece = null;
      model = null;
      components = [];
      if (next) activatePiece(next);
    }
  }
  partMenuFor = null;
  setPlateSelection(null);
  if (!activePiece) $('inputName').value = '';
  selectTab('letters');
  plateChanged();
}
function undoPieceRemoval() {
  if (!removedPiece) return;
  const { piece, at, placements, copies } = removedPiece;
  removedPiece = null;
  if (!pieces.includes(piece)) {
    pieces.splice(at, 0, piece);
    piece.components.forEach(uploadOneMesh);
  }
  pieceState(piece).copies = copies;
  piece.placements = placements;
  if (!activePiece) activatePiece(piece);
  plateChanged();
  selectTab('letters');
  selectPieceOnBoard(piece);
}
const slotParts = [['base','Base'],['letters','Frente'],['outline','Contorno'],['back','Verso']];
function bindPieceTools() {
  for (const [id,label] of slotParts) {
    const row = document.createElement('label');
    row.textContent = label;
    const input = document.createElement('input');
    input.id = 'slot-'+id;
    bindFilamentNumber(input, id);
    row.append(input);
    $('slotFields').append(row);
  }
  $('backColor').oninput = () => { S.backColor = $('backColor').value; refreshMeshColors(); requestRender(); };
  $('pieceSize').onchange = () => {
    const input = $('pieceSize');
    S.nameSize = Math.min(800, Math.max(30, input.valueAsNumber || S.nameSize));
    input.value = S.nameSize;
    updateControls(); scheduleRebuild(true); scheduleScan();
  };
  $('pieceOutline').onchange = () => {
    $('hasOutline').checked = $('pieceOutline').checked;
    $('hasOutline').dispatchEvent(new Event('change'));
  };
  $('movePiece').onclick = () => {
    if (!S.plateView) {
      S.plateView = true;
      $('viewport').classList.add('plate-view');
      $('viewerHelp').classList.add('hidden');
      setView('front');
      selectPieceOnBoard(activePiece);
    }
    if (!selectedPlacement()) return;
    moveToolsOpen = !moveToolsOpen;
    updatePieceTools();
    if ($('viewport').clientWidth >= 590) { fitCamera(); requestRender() }
  };
  $('pieceColor').oninput = e => updateSelectedColor(e.target.value);
  $('pieceFillHoles').onclick = () => {
    const piece = selectedPiece();
    if (!piece) return;
    const state = pieceState(piece);
    state.fillLetterHoles = !state.fillLetterHoles;
    if (piece === activePiece) {
      $('fillLetterHoles').checked = state.fillLetterHoles;
      scheduleRebuild(true);
    } else {
      piece.state = { ...state };
      refreshInactivePiece(piece, piece.state, S.quality);
    }
    updatePieceTools();
  };
  $('zoomPiece').onclick = () => {
    const pos = selectedPlacement();
    if (S.plateView && pos) {
      const r = $('viewport').getBoundingClientRect();
      camera.cx = (pos.left + pos.right) / 2;
      camera.cy = (pos.top + pos.bottom) / 2;
      camera.cz = 0;
      camera.panX = camera.panY = 0;
      camera.scale = Math.min(r.width * .56 / (pos.right - pos.left), r.height * .65 / (pos.top - pos.bottom), 22);
    } else fitCamera();
    requestRender();
  };
  $('editPiece').onclick = () => { const piece = selectedPiece(); if (piece) activatePiece(piece) };
  $('deletePiece').onclick = deleteSelectedPiece;
  $('undoRemoval').onclick = undoPieceRemoval;
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,select,textarea,[contenteditable]')) return;
    if (event.key === 'Delete' && selectedPiece()) { event.preventDefault(); deleteSelectedPiece() }
    if (event.key === 'Escape' && S.plateView && plateSelection) setPlateSelection(null);
  });
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
function stlBytes(positions, models) {
  const count = positions.reduce((sum, pos) => sum + models.get(pos.piece).union.indices.length / 3, 0);
  if (!count) return null;
  const ab = new ArrayBuffer(84 + count * 50), view = new DataView(ab), hdr = new TextEncoder().encode('SparrowTech 3D Studio v5 / malha vetorial fechada, milimetros');
  new Uint8Array(ab, 0, Math.min(80, hdr.length)).set(hdr.slice(0, 80)); view.setUint32(80, count, true); let off = 84;
  for (const pos of positions) {
    const m = models.get(pos.piece).union;
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
// A exportação usa a revisão atual de cada nome, mesmo durante uma reconstrução da vista.
async function exportPlan(union) {
  const size = { plateW: plateW(), plateH: plateH() }, gap = pieceGap(), quality = S.quality;
  const states = new Map(pieces.map(piece => {
    const state = pieceState(piece);
    return [piece, { ...state, filaments: { ...state.filaments } }];
  }));
  const placements = new Map(pieces.map(piece => [piece, new Map(piece.placements)]));
  const models = new Map();
  for (const [piece, state] of states) {
    const result = await geometryCall({ type: 'build', S: state, quality, union });
    if (!result.regions.bounds || !result.parts.length) throw new Error(`Sem malha para «${state.name || 'Nome'}».`);
    models.set(piece, result);
  }
  const { plates, oversized } = layoutPlan(models, states, placements, { ...size, gap });
  if (oversized.size) throw new Error('Peças fora da área disponível: ' + [...oversized].map(piece => states.get(piece).name || 'Nome').join(', '));
  const title = states.size > 1 ? 'Tabuleiro' : (states.values().next().value.name || 'Nome');
  return { plates, models, states, size, title };
}
async function exportSTL() {
  if (!model) return;
  return withBusy($('dlSTL'), '⏳ STL', async () => {
    const { plates, models, title } = await exportPlan(true);
    plates.forEach((positions, i) => {
      const blob = stlBytes(positions, models);
      if (blob) download(blob, `SparrowTech_${safeName(title)}${plates.length > 1 ? '_tabuleiro' + (i + 1) : ''}.stl`);
    });
    $('qualityNotice').textContent = `STL exportado com ${plates.flat().length} peça(s) em ${plates.filter(plate => plate.length).length} ficheiro(s).`;
  });
}
async function export3MF() {
  if (!model) return false;
  let exported = false;
  await withBusy($('dl3MF'), '⏳ 3MF', async () => {
    const { plates, models, states, size, title } = await exportPlan(false);
    const positions = plates.flat();
    const objects = [...models].map(([piece, result]) => {
      const state = states.get(piece);
      return {
        name: state.name || 'Nome',
        placements: positions.filter(p => p.piece === piece),
        parts: result.parts.map(part => {
          const color = partColor(part.id, state);
          return { id: part.id, label: `${partLabel(part)} — ${filamentLabel(part.id, state)} ${color.toUpperCase()}`, color, slot: state.slots?.[part.id], mesh: part.mesh };
        })
      };
    });
    const result = Sparrow3MF.buildObjects(objects, { name: title, ...size, layerHeight: EXPORT_LAYER_HEIGHT });
    download(await Sparrow3MF.zip(result.entries), `SparrowTech_${safeName(title)}_${size.plateW}x${size.plateH}.3mf`, 'model/3mf');
    $('qualityNotice').textContent = `3MF exportado com ${positions.length} peça(s) em ${result.plates} tabuleiro(s).`;
    exported = true;
  });
  return exported;
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
    const gap = 6, innerW = plateW() - 2 * PLATE_MARGIN, innerH = plateH() - 2 * PLATE_MARGIN, placed = []; let x = -innerW / 2, y = innerH / 2, rowH = 0, skipped = [];
    for (const { font, r } of built) {
      const b = r.regions.bounds; if (!b) continue;
      if (x + b.width > innerW / 2) { x = -innerW / 2; y -= rowH + gap; rowH = 0 }
      if (b.width > innerW || y - b.height < -innerH / 2) { skipped.push(font); continue }
      placed.push({ font, r, pos: { x: x - b.minX, y: y - b.maxY } }); x += b.width + gap; rowH = Math.max(rowH, b.height);
    }
    const objects = placed.map(({ font, r, pos }) => ({ name: `${S.name || 'Nome'} — ${font}`, placements: [pos], parts: r.parts.map(p => ({ id: p.id, label: `${partLabel(p)} — ${filamentLabel(p.id)} ${partColor(p.id).toUpperCase()}`, color: partColor(p.id), mesh: p.mesh })) }));
    const res = Sparrow3MF.buildObjects(objects, { name: `Teste de fontes — ${S.name}`, plateW: plateW(), plateH: plateH(), layerHeight: EXPORT_LAYER_HEIGHT });
    download(await Sparrow3MF.zip(res.entries), `SparrowTech_teste_fontes_${safeName(S.name)}.3mf`, 'model/3mf');
    $('qualityNotice').textContent = `Placa de teste: ${placed.length} fonte(s) (${placed.map(p => p.font).join(', ')}).` + (skipped.length ? ` Não couberam: ${skipped.join(', ')}.` : '');
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
  matchFilamentsToBrand(); refreshMeshColors(); updateControls(); scheduleScan();
  autoFitAfterRebuild = true; await rebuildModel(); selectTab('letters'); fitCamera(); requestRender();
  $('addName').disabled = $('inputName').disabled = false;
}
boot();
