# Deck Shelves — Cenários de QA Manual

*[Read in English](../qa-manual.md)*

Checklist de teste manual para testes de regressão num Steam Deck real (SteamOS Stable ou Beta).

## Pré-requisitos

- Decky Loader instalado
- Plugin implantado (`pnpm run deploy:deck`)
- Pelo menos 5 jogos na biblioteca, alguns favoritados, alguns instalados

---

## 1. Ativar / Desativar o plugin

| # | Cenário | Esperado |
|---|----------|----------|
| 1.1 | Alternância do plugin DESATIVADA → seção de prateleiras visível, alternâncias globais e prateleiras inteligentes ocultas | Apenas a alternância principal e a lista de prateleiras visíveis |
| 1.2 | Alternância do plugin DESATIVADA → nenhuma prateleira injetada na tela inicial | Home nativa inalterada |
| 1.3 | Alternância do plugin ATIVADA → prateleiras aparecem na Home em ~2s | Prateleiras renderizam abaixo dos recentes |
| 1.4 | Alternância do plugin ATIVADA → seção de alternâncias globais aparece no QAM | Seção "Aplicar globalmente" visível |
| 1.5 | Alternância do plugin ATIVADA → alternância de prateleiras inteligentes aparece no QAM | Seção Prateleiras Inteligentes visível |
| 1.6 | Alternância DESATIVADA com prateleiras visíveis → prateleiras desaparecem da Home | Home nativa restaurada |

---

## 2. Gerenciamento de prateleira

| # | Cenário | Esperado |
|---|----------|----------|
| 2.1 | Criar prateleira via "+" → seletor de templates abre | Modal com templates exibido |
| 2.2 | Selecionar template em branco → modal de edição abre diretamente | EditShelfModal com configuração vazia |
| 2.3 | Criar prateleira com filtro (Favoritos) → prateleira aparece na Home | Jogos filtrados corretamente |
| 2.4 | Ocultar prateleira via reticências → prateleira desaparece da Home | Prateleira mostrada acinzentada no QAM |
| 2.5 | Mostrar prateleira via reticências → prateleira reaparece na Home | Prateleira ativa novamente |
| 2.6 | Excluir prateleira → modal de confirmação; confirmar → removida | Prateleira sumida do QAM e da Home |
| 2.7 | Mover prateleira para cima/baixo via QAM → a ordem muda na Home | Ordem corresponde ao QAM |
| 2.8 | Editar título da prateleira → título atualiza no cabeçalho da linha na Home | Novo título renderizado |
| 2.9 | Editar limite da prateleira → contagem de cards muda | Número de cards muda |

---

## 3. Navegação (D-pad)

| # | Cenário | Esperado |
|---|----------|----------|
| 3.1 | D-pad PARA BAIXO a partir do último item em "Jogados Recentemente" → primeiro card da prateleira ganha foco | A ponte dispara corretamente |
| 3.2 | D-pad PARA CIMA a partir do primeiro card da prateleira → foco retorna à seção nativa acima | A ponte UP dispara corretamente |
| 3.3 | D-pad ESQUERDA/DIREITA na borda da prateleira → sem voltar (wrap-around) para outro app | Borda bloqueada |
| 3.4 | `hideHomeTabs=true` + D-pad PARA BAIXO a partir da última prateleira → foco para; sem voltar para a primeira prateleira | **Fix do Bug A** |
| 3.5 | `hideHomeTabs=false` + no último item do conteúdo da aba nativa + D-pad PARA BAIXO → foco para | **Fix do Bug B** |
| 3.6 | `hideHomeTabs=false` + navegar PARA BAIXO dos recentes para as prateleiras → correto | A ponte ainda funciona para os irmãos do topo |

---

## 4. Alternâncias globais

