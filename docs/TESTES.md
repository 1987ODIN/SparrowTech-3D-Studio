# Testes (V5)

```bash
npm run build          # gera dist/sparrowtech_3d_studio_v5.html
npm test               # geometria + 3MF (Node 18+, sem dependências externas)
npm run test:browser   # app no Chrome headless (requer: pip install playwright + Chrome)
```

## Resultados em 2026-11-15 (branch `feat/v5-geometria-vetorial`)

### `tests/geometry.test.cjs` — 1769/1769 OK
1. **Desvio em relação às curvas Bézier reais** («Filipa», 27 mm, 40 amostras por curva):

   | Fonte | Normal (≤0,02) | Fina (≤0,01) | Muito fina (≤0,004) |
   |---|---|---|---|
   | Pacifico | 0,0185 | 0,0087 | 0,0038 |
   | Lobster | 0,0162 | 0,0064 | 0,0025 |
   | Great Vibes | 0,0180 | 0,0091 | 0,0033 |

   Na V4 o erro era de meia célula da grelha: 0,07 a 0,25 mm, em degraus.
2. **120 modelos** (6 fontes × 4 acabamentos da frente × 5 do verso, formas e contorno alternados). Cada parte e o sólido único passam nestes testes: **estanque** (cada aresta usada exatamente por 2 triângulos com orientação oposta), **sem triângulos degenerados**, volume positivo e z mínimo = 0. Pior tempo: ~0,8 s.
3. **Partes sem sobreposição**: soma dos volumes das partes = volume da união (16 combinações).
4. **Nomes longos e acentos**: «Maria João» e «Sebastião» em muito fina (2–3 s, 76–97 mil triângulos), «Constança Margarida» em fina (~3,3 s, 101 mil triângulos), «Ana» em rascunho (<0,1 s).

### v5.2 — todos os controlos (`tests/ui_all_controls.py`) — 92 passos OK
Clica em todas as abas, em todos os botões de forma/acabamento/modo, leva cada deslizador ao mínimo e ao máximo, liga/desliga todas as caixas, muda as cores, percorre todas as opções de impressora/qualidade/bico/camada, cópias, organizar, vistas, cubo de vistas, seletor de fonte, modo fonte, importação de fonte e todas as exportações (Imprimir, 3MF, STL, STLs por cor, placa de teste). Depois de cada passo: sem erros na consola e todas as malhas fechadas. Inclui argola arrastada para fora (aviso «solta» + etiqueta no modelo) e reposição automática (segura, ~47 % da bola na peça).

### v5.1 — catálogo de fontes
* `geometry.test.cjs`: **3484/3484**. Inclui as 57 fontes × 3 variantes (normal; espessura +0,3 mm e espaçamento −5 %; espessura −0,1 mm, espaçamento +12 % e verso embutido) — todas estanques e sem degenerados; e testes de espaçamento, espessura e imprimibilidade (Great Vibes com bico 0,8 → aviso; Pacifico com 0,4 → OK).
* Correções encontradas por estes testes: polígonos que se tocam num ponto (separados com erosão de 0,5 µm), triângulos de área nula após soldadura, e tampas agora trianguladas exatamente com os anéis das paredes.
* `threemf.test.cjs`: **111/111**, incluindo a placa de teste com vários objetos.
* `browser_check.py`: clicar nas letras + roda troca de fonte sem zoom, Esc sai, roda sobre o seletor, ✓/⚠ na galeria, aviso de bico 0,8 e placa de teste com 3 objetos.

### `tests/threemf.test.cjs` — 95/95 OK
Gera 3 ficheiros 3MF reais (`tests/out/`) e verifica a estrutura esperada pelo leitor do Bambu/Orca/Creality ([3MF-CORES.md](3MF-CORES.md)): ficheiros obrigatórios, `Application`, componentes ↔ objetos ↔ `<part>`, filamento por parte (cores iguais partilham filamento), instâncias e posições, e malhas estanques depois de lidas do XML. O ZIP e o XML também foram validados com `zipfile`/`minidom` do Python.

### `tests/browser_check.py` — 40/40 OK (Chrome headless, dpr 1 e 2)
* Arranque com WebGL, Web Worker e as 6 fontes embutidas; malhas fechadas na pré-visualização.
* Zoom com a roda: o ponto sob o cursor fica no mesmo pixel (desvio 0,00 px).
* **Esquerdo + direito + arrastar** desloca a vista (−120, +70 px), não roda e não move a peça; o arrasto termina ao largar.
* Esquerdo sozinho volta a rodar; direito sozinho e Shift + esquerdo fazem pan.
* Peça num canto do tabuleiro: «⌖ Peça» centra-a.
* Clique nas letras seleciona o painel das letras.
* Exportações reais: 3MF com 4 partes, filamentos 1/2/3 e 2 cópias; STL completo válido.
* Durante um cálculo «Muito fina» a página continua a desenhar ~55 frames/s.
* Sem erros na consola.

### Ambientes que bloqueiam Web Workers
Testado com servidor local e `Content-Security-Policy`:
* `worker-src data:` (bloqueia `blob:`, como a pré-visualização do Claude): a app usa um Worker `data:` — OK.
* `worker-src 'none'`: modo compatível (cálculo na página, «Muito fina» só na exportação) — modelo, malhas fechadas e exportação 3MF OK, sem erros.

## Ainda por verificar manualmente
* Abrir `tests/out/*.3mf` ou um 3MF exportado pela app no **Bambu Studio** e no **Creality Print** e confirmar: 1 objeto, 3–4 partes, filamentos 1/2/3, posição no tabuleiro.
* Imprimir uma peça de teste (relevo + contorno) e comparar com o `Parametric_Model_Maker_1.stl`.
* Testar num GPU real. No Chrome em modo software (SwiftShader) com antialiasing aparecem alguns píxeis soltos na vista traseira; a geometria foi verificada e está correta (são artefactos do rasterizador por software).
