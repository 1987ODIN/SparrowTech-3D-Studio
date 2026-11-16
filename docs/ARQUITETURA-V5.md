# V5 — geometria vetorial, navegação e 3MF por filamento

## Causa-raiz dos três problemas da V4

| Problema | Causa na V4 | Correção na V5 |
|---|---|---|
| Letras «Minecraft» no STL/3MF | `computeMasks` desenhava o texto num canvas e convertia-o numa máscara de píxeis (`maskFromCanvas`); `meshFromLayers` criava um cubo por píxel. `smoothVoxelContour` só deslocava vértices: a topologia continuava em escada, em qualquer qualidade. | O texto passa a sair das **curvas Bézier da própria fonte** (opentype.js), amostradas com tolerância garantida, e é extrudido como polígono. Não há píxeis em nenhuma fase da geometria. |
| Zoom/clique desalinhados do cursor | `camera.scale*(window.devicePixelRatio\|\|1>2?2:…)` é avaliado como `dpr ? 2 : …`, ou seja, ×2 sempre. Num ecrã 1× o modelo era desenhado ao dobro e o pan não: o zoom não ficava sob o cursor e o clique selecionava ao lado. A rotação girava sempre em torno do centro do tabuleiro. | Escala única (`canvas.width / clientWidth`) para escala e pan; projeção JS idêntica à do shader; rotação em torno da peça. |
| Cores não separadas no slicer | O 3MF tinha só `<basematerials>` do 3MF genérico. Bambu Studio, OrcaSlicer e Creality Print atribuem filamentos por parte a partir de `Metadata/model_settings.config`, que não existia. | 3MF no formato que estes três slicers leem: um objeto com uma **parte** por cor e o `extruder` de cada parte. Ver [3MF-CORES.md](3MF-CORES.md). |

## Percurso da geometria (fonte → ficheiro exportado)

```
fonte TTF/OTF ──opentype.js──► comandos M/L/Q/C (Bézier)
  └─ flattenCommands: n.º de segmentos pela fórmula de Wang (desvio ≤ tol) e por ângulo máximo
     └─ Clipper (inteiros, 1 un. = 0,1 µm): união das letras (regra nonzero), offsets arredondados
        (rebordo, contorno), formas da base, argola, furos pequenos, verso espelhado
        └─ model.js: cada parte = lista de volumes {região, z0, z1} e bolsas
           └─ buildPart / buildSolid: lajes em z → paredes + tampas (earcut com furos)
              → soldadura de vértices → divisão de T-junctions → malha indexada fechada
                 ├─ pré-visualização WebGL (normais suaves nas paredes curvas)
                 ├─ STL binário (por parte ou sólido único)
                 └─ 3MF (uma parte por cor, filamento por parte)
```

### Qualidade

| Opção | Desvio máximo da curva | Ângulo máx. entre segmentos |
|---|---|---|
| Rascunho | 0,05 mm | 12° |
| Normal | 0,02 mm | 6° |
| Fina (por omissão) | 0,01 mm | 3,5° |
| Muito fina | 0,004 mm | 2° |

O desvio é medido nos testes contra a curva Bézier real (ver [TESTES.md](TESTES.md)). Para comparação, o STL de referência enviado tem segmentos de parede com mediana de 0,23 mm; a V5 em «Fina» fica na mesma ordem de grandeza nas curvas e mais fina nas curvas apertadas.

### Partes e acabamentos

Cada parte é um sólido fechado e as partes não se sobrepõem (testado: volume da união = soma das partes).

| Acabamento | Base | Letras | Contorno |
|---|---|---|---|
| Relevo | laje inteira | sobre a base, `altura` mm | 0,2 mm sobre a base |
| À face | bolsa de 0,4 mm com a pegada letras+contorno | embutidas 0,4 mm | embutido 0,4 mm |
| Gravado | bolsa com a forma das letras | — | embutido 0,2 mm no topo |
| Vazado | furo passante | — | embutido 0,2 mm no topo |

Verso: «À face» embute 0,4 mm, «Relevo» acrescenta letras por baixo (o modelo sobe para z ≥ 0), «Gravado» cava, «Passante» atravessa a base com as letras da frente. O texto do verso é reduzido até caber com 0,8 mm de margem e nunca fica a menos de 0,5 mm do rebordo.

### Robustez da malha

