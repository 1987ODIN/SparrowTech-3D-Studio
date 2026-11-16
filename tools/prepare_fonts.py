"""Prepara as fontes embutidas (reprodutível).

Descarrega do repositório google/fonts, fixa o peso das fontes variáveis, faz um subconjunto
Latin (incluindo acentos portugueses) mantendo kerning/ligaduras, e escreve fonts/catalog.json.

Uso: python3 tools/prepare_fonts.py [pasta_cache]
Requer: pip install fonttools
Todas as fontes são SIL OFL 1.1, exceto as marcadas Apache 2.0.
"""
import json, os, subprocess, sys, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.fontcache')
OUT = os.path.join(ROOT, 'fonts')
RAW = 'https://raw.githubusercontent.com/google/fonts/main/'

# (nome na app, caminho no google/fonts, grupo, eixos para fixar)
#  grupos: 'nomes' = manuscritas recomendadas para nomes; 'imprensa' = letra de imprensa grossa;
#          'fina' = elegante, pede letra grande, bico fino ou mais espessura
CATALOG = [
    ('Pacifico', 'ofl/pacifico/Pacifico-Regular.ttf', 'nomes', None),
    ('Lobster', 'ofl/lobster/Lobster-Regular.ttf', 'nomes', None),
    ('Lobster Two', 'ofl/lobstertwo/LobsterTwo-Bold.ttf', 'nomes', None),
    ('Leckerli One', 'ofl/leckerlione/LeckerliOne-Regular.ttf', 'nomes', None),
    ('Lily Script One', 'ofl/lilyscriptone/LilyScriptOne-Regular.ttf', 'nomes', None),
    ('Shrikhand', 'ofl/shrikhand/Shrikhand-Regular.ttf', 'nomes', None),
    ('Oleo Script', 'ofl/oleoscript/OleoScript-Bold.ttf', 'nomes', None),
    ('Euphoria Script', 'ofl/euphoriascript/EuphoriaScript-Regular.ttf', 'nomes', None),
    ('Cookie', 'ofl/cookie/Cookie-Regular.ttf', 'nomes', None),
    ('Damion', 'ofl/damion/Damion-Regular.ttf', 'nomes', None),
    ('Yellowtail', 'apache/yellowtail/Yellowtail-Regular.ttf', 'nomes', None),
    ('Kaushan Script', 'ofl/kaushanscript/KaushanScript-Regular.ttf', 'nomes', None),
    ('Courgette', 'ofl/courgette/Courgette-Regular.ttf', 'nomes', None),
    ('Grand Hotel', 'ofl/grandhotel/GrandHotel-Regular.ttf', 'nomes', None),
    ('Norican', 'ofl/norican/Norican-Regular.ttf', 'nomes', None),
    ('Dancing Script', 'ofl/dancingscript/DancingScript[wght].ttf', 'nomes', {'wght': 700}),
    ('Satisfy', 'apache/satisfy/Satisfy-Regular.ttf', 'nomes', None),
    ('Playball', 'ofl/playball/Playball-Regular.ttf', 'nomes', None),
    ('Berkshire Swash', 'ofl/berkshireswash/BerkshireSwash-Regular.ttf', 'nomes', None),
    ('Niconne', 'ofl/niconne/Niconne-Regular.ttf', 'nomes', None),
    ('Yesteryear', 'ofl/yesteryear/Yesteryear-Regular.ttf', 'nomes', None),
    ('Rochester', 'apache/rochester/Rochester-Regular.ttf', 'nomes', None),
    ('Marck Script', 'ofl/marckscript/MarckScript-Regular.ttf', 'nomes', None),
    ('Mr Dafoe', 'ofl/mrdafoe/MrDafoe-Regular.ttf', 'nomes', None),
    ('Festive', 'ofl/festive/Festive-Regular.ttf', 'nomes', None),
    ('Sofia', 'ofl/sofia/Sofia-Regular.ttf', 'nomes', None),
    ('Bad Script', 'ofl/badscript/BadScript-Regular.ttf', 'nomes', None),
    ('Merienda', 'ofl/merienda/Merienda[wght].ttf', 'nomes', {'wght': 700}),
    ('Caveat', 'ofl/caveat/Caveat[wght].ttf', 'nomes', {'wght': 700}),
    ('Kalam', 'ofl/kalam/Kalam-Bold.ttf', 'imprensa', None),
    ('Sriracha', 'ofl/sriracha/Sriracha-Regular.ttf', 'imprensa', None),
    ('Gochi Hand', 'ofl/gochihand/GochiHand-Regular.ttf', 'imprensa', None),
    ('Chewy', 'apache/chewy/Chewy-Regular.ttf', 'imprensa', None),
    ('Borel', 'ofl/borel/Borel-Regular.ttf', 'imprensa', None),
    ('Fredoka', 'ofl/fredoka/Fredoka[wdth,wght].ttf', 'imprensa', {'wght': 600, 'wdth': 100}),
    ('Sniglet', 'ofl/sniglet/Sniglet-ExtraBold.ttf', 'imprensa', None),
    ('Cherry Bomb One', 'ofl/cherrybombone/CherryBombOne-Regular.ttf', 'imprensa', None),
    ('Calistoga', 'ofl/calistoga/Calistoga-Regular.ttf', 'imprensa', None),
    ('Lilita One', 'ofl/lilitaone/LilitaOne-Regular.ttf', 'imprensa', None),
    ('Titan One', 'ofl/titanone/TitanOne-Regular.ttf', 'imprensa', None),
    ('Luckiest Guy', 'apache/luckiestguy/LuckiestGuy-Regular.ttf', 'imprensa', None),
    ('Baloo 2', 'ofl/baloo2/Baloo2[wght].ttf', 'imprensa', {'wght': 800}),
    ('Nunito', 'ofl/nunito/Nunito[wght].ttf', 'imprensa', {'wght': 900}),
    ('Bowlby One', 'ofl/bowlbyone/BowlbyOne-Regular.ttf', 'imprensa', None),
    ('Special Elite', 'apache/specialelite/SpecialElite-Regular.ttf', 'imprensa', None),
    ('Great Vibes', 'ofl/greatvibes/GreatVibes-Regular.ttf', 'fina', None),
    ('Allura', 'ofl/allura/Allura-Regular.ttf', 'fina', None),
    ('Alex Brush', 'ofl/alexbrush/AlexBrush-Regular.ttf', 'fina', None),
    ('Parisienne', 'ofl/parisienne/Parisienne-Regular.ttf', 'fina', None),
    ('Sacramento', 'ofl/sacramento/Sacramento-Regular.ttf', 'fina', None),
    ('Pinyon Script', 'ofl/pinyonscript/PinyonScript-Regular.ttf', 'fina', None),
    ('Arizonia', 'ofl/arizonia/Arizonia-Regular.ttf', 'fina', None),
    ('Tangerine', 'ofl/tangerine/Tangerine-Bold.ttf', 'fina', None),
    ('Carattere', 'ofl/carattere/Carattere-Regular.ttf', 'fina', None),
    ('Style Script', 'ofl/stylescript/StyleScript-Regular.ttf', 'fina', None),
    ('Imperial Script', 'ofl/imperialscript/ImperialScript-Regular.ttf', 'fina', None),
    ('Bonheur Royale', 'ofl/bonheurroyale/BonheurRoyale-Regular.ttf', 'fina', None),
]
UNICODES = 'U+0020-007E,U+00A0-00FF,U+0152-0153,U+0160-0161,U+0178,U+017D-017E,U+2013-2014,U+2018-201E,U+2026,U+20AC'

