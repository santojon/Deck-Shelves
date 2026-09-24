# Aba própria do Deck Shelves no Quick Access (experimental)

*[Read in English](../own-qam-tab.md)*

Se você usa o Decky Loader e queria que o Deck Shelves tivesse sua própria
aba no Menu de Acesso Rápido — como um recurso nativo do Steam, não um
plugin enterrado dentro da aba do próprio Decky — já dá pra ativar isso.

## O que faz

Normalmente, abrir as configurações do Deck Shelves significa entrar na
própria aba de plugins do Decky Loader, depois encontrar o Deck Shelves na
lista. Com isso ativado, o Deck Shelves ganha uma aba real e dedicada na
própria faixa de Acesso Rápido — mesmo editor, um toque em vez de dois.

Esse é o mesmo mecanismo de aba que o [ShelvesHub](shelveshub-install.md) já
te dá — essa configuração traz isso pra instalações só-Decky, sem precisar
do ShelvesHub. Se você já tiver o ShelvesHub instalado também, essa
configuração fica oculta automaticamente, já que o ShelvesHub já fornece a
aba.

## Como ativar

1. Abra as configurações do Deck Shelves.
2. Encontre **Experimental** (está agrupado ali por enquanto, já que ainda
   está sendo aprimorado).
3. Ative **"Aba própria no QAM"**.
4. Você vai receber um aviso para reiniciar o Steam — faça isso. A aba é
   aplicada só uma vez no boot, então não aparece até o Steam reiniciar.

Desativar de novo não precisa de reinício — a aba desaparece imediatamente.

## Solução de problemas

- **Ativei, reiniciei, e ainda não vejo a aba.** Tente um reinício completo
  do Cliente Steam (não um ciclo de suspensão/retomada rápida) — a
  configuração é lida do zero a cada boot, mas uma sessão genuinamente
  travada pode perder isso. Se ainda não aparecer, reporte um bug com sua
  versão do Decky Loader.
- **A aba parece um pouco diferente do resto da faixa (estilo, se você usa
  um tema do CSS Loader).** Limitação conhecida, só cosmética — alguns
  temas que miram a aba pelo próprio nome de classe interno ainda não
  pegam essa aba. Não afeta a funcionalidade.
- **Por que isso é "experimental"?** Aplica um patch diretamente na lista de
  abas do próprio Decky, o que é um pouco mais invasivo que um painel de
  plugin normal. Já foi verificado funcionando num Deck real, mas continua
  opcional e desativado por padrão até ter mais tempo de uso real.

Desativado por padrão. Nenhuma implicação de dados ou configurações de
qualquer forma — é puramente sobre onde o mesmo editor aparece.
