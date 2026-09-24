# Templates de Prateleira

*[Read in English](../shelf-templates.md)*

Templates de prateleira são configurações predefinidas disponíveis no seletor de templates ao criar uma nova prateleira. Cada template tem uma fonte predefinida (aba da biblioteca ou filtro) e um título sugerido. O usuário pode renomear e editar qualquer prateleira depois de criada — templates são só pontos de partida.

<p align="center">
  <img src="../../assets/screenshots/shelf-create.png" alt="Create shelf — template picker (Standard tab)" width="640">
</p>

## Prateleiras padrão

Quando o usuário clica em **Criar prateleiras padrão** no banner de primeira execução, três prateleiras são criadas automaticamente:

| Template | Fonte |
|---|---|
| Favoritos | Aba da biblioteca `favorites` |
| Jogados Recentemente | Filtro — ordenado por `recent` |
| Adicionados Recentemente | Filtro — ordenado por `added` |

---

## Todos os templates disponíveis

### Favoritos — `favorites`

**Fonte:** aba da biblioteca `favorites`

Mostra jogos que o usuário marcou como favoritos na biblioteca Steam. A ordenação segue a própria lista de favoritos da Steam.

---

### Jogados Recentemente — `recent`

**Fonte:** filtro — ordenado por `recent` (jogados mais recentemente primeiro)

Mostra os jogos jogados mais recentemente. O template usa uma fonte de filtro em vez do antigo `tab=recent` (que nunca foi exposto por `listLibraryTabs()` e silenciosamente caía de volta para a primeira aba do dropdown). Prateleiras já existentes, criadas em versões antigas, são migradas automaticamente na primeira vez que o plugin carrega.

---

### Jogos Instalados — `installed`

**Fonte:** aba da biblioteca `installed`

Mostra todos os jogos atualmente instalados no dispositivo.

---

### Mais Jogados — `most_played`

**Fonte:** filtro — `installed: true`, ordenado por `playtime` (decrescente)

Mostra jogos instalados ordenados por tempo total jogado. Só jogos instalados são incluídos, então a lista reflete o que é jogável agora mesmo.

---

### Adicionados Recentemente — `recently_added`

**Fonte:** filtro — ordenado por `added` (decrescente)

Mostra jogos ordenados por quando foram adicionados à biblioteca, mais novos primeiro. Inclui todos os jogos da biblioteca independentemente do estado de instalação.

---

### Aguardando Atualização — `awaiting_update`

**Fonte:** filtro — `installed: true`, `updatePending: true`, ordenado `alphabetical`

Mostra jogos instalados que têm uma atualização pendente ou download na fila. Útil como uma prateleira de manutenção para acompanhar o que precisa ser baixado.

---

### Não-Steam / Emuladores — `non_steam`

**Fonte:** filtro — `nonSteam: true`, ordenado por `recent`

Mostra atalhos não-Steam (emuladores, outros launchers, jogos adicionados manualmente) ordenados pelos jogados mais recentemente. A prateleira fica vazia quando não existem entradas não-Steam.

---

### Sessões Longas — `long_session`

**Fonte:** filtro — `installed: true`, `minPlaytimeMinutes: 180`, ordenado por `playtime` (decrescente)

Mostra jogos instalados nos quais o usuário investiu mais de 3 horas — os títulos aos quais realmente se dedicou. Ordenado por tempo total jogado para que as entradas mais jogadas apareçam primeiro.

---

### Steam Cloud — `steam_cloud`

**Fonte:** filtro — `filterGroup` contendo `cloudAvailable`, ordenado `alphabetical`

Mostra jogos com suporte a Steam Cloud — saves sincronizados entre dispositivos. Envolve `cloudAvailable` em um `filterGroup` porque o campo não está no schema plano de `ShelfFilter`.

---

### Deck Verificado — `deck_verified`

**Fonte:** filtro — `filterGroup` contendo `deckCompatibility=['verified']`, ordenado `alphabetical`

Mostra jogos avaliados como Deck Verified pela Valve — confirmados como excelentes no Steam Deck. Assim como Steam Cloud, envolve a condição em um `filterGroup`.

---

### Mais Bem Avaliados — `top_reviewed`

**Fonte:** filtro — `installed: true`, ordenado por `review_score` (maior primeiro)

Mostra jogos instalados com as maiores notas de avaliação de usuários na Steam.

### Nunca Jogados — `never_played`

**Fonte:** filtro — `maxPlaytimeMinutes: 0`, ordenado alfabeticamente

Seu backlog: jogos que você possui mas nunca abriu.

### Deck Jogável — `deck_playable`

**Fonte:** filtro — `deckCompatibility: ["playable"]`, ordenado alfabeticamente

Complementa o Deck Verificado, cobrindo o nível de compatibilidade *Jogável*.

---

## Templates online

Esses só aparecem no seletor enquanto os recursos online estão ativados, e são
resolvidos pela rede. Veja [online-shelves.md](./online-shelves.md) para os mecanismos
de cache e atualização.

| Template | Id | Fonte | Ordenação padrão |
|---|---|---|---|
| Wishlist | `wishlist` | A wishlist da sua conta | — |
| Wishlist em promoção | `wishlist_on_sale` | Wishlist, entradas com desconto | `discount_high` |
| Grátis na Wishlist | `free_wishlist` | Entradas da wishlist que são grátis | `original_price_high` |
| Grátis agora | `free_now` | Entradas atualmente grátis | `original_price_high` |

---

## Notas

> **Dica:** se nenhum dos templates se encaixar no seu caso de uso, escolha **Começar em branco** — isso abre o modal de edição diretamente para que você configure a fonte e os filtros do zero, sem nenhum padrão predefinido no caminho.

> **Nota:** templates baseados em aba (`favorites`, `recent`, `installed`) delegam a ordenação inteiramente à Steam. A opção de ordenação no editor de prateleira não tem efeito nesses — a ordem é determinada pela própria lista interna da Steam. Só o limite (número máximo de cards) se aplica.

- O seletor de templates mostra **Começar em branco** primeiro, seguido de todos os templates em uma grade de 2 colunas agrupados por categoria (status / tempo / plataforma). Começar em branco abre o modal de Edição imediatamente.
- Templates baseados em aba (`favorites`, `installed`) delegam a ordenação inteiramente à Steam. O limite da prateleira ainda se aplica — só os primeiros N jogos da aba são mostrados.
- Templates baseados em filtro (`recent`, `most_played`, `recently_added`, `awaiting_update`, `non_steam`, `long_session`, `steam_cloud`, `deck_verified`, `top_reviewed`) usam o resolver próprio do plugin e suportam todas as opções de exibição por prateleira (destacar primeiro, corresponder ao tamanho nativo, ocultar nomes de jogos, etc.).
- Todos os templates produzem prateleiras totalmente editáveis. Tipo de fonte, ordem de ordenação, limite, e opções de exibição podem ser todos alterados após a criação.
