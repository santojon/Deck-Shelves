# Modos de exibição — Normal / Leve / Avançado

*[Read in English](../display-modes.md)*

O Deck Shelves expõe três "modos de exibição" que mudam quanto da
superfície do plugin fica visível — e, no caso do **Leve**, quanto
realmente é renderizado na home. Duas alternâncias do QAM controlam isso,
**Modo leve** e **Modo avançado**; elas são **mutuamente exclusivas**
(ativar uma desativa a outra, após uma confirmação). Com as duas
desativadas você está no modo **Normal**, o padrão.

Alterne em **QAM → Funcionalidades adicionais** (ou na aba **Configurações**
do sidecar) → "Modo leve" / "Modo avançado". A escolha é por perfil (perfis
salvos a armazenam) e persiste entre reinicializações.

## Comparação rápida

| Área | Leve | Normal (padrão) | Avançado |
|---|---|---|---|
| **Logo / ícone / descrição / hero** por prateleira na home | **removido** (forçado desligado) | por alternância | por alternância |
| game-info-above, overlay de amigos jogando, ocultar badges, destaque | ativo | ativo | ativo |
| **Busca contextual** (overlay de acorde) | **desativada** | por alternância | por alternância |
| **Navegação lateral** | **desativada** | por alternância | por alternância |
| Abas de Configurações | Prateleiras, Perfis, Backup | + Atalhos, Sugestões, Estatísticas (+ Integrações *se um plugin de terceiros estiver presente*) | + Integrações (sempre) + **Ferramentas avançadas** |
| QAM/sidecar: alternâncias de decoração + busca + navegação lateral | **ocultas** (funcionalidades desligadas — sem controles mortos) | exibidas | exibidas |
| QAM/sidecar: sliders de ajuste fino (tamanho/offset do logo, altura/espaçamento da descrição) | ocultos | exibidos | exibidos |
| QAM/sidecar: compatibilidade de tema do CSS Loader | oculta | exibida (se o CSS Loader estiver instalado) | exibida |
| QAM/sidecar: smart "no rodapé" / "Me surpreenda" | ocultos | exibidos | exibidos |
| Modal de editar prateleira: ordenação multi-chave, fonte composta, ordenação manual por arrastar | ocultos | exibidos | exibidos |
| Seletor de criação: templates smart avançados | ocultos | exibidos | exibidos |
| **Ferramentas avançadas** (log detalhado, visualizador de log de diagnóstico, atalhos de reset) | — | — | **exibidas** (Configurações → aba Avançado) |

## Modo Normal (padrão)

Tudo está disponível na configuração normal. Todas as decorações respeitam
sua própria alternância, toda aba de configurações exceto **Avançado**
está presente, e o QAM mostra o conjunto completo de controles. A aba
**Integrações** só aparece quando um plugin de terceiros registrou um
descritor.

## Modo Leve — "mínimo"

Uma experiência focada e sem distrações para quem só quer prateleiras na home
e não pretende mexer em ajustes. Também é útil como **modo de demonstração**
ao mostrar o plugin para alguém novo.

**Na home:** logo, ícone, descrição e hero art por prateleira **não são
renderizados** (forçados desligados independentemente da alternância
salva), e **a busca contextual + navegação lateral não são ativadas**. O
game-info-above e o overlay de amigos jogando continuam funcionando — são
informativos, não decorativos.

**Em configurações / QAM / sidecar:** os controles de tudo que o modo leve
desliga ficam **ocultos**, então não há alternâncias mortas — as
alternâncias de ativação de decoração e seus controles de
posição/tamanho, as alternâncias de busca + navegação lateral, a
compatibilidade de tema do CSS Loader, e as opções de posicionamento de
prateleira inteligente. As abas são reduzidas a **Prateleiras / Perfis / Backup**. Os
modais de editar prateleira e prateleira inteligente colapsam a ordenação multi-chave,
ocultam o tipo de fonte composta, e removem o arrastar-para-reordenar
manual; o seletor de criação mostra apenas os templates mais simples.

**Nada é resetado.** Toda alternância oculta mantém seu valor salvo e
reaparece — com as decorações da home restauradas — no momento em que o
modo leve é desligado.

## Modo Avançado — "usuário avançado"

Tudo do modo normal, **mais**:

- **Configurações → aba Avançado** — a alternância de log detalhado, o
  **visualizador de log** de diagnóstico no dispositivo (com copiar /
  limpar), e atalhos de reset (prateleiras / smart / tudo / personalizado por
  categoria). Essas ferramentas vivem **somente** aqui, então ficam
  completamente inacessíveis a menos que o modo avançado esteja ligado.
- A aba **Integrações** fica sempre visível (mesmo sem nenhum plugin de
  terceiros presente).

O modo avançado **não** muda a renderização da home — ele só libera
ferramentas.

## Exclusividade mútua e precedência

- Leve e Avançado não podem estar ligados ao mesmo tempo. Ativar um
  enquanto o outro está ligado mostra uma confirmação e desliga o outro.
- Ambos desligados → Normal.
- A remoção de elementos da home pelo modo leve prevalece sobre
  alternâncias individuais de funcionalidade (uma alternância de logo que
  está "ligada" ainda assim não renderiza nada no modo leve).

## Implementação

- Os hooks [`useLightMode()` / `useAdvancedMode()`](../../src/components/ui/lightMode.ts)
  leem `settings.lightModeEnabled` / `settings.advancedModeEnabled` e
  re-renderizam os consumidores quando mudam.
- **Remoção na home:** [`src/components/Shelf.tsx`](../../src/components/Shelf.tsx)
  (`effectiveEnableLogo = !lightMode && …`, hero), além de
  [`src/features/search/SearchOverlay.tsx`](../../src/features/search/SearchOverlay.tsx) e
  [`src/features/sidenav/ShelfSideNav.tsx`](../../src/features/sidenav/ShelfSideNav.tsx) (`!lightMode`).
- **Controle de acesso em configurações:** [`src/components/SettingsPage.tsx`](../../src/components/SettingsPage.tsx)
  (abas), [`src/components/DeckQAMSettings.tsx`](../../src/components/DeckQAMSettings.tsx) e
  [`src/components/qam/sidecar/GeneralTab.tsx`](../../src/components/qam/sidecar/GeneralTab.tsx)
  (visibilidade de alternâncias). Para controlar o acesso a uma nova
  superfície, envolva a parte em `!lightMode && …` (leve) ou
  `advancedMode && …` (avançado) — sem necessidade de passar props extras.