| # | Cenário | Esperado |
|---|----------|----------|
| 4.1 | `matchNativeSize=true` → dimensões dos cards correspondem aos cards nativos de Recentes | Mesma altura/largura que o nativo |
| 4.2 | `highlightFirst=true` → o primeiro card de toda prateleira renderiza em destaque no formato paisagem | Card largo na borda esquerda |
| 4.3 | `hideStatusLine=true` → texto de status oculto em todos os cards de prateleira | Sem texto "Jogar" / "Instalar" |
| 4.4 | `hideNewBadge=true` → selo "NOVO" oculto em todos os cards de prateleira | Nenhum selo mostrado |
| 4.5 | `hideCompatIcons=true` → ícones de compatibilidade com o Deck ocultos em todos os cards | Nenhum indicador de compat |
| 4.6 | Alternâncias globais ocultas quando `enabled=false` | Seção sumida do QAM |
| 4.7 | `globalHideShelfTitle=true` → todas as linhas de título de prateleira ocultas; linha de cards permanece expandida | Sem título colapsável; cards sempre visíveis |
| 4.8 | `globalHideGameNames=true` → rótulos de nome de jogo ocultos em todo card | Apenas a arte do card, sem nome abaixo |
| 4.9 | `globalHideInstallIndicator=true` → ícones de instalar/baixar/atualizar/jogar ocultos na linha de status; tempo de jogo continua visível | Só o texto de tempo de jogo permanece em `.ds-card-status` |
| 4.10 | Override por prateleira: ativar `hideShelfTitle` / `hideGameNames` / `hideInstallIndicator` numa única prateleira → outras prateleiras não afetadas | Alternância por prateleira vence sobre global=false; global=true vence sobre por-prateleira=false |

---

## 5. Ocultar recentes

| # | Cenário | Esperado |
|---|----------|----------|
| 5.1 | `hideRecents=true` → seção nativa Jogados Recentemente oculta | Seção não visível na Home |
| 5.2 | `hideRecents=true` + `heroBackground=true` → card em foco mostra arte de fundo | Hero art visível |
| 5.3 | `hideRecents=true` + `recentsReplaceSource=true` → primeira prateleira injetada no DOM nativo de recentes | A primeira prateleira usa estilos nativos |
| 5.4 | `hideRecents=false` → sub-alternâncias (hero, substituir-fonte) ocultas no QAM | Só visível quando hideRecents está ativo |

---

## 6. Ocultar abas da home

| # | Cenário | Esperado |
|---|----------|----------|
| 6.1 | `hideHomeTabs=true` → barra de abas Novidades/Amigos/Recomendados oculta | Abas não visíveis |
| 6.2 | `hideHomeTabs=false` → abas visíveis e navegáveis | Abas funcionam normalmente |
| 6.3 | `hideHomeTabs=true` → D-pad PARA BAIXO a partir da última prateleira para (Bug A) | Foco não volta (wrap) |

---

## 7. Prateleiras Inteligentes

| # | Cenário | Esperado |
|---|----------|----------|
| 7.1 | `smartShelvesEnabled=false` → seção de prateleiras inteligentes não mostrada no QAM | Seção oculta |
| 7.2 | `enabled=false` → alternância de prateleiras inteligentes nem mostrada | Até a alternância fica oculta |
| 7.3 | Adicionar prateleira inteligente → modal com 15 templates abre | SmartShelfTemplateModal |
| 7.4 | prateleira inteligente sem resultados → não renderizada na Home | Prateleira invisível (render nulo) |
| 7.5 | prateleira inteligente com resultados → renderizada na Home entre prateleiras normais | Aparece na posição correta |
| 7.6 | `smartShelvesAtBottom=true` → prateleiras inteligentes aparecem abaixo das prateleiras normais | Ordem respeitada |
| 7.7 | `surpriseMe=true` → lista manual oculta, o sistema escolhe os templates | Sem lista manual no QAM |
| 7.8 | `surpriseMe=true` + count=0 → o sistema decide a contagem | Contagem de prateleira variável |
| 7.9 | Prateleira Escolha do Dia → mesmo resultado durante todo o dia | Estável dentro do dia UTC |
| 7.10 | Editar prateleira inteligente → override de ordenação + filterGroup + smartParams + refreshIntervalMinutes persistem após salvar/recarregar | Persistido; aplicado no próximo render |
| 7.11 | prateleira inteligente atualizável (`random_pick`, `time_of_day`, `spare_time`, `recently_played`) mostra card de Atualizar no final | Card final com ícone de atualizar |
| 7.12 | Clicar no card de Atualizar → animação de rotação roda uma vez + a prateleira reresolve | Nova ordem de jogos em `random_pick` / `recently_played` |
| 7.13 | prateleira inteligente determinística (ex.: `daily_pick`, `deck_picks`) → nenhum card final | A linha termina no último jogo |
| 7.14 | Prateleira não-smart com `sort=random` → card de Atualizar no final | Igual ao smart atualizável |
| 7.15 | Clicar em Atualizar numa prateleira com `sort=random` → cache limpo (chaves `ds-random-*`), a prateleira reresolve com nova ordem | A ordem muda ao clicar |

