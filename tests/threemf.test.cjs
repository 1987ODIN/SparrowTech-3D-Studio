/*
 * Testes da exportação 3MF: gera ficheiros reais e verifica, a partir do próprio ZIP,
 * a estrutura que o leitor do Bambu Studio / OrcaSlicer / Creality Print espera
 * (componentes → partes, extruder por parte em model_settings.config, instâncias na plate)
 * e a estanquidade de cada malha lida do XML.
 * Executar: node tests/threemf.test.cjs   (escreve exemplos em tests/out/)
 */
'use strict';
const path = require('path'), fs = require('fs'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'src/geometry.js')), M = require(path.join(ROOT, 'src/model.js')), T = require(path.join(ROOT, 'src/threemf.js'));
const opentype = require(path.join(ROOT, 'vendor/opentype.min.js'));
const buf = fs.readFileSync(path.join(ROOT, 'fonts/Lobster.ttf'));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

let fails = 0, checks = 0;
const check = (c, m) => { checks++; if (!c) { fails++; console.log('  ✗ ' + m); } };

function unzip(bytes) {
  const files = {}; const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22; while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = Buffer.from(bytes.subarray(p + 46, p + 46 + nlen)).toString('utf8');
    const lnlen = dv.getUint16(off + 26, true), lelen = dv.getUint16(off + 28, true), data = bytes.subarray(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize);
    files[name] = (method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data)).toString('utf8');
    p += 46 + nlen + elen + clen;
  }
  return files;
}
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));

