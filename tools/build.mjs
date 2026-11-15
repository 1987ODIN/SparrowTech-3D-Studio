// Gera dist/sparrowtech_3d_studio_v5.html: um único ficheiro offline com bibliotecas, motor e fontes embutidos.
// Uso: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
// Catálogo gerado por tools/prepare_fonts.py (ordem = ordem da galeria e da roda do rato).
const catalog = JSON.parse(read('fonts/catalog.json'));
const fonts = catalog.map(c => ({ name: c.name, group: c.group, data: fs.readFileSync(path.join(ROOT, 'fonts', c.file)).toString('base64') }));
// "</script" dentro do código embutido fecharia a tag: protege-se.
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const libs = ['vendor/opentype.min.js', 'vendor/clipper.js', 'vendor/earcut.min.js', 'src/geometry.js', 'src/model.js', 'src/threemf.js'].map(f => `/* ---- ${f} ---- */\n` + read(f)).join('\n;\n');
let html = read('src/index.html');
html = html.replace('<!--SPARROW:FONTS-->', `<script>window.SPARROW_FONTS=${JSON.stringify(fonts)};</script>`)
  .replace('<!--SPARROW:LIBS-->', () => safe(libs))
  .replace('<!--SPARROW:APP-->', () => safe(read('src/app.js')));
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'sparrowtech_3d_studio_v5.html');
fs.writeFileSync(out, html);
console.log(`${path.relative(ROOT, out)}: ${(html.length / 1024).toFixed(0)} KB`);