* As regiões passam por uniões estritamente simples; anéis que se tocam ao longo de arestas são resolvidos com uma união extra.
* As tampas entre lajes são calculadas pelas «receitas» (`(Ua − Ub) − Pa ∪ Ua ∩ (Pb − Pa)`), sem subtrair regiões quase iguais — evita as arestas coincidentes que tornavam o Clipper lento e frágil.
* As bolsas na base usam pegadas sem recorte (ex.: letras + contorno numa só região), pelo mesmo motivo.
* No fim: soldadura de vértices a ≤ 0,3 µm, divisão iterativa das arestas abertas e, se ainda restar alguma aresta aberta, novo cálculo com diferenças diretas. `isClosed()` confirma o resultado.

## Desempenho

O cálculo corre num **Web Worker** criado a partir do próprio HTML (funciona offline com `file://`). Se o ambiente proibir Workers `blob:` (ex.: pré-visualização do Claude), tenta um Worker `data:`; se também for proibido, entra em **modo compatível** (cálculo na página, pré-visualização no máximo em «Fina», exportação na qualidade escolhida). A interface não bloqueia, mesmo em «Muito fina». Durante o arrasto da argola usa-se a qualidade «Normal» e, ao largar, a qualidade escolhida. Exportações usam sempre a qualidade escolhida.

Tempos medidos em Node (máquina de testes), qualidade fina: 0,1–1 s por modelo; nomes longos em «Muito fina»: 2–4 s (100 mil triângulos).

## Navegação

| Gesto | Ação |
|---|---|
| Esquerdo + arrastar | rodar à volta da peça |
| **Esquerdo + direito** + arrastar | deslocar a vista (pan), sem mover a peça |
| Direito, roda premida ou Shift + esquerdo | deslocar a vista |
| Roda | zoom em torno do cursor |
| Duplo clique | centrar o ponto e aproximar |
| Ctrl + arrastar (vista do tabuleiro) | mover a peça no tabuleiro |
| Clique (sem arrastar) | selecionar letras, base ou argola |
| Arrastar a argola | reposicionar a argola |
| «⌖ Peça» | centra e enquadra a peça, mesmo num canto do tabuleiro |

Pormenores: os botões vêm de `event.buttons` (esquerdo = 1, direito = 2, ambos = 3). Um segundo botão premido durante um arrasto chega como `pointermove` (eventos «chorded») e como `mousedown`; ambos mudam o arrasto para pan. A rotação ou o movimento que o primeiro botão já tivesse feito é reposto, por isso premir os dois botões quase ao mesmo tempo não roda a peça. O menu de contexto está desligado no canvas. A seleção por clique acontece ao largar o botão e só se não houve arrasto.

## Ficheiros

* `src/geometry.js` — motor vetorial (sem dependências do DOM; também corre em Node).
* `src/model.js` — regras do produto: formas, argola, acabamentos, partes.
* `src/threemf.js` — escrita do 3MF e ZIP.
* `src/app.js`, `src/index.html` — interface (derivada da V4).
* `tools/build.mjs` — gera `dist/sparrowtech_3d_studio_v5.html` (ficheiro único, offline).
* `vendor/` — opentype.js 1.3.4 (MIT), Clipper 6.4.2 JS (Boost; inclui jsbn, licença BSD), earcut 2.2.4 (ISC).
* `fonts/` — subconjuntos Latin das fontes (todas SIL OFL 1.1; licenças ao lado).
* `legacy/sparrowtech_3d_studio_v4.html` — V4 original, para comparação.

## Fontes, troca rápida e imprimibilidade (v5.1)

* **57 fontes** embutidas (subconjunto Latin, sem hinting, só as features que o opentype.js aplica — a pré-visualização da galeria e a geometria usam as mesmas formas), geradas por `tools/prepare_fonts.py` a partir do google/fonts. Três grupos: **Recomendadas para nomes** (manuscritas), **Letra de imprensa** (grossas, «à máquina») e **Finas e elegantes**. Licenças em `fonts/licencas/` (SIL OFL 1.1; Chewy, Rochester, Satisfy, Yellowtail, Luckiest Guy e Special Elite: Apache 2.0).
* **Trocar de fonte com a roda:** clicar nas letras do modelo ativa o «modo fonte» (moldura amarela no seletor ◀ Fonte ▶); a roda passa a percorrer as fontes em vez de fazer zoom. Esc, clique fora das letras ou clique no nome da fonte saem do modo. A roda sobre o seletor troca sempre. Durante a troca usa-se uma pré-visualização rápida e, 0,65 s depois, a qualidade escolhida.
* **Espessura das letras** (−0,2 a +0,8 mm, offset arredondado do traço) e **Espaçamento entre letras** (−10 % a +20 % do em). O exemplo `CatarinaTag.3mf`/`Parametric_Model_Maker_1.stl` usa letras engrossadas; nenhuma das ~60 fontes gratuitas testadas coincide exatamente (as mais próximas: Euphoria Script, Leckerli One, Lily Script One, Pacifico).
* **Bico e camada** (separador Impressão): para o bico escolhido, `printability()` mede a fração do traço mais fina do que o bico (abertura morfológica de raio bico/2) e os espaços mais estreitos do que o bico (fecho), e sugere o que mudar. A galeria mostra ✓/⚠ por fonte para o nome atual (análise no Worker, em rascunho). Mostra ainda quantas camadas tem a altura das letras.
* **Placa de teste:** marca até 12 fontes com ★ e exporta um 3MF com o mesmo nome em cada fonte (um objeto por fonte, com as partes por filamento) para imprimir e comparar.

