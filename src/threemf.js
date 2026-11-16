/*
 * SparrowTech 3D Studio — exportação 3MF com partes por filamento (v5).
 *
 * Bambu Studio, OrcaSlicer e Creality Print (6.x/7.x) partilham o mesmo leitor de 3MF
 * (bbs_3mf.cpp). Esse leitor:
 *   • transforma cada <component> de um objeto numa PARTE (volume) separada;
 *   • lê o filamento de cada parte em Metadata/model_settings.config
 *     (<part id=…><metadata key="extruder" value="N"/>);
 *   • só considera o ficheiro «do formato Bambu» se Application começar por "BambuStudio-".
 * O V4 escrevia apenas <basematerials> do 3MF genérico, que estes slicers não usam para
 * atribuir filamentos — por isso base, letras e contorno caíam todos no filamento 1.
 * Aqui escrevemos a mesma estrutura que o Bambu Studio grava (ver docs/3MF-CORES.md).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sparrow3MF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const hex8 = n => n.toString(16).padStart(8, '0');
  const num = v => { const r = Math.round(v * 1e5) / 1e5; return (Object.is(r, -0) ? 0 : r).toString(); };

  // Mapeia cores distintas para filamentos 1..n, na ordem base → letras → contorno → verso.
  function extruderMap(parts) {
    const colors = [], map = {};
    for (const p of parts) { const c = String(p.color).toLowerCase(); let i = colors.indexOf(c); if (i < 0) { colors.push(c); i = colors.length - 1; } map[p.id] = i + 1; }
    return { map, colors };
  }

  function meshXML(mesh) {
    const P = mesh.positions, I = mesh.indices, out = ['<mesh><vertices>'];
    for (let i = 0; i < P.length; i += 3) out.push(`<vertex x="${num(P[i])}" y="${num(P[i + 1])}" z="${num(P[i + 2])}"/>`);
    out.push('</vertices><triangles>');
    for (let k = 0; k < I.length; k += 3) out.push(`<triangle v1="${I[k]}" v2="${I[k + 1]}" v3="${I[k + 2]}"/>`);
    out.push('</triangles></mesh>');
    return out.join('');
  }

  /**
   * parts: [{id, label, color, mesh:{positions, indices, triangleCount}}]
   * placements: [{x, y}] em mm, relativos ao centro do tabuleiro (uma entrada por cópia)
   * meta: {name, printerName, plateW, plateH, date}
   * Devolve [[caminho, texto]] para o ZIP, mais o mapa de filamentos.
   */
  function build(parts, placements, meta) {
    return buildObjects([{ name: meta.name, parts, placements }], meta);
  }
  /**
   * Vários objetos (ex.: placa de teste de fontes): cada um com as suas partes e instâncias.
   * objects: [{name, parts:[{id,label,color,mesh}], placements:[{x,y}]}]
   */
  function buildObjects(objects, meta) {
    objects = objects.map(o => Object.assign({}, o, { parts: o.parts.filter(p => p.mesh && p.mesh.indices && p.mesh.indices.length) })).filter(o => o.parts.length && o.placements.length);
    if (!objects.length) throw new Error('Sem malhas para exportar.');
    const { map, colors } = extruderMap([].concat(...objects.map(o => o.parts)));
    const date = meta.date || new Date().toISOString().slice(0, 10);
    const halfW = (meta.plateW || meta.plateSize || 256) / 2, halfH = (meta.plateH || meta.plateSize || 256) / 2;
    const title = meta.name || 'SparrowTech';
    let nextSub = 1; const totalSub = objects.reduce((s, o) => s + o.parts.length, 0);
    const sub = [`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS}>`, '<metadata name="BambuStudio:3mfVersion">1</metadata><resources>'];
    const resources = [], items = [], cfg = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>'];
    // Tabuleiros: o Bambu Studio dispõe-nos numa grelha (PartPlate.cpp): colunas = teto(raiz(n)), passo = tamanho × 1,2, linhas para −Y.
    const nPlates = Math.min(36, 1 + Math.max(0, ...[].concat(...objects.map(o => o.placements.map(p => p.plate | 0)))));
    const sq = Math.sqrt(nPlates), cols = sq > Math.round(sq) ? Math.round(sq) + 1 : Math.round(sq), plates = Array.from({ length: nPlates }, () => []);
    let itemN = 0, identify = 100;
    objects.forEach((o, oi) => {
      const objectId = totalSub + 1 + oi, comps = [];
      cfg.push(`  <object id="${objectId}">`, `    <metadata key="name" value="${esc(o.name || title)}"/>`, `    <metadata key="extruder" value="${map[o.parts[0].id]}"/>`);
      // Altura de camada como definição DO OBJETO (o Bambu Studio aplica-a ao abrir; o bico é da impressora e não vai no ficheiro).
      if (meta.layerHeight) cfg.push(`    <metadata key="layer_height" value="${num(meta.layerHeight)}"/>`);
      for (const p of o.parts) {
        const id = nextSub++;
        sub.push(`<object id="${id}" p:UUID="${hex8(id)}-81cb-4c03-9d28-80fed5dfa1dc" type="model">${meshXML(p.mesh)}</object>`);
        comps.push(`<component p:path="/3D/Objects/object_1.model" objectid="${id}" p:UUID="${hex8(id << 16)}-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`);
        cfg.push(`    <part id="${id}" subtype="normal_part">`, `      <metadata key="name" value="${esc(p.label)}"/>`, '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>',
          `      <metadata key="extruder" value="${map[p.id]}"/>`, `      <mesh_stat face_count="${p.mesh.indices.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>`, '    </part>');
      }
      cfg.push('  </object>');
      resources.push(`<object id="${objectId}" p:UUID="${hex8(objectId)}-61cb-4c03-9d28-80fed5dfa1dc" type="model"><components>${comps.join('')}</components></object>`);
      o.placements.forEach((pos, i) => {
        const pl = Math.min(nPlates - 1, pos.plate | 0), ox = (pl % cols) * halfW * 2.4, oy = -Math.floor(pl / cols) * halfH * 2.4;
        items.push(`<item objectid="${objectId}" p:UUID="${hex8(++itemN + 1)}-b1ec-4553-aec9-835e5b724bb4" transform="1 0 0 0 1 0 0 0 1 ${num(pos.x + halfW + ox)} ${num(pos.y + halfH + oy)} 0" printable="1"/>`);
        plates[pl].push('    <model_instance>', `      <metadata key="object_id" value="${objectId}"/>`, `      <metadata key="instance_id" value="${i}"/>`, `      <metadata key="identify_id" value="${identify++}"/>`, '    </model_instance>');
      });
    });
    sub.push('</resources><build/></model>');
    const allParts = [].concat(...objects.map(o => o.parts));
    const main = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS}>` +
      '<metadata name="Application">BambuStudio-02.00.00.00</metadata>' +
      '<metadata name="BambuStudio:3mfVersion">1</metadata>' +
      `<metadata name="Title">${esc(title)}</metadata>` +
      '<metadata name="Designer">SparrowTech 3D Studio v5</metadata>' +
      `<metadata name="Description">${esc((meta.printerName || '') + (meta.nozzle ? ' · bico recomendado ' + meta.nozzle + ' mm' : '') + (meta.layerHeight ? ' · camada ' + meta.layerHeight + ' mm' : '') + ' · ' + itemN + ' peça(s) · filamentos: ' + [...new Set(allParts.map(p => p.label.replace(/ \(#.*/, '') + '=' + map[p.id]))].join(', '))}</metadata>` +
      `<metadata name="CreationDate">${date}</metadata><metadata name="ModificationDate">${date}</metadata>` +
      `<resources>${resources.join('')}</resources>` +
      `<build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">${items.join('')}</build></model>`;
    plates.forEach((plate, i) => cfg.push('  <plate>', `    <metadata key="plater_id" value="${i + 1}"/>`, '    <metadata key="plater_name" value=""/>', '    <metadata key="locked" value="false"/>', ...plate, '  </plate>'));
    cfg.push('  <assemble>', '  </assemble>', '</config>');
    const types = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="gcode" ContentType="text/x.gcode"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
    const modelRels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
    return {
      entries: [['[Content_Types].xml', types], ['_rels/.rels', rels], ['3D/3dmodel.model', main], ['3D/_rels/3dmodel.model.rels', modelRels], ['3D/Objects/object_1.model', sub.join('')], ['Metadata/model_settings.config', cfg.join('\n')]],
      extruders: map, colors, plates: nPlates
    };
  }

  // ---- ZIP (OPC) mínimo, com deflate quando o browser/Node tem CompressionStream
  const te = new TextEncoder();
  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) { CRC_TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
  }
  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try { const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); } catch (e) { return null; }
  }
  async function zip(entries) {
    const chunks = [], central = []; let offset = 0;
    for (const [name, data] of entries) {
      const raw = typeof data === 'string' ? te.encode(data) : data, nb = te.encode(name), crc = crc32(raw);
      let body = raw, method = 0; const z = await deflate(raw); if (z && z.length < raw.length) { body = z; method = 8; }
      const loc = new Uint8Array(30 + nb.length), lv = new DataView(loc.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, body.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, nb.length, true); loc.set(nb, 30);
      chunks.push(loc, body);
      const cen = new Uint8Array(46 + nb.length), cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, nb.length, true); cv.setUint32(42, offset, true); cen.set(nb, 46);
      central.push(cen); offset += loc.length + body.length;
    }
    const cdLen = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, cdLen, true); ev.setUint32(16, offset, true);
    const total = offset + cdLen + 22, outBuf = new Uint8Array(total); let o = 0;
    for (const c of [...chunks, ...central, end]) { outBuf.set(c, o); o += c.length; }
    return outBuf;
  }

  return { build, buildObjects, zip, extruderMap, meshXML };
});
