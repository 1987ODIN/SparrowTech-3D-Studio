# Requisitos funcionais — SparrowTech 3D Studio

## 1. Interação visual
- Selecionar diretamente **letras**, **base**, **contorno**, **argola** ou **tabuleiro**.
- O painel lateral apresenta apenas as propriedades do elemento selecionado.
- Selecionar letras deve permitir editar o **texto**, **fonte**, **largura**, **altura**, **espessura**, **posição**, **relevo** e **contorno**.
- Arrastar, rodar e dimensionar com o rato. Atualização imediata sem botão de regeneração.
- O zoom da roda do rato mantém o ponto sob o cursor, incluindo peças encostadas aos cantos; comando «focar seleção».
- Seletor visual de orientação (cubo/face frontal/face traseira/superior) com verso realmente visível.

## 2. Letras e qualidade da malha
- A fonte é pré-visualizada usando o **nome introduzido** em cada opção.
- Priorizar escrita manuscrita, permitir importar TTF/OTF com verificação de licença.
- Converter as curvas vetoriais da fonte em malha adequada, **não** extrudir diretamente quadradinhos de uma grelha grosseira.
- Propor qualidade de preview rápida e exportação de alta resolução, mantendo contornos arredondados.
- Validar a geometria exportada (malha fechada, normais, espessura mínima, letras ligadas quando necessário).
- Referências: modelos STL e 3MF disponibilizados pelo utilizador durante a conceção; **não incluídos no repositório** até confirmação de direitos de redistribuição.

## 3. Formas e frente/verso
- Formas: contorno real das letras, nuvem, tablet/retângulo, cantos arredondados, oval e sem base.
- Camadas editáveis: frente, meio/base, verso.
- Cada face pode ser lisa, com relevo, gravada, vazada ou preenchida noutra cor; contorno colorido opcional.
- Possibilidade de texto no verso (p. ex. número de telefone) com aviso de legibilidade.
- Opções para eliminar vazios muito pequenos e ajustar espessuras sem destruir as letras.

## 4. Argola
- Ligação automática a uma região válida da base/texto; furo e parede com dimensões paramétricas.
- Arrastar livremente com feedback visual de união e resistência.
- Reposicionar automaticamente após qualquer mudança de nome/fonte/forma.

## 5. Cores e exportação
- Base, letras, contorno e verso independentes para permitir seleção de filamento no slicer.
- **3MF** deve preservar objetos/cores e posições no tabuleiro quando suportado pelo slicer.
- **STL** apenas geometria; não depender de STL para guardar cores ou organização de plate.
- Testes reais de importação no Bambu Studio e Creality Print.

## 6. Tabuleiros e fabrico
- Presets iniciais: Bambu A1, A1 Mini e Creality K1C. Evitar K1 duplicada.
- Arrastar peças sobre o tabuleiro com limitação pelos limites efetivos, sem deixar peças parcialmente fora.
- Organizar cópias e apresentar falta de espaço; manter uma margem configurable.
- Distinguir impressão por camada e por objeto. Não prometer segurança de impressão sequencial: depende de zonas de exclusão, altura das peças, impressora e validação no slicer.
- Eventual troca manual de filamento por camada, montagem em duas peças e impressão multicolor AMS.

## 7. Modos
- **Easy:** nome, fontes, formato, cor, argola, frente/verso e exportar.
- **Profissional:** medidas, tolerâncias, resoluções, operações geométricas, preparação detalhada de impressão.
