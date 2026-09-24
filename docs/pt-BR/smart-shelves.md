# Prateleiras Inteligentes

*[Read in English](../smart-shelves.md)*

prateleiras inteligentes são um tipo de prateleira cujo conteúdo é gerado automaticamente por
heurísticas de biblioteca. Elas diferem das prateleiras normais de uma forma
fundamental: **elas aparecem na tela inicial apenas quando a heurística
retorna resultados**. Quando nenhum jogo corresponde, a prateleira simplesmente
não é renderizada — sem ocultação via CSS, sem linha de placeholder.

<p align="center">
  <img src="../../assets/screenshots/smart-shelf-modal.png" alt="Smart Shelf template picker" width="640">
</p>

## Comportamento

- Controlada pela alternância global `smartShelvesEnabled` no QAM.
- Cada prateleira inteligente tem `enabled` (ativa no sistema) e `hidden` (ocultada manualmente pelo usuário). Ambos precisam ser falsos para a prateleira renderizar na home.
- Os resultados são **memoizados por (mode, limit, params, ttl)** para evitar reexecução a cada ciclo de renderização da home. O TTL padrão é 60 minutos; override por prateleira via `refreshIntervalMinutes` (de 1 minuto a 30 dias).
- prateleiras inteligentes **são editáveis** pelo modal **Editar prateleira inteligente** — override de ordenação (`sort`), filtros adicionais (`filterGroup`), controles de ajuste por modo (`smartParams`), intervalo de atualização, e as mesmas opções visuais das prateleiras normais (`matchNativeSize`, `highlightFirst`/`highlightAll`/`highlightedAppIds`, `hideStatusLine`, `hideNewBadge`, `hideCompatIcons`, `hideNonSteamBadge`, `hideShelfTitle`, `hideGameNames`, `hideInstallIndicator`).

> **Dica:** se uma prateleira inteligente aparece raramente ou nunca corresponde à sua biblioteca, prefira **ocultá-la** em vez de excluí-la — uma prateleira oculta pode ser reativada depois pelo QAM sem perder sua posição na lista.

### Parâmetros por modo (`smartParams`)

Cada heurística expõe um pequeno conjunto de controles numéricos de ajuste
editáveis no modal de edição de prateleira inteligente. São específicos por modo e
sobrepõem os padrões hardcoded do resolver quando definidos:

| Modo | Parâmetro | Padrão | Efeito |
|---|---|---:|---|
| `quick_play` | `maxPlaytimeMinutes` | 120 | Limite superior para "rápido" — jogos acima disso são excluídos |
| `interrupted` | `minPlaytimeMinutes` | 30 | Limite inferior da janela "começado mas não consolidado" |
| `interrupted` | `maxPlaytimeMinutes` | 180 | Limite superior da mesma janela |
| `recently_played` | `daysAgo` | 30 | Corte deslizante para "recente" |
| `long_session` | `minPlaytimeMinutes` | 180 | Limite para "longo" |
| `rediscover` | `monthsAgo` | 6 | "Não toca há pelo menos esses tantos meses" |
| `rediscover` | `minPlaytimeMinutes` | 60 | Tempo mínimo investido para contar como "digno de redescoberta" |
| `forgotten` | `yearsAgo` | 3 | Limite de idade na biblioteca para "esquecido" |

Entradas ausentes sempre caem para os padrões — overrides parciais são válidos.

### Card de atualizar na linha

prateleiras inteligentes cujo resultado pode mudar entre dois cliques do card final
recebem um card **Atualizar** em vez de "ver mais na biblioteca":

- **`REFRESHABLE_SMART_MODES`** (em `src/components/shelf/types.ts`): `random_pick`, `time_of_day`, `spare_time`, `recently_played`. Clicar no card de atualizar invalida o cache do resolver e reresolve apenas aquela prateleira.
- **Modos determinísticos** (os 11 restantes) dispensam o card final por completo — ver-mais induziria a erro (resolvers smart não podem ser abertos diretamente na biblioteca), e atualizar seria um no-op contra dados estáveis de app.

