# Integração com a tela inicial nativa

*[Read in English](../native-home-integration.md)*

Como o Deck Shelves se encaixa junto (ou substitui partes) da própria tela
inicial do Steam — ocultando/substituindo a linha nativa de Recentes,
ocultando a faixa de abas, e reordenando suas prateleiras e cards manualmente.

## Substituindo os Recentes nativos

Duas alternâncias independentes funcionam juntas:
- **Ocultar Recentes nativo** — remove a linha nativa de Recentes do Steam
  da tela inicial.
- **Substituir por uma prateleira** — em vez de deixar um vazio, promove uma
  das suas prateleiras do Deck Shelves para exatamente esse lugar,
  correspondendo ao layout e comportamento da própria linha de recentes
  (incluindo coisas como o tratamento de "item em destaque").

Você pode ocultar os Recentes sem substituir (só remove a linha) ou ativar a
substituição sem ocultar nada (se quiser que sua prateleira apareça junto
com os Recentes nativos em vez de no lugar deles) — as duas alternâncias são
independentes.

## Ocultando a faixa de abas da tela inicial

Uma alternância separada remove completamente a linha nativa de abas no topo
da tela inicial, se você quiser um visual mais limpo. Lembre-se que essa é uma
configuração da tela inicial inteira, não por prateleira.

## Ordenação manual e reordenação por arraste

Configure a ordenação de uma prateleira como **Manual** para organizar seus
cards à mão — várias formas de fazer isso, escolha a que for mais
confortável:
- **Setas laterais** num card em foco deslocam ele uma posição por vez
  (funciona com toque, mouse, ou D-pad + A).
- **Pressionar e segurar para agarrar**, depois mover um card com o D-pad e
  confirmar — funciona igual com um controle e com arraste por toque/mouse.

A ordem das próprias prateleiras (qual prateleira aparece onde na tela inicial)
também é reordenável por arraste da mesma forma, a partir da lista de
prateleiras nas configurações.

## Solução de problemas

- **Minha prateleira substituta não parece certa no lugar dos recentes.**
  Alguns temas do CSS Loader miram a linha nativa de Recentes
  especificamente por suas próprias classes internas — veja
  [Compatibilidade de temas](theme-compatibility.md) para o que é suportado
  hoje.
- **A reordenação por arraste parece sem resposta com um controle.** O
  agarrar por pressionar-e-segurar tem um atraso intencional curto (para que
  um toque rápido não comece um arraste sem querer) — segure um instante a
  mais antes de mover.
