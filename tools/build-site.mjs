import './build.mjs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const file = path => new URL(path, root);
await mkdir(file('site/tags/'), { recursive: true });
await cp(file('portal/'), file('site/'), { recursive: true });
const editor = await readFile(file('dist/sparrowtech_3d_studio_v5.html'), 'utf8');
const brand = '<div class="brand">';
if (!editor.includes(brand)) throw new Error('Cabeçalho do editor em falta');
const home = '<a href="../" aria-label="Voltar ao CrowMakes" style="color:inherit;font:600 12px system-ui">← CrowMakes</a>';
const title = 'Criar tags em STL e 3MF — CrowMakes';
const metadata = [
  '<link rel="manifest" href="/tags/manifest.webmanifest">',
  '<link rel="icon" href="/tags/icon-192.png">',
  '<link rel="apple-touch-icon" href="/tags/icon-192.png">',
  '<meta name="theme-color" content="#122235">',
  '<script defer src="/tags/install.js"></script>',
  `<title>${title}</title>`,
  '<meta name="description" content="Cria etiquetas com nome e porta-chaves para impressão 3D. Escolhe a fonte, ajusta a argola e exporta o modelo em STL ou 3MF.">',
  '<link rel="canonical" href="https://crowmakes.com/tags/">',
].join('\n');
if (!/<title>[^<]+<\/title>/.test(editor)) throw new Error('Título do editor em falta');
const page = editor.replace(/<title>[^<]+<\/title>/, metadata).replace(brand, brand + home);
await writeFile(file('site/tags/index.html'), page);
