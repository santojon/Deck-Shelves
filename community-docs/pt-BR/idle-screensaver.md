# O próprio protetor de tela ocioso do Deck Shelves

*[Read in English](../idle-screensaver.md)*

Em vez do protetor de tela ocioso embutido do Steam, o Deck Shelves pode
mostrar seu próprio slideshow em tela cheia — construído com os mesmos
jogos que suas prateleiras e tela inicial já mostram, opcionalmente
misturado com suas próprias capturas de tela locais.

## O que ele mostra

Por padrão, o slideshow puxa de:
- Todo jogo nas suas prateleiras ativadas e visíveis.
- O que estiver atualmente no slot de "recentes" da sua tela inicial — a
  linha nativa de Recentes, ou a prateleira que você configurou para
  substituí-la, se houver alguma.
- Suas próprias capturas de tela locais, se você ativar isso — filtradas
  do mesmo jeito que a configuração do próprio protetor de tela do Steam
  faria (todas as capturas, ou um filtro de "público geral" que pula
  conteúdo adulto), e mostradas com o logo do jogo também, já que o Steam
  já sabe a qual jogo cada captura de tela pertence.

Ele faz uma amostragem justa entre **todas** as suas prateleiras em vez de
favorecer a que aparece primeiro — se você tem muitas prateleiras, pode
controlar exatamente quantos jogos ele puxa de cada uma antes de passar
para a próxima (veja "Ajuste fino" abaixo).

Cada slide ganha um overlay de logo opcional (qualquer canto, redimensionável)
e, novo, uma descrição opcional do jogo mostrada bem ao lado do logo, acima
ou abaixo dele com um espaçamento ajustável.

## Como ativar

1. Abra as configurações do Deck Shelves e encontre **Protetor de tela**.
2. Ative. O próprio protetor de tela ocioso nativo do Steam fica desativado
   enquanto isso ficar ativado, e restaurado exatamente para como estava
   antes no momento em que você desativa de novo.
3. Opcionalmente ative "Incluir capturas de tela" se você quiser suas
   próprias capturas misturadas.

É essa a configuração inteira — começa a funcionar na próxima vez que você
ficar ocioso.

## Ajuste fino

Tudo na mesma seção Protetor de tela:
- **Iniciar após** — quanto tempo você precisa ficar ocioso antes dele
  começar.
- **Tempo por item** — quanto tempo cada slide fica na tela.
- **Jogos por prateleira** — quantos jogos ele puxa de uma prateleira antes
  de passar para a próxima ao construir o slideshow. Diminua isso se você
  quiser mais variedade entre muitas prateleiras rapidamente; aumente se
  preferir ver mais de cada prateleira antes de passar adiante.
- **Mostrar logo do jogo** — ativado por padrão, com tamanho, posição de
  canto, e distância da borda todos ajustáveis. Tem sua própria alternância
  independente para se aparece em slides de captura de tela também.
- **Mostrar descrição do jogo** — desativado por padrão. Quando ativado,
  mostra o trecho de descrição da loja do jogo ao lado do logo, com a
  escolha de acima ou abaixo e um espaçamento ajustável entre eles.

Voltar para a tela inicial (mexer no analógico, pressionar um botão, tocar
na tela) fecha o protetor de tela imediatamente. Ficar ocioso de novo
depois retoma o slideshow de onde parou, em vez de recomeçar do primeiro
slide.

## Solução de problemas

- **Nunca parece disparar, mesmo com o QAM aberto e ocioso por um tempo.**
  Deve funcionar corretamente agora — uma versão anterior tinha um bug onde
  atividade real em outro lugar podia continuar resetando o temporizador de
  ociosidade mesmo sem você tocar em nada. Se ainda acontecer, reporte um
  bug.
- **Só mostra jogos de uma prateleira.** Corrigido — uma versão anterior
  podia acabar puxando quase inteiramente da prateleira que vinha primeiro
  se você tivesse várias prateleiras configuradas. Agora ele roda de forma
  justa por toda prateleira; "Jogos por prateleira" acima controla
  exatamente como.
- **Reinicia do começo toda vez em vez de continuar.** Corrigido — agora
  ele retoma de onde parou.
- **O tempo limite de ociosidade do Steam parece errado depois de usar
  isso.** Desativar o protetor de tela restaura exatamente seu valor
  original de tempo limite de ociosidade do Steam. Se algo ainda parecer
  errado, ative o protetor de tela do Deck Shelves e desative de novo uma
  vez — isso dispara a restauração de novo.

Desativado por padrão, e ainda marcado como experimental.