### Janela de visibilidade

Uma prateleira inteligente pode se restringir a uma janela de horário. Dois campos
persistidos conduzem isso — ambos opcionais, ambos totalmente
retrocompatíveis:

- **`visibleHours`** — array de faixas `{ start, end }` (cada uma `0–23`, com
  suporte a wrap-around por faixa). A prateleira fica visível se **qualquer**
  faixa corresponder à hora atual (combinação por OR). Cada faixa também pode
  carregar um `days?: number[]` opcional (`0` = domingo … `6` = sábado) —
  quando presente, a faixa se aplica **apenas** nesses dias da semana.
- **`visibleDaysOfWeek`** — array de `0..6`. Quando definido, restringe a
  prateleira a esses dias da semana **no nível da prateleira** (intersectado com
  qualquer `days` por faixa). Array vazio = nunca visível. Indefinido = sem
  restrição de dia.

**Layout do editor** (modal de prateleira inteligente):

- A alternância de horas de visibilidade, as faixas de hora padrão e o
  seletor de dia da semana ficam na aba **Filtros smart**.
- Uma alternância **Permitir agenda por dia** nessa mesma aba condiciona uma
  aba separada de **Sobreposições**. Quando ativada, a aba Sobreposições
  mostra os dias/horas configurados como um resumo informativo, depois
  editores de faixa de hora por dia da semana abaixo — cada dia da semana com
  pelo menos uma faixa de sobreposição ganha suas próprias horas,
  **sobrepondo** as horas padrão compartilhadas para aquele dia. Dias sem
  sobreposições continuam usando as horas padrão.

**Tratamento de limites:** `HomeInject` agenda um `setTimeout` único para o
próximo limite de visibilidade, para que a prateleira apareça/desapareça
exatamente quando a janela muda, sem nenhum polling. Modos com lógica de
horário **interna** (atualmente `spare_time`) também ganham um timer de
limite via `getModeVisibilityWindows(mode)`, mesmo quando nenhum
`visibleHours` explícito está configurado.

## Posição

Por padrão, prateleiras inteligentes aparecem **antes** das prateleiras normais. A
alternância `smartShelvesAtBottom` as move para depois. Exceção: quando
`hideRecents` está ativo e `smartShelvesAtBottom` está desativado, smart
prateleiras são inseridas depois da **primeira** prateleira normal (que substitui o
slot nativo de recentes).

---

## Templates

### Jogo Rápido — `quick_play`

**Quando aparece:** você tem jogos instalados que são Verificados ou
Jogáveis para o Deck e têm menos de 2 horas de tempo de jogo.

**Critérios:**
- `installed = true`
- `deck_compatibility_category ∈ {Verified, Playable}` (categorias 3 e 2)
- `playtime_forever < 120 min`

**Ordenação:** Verificados antes de Jogáveis; dentro do mesmo nível, jogados mais recentemente primeiro.

**Quando desaparece:** quando todo jogo instalado compatível com o Deck foi jogado por 2 h ou mais, ou quando nenhum jogo compatível com o Deck está instalado.

**Caso de uso:** jogos que você possui, rodam bem no Deck, e você mal tocou — perfeitos para uma sessão rápida.

---

### Não Iniciados — `not_started`

**Quando aparece:** você tem jogos Steam (atalhos não-Steam excluídos) com zero tempo de jogo e que nunca foram abertos.

**Critérios:**
- `is_non_steam = false`
- `playtime_forever = 0`
- `last_played = 0` (nunca aberto)

**Ordenação:** Verificados para Deck primeiro, depois Jogáveis, depois os demais.

**Quando desaparece:** quando todo jogo na biblioteca foi iniciado pelo menos uma vez.