---

## 8. Importar / Exportar

| # | Cenário | Esperado |
|---|----------|----------|
| 8.1 | Exportar → arquivo JSON salvo em Downloads | JSON válido, todas as prateleiras incluídas |
| 8.2 | Importar JSON válido → prateleiras substituídas pelo conjunto importado | QAM e Home refletem a importação |
| 8.3 | Importar `assets/import/screenshots-en.json` → 3 padrão + 1 oculta + 3 prateleiras inteligentes | Contagem e títulos corretos |
| 8.4 | Importar JSON com campos desconhecidos → sem crash, campos extras ignorados | Parse gracioso via passthrough |
| 8.5 | Resetar Tudo → modal de confirmação; confirmar → configurações limpas | QAM vazio, Home limpa |

---

## 9. Automação de screenshots

| # | Cenário | Esperado |
|---|----------|----------|
| 9.1 | `pnpm run screenshots` com 3+ prateleiras → todos os PNGs gerados em `assets/screenshots/` | Sem erros, nomes de arquivo corretos |
| 9.2 | Novos screenshots: `smart-shelves-qam.png` capturado | Seção de prateleiras inteligentes do QAM visível |
| 9.3 | Novos screenshots: `smart-shelf-modal.png` capturado | Modal do seletor de templates visível |

---

## 10. Temas CSS (requer CDP)

| # | Cenário | Esperado |
|---|----------|----------|
| 10.1 | ArtHero ativo + `hideRecents=false` → nossas prateleiras não afetadas pelo ArtHero | Estilo próprio do DS preservado |
| 10.2 | ArtHero ativo + `hideRecents=true` + `recentsReplaceSource=false` → primeira prateleira adota estilos do ArtHero, `HeroBackground` retorna `null`, o overlay de rótulo clona o `.ds-card-label` do card em foco | Paridade visual com os recentes nativos; o rótulo acompanha o card em foco horizontalmente na rolagem da linha |
| 10.3 | Tema TiltedHome ativo → todo `.ds-card` (imagem + rótulo + brilho + MoreCard + RefreshCard) inclina como um paralelogramo; o card em foco compõe `skew + scale + translateZ` | Cards se sobrepõem visualmente como no TiltedHome nativo; indicador de foco preservado |
| 10.4 | Alternar ArtHero on/off em runtime via CSS Loader → overlay de rótulo aparece/desaparece sem reiniciar a Steam | `MutationObserver` no `<head>` reage imediatamente |

---

## 11. Filtros salvos

| # | Cenário | Esperado |
|---|----------|----------|
| 11.1 | Salvar filtro em `EditShelfModal > Filtros > "Salvar atual como filtro"` → entrada aparece na seção Filtros Salvos do QAM | Seção visível só quando ≥1 filtro salvo |
| 11.2 | Aplicar filtro salvo a outra prateleira pelo menu suspenso → o grupo é **copiado** (spread), não referenciado por id | Excluir o filtro salvo depois não quebra a prateleira que o usa |
| 11.3 | Renomear filtro salvo inline → nome atualiza no menu suspenso imediatamente | Persistido entre recarregamentos |
| 11.4 | Excluir filtro salvo → entrada sumida do QAM e do menu de aplicar | Seção some quando a lista fica vazia |

---

## 12. Flags do harness de QA

O build aceita flags de ambiente que forçam estados específicos de UI para
testes repetíveis. Todas as flags são apenas de desenvolvimento (`!isProd` na
config do Vite). Cada script `pnpm qa:*` envolve uma variável de ambiente
`DS_QA_*` e roda o hard deploy.

