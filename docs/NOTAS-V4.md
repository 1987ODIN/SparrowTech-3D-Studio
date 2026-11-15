# Protótipo V4 — estado de desenvolvimento

Foi preparada uma versão HTML local para testes. Ainda **não** está publicada no repositório como código executável.

## Alterações implementadas no protótipo local
- Zoom da roda do rato ancorado no cursor.
- Shift + arrastar para deslocar a vista; duplo clique para aproximar a região.
- Suavização experimental dos vértices de contorno da malha voxelizada, sem mudar a topologia.
- Qualidade fina (0,22 mm) por defeito e muito fina (0,14 mm) opcional.

## Limitações importantes
- O motor continua a gerar a geometria sobre uma grelha: **não é ainda extrusão vetorial real**. A suavização é incremental, não resolve totalmente o efeito serrilhado.
- A exportação 3MF e o comportamento dos slicers exigem testes adicionais nesta versão.
- O browser de testes teve problemas de desempenho/tempo de execução com a geração de malhas grandes. Não declarar a V4 estável.

## Próxima tarefa técnica
Substituir a geração voxel por contornos vetoriais das fontes (curvas Bézier), triangulação com furos e extrusão. Preservar base, contorno e letras como componentes com materiais separados no 3MF. Adicionar testes automatizados de watertightness, integridade e tempo de geração.