(async () => {
  const S = { name: 'Filipa', shape: 'contour', front: 'raised', back: 'inlay', backText: '912 345 678', outline: true, outlineWidth: 0.8, border: 3.5, letterHeight: 0.6, bodyThickness: 2.4, nameSize: 100, baseColor: '#348cf0', letterColor: '#ffffff', outlineColor: '#090c13', hasRing: true, ringOuter: 7.2, ringInner: 3.0, fillHoles: true, holeArea: 1.5 };
  const cases = [
    ['frente_relevo_verso_embutido', S, [{ x: 0, y: 0 }]],
    ['tres_copias_k1c', { ...S, back: 'smooth' }, [{ x: -40, y: 30 }, { x: 40, y: 30 }, { x: 0, y: -30 }], 220],
    ['mesma_cor_letras_contorno', { ...S, outlineColor: '#FFFFFF', back: 'smooth' }, [{ x: 0, y: 0 }]]
  ];
  for (const [label, st, placements, plate = 256] of cases) {
    const model = M.build(st, { front: font }, 'fine');
    const res = T.build(model.parts, placements, { name: st.name, printerName: 'Teste', plateSize: plate, date: '2026-11-15', layerHeight: 0.08, nozzle: 0.2 });
    const bytes = await T.zip(res.entries);
    fs.writeFileSync(path.join(OUT, `SparrowTech_${label}.3mf`), bytes);
    const f = unzip(bytes);
    console.log(`• ${label}: ${(bytes.length / 1024).toFixed(0)} KB, partes ${model.parts.map(p => p.id + '→filamento ' + res.extruders[p.id]).join(', ')}`);
    for (const need of ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', '3D/_rels/3dmodel.model.rels', '3D/Objects/object_1.model', 'Metadata/model_settings.config']) check(f[need], `${label}: falta ${need}`);
    const main = f['3D/3dmodel.model'], sub = f['3D/Objects/object_1.model'], cfg = f['Metadata/model_settings.config'];
    check(/<metadata name="Application">BambuStudio-/.test(main), `${label}: Application não começa por BambuStudio-`);
    check(/<object id="\d+">[\s\S]*?<metadata key="layer_height" value="0.08"\/>/.test(cfg), `${label}: falta a camada do objeto`);
    // componentes ↔ objetos do sub-modelo ↔ partes do config
    const comps = [...main.matchAll(/<component ([^>]*)\/>/g)].map(m => attrs(m[1]));
    const subObjs = [...sub.matchAll(/<object ([^>]*)>([\s\S]*?)<\/object>/g)].map(m => ({ a: attrs(m[1]), body: m[2] }));
    const cfgParts = [...cfg.matchAll(/<part ([^>]*)>([\s\S]*?)<\/part>/g)].map(m => ({ a: attrs(m[1]), ext: +(/key="extruder" value="(\d+)"/.exec(m[2]) || [])[1], name: (/key="name" value="([^"]*)"/.exec(m[2]) || [])[1] }));
    check(comps.length === model.parts.length && subObjs.length === comps.length && cfgParts.length === comps.length, `${label}: contagens diferentes ${comps.length}/${subObjs.length}/${cfgParts.length}`);
    comps.forEach((c, i) => {
      check(c['p:path'] === '/3D/Objects/object_1.model', `${label}: p:path errado`);
      check(subObjs.some(o => o.a.id === c.objectid), `${label}: componente ${c.objectid} sem objeto`);
      check(cfgParts.some(p => p.a.id === c.objectid && p.a.subtype === 'normal_part'), `${label}: parte ${c.objectid} sem config`);
    });
    const objId = attrs(/<object ([^>]*)>/.exec(main)[1]).id;
    check(new RegExp(`<object id="${objId}">`).test(cfg), `${label}: objeto ${objId} sem config`);
    const items = [...main.matchAll(/<item ([^>]*)\/>/g)].map(m => attrs(m[1]));
    check(items.length === placements.length, `${label}: ${items.length} instâncias ≠ ${placements.length}`);
    check((cfg.match(/<model_instance>/g) || []).length === placements.length, `${label}: model_instance em falta`);
    items.forEach((it, i) => { const t = it.transform.split(' ').map(Number); check(Math.abs(t[9] - (placements[i].x + plate / 2)) < 1e-3 && Math.abs(t[10] - (placements[i].y + plate / 2)) < 1e-3, `${label}: posição ${i} errada`); });
    // filamentos: cores distintas → filamentos distintos
    const byId = {}; model.parts.forEach((p, i) => byId[p.id] = cfgParts[i].ext);
    if (st.baseColor.toLowerCase() !== st.letterColor.toLowerCase()) check(byId.base !== byId.letters, `${label}: base e letras no mesmo filamento`);
    if (byId.outline && st.outlineColor.toLowerCase() !== st.letterColor.toLowerCase()) check(byId.outline !== byId.letters && byId.outline !== byId.base, `${label}: contorno sem filamento próprio`);
    if (byId.outline && st.outlineColor.toLowerCase() === st.letterColor.toLowerCase()) check(byId.outline === byId.letters, `${label}: mesma cor devia partilhar filamento`);
    if (byId.back) check(byId.back === byId.letters, `${label}: verso devia usar o filamento das letras`);
    // malhas lidas do XML: índices válidos, estanques
    for (const o of subObjs) {
      const V = [...o.body.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].map(m => [+m[1], +m[2], +m[3]]);
      const I = [...o.body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].map(m => [+m[1], +m[2], +m[3]]);
      check(I.every(t => t.every(v => v < V.length)), `${label}: índice inválido no objeto ${o.a.id}`);
      const st2 = G.meshStats({ positions: Float32Array.from(V.flat()), indices: Uint32Array.from(I.flat()) });
      check(st2.watertight && st2.degenerate === 0 && st2.volume > 0, `${label}: objeto ${o.a.id} não estanque após exportação ${JSON.stringify(st2)}`);
    }
  }
  // Placa de teste: vários objetos (um por fonte), cada um com partes e filamentos
  {
    const objs = [['Pacifico.ttf', -60], ['Lobster.ttf', 0], ['Damion.ttf', 60]].map(([file, x]) => {
      const b = fs.readFileSync(path.join(ROOT, 'fonts', file)), f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      const m = M.build({ ...S, back: 'smooth' }, { front: f }, 'normal');
      return { name: 'Filipa — ' + file, parts: m.parts, placements: [{ x, y: 0 }] };
    });
    const res = T.buildObjects(objs, { name: 'Teste', plateSize: 256, date: '2026-11-15' });
    const bytes = await T.zip(res.entries); fs.writeFileSync(path.join(OUT, 'SparrowTech_placa_teste.3mf'), bytes);
    const f = unzip(bytes), main = f['3D/3dmodel.model'], cfg = f['Metadata/model_settings.config'];
    const objsMain = [...main.matchAll(/<object id="(\d+)"[^>]*><components>([\s\S]*?)<\/components>/g)];
    check(objsMain.length === 3, `placa de teste: ${objsMain.length} objetos ≠ 3`);
    const subIds = [...f['3D/Objects/object_1.model'].matchAll(/<object id="(\d+)"/g)].map(m => m[1]);
    check(new Set(subIds).size === subIds.length, 'placa de teste: ids de sub-objetos repetidos');
    for (const [, id, body] of objsMain) {
      check(new RegExp(`<object id="${id}">`).test(cfg), `placa de teste: objeto ${id} sem config`);
      for (const m of body.matchAll(/objectid="(\d+)"/g)) check(new RegExp(`<part id="${m[1]}" subtype="normal_part">`).test(cfg), `placa de teste: parte ${m[1]} sem config`);
    }
    check((main.match(/<item /g) || []).length === 3 && (cfg.match(/<model_instance>/g) || []).length === 3, 'placa de teste: instâncias');
    check(/key="extruder" value="3"/.test(cfg), 'placa de teste: filamentos por parte');
    console.log(`• placa_teste: ${(bytes.length / 1024).toFixed(0)} KB, 3 objetos`);
  }
  {
    // Vários tabuleiros: grelha do Bambu Studio (colunas = teto(raiz(n)), passo = tamanho × 1,2, linhas para −Y)
    const m = M.build({ ...S, name: 'Ana', back: 'smooth' }, { front: font }, 'draft');
    const pl = []; for (let p = 0; p < 3; p++) for (let i = 0; i < 2; i++) pl.push({ x: i * 10, y: 5, plate: p });
    const res = T.build(m.parts, pl, { name: 'Ana', plateW: 256, plateH: 256 });
    const main = res.entries.find(e => e[0] === '3D/3dmodel.model')[1], cfg = res.entries.find(e => e[0] === 'Metadata/model_settings.config')[1];
    const tr = [...main.matchAll(/<item [^>]*transform="([^"]+)"/g)].map(x => x[1].split(' ').map(Number));
    check(res.plates === 3 && (cfg.match(/<plate>/g) || []).length === 3, 'tabuleiros: devia haver 3');
    check(/plater_id" value="3"/.test(cfg) && (cfg.match(/<model_instance>/g) || []).length === 6, 'tabuleiros: instâncias por tabuleiro');
    check(tr.length === 6 && Math.abs(tr[2][9] - (128 + 307.2)) < 1e-3 && Math.abs(tr[2][10] - 133) < 1e-3, 'tabuleiros: o 2.º fica à direita (+307,2 mm)');
    check(Math.abs(tr[4][9] - 128) < 1e-3 && Math.abs(tr[4][10] - (133 - 307.2)) < 1e-3, 'tabuleiros: o 3.º fica na linha de baixo (−307,2 mm)');
    console.log('• tabuleiros: 6 peças em 3 tabuleiros');
  }
  console.log(`\n${checks - fails}/${checks} verificações 3MF OK${fails ? ` — ${fails} FALHAS` : ''}`);
  process.exit(fails ? 1 : 0);
})();