**Caso de uso:** o backlog sempre crescente de jogos que você comprou mas nunca abriu.

---

### Escolhas para o Deck — `deck_picks`

**Quando aparece:** você tem pelo menos um jogo Verificado para Deck na biblioteca.

**Critérios:**
- `deck_compatibility_category = Verified` (categoria 3)

**Ordenação:** jogados mais recentemente primeiro (destaca jogos que você usa ativamente no Deck).

**Quando desaparece:** quando a biblioteca não tem nenhum jogo Verificado para Deck.

**Confiabilidade:** alta para a maioria dos usuários de Steam Deck; a Valve certifica muitos títulos populares.

**Caso de uso:** a lista curada de títulos que funcionam melhor no hardware do Deck.

---

### Redescobrir — `rediscover`

**Quando aparece:** você tem jogos compatíveis com o Deck com tempo de jogo significativo que você não toca há mais de 6 meses.

**Critérios:**
- `last_played > 0` (já foi jogado)
- `last_played < (agora − 6 meses)`
- `playtime_forever > 60 min` (pelo menos 1 h investida)
- `deck_compatibility_category ∈ {Verified, Playable}`

**Ordenação:** mais jogados primeiro (traz de volta os títulos em que você mais investiu tempo).

**Quando desaparece:** quando nenhum jogo compatível com >1 h de tempo de jogo foi jogado pela última vez há mais de 6 meses (ex.: uma biblioteca nova, ou um jogador ativo que revisita tudo regularmente).

**Caso de uso:** jogos que você genuinamente gostou mas se afastou — bom para uma sessão de nostalgia.

---

### Melhores Não Jogados — `best_unplayed`

**Quando aparece:** você tem jogos instalados que nunca foram jogados.

**Critérios:**
- `installed = true`
- `playtime_forever = 0`
- `last_played = 0`

**Ordenação:** Verificados para Deck primeiro, depois Jogáveis, depois os demais.

**Quando desaparece:** quando todo jogo instalado já foi jogado pelo menos uma vez.

**Diferença de Não Iniciados:** restringe a apenas jogos instalados; Não Iniciados inclui todo jogo da biblioteca, independente do estado de instalação.

**Caso de uso:** jogos parados no SSD esperando para serem experimentados.

---

### Interrompidos — `interrupted`

**Quando aparece:** você tem jogos com uma quantidade modesta de tempo de jogo — o suficiente para ter começado mas não o bastante para ter terminado ou se comprometido de verdade.

**Critérios:**
- `playtime_forever ∈ [30 min, 180 min]`

**Ordenação:** jogados mais recentemente primeiro.

**Quando desaparece:** quando nenhum jogo tem tempo de jogo nessa faixa de 30–180 min (todo jogo está ou intocado ou profundamente jogado).

**Caso de uso:** jogos que você começou, jogou por uma ou duas horas, e depois largou — bons candidatos para uma segunda olhada.

---

### Hora do Dia — `time_of_day`

**Quando aparece:** sempre que o modo delegado para a hora atual do dia retorna resultados.

**Agenda:**

| Horário | Modo delegado |
|---|---|
| 05:00 – 11:59 | Jogo Rápido |
| 12:00 – 17:59 | Escolhas para o Deck |
| 18:00 – 04:59 | Redescobrir |

**Critérios:** herda inteiramente do delegado; sem filtragem adicional.

**Quando desaparece:** quando o delegado para o horário atual retorna uma lista vazia.

**Nota:** o horário é avaliado no momento da resolução (sem timer em segundo plano). A prateleira atualiza naturalmente no próximo ciclo de renderização/refresh da home quando a hora cruza um limite.

> **Nota:** `time_of_day` e `spare_time` não rodam num timer em segundo plano — a transição entre horários acontece no próximo refresh natural, que pode ser alguns minutos depois do limite do relógio.

**Caso de uso:** uma única prateleira adaptativa que sugere coisas diferentes dependendo de quando você joga.

