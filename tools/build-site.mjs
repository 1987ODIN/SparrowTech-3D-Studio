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
await writeFile(file('site/tags/index.html'), editor.replace(brand, brand + home));
