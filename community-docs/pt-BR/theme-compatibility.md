# Compatibilidade de temas do CSS Loader

*[Read in English](../theme-compatibility.md)*

O Deck Shelves funciona junto com temas do [CSS Loader](https://github.com/DeckThemes/CSSLoader) — ele detecta os mais populares em tempo de execução e ajusta seu próprio layout para combinar, em vez de disputar o controle da tela inicial com eles.

## O que já é suportado

- **ArtHero** — funciona. A primeira prateleira do Deck Shelves aproveita o tratamento de hero art do tema sem perder nenhum de seus próprios estilos.
- **TiltedHome (Renaissance)** — funciona, incluindo as quatro combinações de modo de inclinação (skew/3D × um sentido/sentidos opostos).
- **Centered Home** — detectado e levado em conta na matemática de layout do próprio Deck Shelves.

## Como a detecção de tema funciona, a grosso modo

O Deck Shelves observa propriedades customizadas de CSS e classes que cada tema suportado define na página, e ativa o comportamento correspondente quando as vê — não existe uma configuração manual de "escolher seu tema". Se o tema que você usa não estiver na lista acima, o Deck Shelves ainda renderiza normalmente; só não recebe nenhum ajuste de layout específico do tema, então as prateleiras podem parecer visualmente inconsistentes com o resto do tema.

## Reportando um problema de compatibilidade de tema

Inclua, se puder:
- O nome exato do tema (e a variante, se tiver várias).
- Uma captura de tela ou vídeo curto do problema real.
- Se é uma falha visual (layout, corte, sobreposição) ou funcional (não consegue navegar até as prateleiras, não consegue rolar).

Isso agiliza diretamente a correção — o CSS do tema não pode ser inspecionado sem saber qual é.