---

### Escolha do Dia — `daily_pick`

**Quando aparece:** sempre que você tem qualquer jogo instalado ou que já foi jogado.

**Critérios:**
- `installed = true` OU `playtime_forever > 0`

**Seleção:** rotação determinística baseada em `floor(Date.now() / 86400000) % eligibleCount`. A rotação avança um slot a cada dia do calendário. Nenhum estado é persistido — o mesmo dia sempre retorna os mesmos jogos.

**Quando desaparece:** só quando a biblioteca está completamente vazia.

**Confiabilidade: muito alta.** Essa prateleira vai aparecer para praticamente todo usuário com qualquer conteúdo na biblioteca. Se você não quiser que ela apareça incondicionalmente, use a opção de **ocultar**.

**Caso de uso:** uma sugestão curada diferente todo dia, sem nenhuma aleatoriedade ou dependência de servidor.

---

### No Deck — `on_deck`

**Quando aparece:** você tem jogos instalados que são Verificados ou Jogáveis para o Deck.

**Critérios:**
- `installed = true`
- `deck_compatibility_category ∈ {Verified, Playable}`

**Ordenação:** Verificados antes de Jogáveis; dentro do mesmo nível, jogados mais recentemente primeiro.

**Quando desaparece:** quando nenhum jogo compatível está instalado.

**Caso de uso:** sua rotação ativa pronta para o Deck — instalada e pronta para jogar, com os títulos de melhor suporte primeiro.

---

### Jogados Recentemente — `recently_played`

**Quando aparece:** você jogou algum jogo nos últimos 30 dias.

**Critérios:**
- `last_played > (agora − 30 dias)`

**Ordenação:** jogados mais recentemente primeiro.

**Quando desaparece:** quando nenhum jogo foi jogado nos últimos 30 dias (raro para usuários ativos).

**Caso de uso:** sua rotação ativa atual — o que você realmente tem jogado este mês.

---

### Sessões Longas — `long_session`

**Quando aparece:** você tem jogos instalados com mais de 3 horas de tempo de jogo.

**Critérios:**
- `installed = true`
- `playtime_forever > 180 min`

**Ordenação:** mais jogados primeiro.

**Quando desaparece:** quando nenhum jogo instalado tem mais de 3 horas de tempo de jogo.

**Caso de uso:** os jogos com os quais você se comprometeu — boas escolhas quando você tem tempo para uma sessão de verdade.

---

### Roleta — `random_pick`

**Quando aparece:** sempre que há algum jogo na biblioteca.

**Critérios:** todo jogo da biblioteca é elegível.

**Ordenação:** aleatória (embaralhamento Fisher-Yates usando `Math.random()`).

**Cache:** os resultados são memoizados por 5 minutos (mesmo TTL de toda prateleira inteligente). A seleção se atualiza automaticamente depois de 5 minutos.

**Quando desaparece:** só quando a biblioteca está completamente vazia.

**Caso de uso:** puro acaso — traz qualquer coisa da biblioteca, útil quando você não consegue decidir o que jogar.

---

### Não-Steam — `non_steam`

**Quando aparece:** você tem atalhos não-Steam na biblioteca (emuladores, outros launchers).

**Critérios:**
- `is_non_steam = true`

**Ordenação:** jogados mais recentemente primeiro.

**Quando desaparece:** quando não há entradas não-Steam.

**Caso de uso:** acesso rápido a emuladores e outros launchers sem navegar pela biblioteca inteira.

---

### Tempo Livre — `spare_time`

**Quando aparece:** apenas durante três janelas diárias de horário — manhã (6:00–8:59), almoço (12:00–13:59), e noite (19:00–21:59) — quando você tem jogos instalados com ≤2 horas de tempo de jogo.

**Critérios:**
- Hora atual ∈ {6–8, 12–13, 19–21}
- `installed = true`
- `playtime_forever ≤ 120 min`

