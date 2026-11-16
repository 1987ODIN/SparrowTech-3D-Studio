# Cores no 3MF: o que a V5 exporta e o que cada slicer faz

## Porque é que a V4 não separava as cores

A V4 escrevia um 3MF «genérico»: um objeto com componentes e `<basematerials displaycolor=…>`.
Bambu Studio, OrcaSlicer e Creality Print (6.x/7.x) partilham o mesmo leitor (`src/libslic3r/Format/bbs_3mf.cpp`), que:

1. cria uma **parte** (volume) por cada `<component>` do objeto;
2. lê o **filamento de cada parte** em `Metadata/model_settings.config` — `<part id="…"><metadata key="extruder" value="N"/>`;
3. só trata o ficheiro como projeto «Bambu» se `Application` começar por `BambuStudio-` (o Orca aceita também `OrcaSlicer-` e o Creality Print `Creality_Print V`).

Sem `model_settings.config`, as partes ficavam sem filamento atribuído e caíam todas no filamento 1. As cores `basematerials` só são usadas pelas versões mais recentes do Bambu Studio, e apenas num diálogo de mapeamento de cores para ficheiros «não Bambu». Não há garantia de que isso funcione no Creality Print.

## Estrutura exportada pela V5

```
[Content_Types].xml
_rels/.rels
3D/3dmodel.model                 objeto montado: 1 <component> por parte (p:path) + 1 <item> por cópia
3D/_rels/3dmodel.model.rels
3D/Objects/object_1.model        uma malha fechada por parte (base, letras, contorno, verso)
Metadata/model_settings.config   nome e filamento de cada parte; instâncias na plate 1
```

Esta é a mesma estrutura que o Bambu Studio grava (comparada com o `CatarinaTag.3mf` enviado). `Application` = `BambuStudio-02.00.00.00`. É só um marcador de formato para os slicers usarem o leitor de projeto. O ficheiro identifica-se como «SparrowTech 3D Studio v5» em `Designer`.

**Filamentos:** cada cor diferente recebe um filamento, pela ordem base → letras → contorno. Por omissão: base = 1, letras = 2, contorno = 3, e o verso usa o filamento das letras. Se duas partes tiverem a mesma cor, partilham o filamento. O nome de cada parte no slicer inclui a cor escolhida, por exemplo «Base e argola (#348CF0)».

**Não incluímos** `project_settings.config`. Esse ficheiro substitui as predefinições de impressora e filamentos do utilizador e, no Creality Print, define quantos filamentos existem; um ficheiro parcial pode fazer o slicer ignorar a configuração. Sem ele, o Bambu Studio acrescenta automaticamente os filamentos em falta (`add_missing_filaments`), e o Creality Print mantém os índices. **As cores dos filamentos não são definidas pelo ficheiro: escolhe-as no slicer.**

**Altura de camada (v5.6):** cada objeto leva `<metadata key="layer_height" value="…"/>`, que o leitor do Bambu Studio coloca na configuração do objeto. O diâmetro do bico não vai no ficheiro: faz parte da predefinição da impressora (`project_settings.config`, que não incluímos), por isso escolhe-se no slicer. Por confirmar na aplicação real.

**Nota (v5.6):** a app passou a ter só impressoras e filamentos Bambu Lab; as referências ao Creality Print abaixo descrevem a compatibilidade do formato, que já não é um destino da app.

## Como usar

### Bambu Studio
1. Ficheiro → Importar → `SparrowTech_…3mf` (ou arrastar para a janela). Se perguntar, escolhe importar **só a geometria** ou abrir como projeto; ambos mantêm as partes.
2. Na lista de objetos, o objeto mostra 3–4 partes com os números de filamento 1/2/3.
3. No painel de filamentos, define a cor do filamento 1 (base), 2 (letras) e 3 (contorno).

### Creality Print
1. Abrir/importar o 3MF.
2. Confirma na lista de objetos que existem as partes e que cada uma tem o filamento certo; define as cores dos filamentos.

### STL
STL não guarda cor nem partes. Usa «STLs por cor», seleciona todos os ficheiros ao importar e responde **Sim** quando o slicer perguntar se é um único objeto com várias partes. Depois atribui os filamentos à mão.

## Como foi verificado — e o que falta verificar

* `tests/threemf.test.cjs` gera 3MF reais e verifica, a partir do ZIP, as regras do leitor `bbs_3mf.cpp`: `p:path` válido, cada componente com objeto e com `<part>` de subtipo `normal_part`, filamento por parte, instâncias na plate, posições, e malhas estanques depois de lidas do XML.
* `tests/browser_check.py` exporta o 3MF pela própria app no Chrome e confere partes, filamentos e cópias.
* O comportamento foi confirmado lendo o código-fonte atual do Bambu Studio (`bbs_3mf.cpp`, `Plater.cpp`), do OrcaSlicer e do Creality Print.
* **Ainda não foi aberto nas aplicações reais.** Nesta sessão não era possível executar slicers. Antes de considerar o problema resolvido, abre o ficheiro de exemplo no Bambu Studio e no Creality Print e confirma as partes e os filamentos (ver a lista no PR).

## Limites conhecidos

* O Creality Print 4.x e anteriores (baseados no Cura) não leem o formato de partes do Bambu. Só se testa a família 5+/6+/7+.
* Se o slicer só tiver 1 filamento configurado, o Bambu Studio acrescenta os que faltam; noutros slicers pode ser preciso acrescentar 2 filamentos antes de importar.
* As cópias são instâncias do mesmo objeto: mudar a cor de uma parte muda-a em todas as cópias.
