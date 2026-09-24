# Customização visual

*[Read in English](../visual-customization.md)*

O Deck Shelves te dá controle sobre a aparência das suas prateleiras e
cards, desde pequenos ajustes por card até tratamentos de prateleira
inteira. Tudo aqui pode ser configurado **globalmente** (aplica a toda
prateleira) ou **por prateleira** (sobrescreve só aquela) — alternâncias
globais funcionam como um interruptor mestre, então se uma opção global
está desligada, nenhuma prateleira individual pode ativá-la por conta
própria.

## Conteúdo do card

- **Destaque** — apresenta o primeiro card, todos os cards, ou um aleatório
  num layout paisagem maior em vez do retrato padrão.
- **Ocultar elementos individuais** — linha de status, badge "Novo", badge
  de desconto, ícones de compatibilidade, badge não-Steam, título da
  prateleira, nomes dos jogos, indicador de instalação, os cards finais de
  "ver mais" / atualizar. Cada um é sua própria alternância independente.
- **Corresponder tamanho nativo** — faz os cards da sua prateleira
  personalizada terem exatamente o mesmo tamanho das linhas nativas do
  Steam, para um visual mais integrado.
- **Deduplicar por nome** — recolhe entradas que são na verdade o mesmo jogo
  aparecendo duas vezes (ex.: uma cópia Steam e um atalho não-Steam com o
  mesmo título).

## Logo, ícone e descrição

Três enriquecimentos opcionais por card, cada um com seus próprios
controles de posição/tamanho:
- **Logo** — a arte de logo do jogo sobreposta no card, posição e tamanho
  ajustáveis.
- **Ícone** — um pequeno ícone, com controle de alinhamento vertical.
- **Descrição** — um trecho curto de texto da página da loja, posicionável
  em relação ao logo com um espaçamento ajustável entre eles (mesma ideia
  que o [overlay de descrição do próprio protetor de tela](idle-screensaver.md)
  reaproveita).

## Hero art

Pinta a arte do card em foco como um fundo em tela cheia atrás da
prateleira — disponível por prateleira ou globalmente. Também tem uma opção
dedicada para promover uma prateleira a um layout de página inteira (o
mesmo tratamento que a primeira prateleira recebe quando os Recentes
nativos estão ocultos).

## Cards de decoração

Fixe cards de posição fixa, não-jogo, em qualquer posição de uma prateleira:
- Um **rótulo de texto**.
- Um **banner de imagem** (pode servir também como o fundo de hero daquela
  prateleira quando em foco).
- Um **link focável** — pule para uma URL ou outro app/jogo.
- Um **espaço transparente**, para espaçamento visual.

Cards de imagem suportam uma sombra configurável (nunca / ao focar /
sempre) para um enquadramento limpo em torno de artes transparentes.

## Opções da tela inicial inteira

Algumas alternâncias afetam a tela inicial inteira em vez de uma prateleira:
- **Ocultar Recentes nativo** — substitui ou remove a própria linha de
  Recentes do Steam.
- **Ocultar abas da tela inicial** — remove a faixa nativa de abas no topo.
- **Fundo de hero na primeira prateleira**, vindo do que estiver em foco.
- **Forçar estilo de tema do CSS Loader** em toda prateleira, não só na que
  está no slot nativo de Recentes — útil com temas que normalmente só miram
  essa posição específica.

## Onde configurar isso

As versões globais da maioria dessas opções ficam em **Visual** nas
configurações principais; sobrescritas por prateleira ficam na própria tela
de edição de cada prateleira.