def fetch(path):
    os.makedirs(CACHE, exist_ok=True)
    dst = os.path.join(CACHE, path.replace('/', '__'))
    if not os.path.exists(dst):
        url = RAW + path.replace('[', '%5B').replace(']', '%5D')
        urllib.request.urlretrieve(url, dst)
    return dst

def main():
    os.makedirs(os.path.join(OUT, 'licencas'), exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(('.ttf', '.otf')): os.remove(os.path.join(OUT, f))
    catalog = []
    for name, path, group, axes in CATALOG:
        src = fetch(path)
        fn = name.replace(' ', '') + '.ttf'
        tmp = os.path.join(CACHE, 'inst_' + fn)
        if axes:
            f = TTFont(src); instancer.instantiateVariableFont(f, axes, inplace=True); f.save(tmp); src = tmp
        subprocess.run(['pyftsubset', src, '--unicodes=' + UNICODES, # Só as features que o opentype.js aplica (kern, liga, rlig…): assim a pré-visualização do
        # browser e a geometria 3D usam exatamente as mesmas formas. Sem hinting (inútil em 3D).
        '--layout-features=kern,liga,rlig,ccmp,locl,mark,mkmk', '--no-hinting', '--name-IDs=*', '--notdef-outline', '--output-file=' + os.path.join(OUT, fn)], check=True, capture_output=True)
        lic = 'OFL-1.1' if path.startswith('ofl/') else 'Apache-2.0'
        family_dir = os.path.dirname(path)
        lic_src = fetch(family_dir + ('/OFL.txt' if lic == 'OFL-1.1' else '/LICENSE.txt'))
        with open(lic_src, 'rb') as a, open(os.path.join(OUT, 'licencas', name.replace(' ', '') + '.txt'), 'wb') as b: b.write(a.read())
        catalog.append({'name': name, 'file': fn, 'group': group, 'license': lic, 'source': 'https://github.com/google/fonts/tree/main/' + family_dir})
        print(f'{name:18} {group:6} {os.path.getsize(os.path.join(OUT, fn)) // 1024:4d} KB')
    json.dump(catalog, open(os.path.join(OUT, 'catalog.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('total', sum(os.path.getsize(os.path.join(OUT, c['file'])) for c in catalog) // 1024, 'KB')

if __name__ == '__main__':
    main()
