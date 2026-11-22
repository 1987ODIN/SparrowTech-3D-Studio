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
const portal = await readFile(file('portal/index.html'), 'utf8');
const loader = portal.match(/<script async src="https:\/\/pagead2\.googlesyndication\.com[^"]+"[^>]*><\/script>/)?.[0];
const ad = portal.match(/<aside id="publicidade"[\s\S]*?<\/aside>/)?.[0];
if (!loader || !ad) throw new Error('Configuração AdSense em falta no portal');
const adFooter = '<footer style="margin-top:2rem;padding-top:1rem;border-top:1px solid #334357">' +
  '<small>Publicidade</small>' + ad + '</footer>';
const page = editor.replace('</head>', loader + '</head>')
  .replace('</aside></div>', adFooter + '</aside></div>').replace(/<title>[^<]+<\/title>/, metadata).replace(brand, brand + home);
await writeFile(file('site/tags/index.html'), page);

// A demonstração usa o mesmo rodapé, sem carregar o AdSense.
const sample = '<div id="amostra" tabindex="-1" style="box-sizing:border-box;width:100%;min-height:110px;display:grid;place-content:center;text-align:center;padding:16px;border:2px dashed #286986;background:#eaf7fb;color:#123e50;font:600 16px system-ui">Publicidade · Demonstração</div>';
for (const [path, html] of [['', portal], ['tags/', page]]) {
  const demo = html.replace(loader, '').replace(ad, sample)
    .replace('<title>', '<meta name="robots" content="noindex,nofollow"><title>')
    .replace('</html>', '<script>window.addEventListener("load",()=>{const el=document.getElementById("amostra");document.getElementById("introCard")?.classList.add("hidden");el.scrollIntoView({block:"center"});el.focus({preventScroll:true})})</script></html>');
  await writeFile(file('site/' + path + 'demonstracao.html'), demo);
}
