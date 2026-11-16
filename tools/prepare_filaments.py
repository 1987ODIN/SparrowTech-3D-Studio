"""Gera src/filaments.js a partir das listas oficiais de cores de filamento.

Fonte (copiada em data/):
  Bambu Lab: github.com/bambulab/BambuStudio  resources/profiles/BBL/filament/filaments_color_codes.json
Uso: python3 tools/prepare_filaments.py
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAMBU_SERIES = ['PLA Basic', 'PLA Matte', 'PLA Silk', 'PLA Lite', 'PLA Tough', 'PETG Basic', 'PETG HF']

def hex6(c): return c[:7].upper()

def main():
    b = json.load(open(os.path.join(ROOT, 'data/bambu_filaments_color_codes.json'), encoding='utf-8'))['data']
    bambu = {s: [] for s in BAMBU_SERIES}
    for x in b:
        s = x.get('fila_type')
        if s not in bambu or len(x.get('fila_color') or []) != 1: continue
        n = x.get('fila_color_name') or {}
        bambu[s].append({'code': x.get('fila_color_code', ''), 'name': n.get('pt') or n.get('en') or '', 'hex': hex6(x['fila_color'][0])})
    # Só Bambu Lab: o ficheiro é feito para o Bambu Studio (a lista Creality ficou de fora a pedido).
    out = {'Bambu Lab': {k: v for k, v in bambu.items() if v}}
    js = ('/* Gerado por tools/prepare_filaments.py a partir das listas oficiais do Bambu Studio e do Creality Print. Não editar à mão. */\n'
          '(function (root) { const F = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
          '  if (typeof module === "object" && module.exports) module.exports = F; else root.SPARROW_FILAMENTS = F;\n'
          '})(typeof self !== "undefined" ? self : this);\n')
    open(os.path.join(ROOT, 'src/filaments.js'), 'w', encoding='utf-8').write(js)
    for brand, series in out.items(): print(brand, {k: len(v) for k, v in series.items()})

if __name__ == '__main__': main()
