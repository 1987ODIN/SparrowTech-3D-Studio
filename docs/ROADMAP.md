# Roadmap

## Etapa 0 — Base do projeto
- [x] Criar repositório dedicado
- [x] Documentar requisitos e prioridades
- [x] Publicar código-fonte da versão protótipo e instruções de execução
- [ ] Escolher/confirmar licença open source e licenças de dependências e fontes
- [x] Definir testes automáticos para geometria e exportação

## Etapa 1 — Qualidade da geometria (prioridade máxima)
- [x] Extrusão de contornos vetoriais de fontes com tesselação adaptativa
- [x] Correção de furos/pequenos vazios e união entre componentes
- [x] Contorno suave da base, sem efeito de grelha
- [ ] Teste de comparação visual e dimensional com STL de referência autorizado
- [x] Malhas fechadas, não degeneradas, para os modos principais

## Etapa 2 — Editor e controlos
- [ ] Seleção contextual de letras, contorno, base e argola
- [ ] Arrastar/redimensionar com rato e auto-argola
- [x] Zoom centrado no cursor e foco na seleção
- [ ] Vista frontal/traseira sem o tabuleiro ocultar o objeto
- [x] Galeria de fontes manuscritas com nome em preview

## Etapa 3 — Multicolor e ficheiros
- [x] Atribuição de cores por elemento
- [x] Exportação 3MF preservando objetos e transformações
- [ ] Importação verificada no Bambu Studio
- [ ] Importação verificada no Creality Print
- [x] STL opcional por componente e verificações geométricas

## Etapa 4 — Tabuleiro e produção
- [x] Presets Bambu A1, A1 Mini e Creality K1C
- [ ] Posicionamento com margens e empacotamento de múltiplas peças
- [ ] Alertas de espaço insuficiente
- [ ] Modo por objeto com avaliação de colisões e limites, validado no slicer
- [ ] Impressão de frente e verso com diferentes acabamentos

## Etapa 5 — Publicação
- [ ] Exemplos próprios, capturas de ecrã, documentação e licença
- [ ] Testes de browser e slicers
- [ ] Versão estável


## Notas v5
- Etapa 1: falta a comparação dimensional com o STL de referência impresso.
- Etapa 3: o 3MF segue o formato lido por Bambu Studio / OrcaSlicer / Creality Print (ver docs/3MF-CORES.md); a importação nas aplicações ainda tem de ser confirmada manualmente.
- Novo: importação de fontes TTF/OTF/WOFF e cálculo em Web Worker.