## Argola segura e interface simplificada (v5.2)

* **Posição automática segura:** procura no canto superior esquerdo uma posição com 30–50 % do disco da argola em cima da peça, sem o furo cortar letras e evitando tapar letras (pesquisa grossa + refinamento sobre contornos simplificados, ~0,1 s).
* **Reforço da ligação** (ativo por omissão): fecho morfológico local (raio ≈ 0,6 × raio da argola) que acrescenta um filete arredondado no pescoço entre a argola e a peça. As lascas do fecho ao longo do contorno são descartadas; o filete cresce 0,05 mm para sobrepor sem arestas tangentes.
* **Avaliação:** `solta` (sem ligação), `fraca` (< 20 % da bola na peça ou parede < 1,2 mm), aviso se o furo cortar letras ou se a parede for < 1,6 mm. Aparece no painel da argola, no aviso geral e numa etiqueta junto à argola no modelo («arrasta a argola» durante os primeiros segundos, ou o aviso de fragilidade). O cursor muda para «mover» por cima da argola.
* **Interface:** o seletor Easy/Profissional saiu (não mudava nada). No topo do painel há o botão **🖨 Imprimir — descarregar 3MF**, que exporta logo com as definições atuais. A aba de impressão passou a **⚙ Pro (beta)**: impressora, cópias, bico, camada, qualidade, modo sequencial e outros formatos. Nas Letras, o aviso de bico só aparece quando há problema.

## Filamentos reais, formato no topo e arrasto fluido (v5.3)

* **Paleta de filamentos oficial** (`src/filaments.js`, gerado por `tools/prepare_filaments.py` a partir de `data/`): Bambu Lab (PLA Basic, Matte, Silk, Lite, Tough, PETG Basic/HF — nomes em português e código de cor oficial, ex. «PLA Basic Ciano (10603)») e Creality (Hyper PLA, CR-PLA, CR-PLA Matte, CR-Silk, Soleyin Ultra PLA, Ender Fast PLA, Hyper PETG, CR-PETG — nomes em inglês, como na lista do Creality Print, que não tem código por cor). A marca segue a impressora: A1/A1 Mini → Bambu Lab, K1C → Creality; ao mudar de impressora cada parte passa para a cor mais próxima da outra marca. Há sempre «cor livre». Os nomes dos filamentos vão nas partes do 3MF e só aparece a marca da impressora escolhida.
* **Topo do painel:** impressora, ficheiro (3MF com cores / STL uma peça / STL por cor), chips de filamento por parte e botão Imprimir; a dica indica o slicer certo (Bambu Studio ou Creality Print).
* **Materiais na pré-visualização:** Basic acetinado, Matte baço, Silk brilho sedoso, PETG brilhante.
* **Arrasto da argola em tempo real:** ao começar a arrastar, a peça é recalculada uma vez (rascunho, sem argola) e a argola passa a ser uma forma desenhada diretamente na GPU que segue o cursor; a força da ligação (% da bola na peça, ou «tapa letras») é calculada ao vivo e mostrada na cor e na etiqueta. Ao largar, a peça é recalculada com o reforço. Teste: `tests/ring_drag.py` (1 cálculo para 40 movimentos).

## Telemóvel, câmara da argola e letras redondas (v5.4)

* **Toque:** 1 dedo roda; 2 dedos aproximam/afastam (zoom em torno do ponto entre os dedos) e deslocam; toque simples seleciona (nas letras ativa o modo fonte, troca com ◀ ▶). A zona de toque da argola é maior. Ao trocar de fonte só a galeria rola — a página não salta e o modelo não sai do ecrã.
* **Câmara secundária da argola:** ao arrastar a argola com o dedo abre-se, no canto oposto ao dedo, uma segunda vista (de cima, ampliada ~2×, centrada na argola) desenhada pela GPU no mesmo canvas (scissor/viewport), com a argola colorida pela força da ligação. O cubo de vistas, a etiqueta de seleção e o seletor de fonte escondem-se enquanto a câmara está aberta.
* **Ecrã pequeno:** cabeçalho compacto, modelo com 62 % da altura, painel por baixo, botões maiores.
* **Topo arredondado (3D):** a parte saliente das letras é feita de lajes cada vez mais estreitas segundo um quarto de círculo (raio até 0,8 mm, degraus ≤ 0,1 mm — da ordem da altura de camada), também nas letras em relevo do verso.
* **Pontas arredondadas:** «abertura» morfológica (encolhe r, cresce r) que arredonda bicos e terminações finas das letras.
* Testes: `tests/mobile_check.py` (emulação de toque com multitoque real via CDP) e novos casos em `geometry.test.cjs` (3719 verificações).

