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
    check(lo and lb and lb['width'] > 120, f"arrastar a argola com o dedo abre a câmara secundária ({lb and round(lb['width'])} px)")
    if lb: check(not (lb['x'] <= rp['x'] + 45 <= lb['x'] + lb['width'] and lb['y'] <= rp['y'] + 30 <= lb['y'] + lb['height']), 'a câmara fica longe do dedo')
    pg.screenshot(path=os.path.join(OUT, 'mobile_lupa_argola.png'))
    touch('touchEnd', []); pg.wait_for_timeout(700); pg.wait_for_function('() => !building', timeout=60000)
    check(pg.evaluate("document.getElementById('loupe').classList.contains('hidden') && !ringGhost && components.every(c=>SparrowGeo.isClosed(c.mesh))"), 'ao largar: câmara fecha e a peça é recalculada (fechada)')
    # Letras redondas
    pg.evaluate("S.roundTop = true; S.letterRound = 0.3; updateControls(); scheduleRebuild(true)"); pg.wait_for_timeout(500); pg.wait_for_function('() => !building', timeout=90000)
    check(pg.evaluate("components.every(c=>SparrowGeo.isClosed(c.mesh)) && components.find(c=>c.id==='letters').mesh.triangleCount > 20000"), 'topo arredondado + pontas arredondadas (malhas fechadas)')
    # Imprimir no telemóvel
    pg.locator('#quickPrint').scroll_into_view_if_needed()
    with pg.expect_download(timeout=90000) as dl: pg.click('#quickPrint')
    check(dl.value.suggested_filename.endswith('.3mf'), 'Imprimir no telemóvel descarrega o 3MF')
    pg.screenshot(path=os.path.join(OUT, 'mobile_final.png'), full_page=True)
    check(not errs, 'sem erros na consola' + (': ' + '; '.join(errs[:2]) if errs else ''))
    b.close()
print('TUDO OK' if not fails else f'{len(fails)} FALHAS'); sys.exit(1 if fails else 0)