| Flag | Script | Efeito |
|------|--------|--------|
| `DS_QA_FORCE_FIRST_RUN` | `pnpm qa:first-run` | Lista de prateleiras vazia + plugin desativado — exercita o banner de primeira execução |
| `DS_QA_FORCE_QAM_ERROR` | `pnpm qa:qam-error` | Lança erro na renderização do QAM — exercita o ErrorBoundary do QAM |
| `DS_QA_FORCE_SHELF_ERROR` | `pnpm qa:shelf-error` | Lança erro na renderização de prateleira — exercita o `HomeBoundary` |
| `DS_QA_FORCE_HOME_CRASH` | `pnpm qa:home-crash` | Mesmo erro, flag distinta para scripts de captura desambiguarem |
| `DS_QA_FORCE_REPLACE_FAILED` | `pnpm qa:replace-failed` | Mostra o `RecentsReplaceErrorBanner` (UI do kill-switch) |
| `DS_QA_FORCE_ALL_SHELVES_HIDE_RECENTS` | `pnpm qa:all-shelves-hide-recents` | Fixture de prateleira selecionada + `hideRecents=true` |
| `DS_QA_FORCE_ALL_SHELVES_SHOW_RECENTS` | `pnpm qa:all-shelves-show-recents` | Fixture de prateleira selecionada + `hideRecents=false` |
| `DS_QA_FORCE_ALL_SHELVES_HIDE_HOME_TABS` | `pnpm qa:all-shelves-hide-home-tabs` | Fixture selecionada + `hideHomeTabs=true` |
| `DS_QA_FORCE_ALL_SHELVES_SHOW_HOME_TABS` | `pnpm qa:all-shelves-show-home-tabs` | Fixture selecionada + `hideHomeTabs=false` |
| `DS_QA_SMART_SHELVES_FIXTURE` | `pnpm qa:smart-fixture` | Semeia 4 prateleiras inteligentes para que a seção smart renderize populada |
| `DS_QA_SAVED_FILTERS_FIXTURE` | `pnpm qa:saved-filters-fixture` | Semeia filtros salvos para que a seção Filtros Salvos do QAM fique visível |
| `DS_QA_FORCE_HIDDEN_SHELF` | `pnpm qa:hidden-shelf` | Adiciona uma prateleira oculta à fixture selecionada (para a captura `shelf-hidden.png`) |
| `DS_QA_SMART_SURPRISE_ME` | `pnpm qa:surprise-me` | Força `smartSurpriseMe=true` para que a lógica de rotação diária rode |
| `DS_QA_FORCE_TABMASTER` | — | `present` / `absent` sobrepõe a detecção do TabMaster |
| `DS_QA_FORCE_UNIFIDECK` | — | `present` / `absent` sobrepõe a detecção do UnifiDeck |
| `DS_QA_FORCE_NONSTEAMBADGES` | — | `present` / `absent` sobrepõe a detecção do Non-Steam Badges |
| `DS_QA_UPDATE_AVAILABLE` | `pnpm qa:update-available` | Curto-circuita `checkForUpdate` com uma release falsa `99.0.0` para que o banner de atualização do QAM renderize sem uma ida e volta de rede |
| `DS_QA_UPDATE_DISMISSED` | `pnpm qa:update-dismissed` | Define `updateNotifyDismissedVersion = "99.0.0"` mantendo `qa:update-available` ativo — o banner permanece oculto porque o usuário dispensou exatamente essa versão |
| `DS_QA_UPDATE_OFFLINE` | `pnpm qa:update-offline` | Força `isOnline()` a retornar `false` para que o caminho de pular-quando-offline rode sem desconectar o Deck |
| `DS_QA_COLLECTION_EMPTY` | `pnpm qa:collection-empty` | Semeia uma prateleira cujo filtro de coleção aponta para uma coleção inexistente — antes do fix do #55 isso vazava a biblioteca inteira; agora renderiza vazia (smoke de regressão) |
| `DS_QA_COLLECTION_INVERTED` | `pnpm qa:collection-inverted` | Semeia duas prateleiras lado a lado: "Nos Favoritos" + "Instalado mas NÃO nos Favoritos" (invertida) — verifica visualmente o #56 |

Combine flags conforme necessário (ex.:
`DS_QA_SMART_SHELVES_FIXTURE=1 DS_QA_SAVED_FILTERS_FIXTURE=1 pnpm run deploy:deck:hard`).
Cada uma é independente e aditiva.