**Ordenação:** Verificados para Deck antes de Jogáveis; dentro do mesmo nível, jogados mais recentemente primeiro.

**Quando desaparece:** fora das janelas de horário definidas (sempre vazia), ou quando nenhum jogo instalado tem ≤2 h de tempo de jogo.

**Nota:** o horário é avaliado no momento da resolução. Fora das três janelas, o resolver retorna uma lista vazia imediatamente, então nenhuma linha de prateleira é renderizada.

**Caso de uso:** sugestões de sessão curta em pontos naturais de pausa do dia — café da manhã, almoço, ou depois do jantar.

---

### Esquecidos — `forgotten`

**Quando aparece:** você tem jogos Steam (atalhos não-Steam excluídos) que estão na sua biblioteca há mais de 3 anos e nunca foram abertos.

**Critérios:**
- `is_non_steam = false`
- `app_type = 1` (jogo) ou desconhecido — exclui ferramentas, Proton, redistribuíveis, servidores, SDKs
- `playtime_forever = 0`
- `last_played = 0` (nunca aberto)
- `rt_purchased_time` (ou `user_added_ts`) > 0 E < (agora − 3 anos)

**Ordenação:** data de aquisição mais antiga primeiro (ascendente por `rt_purchased_time`).

**Quando desaparece:** quando todo jogo no backlog de "nunca jogado" foi adquirido há menos de 3 anos, ou quando todo jogo já foi iniciado pelo menos uma vez.

**Confiabilidade: baixa.** Exige pelo menos 3 anos de histórico de biblioteca com jogos não jogados. Contas novas e jogadores ativos raramente vão ver essa prateleira.

**Caso de uso:** traz à tona o backlog mais profundo — jogos comprados há muito tempo e completamente esquecidos.

---

## Templates de mídia e não-jogo

Os templates focados em jogos acima excluem deliberadamente entradas que não
são jogos. Estes criam uma prateleira para elas, cada um correspondendo a um tipo
de app da Steam:

| Template | Modo | Conteúdo | Ordem |
|---|---|---|---|
| Trilhas Sonoras | `soundtracks` | Trilhas sonoras da Steam que você possui | Alfabética |
| Vídeos | `videos` | Vídeos da Steam | Alfabética |
| Demos | `demos` | Entradas de demo | Jogados mais recentemente primeiro |
| Jogos na Nuvem | `cloud_games` | Atalhos não-Steam marcados como cloud-play | Alfabética |

`cloud_games` reutiliza a mesma detecção de nuvem da alternância "ocultar
não-Steam de nuvem que já possuo" (o appid vive numa coleção no estilo
`[Unifideck] …`). Sem nenhuma coleção de nuvem presente, ela retorna uma
prateleira vazia em vez de recuar para "qualquer não-Steam", o que rotularia a
linha incorretamente.

## prateleiras inteligentes personalizadas — `custom`

`custom` é uma prateleira inteligente em branco: em vez de uma heurística, ela carrega
seu próprio grupo de filtro e ordenação, então você obtém os comportamentos
de prateleira inteligente (render nulo quando vazia, janela de visibilidade, card de
atualizar) com critérios escolhidos à mão. Ela é resolvida através do
resolver de prateleira normal em vez do despachante de heurística, já que precisa
do grupo de filtro e das chaves de ordenação.

## Resumo de confiabilidade de aparição

