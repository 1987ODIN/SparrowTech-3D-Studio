# SparrowTech 3D Studio

Editor visual open source para criar nomes, porta-chaves, placas e outros modelos 3D personalizáveis, com foco em edição direta e impressão 3D multicolor.

[Abrir o editor CrowMakes para criar tags em STL e 3MF](https://crowmakes.com/tags/)

> **Estado:** protótipo em desenvolvimento. Ainda não é uma aplicação validada para produção ou impressão sequencial segura.

## Visão

Escrever um nome, comparar fontes manuscritas em pré-visualização, editar diretamente a peça com o rato e preparar a impressão no tabuleiro da impressora, sem menus desnecessários.

## Funcionalidades previstas

- **Easy / Profissional:** edição simples por clique e ferramentas avançadas opcionais.
- **Fontes:** galeria com o próprio nome em cada fonte; importação de TTF/OTF; letras ligadas e curvas suaves.
- **Base:** contorno que segue a silhueta do texto, nuvem, retângulo/tablet, cantos arredondados, oval ou sem base.
- **Edição:** clicar nas letras, base ou argola abre as respetivas propriedades; mover/redimensionar com rato; atualização instantânea.
- **Argola:** colocação automática numa zona estruturalmente válida, tamanho padrão ajustável, reposicionamento por arrastar.
- **Frente/verso:** verso liso ou com texto, gravação, relevo, preenchimento e efeitos vazados; navegação e foco corretos.
- **Cores:** partes independentes para base, contorno e letras; exportação 3MF com cores/componentes e transformações.
- **Impressoras:** Bambu A1, Bambu A1 Mini e Creality K1C; limites reais do tabuleiro, margens, encaixe e distribuição de peças.
- **Impressão:** STL/3MF, validação de malha, visualização de colisões e aviso para impressão sequencial por objeto.

## Prioridades

1. Corrigir as letras «Minecraft»: curvas vetoriais suavizadas, sem serrilhas na geometria exportada.
2. Corrigir a separação de cores e a importação do 3MF nos slicers.
3. Zoom sob o cursor, foco na peça, navegação frente/verso e movimento dentro dos limites do tabuleiro.
4. Argola automática e regras de robustez de peças pequenas.
5. Testar os perfis de impressora e a disposição de múltiplas peças.

Ver [requisitos](docs/REQUISITOS.md) e [plano de desenvolvimento](docs/ROADMAP.md).

## Compatibilidade

Destinos de teste: **Bambu Studio** e **Creality Print**. Qualquer exportação deve ser conferida no slicer antes de imprimir; a colocação de peças no tabuleiro não equivale à validação de segurança da impressão sequencial.

## Contribuições e licença

O projeto pretende ser gratuito e open source, incluindo utilização comercial dos objetos originais criados. As condições concretas para redistribuição do código devem constar num ficheiro `LICENSE` antes da publicação de uma versão estável. Fontes, modelos e outros recursos de terceiros mantêm as respetivas licenças.
