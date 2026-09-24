# Plugin API — notas de runtime do Deck Shelves

*[Read in English](../plugin-api.md)*

O **contrato de API pública** — todo método `register*`, o formato de
descritor, a matriz de capacidades, instalação + início rápido, e a política
de versão — vive no pacote separado **`@deck-shelves/api`** e no seu
repositório:

- npm: **`@deck-shelves/api`**
- Documentação / código-fonte completos: **<https://github.com/santojon/Deck-Shelves-API>**

Esse pacote é a única fonte de verdade para o contrato: o runtime em
[`src/core/pluginApi.ts`](../../src/core/pluginApi.ts) não declara nenhum
tipo público próprio — ele importa e **reexporta** os tipos de
`@deck-shelves/api`, de modo que o contrato publicado e o código em execução
não podem divergir. **Esta página documenta apenas o que é específico do
runtime do Deck Shelves** — os globais que ele expõe, os provedores que vêm
embutidos, como a UI mostra os registros, e os ids nativos com os quais
plugins de terceiros podem colidir.

## Globais de runtime

O Deck Shelves expõe a API em `window.deckShelves` (`{ version, api,
register }`) e espelha o registro em `window.__DECK_SHELVES_API__`. Plugins
se registram através de `window.deckShelves.register({ name, onMount(api) })`;
o pacote `@deck-shelves/api` cuida do timing de ordem de carregamento (plugin
antes / depois / simultaneamente com o host).

## Provedores nativos (distribuídos pelo Deck Shelves)

Toda funcionalidade nativa se registra através dos **mesmos** registros que
plugins de terceiros usam, então eles aparecem de forma uniforme na UI:

- **Estatísticas** — dois provedores, `deck-shelves.library` e
  `deck-shelves.shelf-stats` ([`src/steam/statistics.ts`](../../src/steam/statistics.ts)).
  A aba Configurações → Estatísticas renderiza **uma área por provedor de
  estatísticas registrado**, então um provedor de terceiros aparece ao lado
  destes com seu próprio `displayName`; as entradas são agrupadas por
  `category`.
- **Busca** — `deck-shelves.shelves` (Busca Rápida sobre o conteúdo das prateleiras).
- **Filtros / Ordenações / Fontes (v3)** — os ids nativos listados abaixo.

O card Configurações → Integrações lista todo tipo de provedor registrado
(fontes, fontes smart, filtros, ordenações, importadores, busca, side-menu,
contexto, widget, renderizador de prateleira, metadados, estatísticas,
recomendação) com um selo NATIVO nas entradas nativas.

## Catálogos nativos

Descubra o que o Deck Shelves distribui para que uma integração possa
construir sobre o mesmo vocabulário em vez de hardcodear ids:

- `api.listTriggerCatalog()` — todo tipo de regra nativa de
  visibilidade/gatilho-de-perfil (`PublicTriggerKind[]`): `kind`, `category`,
  `categoryTitleKey`, `defaults`, e se é `invertible`.
- `api.listShelfTemplates()` — todo template de prateleira nativo
  (`PublicShelfTemplate[]`): `id`, `titleKey`, `category`, `requiresOnline`,
  `defaultSort`, e sua `source`.
- `api.listShortcuts()` — todo atalho nativo de controle
  (`PublicShortcut[]`): `action`, `defaultCombo`, e o `combo` atual do usuário.
- `api.listKeyboardShortcuts()` — o atalho de teclado independente de toda
  ação nativa (`PublicKeyboardShortcut[]`): `action` e o `combo` atual do
  usuário. Diferente dos atalhos de controle, toda ação começa sem
  vínculo definido — `combo` é `null` até o usuário vincular um explicitamente.

Todos os quatro são snapshots somente-leitura — chame-os de novo para o estado mais atual.

## Traduções de runtime

