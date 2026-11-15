# PASSAGEM DE TRABALHO PARA CLAUDE — SparrowTech 3D Studio
Data: 2026-11-15
Repositório: https://github.com/1987ODIN/SparrowTech-3D-Studio
Issue principal: https://github.com/1987ODIN/SparrowTech-3D-Studio/issues/1

## PEDIDO DO UTILIZADOR
Melhora o software EXISTENTE, não faças apenas uma demonstração nem substituas a interface sem necessidade. O problema prioritário é a qualidade REAL da geometria das letras: estão em degraus, como Minecraft, mesmo com o modo de qualidade máxima. O resultado tem de ficar tão redondo e contínuo como o STL de referência `Parametric_Model_Maker_1.stl` e o exemplo `CatarinaTag.3mf`, que serão fornecidos à parte. A suavidade tem de existir no STL/3MF exportado e não só na pré-visualização.

Outro pedido explícito: **manter os dois botões do rato premidos simultaneamente e arrastar deve deslocar a vista/tabuleiro (PAN)** para onde se quiser. A roda deve fazer zoom sobre a posição do cursor, e o utilizador deve conseguir focar letras situadas nos cantos do tabuleiro. Também manter, se possível, Shift+arrastar como atalho alternativo. Não confundir PAN da câmara com mover fisicamente o modelo sobre a mesa.

## ESTADO REAL DO PROTÓTIPO
- O ficheiro principal atual é `sparrowtech_3d_studio_v4.html` (HTML/JS/CSS num único ficheiro offline, ~673 KB, inclui fontes embutidas).
- A V4 NÃO resolveu a geometria. O motor ainda rasteriza o texto para uma máscara e gera uma malha voxelizada. O algoritmo `smoothVoxelContour` altera vértices, mas não substitui a topologia em degraus. A visualização fallback em Canvas pode parecer mais suave que o STL/3MF real.
- No JS: estado `S` (~linha 35); `CELL=.22` (~41); `buildMasks` (~80-130); `smoothVoxelContour` (~170-205); `meshFromLayers` (~204-250); `bindViewerEvents` (~375); exportações STL e 3MF no final.
- Resoluções atuais de grelha: draft .50 mm, normal .32 mm, fine .22 mm, ultra .14 mm. Aumentar 40x a densidade da grelha NÃO é solução preferida: custos de memória/tempo enormes e curvas ainda aproximadas em degraus.
- A V4 suporta separação lógica base/letras/contorno em componentes e exportação 3MF com materiais, mas o utilizador diz que **as cores não aparecem separadas corretamente no slicer**. Não considerar resolvido sem abrir o 3MF no Bambu Studio e Creality Print.
- O GitHub contém documentação e issue, mas NÃO contém ainda o HTML completo. Adicionar o código-fonte ao repositório com commits/PR pequenos.

## IMPLEMENTAÇÃO RECOMENDADA
1. Inspecionar o HTML e identificar o caminho de geração de geometria/exportação, NÃO apenas o desenho Canvas.
2. Substituir a máscara voxelizada por contornos vetoriais das fontes (TrueType/OpenType, curvas quadráticas/cúbicas Bézier), amostragem adaptativa por tolerância geométrica e triangulação com furos; extrudir tampas e paredes mantendo orientação/normais consistentes.
3. Calcular offsets/uniões/diferenças robustas para base, contorno, letras e argola. Considerar bibliotecas adequadas com licença compatível; se a ferramenta precisar de dependências, criar build reproduzível e versão offline empacotada.
4. As partes de diferentes cores devem ser componentes/malhas separados e atribuíveis a filamentos no 3MF. Garantir alinhamento espacial, posição na plate e importação correta nos dois slicers.
5. Implementar PAN com **botão esquerdo + direito simultaneamente**: usar eventos pointer/mouse, estado dos botões via `event.buttons` (bitmask esquerdo=1, direito=2, ambos=3), `contextmenu.preventDefault()`, pointer capture e tratar mudanças durante o arrasto. Não perder a seleção/arrasto de componentes nem a rotação normal. Permitir voltar a controlar após libertar botões.
6. Zoom ancorado no cursor: a posição sob o cursor deve manter-se no mesmo local do ecrã durante o zoom. Implementar «Focar seleção» se necessário.
7. Preservar controlos existentes: fontes manuscritas e importação de fontes, argola, base, frente/verso, vista traseira, cópias, Bambu A1/A1 Mini/Creality K1C, STL e 3MF.
8. Corrigir os problemas, testar e documentar o que funciona e o que ainda não funciona. Evitar declarações de sucesso sem testes.

## CRITÉRIOS DE ACEITAÇÃO
- Letras curvas e arredondadas vistas de perto no **STL/3MF real**, sem serrilhas de quadradinhos.
- Um nome manuscrito com curvas apertadas e furos continua legível, com malha válida (fechada, sem triângulos degenerados, sem interseções inválidas).
- Cores da base, contorno e letras são editáveis como partes distintas no Bambu Studio e Creality Print (validar na aplicação, não só por inspeção de XML).
- Esquerdo+direito+arrastar move a VISTA sem alterar a posição de impressão da peça; roda faz zoom onde aponta o rato.
- Zoom e PAN funcionam também com peça num canto da plate; navegação frente/verso não é tapada pela plate.
- Não há regressões graves de desempenho e não se perde a funcionalidade do editor.
- Entregar ficheiros executáveis e instruções claras, atualizar README/docs e reportar testes feitos.

## REPOSITÓRIO / FLUXO DE TRABALHO
- Trabalhar em branch dedicada e PR para revisão; não sobrescrever sem backup.
- O utilizador pode fornecer `sparrowtech_3d_studio_v4.html`, `Parametric_Model_Maker_1.stl` e `CatarinaTag.3mf` como anexos.
- Não incluir os modelos de referência de terceiros no GitHub sem confirmar direitos.
- Documentação existente: README.md, docs/REQUISITOS.md, docs/ROADMAP.md, docs/NOTAS-V4.md.
- A licença open source ainda precisa de decisão definitiva; verificar licenças de fontes e dependências.

## RESPOSTA ESPERADA DO CLAUDE
Analisa o código, apresenta uma causa-raiz curta, implementa uma correção concreta, mostra os testes e disponibiliza a versão corrigida. Não respondas apenas com sugestões de aumentar a resolução ou filtros visuais. O objetivo é geometria suave exportável e controlos de câmara intuitivos.
