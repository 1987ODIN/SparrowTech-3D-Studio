"""Verificação da app no Chrome (headless): arranque, geometria, navegação com o rato e exportações.

Uso: python3 tests/browser_check.py [caminho/para/dist.html]
Requer: pip install playwright, e um Chrome/Chromium instalado.
Escreve capturas e ficheiros exportados em tests/out/.
"""
import json, math, os, sys, zipfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'sparrowtech_3d_studio_v5.html')
OUT = os.path.join(ROOT, 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond: fails.append(msg)

def cam(page): return page.evaluate('({...camera})')
def wait_model(page, timeout=30000):
    page.wait_for_function('() => typeof model !== "undefined" && model && components.length && !building', timeout=timeout)

with sync_playwright() as p:
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    browser = p.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for dpr in (1, 2):
        print(f'\n== devicePixelRatio {dpr} ==')
        ctx = browser.new_context(viewport={'width': 1400, 'height': 860}, device_scale_factor=dpr, accept_downloads=True)
        page = ctx.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto('file://' + HTML)
        wait_model(page)
        info = page.evaluate('''() => ({ gl: !!gl, worker: !!worker, parts: components.map(c => [c.id, c.mesh.triangleCount]), fonts: Object.keys(FONT_BYTES),
             text: document.getElementById('qualityNotice').textContent, closed: components.every(c => SparrowGeo.isClosed(c.mesh)) })''')
        print('  ', json.dumps(info, ensure_ascii=False))
        check(info['gl'], 'WebGL ativo'); check(info['worker'], 'geometria num Web Worker')
        check({x[0] for x in info['parts']} >= {'base', 'letters', 'outline'}, 'partes base/letras/contorno')
        check(info['closed'], 'malhas da pré-visualização fechadas')
        check(len(info['fonts']) >= 50, f"{len(info['fonts'])} fontes embutidas carregadas")
        page.screenshot(path=os.path.join(OUT, f'v5_frente_dpr{dpr}.png'))
        box = page.locator('#gl').bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2

        # 1) Zoom com a roda: o ponto do mundo sob o cursor não se mexe no ecrã
        mx, my = round(box['x'] + box['width'] * 0.8), round(box['y'] + box['height'] * 0.25)  # o Chrome arredonda clientX/Y
        before = page.evaluate(f'unproject({mx - box["x"]}, {my - box["y"]}, 0)')
        page.mouse.move(mx, my)
        for _ in range(4): page.mouse.wheel(0, -240); page.wait_for_timeout(30)
        s = page.evaluate(f'(() => {{ const p = project({before["x"]}, {before["y"]}, 0); return p; }})()')
        d = math.hypot(s['x'] - (mx - box['x']), s['y'] - (my - box['y']))
        check(d < 1.5, f'zoom ancorado no cursor (desvio {d:.2f} px)')

        # 2) Esquerdo + direito + arrastar = pan da vista; a peça não se move
        c0, pos0 = cam(page), page.evaluate('[S.positionX, S.positionY]')
        page.mouse.move(cx, cy); page.mouse.down(button='left'); page.mouse.down(button='right')
        for i in range(1, 11): page.mouse.move(cx - 12 * i, cy + 7 * i); page.wait_for_timeout(10)
        page.mouse.up(button='right'); page.mouse.up(button='left')
        c1, pos1 = cam(page), page.evaluate('[S.positionX, S.positionY]')
        check(abs((c1['panX'] - c0['panX']) + 120) < 6 and abs((c1['panY'] - c0['panY']) - 70) < 6, f'esq.+dir. desloca a vista (Δ {c1["panX"] - c0["panX"]:.0f}, {c1["panY"] - c0["panY"]:.0f} px)')
        check(abs(c1['yaw'] - c0['yaw']) < 1e-6 and abs(c1['pitch'] - c0['pitch']) < 1e-6, 'esq.+dir. não roda a câmara')
        check(pos0 == pos1, 'esq.+dir. não move a peça no tabuleiro')
        check(not page.evaluate('!!dragAction'), 'estado de arrasto termina ao largar os botões')

        # 3) Depois do pan, esquerdo sozinho volta a rodar
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + 60, cy, steps=6); page.mouse.up()
        c2 = cam(page); check(abs(c2['yaw'] - c1['yaw']) > .2 and abs(c2['panX'] - c1['panX']) < 1e-6, 'esquerdo sozinho roda (sem pan)')
        # 4) Direito sozinho e Shift+esquerdo também fazem pan
        page.mouse.move(cx, cy); page.mouse.down(button='right'); page.mouse.move(cx + 40, cy + 20, steps=5); page.mouse.up(button='right')
        c3 = cam(page); check(abs(c3['panX'] - c2['panX'] - 40) < 3 and abs(c3['yaw'] - c2['yaw']) < 1e-6, 'direito sozinho faz pan')
        page.keyboard.down('Shift'); page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx - 30, cy, steps=5); page.mouse.up(); page.keyboard.up('Shift')
        c4 = cam(page); check(abs(c4['panX'] - c3['panX'] + 30) < 3, 'Shift + esquerdo faz pan')
        check(page.evaluate("getComputedStyle(document.querySelector('#gl')).cursor") in ('grab', 'auto', 'default'), 'cursor normal depois do arrasto')

        # 5) Peça num canto do tabuleiro: ⌖ Peça centra-a; zoom continua sob o cursor
        page.evaluate("S.positionX = 90; S.positionY = 95; clampToPlate(); drawMiniPlate(); fitCamera(); setView('front'); requestRender()")
        page.wait_for_timeout(100)
        pc = page.evaluate('(() => { const c = pieceCenter(); return project(c.x, c.y, c.z); })()')
        check(abs(pc['x'] - box['width'] / 2) < 2 and abs(pc['y'] - box['height'] / 2) < 2, 'peça no canto fica centrada com «⌖ Peça»')
        page.screenshot(path=os.path.join(OUT, f'v5_canto_dpr{dpr}.png'))
        # 5b) Clicar nas letras + rodar o rato = trocar de fonte (sem zoom); Esc sai
        page.evaluate("S.positionX=0; S.positionY=0; clampToPlate(); fitCamera(); setView('front'); requestRender()"); page.wait_for_timeout(80)
        pt = page.evaluate('''(() => { const R = model.regions, b = SparrowGeo.bounds(R.text); for (let i = 0; i < 2000; i++) { const x = b.minX + Math.random() * b.width, y = b.minY + Math.random() * b.height; if (SparrowGeo.contains(R.text, x, y)) { const r = document.getElementById('gl').getBoundingClientRect(), s = project(x + S.positionX, y + S.positionY, (model.zShift || 0) + S.bodyThickness); return { x: s.x + r.left, y: s.y + r.top }; } } })()''')
        f0, sc0 = page.evaluate('S.font'), page.evaluate('camera.scale')
        page.mouse.click(pt['x'], pt['y']); page.wait_for_timeout(50)
        check(page.evaluate('fontMode'), 'clicar nas letras ativa o modo fonte')
        for _ in range(3): page.mouse.wheel(0, 100); page.wait_for_timeout(40)
        f1 = page.evaluate('S.font'); i0, i1 = page.evaluate(f'[FONTS.indexOf({json.dumps(f0)}), FONTS.indexOf({json.dumps(f1)})]')
        check(i1 == (i0 + 3) % page.evaluate('FONTS.length') and abs(page.evaluate('camera.scale') - sc0) < 1e-9, f'roda troca de fonte em vez de zoom ({f0} → {f1})')
        page.wait_for_timeout(900); wait_model(page)
        check(page.evaluate('model && !interactiveBuild') and page.evaluate("document.querySelector('.fontcard.on').dataset.font") == f1, 'modelo final calculado com a nova fonte e galeria sincronizada')
        page.keyboard.press('Escape'); page.mouse.move(cx, cy); page.mouse.wheel(0, -120); page.wait_for_timeout(50)
        check(not page.evaluate('fontMode') and page.evaluate('camera.scale') > sc0, 'Esc sai do modo fonte e a roda volta a fazer zoom')
        sw = page.locator('#fontName').bounding_box(); page.mouse.move(sw['x'] + 10, sw['y'] + 5); page.mouse.wheel(0, -100); page.wait_for_timeout(50)
        check(page.evaluate('S.font') != f1, 'roda sobre o seletor de fonte também troca')
        page.evaluate("chooseFont('Pacifico')"); page.wait_for_timeout(400); wait_model(page)
        # 6) Clique seleciona: letras e base
        sel = page.evaluate('''(() => { const R = model.regions, b = SparrowGeo.bounds(R.text); const pts = [];
            for (let i = 0; i < 400; i++) { const x = b.minX + Math.random() * b.width, y = b.minY + Math.random() * b.height; if (SparrowGeo.contains(R.text, x, y)) { pts.push([x, y]); break; } }
            const r = document.getElementById('gl').getBoundingClientRect(); const z = (model.zShift || 0) + S.bodyThickness;
            const s = project(pts[0][0] + S.positionX, pts[0][1] + S.positionY, z); return { x: s.x + r.left, y: s.y + r.top }; })()''')
        page.mouse.click(sel['x'], sel['y']); page.wait_for_timeout(50)
        check(page.evaluate('S.selected') == 'letters', 'clique nas letras abre o painel das letras')
        # 7) Verso
        page.evaluate("setView('back')"); page.wait_for_timeout(80); page.screenshot(path=os.path.join(OUT, f'v5_verso_dpr{dpr}.png'))
        check(not errors, 'sem erros na consola' + (': ' + '; '.join(errors[:3]) if errors else ''))
        if dpr == 2: ctx.close(); continue

        # 7b) Galeria por grupos, análise ✓/⚠ e bico
        groups = page.evaluate("[...document.querySelectorAll('.fontgroup')].map(e => e.textContent)")
        check(len(groups) >= 3 and any('nomes' in g for g in groups) and any('imprensa' in g for g in groups), 'galeria com grupos (nomes / imprensa / finas)')
        page.wait_for_function("() => Object.keys(fontScan).length >= 50", timeout=60000)
        okp = page.evaluate("fontScan['Pacifico'].status"); check(okp == 'ok', 'Pacifico ✓ com bico 0,4')
        page.evaluate("S.nozzle = 0.8; updateControls(); chooseFont('Great Vibes'); scheduleScan()"); page.wait_for_timeout(500); wait_model(page)
        page.wait_for_function("() => fontScan['Great Vibes'] && fontScan['Great Vibes'].nozzle === 0.8", timeout=60000)
        check(page.evaluate("fontScan['Great Vibes'].status") != 'ok' and '⚠' in page.evaluate("document.getElementById('printCheck').textContent"), 'Great Vibes com bico 0,8 dá aviso de traço fino')
        w0 = page.evaluate('model.regions.bounds.width'); page.evaluate("S.nozzle=0.4; S.letterSpacing = 15; updateControls(); chooseFont('Pacifico')"); page.wait_for_timeout(500); wait_model(page)
        check(page.evaluate('model.regions.bounds.width') > 0, 'espaçamento aplicado')
        page.evaluate("S.letterSpacing = 0; updateControls()")
        # 7c) Placa de teste com 3 fontes marcadas (★)
        page.evaluate("S.favorites=['Pacifico','Leckerli One','Lilita One']; renderGallery()")
        with page.expect_download(timeout=90000) as dl: page.click('#testPlate')
        ft = os.path.join(OUT, 'app_placa_teste.3mf'); dl.value.save_as(ft)
        zt = zipfile.ZipFile(ft); mt = zt.read('3D/3dmodel.model').decode()
        check(mt.count('<item ') == 3 and mt.count('<components>') == 3, 'placa de teste: 3 fontes = 3 objetos no 3MF')
        # 8) Exportações reais (fonte manuscrita, verso embutido, 2 cópias)
        page.evaluate("S.font='Great Vibes'; S.name='Constança'; S.back='inlay'; S.backText='912 345 678'; S.copies=2; updateControls(); scheduleRebuild(true)")
        page.wait_for_timeout(300); wait_model(page)
        page.evaluate("S.positionX=0; S.positionY=0; setView('front'); fitCamera(); requestRender()"); page.wait_for_timeout(100)
        page.screenshot(path=os.path.join(OUT, 'v5_great_vibes.png'))
        page.evaluate("selectTab('print')")
        with page.expect_download() as dl: page.click('#quickPrint')
        f3 = os.path.join(OUT, 'app_export.3mf'); dl.value.save_as(f3)
        z = zipfile.ZipFile(f3); names = z.namelist(); cfg = z.read('Metadata/model_settings.config').decode()
        check('Metadata/model_settings.config' in names and cfg.count('<part ') >= 3, f'3MF exportado pela app com {cfg.count("<part ")} partes')
        check('value="2"' in cfg and 'value="3"' in cfg, '3MF atribui filamentos 1/2/3')
        check(z.read('3D/3dmodel.model').decode().count('<item ') == 2, '3MF com 2 instâncias (cópias)')
        page.select_option('#fileFormat', 'stl')
        with page.expect_download(timeout=60000) as dl: page.click('#quickPrint')
        page.select_option('#fileFormat', '3mf')
        fs_ = os.path.join(OUT, 'app_export.stl'); dl.value.save_as(fs_)
        n = int.from_bytes(open(fs_, 'rb').read()[80:84], 'little'); check(n > 1000 and os.path.getsize(fs_) == 84 + 50 * n, f'STL completo válido ({n} triângulos)')
        # 9) Desempenho: ultra não bloqueia a página (Worker)
        page.evaluate("S.quality='ultra'; updateControls(); window.__t0=performance.now(); window.__ticks=0; (function tick(){ window.__ticks++; if (performance.now()-window.__t0 < 4000) requestAnimationFrame(tick) })(); scheduleRebuild(true)")
        page.wait_for_timeout(400); wait_model(page, 60000)
        ticks = page.evaluate('window.__ticks'); el = page.evaluate('performance.now()-window.__t0')
        check(ticks > el / 1000 * 15, f'interface continua a responder durante o cálculo «muito fina» ({ticks} frames em {el:.0f} ms)')
        check(not errors, 'sem erros na consola após exportações' + (': ' + '; '.join(errors[:3]) if errors else ''))
        ctx.close()
    browser.close()
print(f"\n{'TUDO OK' if not fails else str(len(fails)) + ' FALHAS'}")
sys.exit(1 if fails else 0)