| Template | Desaparece quando… | Confiabilidade |
|---|---|---|
| `daily_pick` | biblioteca completamente vazia | **Muito alta** |
| `deck_picks` | nenhum jogo Verificado para Deck na biblioteca | Alta |
| `on_deck` | nenhum jogo compatível instalado | Alta |
| `recently_played` | nenhum jogo jogado nos últimos 30 dias | Alta |
| `long_session` | nenhum jogo instalado com >3 h de tempo de jogo | Alta |
| `not_started` | todo jogo já foi iniciado pelo menos uma vez | Média |
| `best_unplayed` | todo jogo instalado já foi jogado | Média |
| `quick_play` | todo jogo instalado compatível com Deck jogado >2 h | Média |
| `interrupted` | nenhum jogo na faixa de 30–180 min | Média |
| `random_pick` | biblioteca completamente vazia | **Muito alta** |
| `non_steam` | nenhum atalho não-Steam na biblioteca | Média |
| `spare_time` | fora das janelas ativas, ou nenhum jogo instalado ≤2 h | Média (dentro da janela) |
| `time_of_day` | delegado para a hora atual está vazio | Herda |
| `rediscover` | nenhum jogo compatível com >1 h intocado há 6 meses | Baixa–Média |
| `forgotten` | nenhum jogo não jogado de 3+ anos na biblioteca | Baixa |
| `backlog_rescue` | nenhum jogo instalado-mas-parado (cooldown de 14d) | Baixa–Média |
| `forgotten_gems` | nenhum possuído-mas-nunca-jogado com nota ≥ 85% | Baixa |
| `hidden_gems` | nenhum nunca-jogado com nota ≥ 85% | Baixa |
| `short_battery` | nenhum jogo amigável ao Deck ≤ 4 GB + ≤ 2h | Baixa |
| `long_session_night` | nenhum jogo instalado com >3 h de tempo de jogo | Baixa |
| `travel_mode` | nenhum jogo amigável ao Deck ≤ 5 GB | Baixa |
| `never_touched_classics` | nenhum jogo Steam adquirido há 3+ anos e nunca jogado | Baixa |
| `recent_hidden_installs` | nenhum jogo Steam instalado nos últimos 30 dias e nunca jogado | Baixa |
| `weekly_rotation` / `monthly_spotlight` / `seasonal_rotation` | nenhum jogo instalado | Baixa (a fatia da rotação pode ficar vazia entre ciclos) |
| `low_battery_mode` | recua para candidatos de `short_battery` quando a bateria está OK/desconhecida | Baixa |
| `almost_finished` | cache de conquistas da Steam vazio OU nenhum jogo ≥ limiar | Alta no primeiro paint; resolve quando o cache aquece |
| `couch_gaming` / `coop_ready` / `party_games` | cache de categoria da Steam vazio OU nenhum jogo com categoria correspondente | Alta no primeiro paint; resolve quando o cache aquece |
| `friends_playing` | `onlineFeaturesEnabled` desativado OU nenhum amigo em jogo (+ recente se ativado) OU sem sobreposição com sua biblioteca | Média — depende da atividade dos amigos no momento |

> `daily_pick`, `deck_picks`, `on_deck`, `recently_played`, e `random_pick`
> são as mais prováveis de estarem sempre visíveis. O seletor de templates
> lista os templates da maior para a menor probabilidade.

---

## prateleiras inteligentes compostas

Uma prateleira inteligente pode combinar múltiplos modos num único resultado via o
seletor **Combinar modos** na aba Fonte. Mesmo modelo mental de combinar
fontes em prateleiras normais.

- **Persistido como** `compositeModes: SmartShelfMode[]` + `compositeCombine: 'union' | 'intersection'` junto do `mode` primário. Até 4 modos adicionais por prateleira (o primário conta como o 5º).
- **Resolver:** avalia cada modo em `[primary, ...compositeModes]` independentemente (cada um compartilha o `smartParams` do pai), depois mescla:
  - **União** — semântica "qualquer um". O resultado é a união sem duplicatas, preservando a ordem da primeira fonte.
  - **Interseção** — semântica "todos". O resultado são os appids que aparecem na saída de todo filho.
