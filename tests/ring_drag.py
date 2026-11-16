"""Arrasto da argola: deve seguir o cursor sem recalcular a peça a cada movimento (argola «fantasma»
na GPU), mostrar a força da ligação ao vivo e recalcular uma vez ao largar.
Uso: python3 tests/ring_drag.py [dist.html]"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'sparrowtech_3d_studio_v5.html')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto('file://' + HTML + '#semintro')
    pg.wait_for_function('() => typeof model!=="undefined" && model && components.length && !building', timeout=60000); pg.wait_for_timeout(500)
    pg.evaluate("setView('front'); fitCamera(); requestRender(); window.__builds=0; const pm=worker.postMessage.bind(worker); worker.postMessage=(m,t)=>{ if(m && m.type==='build') window.__builds++; return pm(m,t) }")
    pt = pg.evaluate("(()=>{const r=model.regions.ring,pos=objectPositions()[0],c=document.getElementById('gl').getBoundingClientRect(),s=project(r.x+pos.x,r.y+pos.y,(model.zShift||0)+S.bodyThickness);return {x:s.x+c.left,y:s.y+c.top}})()")
    pg.mouse.move(pt['x'], pt['y']); pg.mouse.down(); states = []
    for i in range(1, 41):
        pg.mouse.move(pt['x'] - i * 3, pt['y'] - i * 2); pg.wait_for_timeout(16)
        states.append(pg.evaluate("ringGhost && ringGhost.status"))
    builds = pg.evaluate('window.__builds'); pg.mouse.up(); pg.wait_for_timeout(700); pg.wait_for_function('() => !building', timeout=30000)
    final = pg.evaluate("[model.regions.ring.status, components.every(c=>SparrowGeo.isClosed(c.mesh)), !!ringGhost]")
    ok = builds <= 2 and all(states) and 'solta' in states and final[1] and not final[2] and not errs
    print(f"estados {states[0]}→{states[-1]}, cálculos durante 40 movimentos: {builds}, final {final}, erros {errs[:2]}")
    print('TUDO OK' if ok else 'FALHOU'); b.close(); sys.exit(0 if ok else 1)