## Largar a argola sem ela «fugir» (v5.5)

Ao levantar o dedo, a ponta rola e os últimos eventos de movimento deslocam a argola uns milímetros (às vezes para trás). Correção (`releasePosition`): guarda-se o histórico do arrasto (posição + tempo); ao largar, entre as amostras a ≤ 22 px do ponto final, (1) se houve uma pausa ≥ 90 ms usa-se a posição dessa pausa; (2) senão, ignoram-se os últimos ~110 ms (60 ms com rato). Movimentos finais maiores do que 22 px contam como intencionais. Com o dedo há também um amortecimento curto do tremor durante o arrasto. Teste em `tests/mobile_check.py` (desvio 0,00 mm).

## Só Bambu Lab, descarregar no topo e bicos por nível (v5.6)

> Esta secção substitui o que as secções anteriores dizem sobre a Creality K1C e a paleta Creality: foram retiradas da app.

* **Impressoras:** só Bambu Lab, agrupadas pelo tamanho do tabuleiro — 180×180 (A1 mini), 256×256 (A1, P1P, P1S, P2S, X1C, X1E) e grandes (A2L 330×320, H2S 340×320, H2D 325×320, H2C 300×320). O tabuleiro deixou de ser sempre quadrado (`plateW()`/`plateH()`; o 3MF recebe `plateW`/`plateH`).
* **Paleta:** só filamentos Bambu Lab (`data/bambu_filaments_color_codes.json`).
* **Topo:** cabeçalho mais pequeno com o botão **⬇** (descarrega no formato escolhido: 3MF, STL ou STL por cor). As medidas em mm deixaram de aparecer sobre o modelo.
* **Bicos por nível:** 0,2 mm = Premium (camadas muito finas), 0,4 mm = Normal (o mínimo aceitável para letras), 0,6/0,8 mm = não recomendados para letras. Quando as letras não saem bem com o bico escolhido, a app calcula o tamanho mínimo da peça (`minScaleFor`, pesquisa binária até 400 %) e oferece «Aumentar para X %».
* **Imprimibilidade mais exigente:** um traço só conta como imprimível se couberem 2 perímetros (abertura morfológica com raio = bico).
* **Camadas por bico:** a lista de alturas depende do bico (0,2: 0,06–0,12; 0,4: 0,08–0,24; 0,6: 0,18–0,30; 0,8: 0,24–0,40), com uma recomendada; mudar de bico escolhe a recomendada.
* **Camada no 3MF:** a altura de camada vai como definição do objeto (`<metadata key="layer_height">` em `model_settings.config`). **O bico não pode ir no ficheiro** — pertence à predefinição da impressora, que não exportamos (ver 3MF-CORES.md); a app diz qual escolher no Bambu Studio. Falta confirmar no Bambu Studio real que a camada do objeto é aplicada ao abrir.

## Só 3MF ou STL, vários tabuleiros e menu da argola no ecrã (v5.7)

* **Descarregar só no topo:** o ficheiro é 3MF (cores) ou STL. Saíram «STL por cor» e os botões de exportação repetidos no separador Pro.
* **Cópias (1–40) no topo.** As que não cabem num tabuleiro passam para os seguintes (até 36). No 3MF cada tabuleiro é um `<plate>` em `model_settings.config` e as peças ficam na grelha que o Bambu Studio usa (`PartPlate.cpp`: colunas = teto(√n), passo = tamanho do tabuleiro × 1,2, linhas para −Y). Em STL sai um ficheiro por tabuleiro. **Por confirmar no Bambu Studio real**; a grelha só coincide se a impressora escolhida no slicer tiver o mesmo tabuleiro da escolhida na app.
* **Menu da argola no ecrã:** tocar/clicar na argola abre, dentro da vista do modelo, um menu com tamanho (− / cursor / ＋; o furo acompanha a proporção) e «Repor posição». No telemóvel deixa de ser preciso descer ao painel.
* Testes: `threemf.test.cjs` (118), `ui_all_controls.py` (40 cópias → 2 tabuleiros), `mobile_check.py` (menu da argola).
