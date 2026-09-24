# Modo Vitrine / Ocioso Dinâmico

*[Read in English](../showcase-mode.md)*

Um "modo demonstração" autociclante para sua tela inicial — enquanto você
está ocioso, ele percorre automaticamente suas prateleiras e os jogos
delas, na sua tela inicial de verdade, em vez de assumir com um overlay
separado. Bom para mostrar sua configuração, ou só como movimento ambiente
num cômodo onde o Deck fica encaixado.

## Como é diferente do protetor de tela ocioso

O Deck Shelves também tem um
[protetor de tela ocioso em tela cheia separado](idle-screensaver.md) — esse
substitui sua tela inteira por um slideshow. O Modo Vitrine é o oposto: ele
fica na sua tela inicial de verdade e move o foco entre prateleiras e cards,
do mesmo jeito que você faria com um controle, usando o mesmo mecanismo de
navegação que a Navegação Lateral embutida usa. Nada é falso ou sintético —
é genuinamente navegar pela sua tela inicial do jeito que você faria.

Você pode rodar um, os dois, ou nenhum — são alternâncias independentes.

## Como ativar

1. Abra as configurações do Deck Shelves e encontre **Modo Vitrine**.
2. Ative.
3. Configure quanto tempo esperar antes de começar, e quanto tempo ele fica
   em cada prateleira — ambos ajustáveis.

Por padrão, toda prateleira visível participa — ainda não tem seletor de
prateleira (veja Limitações conhecidas).

## Ajuste fino

- **Iniciar após / tempo de permanência** — mesma ideia dos controles de
  tempo do protetor de tela, configurações independentes.
- **Ordem aleatória** — percorre as prateleiras em ordem aleatória em vez da
  sua ordem normal de prateleiras.
- **Parar na interação** — se tocar um botão/analógico para o vitrine
  imediatamente (ativado por padrão) ou deixa continuar rodando.
- **Percorrer os cards dentro de uma prateleira** — ativado por padrão. Em
  vez de só pular de prateleira em prateleira, também percorre os próprios
  cards de uma prateleira antes de avançar, então uma prateleira com muitos
  jogos é realmente mostrada, não só suas primeiras entradas. Você pode
  controlar quantos cards ele mostra por prateleira antes de avançar, e
  quanto tempo ele permanece em cada card.

Qualquer entrada real (botão, analógico, toque) para imediatamente e devolve
o controle para você.

## Limitações conhecidas

- **Ainda sem seletor por prateleira.** É tudo ou nada entre suas
  prateleiras visíveis por enquanto — você não pode atualmente excluir uma
  prateleira específica do rodízio enquanto mantém as outras. Planejado,
  ainda não construído.
- Ainda sem polimento de transição de câmera/crossfade ou um preset
  dedicado para TV/modo demonstração — o ciclo principal funciona, a
  apresentação ainda é funcional em vez de sofisticada.

## Solução de problemas

- **Não começou.** Confira "Iniciar após" — só começa depois desse tempo de
  ociosidade, igual ao protetor de tela. Também confira se nada mais está
  interceptando o temporizador de ociosidade (o protetor de tela ocioso, se
  também ativado, tem prioridade já que assume a tela inteira).
- **Parou e não reinicia.** Qualquer entrada real para (de propósito) e
  rearma o temporizador de ociosidade — ele volta a rodar assim que você
  ficar ocioso de novo pelo tempo de espera configurado.

Desativado por padrão.
