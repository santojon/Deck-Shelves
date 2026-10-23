# Aba própria do Deck Shelves no Acesso Rápido (experimental)

*[Read in English](../own-qam-tab.md)*

Se você usa o Decky Loader e queria que o Deck Shelves tivesse sua própria
aba no Menu de Acesso Rápido — como um recurso nativo da Steam, não um
plugin dentro da aba do próprio Decky — dá pra ativar isso.

## O que faz

Normalmente, abrir as configurações do Deck Shelves significa entrar na
própria aba de plugins do Decky Loader e depois encontrar o Deck Shelves na
lista. Com isso ativado, o Deck Shelves ganha uma aba real e dedicada na
própria faixa do Acesso Rápido, logo depois de Desempenho — mesmo editor,
um toque em vez de dois. O Deck Shelves continua também na lista de
plugins do Decky, como antes.

Se outro host já mostra uma aba do Deck Shelves, essa configuração fica
oculta automaticamente, e essa aba é a que aparece.

## Como ativar

1. Abra as configurações do Deck Shelves.
2. Encontre **Experimental** (está agrupado ali enquanto ainda está sendo
   aprimorado).
3. Ative **"Aba própria no Acesso Rápido (experimental)"**.
4. Você vai receber um aviso para reiniciar a Steam — faça isso. A aba
   aparece depois que a Steam reinicia, desde a primeira vez que você abre o
   Menu de Acesso Rápido.

Desativar de novo também pede um reinício: a aba pode continuar visível até
a Steam reiniciar.

## Solução de problemas

- **Ativei, reiniciei, e ainda não vejo a aba.** Confira se foi um reinício
  completo da Steam (não uma suspensão e retomada). Se desenhar a aba falhou
  em duas inicializações seguidas da Steam, ela pausa sozinha por 12 horas
  para manter o Menu de Acesso Rápido seguro; desligar e ligar a opção de
  novo e reiniciar a Steam encerra a pausa antes. Se ainda não aparecer, reporte um bug com sua versão
  do Decky Loader.
- **A aba parece um pouco diferente do resto da faixa (se você usa um tema
  do CSS Loader).** Limitação só cosmética: alguns temas estilizam as abas
  da faixa pela posição ou pelos nomes internos e podem não pegar essa aba.
  Um tema que esconde abas pela posição pode esconder outra aba enquanto
  esta aparece.
- **Por que isso é "experimental"?** Ela adiciona uma aba ao próprio painel
  de Acesso Rápido da Steam, o que é mais invasivo que um painel de plugin
  normal. Continua opcional e desativada por padrão até ter mais tempo de uso
  real.

Desativado por padrão. Nenhuma implicação de dados ou configurações de
qualquer forma — é puramente sobre onde o mesmo editor aparece.
