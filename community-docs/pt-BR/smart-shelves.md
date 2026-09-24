# Prateleiras Inteligentes

*[Read in English](../smart-shelves.md)*

As Prateleiras Inteligentes escolhem seus próprios jogos automaticamente,
com base na sua biblioteca — sem curadoria manual necessária. A
característica que as define: **uma smart prateleira só aparece quando
realmente tem algo para mostrar.** Sem linha vazia, sem placeholder — se
nada corresponde agora, ela simplesmente não está lá até que algo
corresponda.

## Como ativá-las

Ative **Prateleiras Inteligentes** nas configurações do Deck Shelves, depois
adicione uma pelo seletor de templates.

## Os templates

Heurísticas prontas que você pode adicionar, cada uma com seus próprios
ajustes:
- **Jogo Rápido** — jogos curtos que você pode terminar numa sentada.
- **Não Iniciados** — instalados, nunca abertos.
- **Escolhas do Deck** — jogos Deck Verified/Playable que você ainda não
  jogou.
- **Redescobrir** — jogos em que você investiu tempo de verdade mas não toca
  há meses.
- **Melhores Não Jogados** — jogos bem avaliados parados no seu backlog.
- **Interrompidos** — começados, jogados um pouco, depois parados — a
  prateleira "retomar de onde parou".
- **Hora do Dia** — sugestões diferentes dependendo de quando você está
  jogando.
- **Escolha do Dia** — uma sugestão em destaque por dia.
- **No Deck** — ativos recentemente, ainda em rotação.
- **Jogados recentemente** — sua rotação atual.
- **Sessões longas** — jogos em que você costuma investir tempo de verdade.
- **Roleta** — uma escolha aleatória, reembaralhada com seu próprio card de
  atualização.
- **Não Steam** — seus atalhos não-Steam e jogos de launcher.
- **Horas Vagas** — combinado com quanto tempo você costuma ter disponível.
- **Esquecidos** — entradas genuinamente antigas da biblioteca que você
  provavelmente esqueceu que existiam.

A maioria tem alguns parâmetros ajustáveis (limiares como "o que conta como
rápido", "quantos meses conta como digno de redescoberta") direto na tela de
edição.

## Criando a sua própria

Além dos templates, você também pode construir uma smart prateleira
totalmente **personalizada** — o mesmo motor de heurísticas, com suas
próprias regras de filtro/ordenação por cima.

## Agendamento por hora do dia

Qualquer smart prateleira pode ser restrita a horários específicos, dias da
semana específicos, ou os dois — então uma prateleira "escolhas da manhã" só
aparece de manhã, por exemplo. Você também pode definir faixas de horário
diferentes por dia da semana se quiser uma agenda genuinamente diferente,
digamos, nos fins de semana.

## Onde elas ficam

Por padrão, as smart prateleiras aparecem antes das suas prateleiras
normais. Existe uma alternância para movê-las para depois, se você preferir
que suas prateleiras com curadoria manual venham primeiro.

## Solução de problemas

- **Uma smart prateleira nunca parece aparecer.** Confira seus parâmetros de
  ajuste — se o limiar estiver muito rígido para sua biblioteca, ela pode
  raramente ter algo para mostrar. Ocultá-la (em vez de excluir) mantém sua
  posição e configurações caso você queira revisitar depois.
- **Está mostrando resultados desatualizados.** As smart prateleiras
  guardam seus resultados em cache por um tempo (uma hora por padrão,
  ajustável por prateleira) para que a tela inicial não reprocesse sua
  biblioteca inteira a cada renderização. Alguns modos (Roleta, Hora do Dia,
  Horas Vagas, Jogados recentemente) ganham seu próprio card de atualização
  na linha se você quiser forçar um novo sorteio imediatamente.