- **filterGroup + sort + limit** se aplicam uma vez depois da mesclagem (do mesmo jeito que fazem para uma prateleira de modo único).
- **Cache:** o resultado do resolver de cada filho composto é armazenado sob `${shelfId}:${childMode}`. Atualizar a prateleira pela UI invalida todos os ramos de uma vez.
- **smartParams por filho** é um follow-up; por enquanto todos os filhos compartilham o ajuste do pai.

---

## Templates sensíveis ao runtime

Três famílias consultam estado de runtime fora de `AppOverview`:

- **`low_battery_mode`** — lê o estado da bateria de `SteamClient.System.RegisterForBatteryStateChanges` (via `src/runtime/batteryState.ts`). Quando o dispositivo está de fato na bateria abaixo do limiar (padrão 30%), traz para o topo os jogos menores e com menor tempo de jogo primeiro. Na tomada / bateria desconhecida, recua para os candidatos do short_battery para que a prateleira não fique vazia em nenhum estado.
- **`almost_finished`** — lê o progresso de conquistas de `SteamClient.Apps.RegisterForAppDetails` via o `src/steam/appDetailsCache.ts` preguiçoso. O primeiro paint pode ser parcial (o cache está vazio para apps ainda não lidos); os ciclos de refresh seguintes preenchem a prateleira.
- **`couch_gaming` / `coop_ready` / `party_games`** — leem categorias da loja Steam do mesmo `appDetailsCache`. Correspondência por substring contra nomes canônicos de categoria em inglês; instalações localizadas podem precisar de expansão de palavras-chave (registrado para follow-up).
- **`friends_playing`** — lê a presença de amigos de `friendStore.allFriends` via `src/runtime/friendsState.ts` (faz polling a cada 90 s na home, sem chamadas de rede). Traz apps que qualquer amigo está jogando NESTE MOMENTO; quando `includeRecentlyPlayed` = 1 (padrão), também inclui apps que qualquer amigo jogou nos últimos 14 dias. **Condicionado a online**: oculto do seletor de templates E retorna vazio do resolver quando `onlineFeaturesEnabled` está desativado. Reutiliza a alternância mestre existente — nenhuma alternância nova necessária já que a presença de amigos é conceitualmente originada de rede.

Todas as famílias retornam uma **prateleira vazia** graciosamente quando o dado de
runtime não está acessível (SteamOS mais antigo, ambiente de desenvolvimento
desktop, offline, ou nenhuma atividade correspondente). Elas seguem o
caminho natural de render nulo — a prateleira simplesmente não aparece até que os
dados estejam disponíveis.

---

## Me Surpreenda

Quando **Me Surpreenda** está ativado (sub-alternância sob Prateleiras Inteligentes no
QAM), a lista manual de prateleira inteligente fica totalmente oculta. Em vez disso, o
sistema escolhe um conjunto de templates de prateleira inteligente automaticamente todo
dia usando uma semente diária determinística — mesmo dia, mesma seleção.

**Contagem:** o slider define quantos templates aparecem (1–5). Quando
definido como 0, o sistema decide: `1 + (dayIndex % 3)`, alternando entre 2, 3
ou 4 prateleiras por dia.

> **Nota:** a contagem é o número **máximo** de prateleiras, não uma garantia. Templates que não retornam jogos para sua biblioteca seguem o caminho normal de render nulo e simplesmente não aparecem — o número real de prateleiras visíveis pode ser menor.

**Seleção:** todos os 13 templates são embaralhados com a semente diária. As
primeiras `count` entradas da lista embaralhada são usadas. Templates que não
retornam jogos ainda seguem o caminho natural de render nulo e desaparecem
da tela inicial — a contagem é o máximo, não uma garantia.

**Horário de reset:** a semente é derivada da data local do calendário
(`YYYYMMDD`). A seleção reseta à **meia-noite local** — quando o relógio do
dispositivo vira para um novo dia.

**Caso de uso:** modo sem intervenção — deixe o plugin decidir o que trazer
à tona a cada dia sem nenhuma configuração.
