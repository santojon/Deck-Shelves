# Atalhos de teclado

*[Read in English](../keyboard-bindings.md)*

Todo atalho de controle no Deck Shelves — ocultar/destacar um card, lançar
rapidamente um jogo, abrir a Busca Rápida, abrir a Navegação Lateral,
abrir ou fechar o painel sidecar — agora também pode ser vinculado a uma
tecla do teclado. Útil se você roda o Deck Shelves num PC ou no Modo
Desktop com um teclado conectado, ou só prefere teclas para algumas ações.

## Como funciona

Os atalhos de teclado são um **slot separado e independente** dos seus
atalhos de controle — vincular uma tecla não remove nem substitui a
combinação de controle daquela ação. Qualquer uma das entradas dispara a
mesma ação; você pode usar as duas, só uma, ou nenhuma.

Suporta combinações com modificador (Ctrl+F, por exemplo), e uma tecla
vinculada nunca dispara enquanto você está digitando ativamente num campo de
texto, então não vai atrapalhar a digitação normal.

## Como configurar

1. Abra as configurações do Deck Shelves e encontre a tela de atalhos (o
   mesmo lugar onde ficam seus atalhos de controle).
2. Cada ação agora tem um segundo slot de captura ao lado do de controle —
   selecione e pressione a tecla (ou combinação) desejada.
3. Pronto — sem precisar reiniciar, já fica ativo imediatamente.

Para remover um atalho, abra o slot de captura dele e limpe (ou redefina
essa ação para o padrão).

## O que pode e não pode ser vinculado

Quase toda ação funciona. As teclas de seta são a única exceção — não podem
ser capturadas como atalho de teclado de jeito nenhum. Isso não é uma
limitação do Deck Shelves: na beta atual do Steam, pressionar as teclas de
seta é interceptado como navegação virtual de D-pad antes de qualquer evento
de tecla no nível do app disparar, então não sobra nada para capturarmos.

## Solução de problemas

- **Minha tecla não faz nada.** Confira se não é uma tecla de seta (veja
  acima — realmente não é capturável agora). Também confira se o foco não
  está dentro de um campo de texto, já que teclas vinculadas são ignoradas
  ali de propósito.
- **Vinculei a mesma tecla a duas ações diferentes.** A tela de atalhos
  sinaliza colisões da mesma forma que já faz para atalhos de controle —
  corrija um deles antes de conseguir salvar.
- **Um plugin de terceiros consegue ver o que eu vinculei.** De propósito —
  o Deck Shelves expõe uma lista somente-leitura dos seus atalhos de
  teclado através da API pública (`api.listKeyboardShortcuts()`), da mesma
  forma que já faz para atalhos de controle, então outros plugins podem
  mostrar ou evitar seus atalhos se quiserem.

Sem configurações, sem alternância para desativar isso globalmente — é só um
slot de captura extra e opcional nos atalhos que você já tem. Deixe um slot
vazio e essa ação simplesmente não tem atalho de teclado.
