"""Telemóvel (emulação de toque no Chrome): toque seleciona, 1 dedo roda, 2 dedos fazem zoom e
deslocam, arrastar a argola com o dedo mostra a câmara secundária (lupa), e o Imprimir funciona.
Uso: python3 tests/mobile_check.py [dist.html]"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'sparrowtech_3d_studio_v5.html')
OUT = os.path.join(ROOT, 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, m): print(('  ✓ ' if c else '  ✗ ') + m); fails.extend([] if c else [m])

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto('file://' + HTML)
    pg.wait_for_selector('#introGo', state='visible', timeout=60000); txt = pg.inner_text('#introCard')
    intro_ok = 'argola' in txt and 'dedo' in txt; pg.screenshot(path=os.path.join(OUT, 'mobile_cartao_inicial.png')); pg.tap('#introGo')
    pg.wait_for_function('() => typeof model!=="undefined" && model && components.length && !building', timeout=90000); pg.wait_for_timeout(500)
    cdp = ctx.new_cdp_session(pg)
    def touch(kind, pts): cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
    def gesture(start, end, steps=12):
        touch('touchStart', start)
        for k in range(1, steps + 1):
            t = k / steps; touch('touchMove', [(a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t) for a, bb in zip(start, end)]); pg.wait_for_timeout(16)
        touch('touchEnd', [])
        pg.wait_for_timeout(80)
    box = pg.locator('#gl').bounding_box(); side = pg.locator('.side').bounding_box()
    check(side['y'] >= box['y'] + box['height'] - 2 and box['width'] >= 380, f"layout de telemóvel: modelo em cima ({box['width']:.0f}×{box['height']:.0f}), painel por baixo")
    pg.screenshot(path=os.path.join(OUT, 'mobile_inicio.png'))
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    pg.evaluate("setView('front'); fitCamera(); requestRender()"); pg.wait_for_timeout(100)
    c0 = pg.evaluate('({...camera})')
    gesture([(cx - 40, cy), (cx + 40, cy)], [(cx - 110, cy), (cx + 110, cy)])
    c1 = pg.evaluate('({...camera})')
    check(c1['scale'] > c0['scale'] * 2.3 and abs(c1['yaw'] - c0['yaw']) < 1e-6, f"2 dedos a afastar = zoom ({c0['scale']:.2f} → {c1['scale']:.2f}), sem rodar")
    gesture([(cx - 40, cy), (cx + 40, cy)], [(cx - 10, cy + 50), (cx + 70, cy + 50)])
    c2 = pg.evaluate('({...camera})')
    check(abs(c2['panX'] - c1['panX'] - 30) < 4 and abs(c2['panY'] - c1['panY'] - 50) < 4 and abs(c2['yaw'] - c1['yaw']) < 1e-6, f"2 dedos a mover = deslocar vista (Δ {c2['panX'] - c1['panX']:.0f}, {c2['panY'] - c1['panY']:.0f})")
    pg.evaluate("fitCamera(); setView('front'); requestRender()"); pg.wait_for_timeout(80)
    y0 = pg.evaluate('camera.yaw'); gesture([(cx, cy)], [(cx + 80, cy)])
    check(pg.evaluate('camera.yaw') - y0 > .3, '1 dedo roda o modelo')
    pg.evaluate("setView('front'); fitCamera(); requestRender()"); pg.wait_for_timeout(80)
    pt = pg.evaluate('''(() => { const R = model.regions, b = SparrowGeo.bounds(R.text); for (let i = 0; i < 3000; i++) { const x = b.minX + Math.random() * b.width, y = b.minY + Math.random() * b.height; if (SparrowGeo.contains(R.text, x, y) && Math.hypot(x - S.ringX, y - S.ringY) > 9) { const r = document.getElementById('gl').getBoundingClientRect(), s = project(x + S.positionX, y + S.positionY, (model.zShift || 0) + S.bodyThickness); return { x: s.x + r.left, y: s.y + r.top }; } } })()''')
    pg.touchscreen.tap(pt['x'], pt['y']); pg.wait_for_timeout(150)
    check(pg.evaluate('S.selected') == 'letters' and pg.evaluate('fontMode'), 'toque nas letras seleciona as letras (modo fonte)')
    pg.click('#fontNext'); pg.wait_for_timeout(1200); pg.wait_for_function('() => !building', timeout=60000)
    check(pg.evaluate("FONTS.indexOf(S.font)") == 1, f"botão ▶ troca de fonte no telemóvel ({pg.evaluate('S.font')})")
    # Arrastar a argola com o dedo → lupa
    rp = pg.evaluate("(()=>{const r=model.regions.ring,pos=objectPositions()[0],c=document.getElementById('gl').getBoundingClientRect(),s=project(r.x+pos.x,r.y+pos.y,(model.zShift||0)+S.bodyThickness);return {x:s.x+c.left,y:s.y+c.top}})()")
    touch('touchStart', [(rp['x'], rp['y'])])
    for k in range(1, 16): touch('touchMove', [(rp['x'] + k * 3, rp['y'] + k * 2)]); pg.wait_for_timeout(20)
    pg.wait_for_timeout(400)
    lo = pg.evaluate("!document.getElementById('loupe').classList.contains('hidden') && !!ringGhost && loupeOn")
    lb = pg.locator('#loupe').bounding_box() if lo else None
    if lo: pg.screenshot(path=os.path.join(OUT, 'mobile_camara_topo.png'), clip={'x': 0, 'y': 0, 'width': 390, 'height': 460})
    px = pg.evaluate("(()=>{const cv=document.getElementById('loupeCv'),d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let n=0;for(let i=0;i<d.length;i+=16)if(d[i]+d[i+1]+d[i+2]>120)n++;return n})()") if lo else 0
    check(px > 200, f'a câmara mostra mesmo a peça ({px} pontos desenhados)')
    check(lo and lb and lb['width'] > 120, f"arrastar a argola com o dedo abre a câmara secundária ({lb and round(lb['width'])} px)")
    if lb: check(not (lb['x'] <= rp['x'] + 45 <= lb['x'] + lb['width'] and lb['y'] <= rp['y'] + 30 <= lb['y'] + lb['height']), 'a câmara fica longe do dedo')
    pg.screenshot(path=os.path.join(OUT, 'mobile_lupa_argola.png'))
    touch('touchEnd', []); pg.wait_for_timeout(700); pg.wait_for_function('() => !building', timeout=60000)
    check(pg.evaluate("document.getElementById('loupe').classList.contains('hidden') && !ringGhost && components.every(c=>SparrowGeo.isClosed(c.mesh))"), 'ao largar: câmara fecha e a peça é recalculada (fechada)')
    if lb: check(lb['x'] < 20 and lb['y'] < 10, 'a câmara da argola fica fixa no canto superior esquerdo, por cima do título')
    check(intro_ok and not pg.locator('#introCard').is_visible(), 'cartão inicial explica a argola e fecha em «Começar»')
    hb = [pg.locator(i).bounding_box() for i in ('#dlSTL', '#dl3MF')]
    check(all(b and b['y'] < 54 and b['x'] + b['width'] <= 390 for b in hb), 'STL e 3MF no topo, à direita, dentro do ecrã')
    # Menu da argola no ecrã: toca na argola → tamanho (＋/−) e repor posição, sem ir ao painel
    rq = pg.evaluate("(()=>{const r=model.regions.ring,pos=objectPositions()[0],c=document.getElementById('gl').getBoundingClientRect(),s=project(r.x+pos.x,r.y+pos.y,(model.zShift||0)+S.bodyThickness);return {x:s.x+c.left,y:s.y+c.top,vb:c.bottom,vt:c.top}})()")
    pg.touchscreen.tap(rq['x'], rq['y']); pg.wait_for_timeout(250)
    mb = pg.locator('#ringMenu').bounding_box()
    check(pg.evaluate("S.selected") == 'ring' and mb is not None and mb['y'] >= rq['vt'] and mb['y'] + mb['height'] <= rq['vb'] + 1, 'tocar na argola abre o menu da argola dentro do ecrã do modelo')
    o0 = pg.evaluate('S.ringOuter'); pg.tap('#rmPlus'); pg.tap('#rmPlus'); pg.wait_for_timeout(900); pg.wait_for_function('() => !building', timeout=60000)
    check(pg.evaluate('S.ringOuter') == 8 and o0 < 8 and pg.evaluate("components.every(c=>SparrowGeo.isClosed(c.mesh))"), f"＋ aumenta a argola ({o0} → {pg.evaluate('S.ringOuter')} mm)")
    pg.tap('#rmMinus'); pg.tap('#rmMinus'); pg.wait_for_timeout(300)
    check(pg.evaluate('S.ringManual') is True, 'a argola estava numa posição manual')
    pg.tap('#rmReset'); pg.wait_for_timeout(900); pg.wait_for_function('() => !building', timeout=60000)
    check(pg.evaluate('S.ringManual') is False and pg.evaluate("model.regions.ring.status") == 'ok', 'Repor posição devolve a argola ao sítio seguro')
    pg.screenshot(path=os.path.join(OUT, 'mobile_menu_argola.png'))
    pg.tap('#rmClose'); pg.wait_for_timeout(100)
    check(pg.evaluate("document.getElementById('ringMenu').classList.contains('hidden')"), '✕ fecha o menu da argola')
    # Ao largar: o «rolar» do dedo (movimento pequeno nos últimos ms) não pode mover a argola
    pg.evaluate("setView('front'); fitCamera(); requestRender()"); pg.wait_for_timeout(100)
    rp = pg.evaluate("(()=>{const r=model.regions.ring,pos=objectPositions()[0],c=document.getElementById('gl').getBoundingClientRect(),s=project(r.x+pos.x,r.y+pos.y,(model.zShift||0)+S.bodyThickness);return {x:s.x+c.left,y:s.y+c.top}})()")
    tx, ty = rp['x'] + 30, rp['y'] + 18
    touch('touchStart', [(rp['x'], rp['y'])])
    for k in range(1, 11): touch('touchMove', [(rp['x'] + 3 * k, rp['y'] + 1.8 * k)]); pg.wait_for_timeout(20)
    pg.wait_for_timeout(250)                                   # dedo parado no sítio certo
    target = pg.evaluate("[S.ringX, S.ringY]")
    for k in range(1, 4): touch('touchMove', [(tx - 4 * k, ty - 2 * k)])   # rola ao levantar (rápido)
    touch('touchEnd', []); pg.wait_for_timeout(700); pg.wait_for_function('() => !building', timeout=60000)
    final = pg.evaluate("[S.ringX, S.ringY, model.regions.ring.x, model.regions.ring.y]")
    err = ((final[0] - target[0]) ** 2 + (final[1] - target[1]) ** 2) ** .5
    check(err < 0.15 and abs(final[2] - final[0]) < 1e-6, f'ao largar, o rolar do dedo é ignorado (desvio {err:.2f} mm)')
    # Letras redondas
    pg.evaluate("S.roundTop = true; S.letterRound = 0.3; updateControls(); scheduleRebuild(true)"); pg.wait_for_timeout(500); pg.wait_for_function('() => !building', timeout=90000)
    check(pg.evaluate("components.every(c=>SparrowGeo.isClosed(c.mesh)) && components.find(c=>c.id==='letters').mesh.triangleCount > 20000"), 'topo arredondado + pontas arredondadas (malhas fechadas)')
    # Imprimir no telemóvel
    pg.tap('#dl3MF'); check(not pg.locator('#infoStudio').is_visible(), 'no telemóvel o cartão do 3MF só tem descarregar')
    with pg.expect_download(timeout=90000) as dl: pg.tap('#infoGo')
    check(dl.value.suggested_filename.endswith('.3mf'), 'Imprimir no telemóvel descarrega o 3MF')
    pg.screenshot(path=os.path.join(OUT, 'mobile_final.png'), full_page=True)
    check(not errs, 'sem erros na consola' + (': ' + '; '.join(errs[:2]) if errs else ''))
    b.close()
print('TUDO OK' if not fails else f'{len(fails)} FALHAS'); sys.exit(1 if fails else 0)