`api.registerTranslations(locale, dict)` mescla profundamente suas strings no
bundle do locale em runtime e nunca sobrescreve chaves nativas — use um
namespace para as suas (`my-plugin.*`). As strings nativas vivem em
`i18n/<locale>/<area>.json` (veja [`development.md#i18n`](development.md#i18n)).

## Handlers de exportação / importação

Ofereça "Exportar para o formato X" / "Importar do formato Y" para
transferência portável, de plugin para plugin. Os handlers são agnósticos de
formato: os dois lados trocam o **JSON de snapshot** do Deck Shelves (um
pacote serializado de prateleiras, prateleiras inteligentes, filtros salvos e filtros smart
salvos), então o ciclo de ida-e-volta permanece sem perdas e nenhum tipo
interno vaza.

```ts
// Serializa o JSON de snapshot para o seu formato.
const offExport = api.registerExportHandler({
  id: "my-plugin.csv",
  displayName: "My CSV",
  fileExtension: "csv",
  export: (snapshotJson) => toCsv(JSON.parse(snapshotJson)),
});

// Converte seu formato de volta para uma string de JSON de snapshot.
const offImport = api.registerImportHandler({
  id: "my-plugin.csv",
  displayName: "My CSV",
  fileExtension: "csv",
  import: (raw) => JSON.stringify(fromCsv(raw)),
});
```

`export` recebe o JSON de snapshot atual e retorna o texto no seu formato;
`import` recebe o seu texto e retorna uma string de JSON de snapshot, que o
Deck Shelves aplica (mesclagem por padrão). Ambos podem ser assíncronos.
Handlers registrados aparecem em Configurações → Backup. Enumere-os com
`getRegisteredExportHandlers()` / `getRegisteredImportHandlers()`. Aditivo —
não incrementa a `version` da API.

## IDs nativos de Filtro / Ordenação / Fonte (v3)

Esses ids são registrados através dos mesmos registros públicos. Um plugin de
terceiros visando o mesmo id sobrescreve a implementação nativa
(a última escrita vence); escolha um prefixo `my-plugin.` para evitar
colisões.

### Filter v3

| Grupo | IDs |
| --- | --- |
| Metadados Steam | `genres` · `categories` · `franchise` · `vrSupport` · `multiplayerType` · `familySharing` · `dlcOwned` · `soundtrackOwned` |
| Comportamento do usuário | `launchCount` · `avgSessionMinutes` · `neverCompleted` · `recentlyAbandoned` · `installedNeverPlayed` · `playedOnce` · `achievementPercentRange` |
| Armazenamento / dispositivo | `storageDevice` · `installedSizeRange` · `compatDataQuality` |
| Ecossistema externo | `emuDeckSystem` · `retroDeckSystem` · `heroicLauncher` · `lutrisApp` · `chiakiApp` · `moonlightApp` |
| Não-Steam avançado | `executableType` · `launchOptionTags` · `customTags` · `parserCategories` · `hiddenLauncherShortcuts` |
| Composto | `weightedFilter` · `priorityFilter` · `exclusionGroup` |

### Sort v3

| Grupo | IDs |
| --- | --- |
| Uso | `most_launched` · `least_launched` · `longest_session` · `shortest_session` · `most_ignored` · `rediscovered_recently` |
| Conquistas | `completion_percent` · `closest_to_completion` · `rarest_achievements` |
| Temporal | `newest_installed` · `oldest_installed` · `oldest_unplayed` · `newest_purchased` |
| Armazenamento | `largest_install` · `smallest_install` · `ssd_priority` · `sd_priority` |
| Social | `friends_playing_now` · `most_friends_owning` · `trending_among_friends` |
| Aleatoriedade _(reservado)_ | `weighted_random` · `smart_random` · `seeded_random` · `rotating_daily_random` · `avoid_recently_shown` |

Os ids de **Aleatoriedade** são placeholders reservados: seus comparadores
são no-ops, então não são oferecidos no editor de prateleira. Use `random` para um
embaralhamento estável. Todo outro id acima é selecionável na UI — veja
[`filters.md`](filters.md) para o que cada um faz e seus parâmetros.

### Ecossistema de Fontes de Prateleira v3

| Grupo | IDs |
| --- | --- |
| Steam | `dynamic_collections` · `followed_games` · `ignored_games` · `dlc_source` · `soundtrack_source` |
| Manual | `pinned_games` · `history_source` · `session_queue_source` · `temporary_queue_source` |
| Contextual | `recently_updated` · `with_events` · `with_workshop_updates` · `controller_specific_source` |
| Launchers externos (registrados; dados preenchidos pelo probe do backend em `main.py`) | `emudeck_collections` · `retrodeck_collections` · `heroic_library` · `lutris_library` · `moonlight_sessions` · `chiaki_sessions` |

---

Para assinaturas de método, interfaces de descritor, a matriz de capacidades
e a política de versão, veja a documentação do **`@deck-shelves/api`**
vinculada no topo.
