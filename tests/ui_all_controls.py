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
    page.goto('file://' + HTML + '#semintro')
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
    for group, tab in [('shapeButtons', 'tabBase'), ('finishFront', 'tabLetters'), ('finishBack', 'tabLetters')]:
        page.click('#' + tab)
        n = page.locator(f'#{group} button').count()
        for i in range(n):
            label = page.locator(f'#{group} button').nth(i).inner_text()
            page.locator(f'#{group} button').nth(i).click(); verify(f'{group}: {label}')
        page.locator(f'#{group} button').first.click()
    page.click('#tabLetters')
    # Deslizadores: mínimo, máximo e volta ao valor inicial
    for rid in page.evaluate("[...document.querySelectorAll('input[type=range]:not(#rmSize)')].map(e => e.id)"):
        tab = page.evaluate(f"document.getElementById('{rid}').closest('#lettersPanel,#basePanel,#ringPanel,#printPanel').id.replace('Panel','')")
        page.click('#tab' + tab[0].upper() + tab[1:])
        orig = page.evaluate(f"document.getElementById('{rid}').value")
        for v in ['min', 'max']:
            page.evaluate(f"(() => {{ const e = document.getElementById('{rid}'); e.value = e.{v}; e.dispatchEvent(new Event('input', {{bubbles: true}})); }})()")
            verify(f'deslizador {rid} = {v}')
        page.evaluate(f"(() => {{ const e = document.getElementById('{rid}'); e.value = '{orig}'; e.dispatchEvent(new Event('input', {{bubbles: true}})); }})()")
    # Caixas de seleção (liga/desliga)
    for cid in page.evaluate("[...document.querySelectorAll('input[type=checkbox]:not(#infoSkip)')].map(e => e.id)"):
        tab = page.evaluate(f"document.getElementById('{cid}').closest('#lettersPanel,#basePanel,#ringPanel,#printPanel').id.replace('Panel','')")
        page.click('#tab' + tab[0].upper() + tab[1:])
        for _ in range(2): page.click('#' + cid); verify(f'caixa {cid} → {page.evaluate(f"document.getElementById(\'{cid}\').checked")}')
    # Cores
    for cid in ['baseColor', 'letterColor', 'outlineColor']:
        page.evaluate(f"(() => {{ const e = document.getElementById('{cid}'); e.value = '#ff8800'; e.dispatchEvent(new Event('input', {{bubbles: true}})); }})()"); verify(f'cor {cid}')
    # Formato do tabuleiro, detalhe da malha, cópias e organização
    page.click('#tabPrint')
    for sid in ['printer', 'quality']:
        for v in page.evaluate(f"[...document.getElementById('{sid}').options].map(o => o.value)"):
            page.select_option('#' + sid, v); verify(f'menu {sid} = {v}')
    page.fill('#plateWidth', '237'); page.locator('#plateWidth').press('Tab')
    page.fill('#plateDepth', '198'); page.locator('#plateDepth').press('Tab')
    assert page.evaluate('[plateW(), plateH()]') == [237, 198]
    page.select_option('#quality', 'fine'); page.select_option('#printer', '256')
    page.fill('#copyTop', '4'); verify('4 cópias')
    page.click('#btnPlate')
    page.click('#autoArrange'); verify('organizar automaticamente')
    page.fill('#copyTop', '1')
    # Vistas e botões do topo
    for bid in ['btnFit', 'btnFlip', 'btnFlip', 'resetCam']:
        page.click('#' + bid); verify(f'botão {bid}')
    for v in ['front', 'back', 'top', 'iso', 'zoomIn', 'zoomOut']:
        page.click(f'.viewCube button[data-view="{v}"]'); verify(f'cubo de vistas {v}')
    page.evaluate("setView('front')")
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
    # Filamentos: abrir a paleta oficial depois de usar cor livre
    page.select_option('#printer', '256'); page.wait_for_timeout(100)
    page.locator('.filachip').first.click()
    page.select_option('#filaSeries', 'PLA Basic')
    sw = page.locator('#filaPicker .swatch'); n = sw.count()
    sw.nth(min(5, n - 1)).click(); page.wait_for_timeout(100); verify(f'paleta Bambu ({n} cores) → base escolhida')
    fb = page.evaluate("S.filaments.base"); ok = fb and fb['brand'] == 'Bambu Lab' and page.evaluate("S.baseColor") == fb['hex'].lower()
    print(('  ✓ ' if ok else '  ✗ ') + f"base = {fb and fb['series']} {fb and fb['name']} ({fb and fb['code']})"); fails.extend([] if ok else ['filamento base'])
    page.select_option('#filaSeries', 'PLA Matte'); page.locator('#filaPicker .swatch').nth(2).click(); verify('série PLA Matte')
    # Tabuleiro exclusivamente por dimensões
    opts = page.evaluate("[...document.querySelectorAll('#printer option')].map(o => o.textContent)")
    assert all('mm' in option or option == 'Personalizado' for option in opts)
    page.select_option('#printer', '325x320'); verify('tabuleiro retangular')
    page.click('#dl3MF'); info = page.inner_text('#infoBody')
    assert '0,16 mm' in info and 'cores' in info
    with page.expect_download(timeout=90000) as dl: page.click('#infoGo')
    pth = os.path.join(OUT, 'ui_325x320.3mf'); dl.value.save_as(pth)
    import zipfile, re
    z = zipfile.ZipFile(pth); main = z.read('3D/3dmodel.model').decode(); cfg = z.read('Metadata/model_settings.config').decode()
    t = [float(v) for v in re.search(r'<item [^>]*transform="([^"]+)"', main).group(1).split()]
    pos = page.evaluate('currentPlan().plates[0].map(({x,y}) => [x,y])[0]')
    ok = abs(t[9] - (pos[0] + 162.5)) < 1e-3 and abs(t[10] - (pos[1] + 160)) < 1e-3 and 'Bambu Lab H2D' not in main and 'nozzle_diameter' not in cfg and 'key="layer_height" value="0.16"' in cfg
    print(('  ✓ ' if ok else '  ✗ ') + f'botão ⬇ do topo → 3MF centrado no tabuleiro 325×320 ({t[9]:.1f}, {t[10]:.1f})'); fails.extend([] if ok else ['3mf 325x320'])
    badges = page.evaluate("getComputedStyle(document.getElementById('sizeBadge').parentElement).display")
    ok = badges == 'none'; print(('  ✓ ' if ok else '  ✗ ') + 'medidas em mm escondidas na barra de baixo'); fails.extend([] if ok else ['badges'])
    page.select_option('#printer', '256'); page.wait_for_timeout(150)
    with page.expect_download(timeout=90000) as dl: (page.click('#dl3MF'), page.click('#infoGo'))
    pth = os.path.join(OUT, 'ui_a1.3mf'); dl.value.save_as(pth); cfg = zipfile.ZipFile(pth).read('Metadata/model_settings.config').decode()
    ok = 'Bambu Lab PLA' in cfg and 'Creality' not in cfg
    print(('  ✓ ' if ok else '  ✗ ') + '3MF A1 com filamentos Bambu Lab nas partes (sem Creality)'); fails.extend([] if ok else ['3mf a1'])
    # Formato no topo: 3MF / STL / STLs por cor
    for fmt_, expect in [('stl', '.stl'), ('3mf', '.3mf')]:
        with page.expect_download(timeout=90000) as dl: page.click('#dlSTL') if fmt_ == 'stl' else (page.click('#dl3MF'), page.click('#infoGo'))
        ok = dl.value.suggested_filename.endswith(expect); print(('  ✓ ' if ok else '  ✗ ') + f'Imprimir em {fmt_} → {dl.value.suggested_filename}'); fails.extend([] if ok else ['formato ' + fmt_])
    ok = page.evaluate("!!document.getElementById('dlSTL') && !!document.getElementById('dl3MF') && !document.getElementById('fileFormat') && !document.getElementById('quickPrint') && !document.getElementById('printHint') && !document.getElementById('export3MF') && !document.getElementById('exportSTL') && !document.getElementById('exportParts')")
    print(('  ✓ ' if ok else '  ✗ ') + 'só 3MF e STL no topo; sem botões de exportação repetidos em baixo'); fails.extend([] if ok else ['formatos'])
    # Cópias a mais → mais tabuleiros (3MF) / um STL por tabuleiro
    page.fill('#copyTop', '40'); page.wait_for_timeout(300)
    npl = page.evaluate("currentPlan().plates.filter(plate => plate.length).length")
    with page.expect_download(timeout=120000) as dl: (page.click('#dl3MF'), page.click('#infoGo'))
    pth = os.path.join(OUT, 'ui_40copias.3mf'); dl.value.save_as(pth)
    import zipfile as _z
    zz = _z.ZipFile(pth); c40 = zz.read('Metadata/model_settings.config').decode(); m40 = zz.read('3D/3dmodel.model').decode()
    ok = npl > 1 and c40.count('<plate>') == npl and m40.count('<item ') == 40
    print(('  ✓ ' if ok else '  ✗ ') + f'40 cópias → {npl} tabuleiros {m40.count("<item ")} peças no 3MF'); fails.extend([] if ok else ['tabuleiros'])
    got = []
    h = lambda d: got.append(d.suggested_filename)
    page.on('download', h); page.click('#dlSTL'); page.wait_for_timeout(6000); page.remove_listener('download', h)
    ok = len(got) == npl; print(('  ✓ ' if ok else '  ✗ ') + f'STL com 40 cópias → {got}'); fails.extend([] if ok else ['stl tabuleiros'])
    page.fill('#copyTop', '1'); page.wait_for_timeout(300)
    # Exportações: Imprimir (topo), 3MF, STL completo, STLs por cor, placa de teste
    # No Chrome de teste o pedido bambustudio:// abre um aviso do navegador que bloqueia os cliques seguintes: regista-se só que foi pedido.
    page.evaluate("window.openStudioAfter = () => { window.__studio = true }")
    for bid, n in [('infoGo', 1), ('infoStudio', 1)]:
        with page.expect_download(timeout=90000) as dl: (page.click('#dl3MF'), page.click('#' + bid))
        d = dl.value; path = os.path.join(OUT, 'ui_' + d.suggested_filename); d.save_as(path)
        ok = os.path.getsize(path) > 1000; print(('  ✓ ' if ok else '  ✗ ') + f'{bid} → {d.suggested_filename} ({os.path.getsize(path) // 1024} KB)'); fails.extend([] if ok else [bid])
    ok = page.evaluate('window.__studio === true'); print(('  ✓ ' if ok else '  ✗ ') + 'depois do 3MF é pedido o arranque do Bambu Studio'); fails.extend([] if ok else ['abrir studio'])
    page.click('#tabLetters'); page.evaluate("S.favorites = ['Pacifico', 'Lilita One']; renderGallery()")
    with page.expect_download(timeout=90000) as dl: page.click('#testPlate')
    print('  ✓ placa de teste → ' + dl.value.suggested_filename)
    # Seleção da peça, movimento, sugestões de nomes, cor e remoção reversível
    page.click('#addName')
    page.fill('#newName', 'Andre')
    page.get_by_role('button', name='André', exact=True).click()
    page.locator('#newName').press('Enter')
    page.wait_for_function("() => S.plateView && S.name === 'André' && !building && !$('addName').disabled")
    page.click('#movePiece')
    page.select_option('#plateCorner', 'right,bottom')
    assert page.evaluate("() => Math.abs(selectedPlacement().right - 123) < 0.001 && Math.abs(selectedPlacement().bottom + 123) < 0.001")
    page.locator('#pieceColor').evaluate("e => { e.value = '#ff0088'; e.dispatchEvent(new Event('input')) }")
    assert page.evaluate("S.plateView && S.letterColor === '#ff0088'")
    page.fill('#copyTop', '2'); page.locator('#copyTop').press('Tab')
    page.click('#movePiece')
    page.keyboard.press('Delete')
    assert page.evaluate('pieces.length === 2 && S.copies === 1')
    page.click('#undoRemoval')
    assert page.evaluate('pieces.length === 2 && S.copies === 2')
    page.click('#gl', position={'x': 12, 'y': 12})
    assert not page.locator('#pieceTools').is_visible()
    with page.expect_download(timeout=120000) as dl: (page.click('#dl3MF'), page.click('#infoGo'))
    with zipfile.ZipFile(dl.value.path()) as z:
        main = z.read('3D/3dmodel.model').decode()
        cfg = z.read('Metadata/model_settings.config').decode()
    assert 'value="André"' in cfg and '#FF0088' in cfg
    assert main.count('<item ') == 3 and cfg.count('key="layer_height" value="0.16"') == 2
    print('  ✓ sugestões, cópias, cantos, cor e remoção reversível')
    if errors: fails.append('erros finais: ' + '; '.join(errors[:3]))
    page.screenshot(path=os.path.join(OUT, 'ui_final.png'))
    b.close()
print(f"\n{steps} passos verificados — {'TUDO OK' if not fails else str(len(fails)) + ' FALHAS'}")
for f in fails: print('  -', f)
sys.exit(1 if fails else 0)
