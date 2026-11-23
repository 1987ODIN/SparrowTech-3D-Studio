import './build.mjs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

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
const loader = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4327764352811582" crossorigin="anonymous"></script>`;
const ad = `<aside id="publicidade" aria-label="Publicidade">
<ins class="adsbygoogle" style="display:block"
     data-ad-client="ca-pub-4327764352811582"
     data-ad-slot="6683290316"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>(window.adsbygoogle = window.adsbygoogle || []).push({});</script>
</aside>`;
const adFooter = '<footer id="editorAd" style="box-sizing:border-box;padding:4px 12px;border-top:1px solid #334357"><small>Publicidade</small>' + ad + '</footer>';
const adLayout = '<style>body:has(#editorAd){height:100dvh;display:grid;grid-template-rows:minmax(0,1fr) 78px}body:has(#editorAd) .app{height:100%;min-height:0;overflow:auto}#editorAd #publicidade{margin:0}#editorAd{overflow:hidden}#editorAd ins{height:50px}#editorAd ins[data-ad-status="unfilled"]{visibility:hidden}</style>';
const page = editor.replace('</head>', loader + adLayout + '</head>')
  .replace('</body>', adFooter + '</body>')
  .replace(/<title>[^<]+<\/title>/, metadata).replace(brand, brand + home);
await writeFile(file('site/tags/index.html'), page);
for (const dir of ['site/', 'site/tags/']) await rm(file(dir + 'demonstracao.html'), { force: true });
