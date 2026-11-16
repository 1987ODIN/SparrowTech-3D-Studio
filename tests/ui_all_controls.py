"""Passa por TODOS os controlos da interface no Chrome e verifica, depois de cada ação,
que não há erros na consola e que todas as malhas continuam fechadas.

Uso: python3 tests/ui_all_controls.py [dist.html]
"""
import json, os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'sparrowtech_3d_studio_v5.html')
OUT = os.path.join(ROOT, 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails, steps = [], 0

with sync_playwright() as p:
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    b = p.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
    page = ctx.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto('file://' + HTML)
    page.wait_for_function('() => typeof model !== "undefined" && model && components.length && !building', timeout=60000)

    def verify(label):
        global steps
        steps += 1
        page.wait_for_timeout(200)
        page.wait_for_function('() => !building', timeout=60000)
        page.wait_for_timeout(150)
        page.wait_for_function('() => !building', timeout=60000)
        st = page.evaluate('''() => ({ n: components.length, closed: components.every(c => SparrowGeo.isClosed(c.mesh)), ids: components.map(c => c.id),
            notice: document.getElementById('qualityNotice').textContent })''')
        ok = st['n'] > 0 and st['closed'] and not errors and not st['notice'].startswith('Erro')
        if not ok: fails.append(f'{label}: {json.dumps(st, ensure_ascii=False)} erros={errors[:2]}')
        print(('  ✓ ' if ok else '  ✗ ') + label + ('' if ok else f'  {st} {errors[:2]}'))
        errors.clear()

    # Abas
    for tab in ['tabBase', 'tabRing', 'tabPrint', 'tabLetters']:
        page.click('#' + tab); verify(f'aba {tab}')
    # Botões de opção (forma, acabamento frente/verso, modo de impressão)
    for group, tab in [('shapeButtons', 'tabBase'), ('finishFront', 'tabLetters'), ('finishBack', 'tabLetters'), ('printModeButtons', 'tabPrint')]:
        page.click('#' + tab)
        n = page.locator(f'#{group} button').count()
        for i in range(n):
            label = page.locator(f'#{group} button').nth(i).inner_text()
            page.locator(f'#{group} button').nth(i).click(); verify(f'{group}: {label}')
        page.locator(f'#{group} button').first.click()
    page.click('#tabLetters')
    # Deslizadores: mínimo, máximo e volta ao valor inicial
    for rid in page.evaluate("[...document.querySelectorAll('input[type=range]')].map(e => e.id)"):
        tab = page.evaluate(f"document.getElementById('{rid}').closest('#lettersPanel,#basePanel,#ringPanel,#printPanel').id.replace('Panel','')")
        page.click('#tab' + tab[0].upper() + tab[1:])
        orig = page.evaluate(f"document.getElementById('{rid}').value")
        for v in ['min', 'max']:
            page.evaluate(f"(() => {{ const e = document.getElementById('{rid}'); e.value = e.{v}; e.dispatchEvent(new Event('input', {{bubbles: true}})); }})()")
            verify(f'deslizador {rid} = {v}')
        page.evaluate(f"(() => {{ const e = document.getElementById('{rid}'); e.value = '{orig}'; e.dispatchEvent(new Event('input', {{bubbles: true}})); }})()")
    # Caixas de seleção (liga/desliga)
    for cid in page.evaluate("[...document.querySelectorAll('input[type=checkbox]')].map(e => e.id)"):
        tab = page.evaluate(f"document.getElementById('{cid}').closest('#lettersPanel,#basePanel,#ringPanel,#printPanel').id.replace('Panel','')")
        page.click('#tab' + tab[0].upper() + tab[1:])
        for _ in range(2): page.click('#' + cid); verify(f'caixa {cid} → {page.evaluate(f"document.getElementById(\'{cid}\').checked")}')
    # Cores
    for cid in ['baseColor', 'letterColor', 'outlineColor']:
        page.evaluate(f"(() => {{ const e = document.getElementById('{cid}'); e.value = '#ff8800'; e.dispatchEvent(new Event('input', {{bubbles: true}})); }})()"); verify(f'cor {cid}')
    # Menus (impressora, qualidade, bico, camada)
    page.click('#tabPrint')
    for sid in ['printer', 'quality', 'nozzle', 'layer']:
        for v in page.evaluate(f"[...document.getElementById('{sid}').options].map(o => o.value)"):
            page.select_option('#' + sid, v); verify(f'menu {sid} = {v}')
    page.select_option('#quality', 'fine'); page.select_option('#printer', 'A1'); page.select_option('#nozzle', '0.4')
    # Cópias e organizar
    page.evaluate("(() => { const e = document.getElementById('copyCount'); e.value = 4; e.dispatchEvent(new Event('input')); })()"); verify('4 cópias')
    page.click('#autoArrange'); verify('organizar automaticamente')
    page.evaluate("(() => { const e = document.getElementById('copyCount'); e.value = 1; e.dispatchEvent(new Event('input')); })()")
    # Vistas e botões do topo
    for bid in ['btnFit', 'btnPlate', 'btnFlip', 'btnFlip', 'frontView', 'backView', 'resetCam']:
        page.click('#' + bid); verify(f'botão {bid}')
    for v in ['front', 'back', 'top', 'iso', 'zoomIn', 'zoomOut']:
        page.click(f'.viewCube button[data-view="{v}"]'); verify(f'cubo de vistas {v}')
    page.click('#frontView')
    # Seletor de fonte ◀ ▶ e modo fonte
    page.click('#fontNext'); verify('fonte seguinte ▶'); page.click('#fontPrev'); verify('fonte anterior ◀')
    page.click('#fontName'); check_mode = page.evaluate('fontMode'); page.keyboard.press('ArrowRight'); verify(f'modo fonte por clique no nome ({check_mode}) + seta →'); page.keyboard.press('Escape')
    # Argola: desligar do sítio (fraca/solta) → aviso; reposicionar → seguro
    page.click('#tabRing')
    page.evaluate("S.ringManual = true; S.ringX = model.regions.bounds.minX - 6; S.ringY = model.regions.bounds.maxY + 6; scheduleRebuild(true)"); verify('argola arrastada para fora')
    weak = page.evaluate("model.regions.ring.status"); notice = page.inner_text('#qualityNotice'); tag = page.evaluate("document.getElementById('ringTag').className")
    ok = weak in ('solta', 'fraca') and '⚠' in notice and 'hidden' not in tag
    print(('  ✓ ' if ok else '  ✗ ') + f'aviso de argola frágil/solta ({weak}; etiqueta: {tag})'); fails.extend([] if ok else ['aviso argola'])
    page.screenshot(path=os.path.join(OUT, 'ui_argola_solta.png'))
    page.click('#autoRing'); verify('reposicionar argola automaticamente')
    st = page.evaluate("model.regions.ring.status"); ok = st == 'ok'
    print(('  ✓ ' if ok else '  ✗ ') + f'argola automática segura ({st}, {round(page.evaluate("model.regions.ring.frac") * 100)}% na peça)'); fails.extend([] if ok else ['argola auto'])
    page.screenshot(path=os.path.join(OUT, 'ui_argola_ok.png'))
    # Importar fonte (usa uma das fontes do projeto)
    page.click('#tabLetters')
    page.set_input_files('#fontFile', os.path.join(ROOT, 'fonts', 'Cookie.ttf')); page.wait_for_timeout(600); verify('importar fonte TTF')
    # Exportações: Imprimir (topo), 3MF, STL completo, STLs por cor, placa de teste
    for bid, n in [('quickPrint', 1), ('export3MF', 1), ('exportSTL', 1)]:
        if bid != 'quickPrint': page.click('#tabPrint')
        with page.expect_download(timeout=90000) as dl: page.click('#' + bid)
        d = dl.value; path = os.path.join(OUT, 'ui_' + d.suggested_filename); d.save_as(path)
        ok = os.path.getsize(path) > 1000; print(('  ✓ ' if ok else '  ✗ ') + f'{bid} → {d.suggested_filename} ({os.path.getsize(path) // 1024} KB)'); fails.extend([] if ok else [bid])
    downloads = []
    page.on('download', lambda d: downloads.append(d.suggested_filename))
    page.click('#exportParts'); page.wait_for_timeout(2500)
    ok = len(downloads) >= 3; print(('  ✓ ' if ok else '  ✗ ') + f'STLs por cor: {downloads}'); fails.extend([] if ok else ['exportParts'])
    page.click('#tabLetters'); page.evaluate("S.favorites = ['Pacifico', 'Lilita One']; renderGallery()")
    with page.expect_download(timeout=90000) as dl: page.click('#testPlate')
    print('  ✓ placa de teste → ' + dl.value.suggested_filename)
    if errors: fails.append('erros finais: ' + '; '.join(errors[:3]))
    page.screenshot(path=os.path.join(OUT, 'ui_final.png'))
    b.close()
print(f"\n{steps} passos verificados — {'TUDO OK' if not fails else str(len(fails)) + ' FALHAS'}")
for f in fails: print('  -', f)
sys.exit(1 if fails else 0)
