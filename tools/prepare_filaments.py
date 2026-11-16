"""Gera src/filaments.js a partir das listas oficiais de cores de filamento.

Fontes (copiadas em data/):
  Bambu Lab: github.com/bambulab/BambuStudio  resources/profiles/BBL/filament/filaments_color_codes.json
  Creality : github.com/CrealityOfficial/CrealityPrint  resources/profiles/Creality/filament/filaments_color.json
Uso: python3 tools/prepare_filaments.py
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAMBU_SERIES = ['PLA Basic', 'PLA Matte', 'PLA Silk', 'PLA Lite', 'PLA Tough', 'PETG Basic', 'PETG HF']
CREALITY_SERIES = ['Hyper PLA', 'CR-PLA', 'CR-PLA Matte', 'CR-Silk', 'Soleyin Ultra PLA', 'ENDER FAST PLA', 'Hyper PETG', 'CR-PETG']

def hex6(c): return c[:7].upper()

def main():
    b = json.load(open(os.path.join(ROOT, 'data/bambu_filaments_color_codes.json'), encoding='utf-8'))['data']
    bambu = {s: [] for s in BAMBU_SERIES}
    for x in b:
        s = x.get('fila_type')
        if s not in bambu or len(x.get('fila_color') or []) != 1: continue
        n = x.get('fila_color_name') or {}
        bambu[s].append({'code': x.get('fila_color_code', ''), 'name': n.get('pt') or n.get('en') or '', 'hex': hex6(x['fila_color'][0])})
    c = json.load(open(os.path.join(ROOT, 'data/creality_filaments_color.json'), encoding='utf-8'))['data']
    creality = {s: [] for s in CREALITY_SERIES}
    seen = set()
    for x in c:
        s = x.get('name')
        if s not in creality or len(x.get('colors') or []) != 1: continue
        key = (s, x.get('colorEn'), x['colors'][0])
        if key in seen: continue
        seen.add(key)
        creality[s].append({'code': x.get('id', ''), 'name': x.get('colorEn', ''), 'hex': hex6(x['colors'][0])})
    out = {'Bambu Lab': {k: v for k, v in bambu.items() if v}, 'Creality': {k: v for k, v in creality.items() if v}}
    js = ('/* Gerado por tools/prepare_filaments.py a partir das listas oficiais do Bambu Studio e do Creality Print. Não editar à mão. */\n'
          '(function (root) { const F = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
          '  if (typeof module === "object" && module.exports) module.exports = F; else root.SPARROW_FILAMENTS = F;\n'
          '})(typeof self !== "undefined" ? self : this);\n')
    open(os.path.join(ROOT, 'src/filaments.js'), 'w', encoding='utf-8').write(js)
    for brand, series in out.items(): print(brand, {k: len(v) for k, v in series.items()})

if __name__ == '__main__': main()
