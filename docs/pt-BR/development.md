# Guia de Desenvolvimento

*[Read in English](../development.md)*

## Pré-requisitos

- Node.js 20+, pnpm 10+, Python 3
- Steam Deck com [Decky Loader](https://decky.xyz) e acesso SSH
- CEF Remote Debugging ativado no Deck

> O desenvolvimento funciona em **Windows, macOS, SteamOS e outros Linux** (veja
> [CONTRIBUTING.md § Supported platforms](../../CONTRIBUTING.md#supported-platforms)).
> Os scripts do `pnpm` invocam o Python de forma multiplataforma via
> `scripts/build/py.mjs`; os exemplos brutos de `python3 …` abaixo assumem
> `python3` no PATH — no Windows use `python` / `py -3` ou os fluxos
> equivalentes de `pnpm` / `pnpm --filter deckprobe …`.

## Setup

```bash
pnpm install
cp .env.example .env   # Edite com o IP do seu Deck
pnpm run deck:setup    # Configuração do Deck na primeira vez
```

## Rodar localmente (Decky já instalado)

Para desenvolver **diretamente na máquina que roda a Steam** — um Steam Deck, uma
máquina Linux, ou Windows — que **já tem o Decky Loader instalado**, faça o
deploy no diretório local de plugins do Decky em vez de via SSH:

```bash
pnpm run deploy:local        # build + instala no diretório do Decky DESTA máquina
pnpm run deploy:local:hard   # + recarrega o plugin_loader e reinicia a Steam (Linux)
```

- Ele **não** instala o Decky — apenas copia o plugin para uma instalação já
  existente. O local padrão é `~/homebrew/plugins`; se o Decky estiver em
  outro lugar, defina `DECKY_PLUGINS_DIR=/caminho/para/homebrew/plugins` (ou
  `DECKY_HOME=/caminho/para/homebrew`) no `.env` ou no ambiente.
- Depois de um `deploy:local` simples, recarregue pelo Decky (Desenvolvedor →
  Recarregar deck-shelves) ou reinicie a Steam. O `:hard` tenta fazer isso
  para você no Linux (precisa de `sudo` sem senha ou de `DECK_SUDO_PASS`).
- **CDP contra a Steam local:** o `deckprobe` usa por padrão a porta LAN do
  Deck (`8081`). Para apontar para a Steam local, defina
  `DECK_CDP_HOST=127.0.0.1` e `DECK_CDP_PORT=8080` no `.env` — o CEF da Steam
  escuta na `8080` na mesma máquina. Isso é opcional via `.env`; o padrão
  distribuído continua sendo `8081`, então os fluxos existentes de Deck/CI não
  são afetados.

## Variáveis de ambiente (`.env`)

```
DECK_HOST=192.168.1.x     # Endereço IP do Steam Deck (ou hostname, ex.: steamdeck)
DECK_USER=deck             # Usuário SSH
DECK_SUDO_PASS=...        # Senha de sudo para a posse do diretório do plugin
DECK_CDP_PORT=8081         # Porta do CEF Remote Debugging
DECK_CDP_HOST=127.0.0.1    # opcional: host do CDP (padrão DECK_HOST; use 127.0.0.1 para Steam local / via túnel SSH)
DECKY_PLUGINS_DIR=         # opcional: diretório local de plugins do Decky para `deploy:local` (padrão ~/homebrew/plugins)
```

> Steam local: defina `DECK_CDP_HOST=127.0.0.1` + `DECK_CDP_PORT=8080` (o CEF
> da Steam fica na `8080` na mesma máquina; `8081` é a porta LAN do Deck).

Todas as variáveis são opcionais — cada script também aceita argumentos de
linha de comando (ex.: `pnpm run deploy:deck steamdeck`). Quando ambos são
fornecidos, o argumento da CLI prevalece.

## Comandos de build

| Comando | Descrição |
|---------|-------------|
| `pnpm run build` | Build de desenvolvimento (sourcemaps, `__DEV__=true`) |
| `pnpm run build:release` | Build de produção (minificado, `__DEV__=false`) |

> **Atenção:** sempre use `build:release` ao criar um pacote para distribuição ou envio à Decky Store. O comando `build` inclui sourcemaps e ativa o log de debug — é apenas para desenvolvimento local.
| `pnpm run deploy:deck` | Build + deploy no Deck via SSH |
| `pnpm run deploy:deck:hard` | Deploy + reinicia a Steam |
| `pnpm run deploy:local` | Build + instala no Decky **local** (sem SSH; o Decky já precisa estar instalado) |
| `pnpm run deploy:local:hard` | Instalação local + recarrega plugin_loader + reinicia a Steam (Linux) |
| `pnpm run watch:deck` | Auto-deploy nas mudanças de arquivo |
| `pnpm run package` | Cria o `.zip` distribuível |
| `pnpm run upload:deckzip` | Envia o zip para a pasta Downloads do Deck |

> **Atenção — `--hard` logo depois de um salvamento ao vivo:** o `killall steam` pode acontecer no meio de uma chamada de `saveSettings` que o usuário acabou de fazer na UI. A escrita em si já chegou ao disco (confirmado via reprodução: o snapshot de backup pré-salvamento do backend tinha ela), mas a flag `lastSaveSucceeded` do frontend pode ficar `false` se o ack nunca chegar — e o "retry unsynced save" de boot do `refreshSettings` então reenvia o que estava no cache do `localStorage` *quando a chamada de salvamento começou*, o que pode ser mais antigo do que o que está no disco agora. Se você está fazendo deploy `--hard` logo depois que o usuário (ou você, testando ao vivo) adicionou/editou algo, verifique o arquivo de configurações no disco depois, antes de assumir que ainda está lá.

## Testes

```bash
pnpm test              # Vitest (TypeScript)
pnpm run test:all      # Vitest + pytest (Python)
pnpm run typecheck     # Verificação de tipos do TypeScript
```

## Verificações de compatibilidade

```bash
pnpm run validate:compat
```

Valida contra 23 alvos de compatibilidade: versões do Decky Loader, versões do SteamOS, temas do CSS Loader, e plugins coexistentes.

## Verificação de docs

```bash
pnpm run docs:check              # cobertura + índice + selos
pnpm run docs:check --no-badges  # pula os coletores de contagem de testes
```

Roda na CI e falha o build quando a documentação diverge do código:

- **Cobertura** — toda entrada que a UI expõe é documentada: tipos de filtro
  (`ALL_FILTER_TYPES` → [`filters.md`](filters.md)), chaves de ordenação e
  fontes nativas (`SORT_OPTIONS` / `V3_SOURCE_OPTIONS` → `filters.md`), modos
  de smart-prateleira (`SmartShelfModeSchema` → [`smart-shelves.md`](smart-shelves.md))
  e templates de prateleira (`templates.ts` → [`shelf-templates.md`](shelf-templates.md)).
- **Índice** — todo arquivo em `docs/` está listado em [`docs-index.md`](docs-index.md)
  e todos os seus links resolvem corretamente.
- **Diagramas** — sem entidades HTML nos rótulos de diagrama, cercas (fences) balanceadas.
- **Ícone** — a marca `DeckShelvesLogo` embutida em `icons.tsx` corresponde a
  `assets/icon.svg` (mesmos rects + transformação de ajuste), então os dois nunca divergem.
- **Selos** — as contagens hardcoded de `vitest` / `pytest` no README raiz batem com
  as suítes, coletadas com `vitest list` e `pytest --collect-only`.

Então, quando você expõe um novo filtro, ordenação, fonte, modo smart ou
template, adicione-o ao documento correspondente na mesma mudança. Se um
extrator reportar `0 ids`, a fonte mudou de lugar — atualize a regex em
`scripts/ci/docs-check.mjs` em vez de deixar a verificação passar vazia.

## Flag de debug

> **Nota:** a flag `debug` faz o Decky recarregar o plugin automaticamente a cada deploy — ela deve estar ausente do `plugin.json` final enviado à store. O script de deploy cuida dessa injeção automaticamente; não adicione a flag manualmente ao arquivo commitado.

O `plugin.json` é distribuído sem a flag `debug` (exigido para a Decky Store). Durante o desenvolvimento, `deploy-deck.sh` injeta automaticamente a flag na cópia preparada para que o Decky recarregue o plugin a cada deploy.

## Screenshots

O tooling de CDP vive no pacote `deckprobe/` (host/porta vêm do `.env`:
`DECK_HOST`, `DECK_CDP_PORT`). Faça o deploy do plugin primeiro (exige pelo
menos 2 prateleiras com 1+ jogo cada; `smart-shelf-edit.png` precisa de Smart
Prateleiras ativado com uma entrada).

```bash
# Captura todos os screenshots via automação CDP
pnpm run devtools:screenshots

# Valida os screenshots capturados (arquivos exigidos presentes, cabeçalho
# mágico PNG, >= 60 KB — pega frames de popup em branco)
pnpm run screenshots:validate
```

As capturas ficam em `assets/screenshots/`. A galeria é renderizada em
[`showcase.md`](showcase.md).

A captura é conduzida pelo **runner modular** (`pnpm run devtools:screenshots`
chama `deckprobe/cli.py screenshot`, que o executa):

```bash
# Todas as capturas (via a CLI — lê cenários + diretório de saída de deckprobe.config.json)
python3 deckprobe/cli.py screenshot

# Ou invoque o runner diretamente (como módulo, a partir da raiz do repo)
python3 -m deckprobe.screenshots.run --scenarios-dir scripts/deckprobe-ext/screenshots/scenarios
python3 deckprobe/cli.py screenshot --only home,qam,about_overview   # subconjunto
python3 -m deckprobe.screenshots.run --list                          # lista os cenários
```

Os cenários do projeto ficam em `scripts/deckprobe-ext/screenshots/scenarios/*.py`
(conectados via `screenshots_scenarios_dir` em `deckprobe.config.json`). Cada
arquivo agrupa capturas relacionadas; adicione uma escrevendo uma função
decorada com `@register("name")` que recebe a sessão SharedJS, host, porta e
diretório de saída e retorna um mapa `{filename: Path}`. O runner é dividido
em `lib/cdp.py` (`Session` CDP mínima), `lib/nav.py` (primitivas de
navegação), `lib/capture.py` (`capture_bigpicture` / `capture_qam` com
fallback de frame em branco) e `run.py` (orquestrador sobre `ALL_SCENARIOS`).

### Conjunto de screenshots

| Arquivo | Captura |
|------|----------|
| `home.png` | Home com o portal do Deck Shelves montado após os recentes nativos |
| `home-shelves.png` | Home rolada para mostrar a segunda prateleira do DS por completo |
| `game-menu.png` | Menu de contexto aberto num card de prateleira (botão MENU) |
| `qam.png` | QAM com a aba do plugin Deck Shelves ativa |
| `shelf-create.png` | Modal do seletor de templates (agrupado por categoria) |
| `shelf-actions.png` | Menu de ações por prateleira (Editar / Duplicar / Ocultar / Excluir / reordenar) |
| `shelf-edit.png` | Modal de edição de prateleira — aba Fonte (ordenação, tipo de fonte, limite) |
| `shelf-edit-filters.png` | Modal de edição de prateleira — aba Filtros (FilterPanel + SavedFiltersBar) |
| `shelf-edit-visual.png` | Modal de edição de prateleira — aba Visual (alternâncias de destaque + seletor + Ímpar/Par) |
| `shelf-hidden.png` | QAM mostrando uma prateleira alternada para oculta (ícone de olho cortado) |
| `shelf-delete.png` | Diálogo de confirmação para excluir prateleira |
| `shelf-import.png` / `shelf-export.png` | Modais de importação / exportação |
| `reset-all.png` | Confirmação destrutiva de resetar tudo |
| `about-page.png` | Página Sobre e Documentação de Filtros |
| `smart-shelves-qam.png` | QAM rolado até a seção Prateleiras Inteligentes |
| `smart-shelf-modal.png` | Seletor de templates de Prateleira Inteligente (acordeões por categoria) |
| `smart-shelf-edit.png` | Modal de edição de Prateleira Inteligente (override de ordenação + filtros + visual) |
| `saved-filters-qam.png` | **Opcional** — seção Filtros Salvos no QAM; capturado só quando um filtro foi salvo |
| `global-toggles.png` | Seção Aplicar Globalmente no QAM |

## Suíte local de testes de UI

```bash
pnpm uitests             # roda toda suíte registrada contra o Deck
pnpm uitests:list        # lista toda suíte + nome de teste
pnpm uitests --only home,qam_shelves   # subconjunto
```

As suítes ficam em `scripts/deckprobe-ext/uitests/suites/` e reutilizam o
`lib/` do pipeline de screenshots (sessão CDP, navegação, captura). Apenas
local — roda contra um Deck real ou uma VM SteamOS via CDP, nunca na CI. Use
como a verificação opcional pré-PR para fluxos que os testes unitários não
alcançam.

## Fluxos de validação (com relatórios HTML)

Três comandos orquestram todas as verificações de ponta a ponta e escrevem
um relatório HTML em `reports/`:

```bash
pnpm validate:ci             # offline: typecheck, build, testes, empacotamento, compat
pnpm validate:full           # com Deck: acima + deploy + testes de UI + bench de performance
pnpm validate:full:stress    # com Deck + fixture de estresse (16 shelves, 50 cards cada)
```

`validate:ci` é feito para CI/CD — sem dispositivo ou `.env` necessários.
`validate:full` pula as etapas de dispositivo graciosamente quando o Deck
está inacessível. Os relatórios ficam em `reports/` (no gitignore),
organizados em três escopos (`ci/`, `local/`, `release/`) mais um
`index.html` de nível superior e um `dashboard.html` de estatísticas. Abra-os
com `pnpm reports`.

## Bench de performance

```bash
pnpm perf:bench          # 3 execuções, imprime p_avg / p_min / p_max do mount
pnpm perf:bench --runs 10
```

Insere chamadas `performance.mark` / `performance.measure` no Big Picture,
navega até a home, lê as durações de volta. Combine com a tag `[PERF]` de PR
e números de antes/depois — veja [`performance.md`](performance.md).

## Diagnósticos CDP

`deckprobe/cdp.py` cobre o loop comum de debug (encontrar alvo → rodar probe →
checar resultado). Veja [`cdp.md`](cdp.md) para a referência completa.

```bash
# Lista os alvos CDP com aliases (bp / qam / sjc / mainmenu)
python3 deckprobe/cdp.py targets

# Avalia uma expressão JS num alvo
python3 deckprobe/cdp.py eval bp 'document.title'

# Captura um screenshot do QAM
python3 deckprobe/cdp.py screenshot qam /tmp/qam.png

# Transmite warnings/erros do console
python3 deckprobe/cdp.py console sjc

# Injeta um classmap para testes
python3 deckprobe/tools/inject_classmap.py

# Lista todo script de diag (os genéricos do deckprobe + os próprios deste projeto)
python3 deckprobe/cli.py diag list
python3 deckprobe/cli.py diag run diag_composite_filter -- <bp-target-id>
```

Os scripts de diag específicos do projeto (os que hardcodam os próprios
seletores/funcionalidades do Deck Shelves em vez dos padrões genéricos e
substituíveis que o deckprobe já traz) ficam em `scripts/deckprobe-ext/diag/`
— conectados via `diag_dirs` em `deckprobe.config.json`, na mesma convenção
dos cenários de screenshot e das suítes de teste de UI acima. `diag list`/`diag run`
mesclam os dois diretórios automaticamente.

## i18n

Os locales são divididos em arquivos por área: `i18n/<locale>/<area>.json`,
onde `<area>` é um de `home`, `qam`, `about`, `settings`, `integrations`,
`common`. O loader (`src/i18n.ts`) mescla todo arquivo de área por locale num
único bundle via `import.meta.glob` — `en-US` é carregado de forma eager
(rótulos do primeiro paint), todo outro locale carrega seus chunks de área de
forma lazy para o idioma detectado. Adicionar um locale ou uma nova sub-área
é só um novo arquivo JSON; nenhuma mudança no loader. Integrações nativas
adicionam `i18n/<locale>/integration-<name>.json`.

> **Atenção:** toda nova chave deve existir em todos os locales sem colisões
> entre áreas — `node scripts/build/validate.mjs` falha se o conjunto de
> chaves mesclado de qualquer locale diferir do `en-US` ou se uma chave
> aparecer em dois arquivos de área. Use a string em inglês como valor quando
> uma tradução ainda não estiver pronta; nunca deixe uma chave indefinida (o
> runtime cai para o fallback silenciosamente e registra um warning).

- Locale base: `i18n/en-US/` (arquivos de área)
- Uma chave deve existir em todo locale e viver em exatamente um arquivo de área
- Integrações externas registram suas próprias strings em runtime via
  `window.deckShelves.api.registerTranslations(locale, dict)` em vez de um PR

## Convenções do projeto

- Indentação de 2 espaços, ponto e vírgula, aspas duplas
- `camelCase` para variáveis, `PascalCase` para componentes/tipos
- Entradas do changelog vão sob `## [Unreleased]` (nunca versione manualmente)
- Títulos de PR devem começar com `[FIX]`, `[ENHANCEMENT]`, `[REFACTOR]`, `[CLEANUP]`, ou `[FEATURE]`

### Diagramas na documentação

Os diagramas são escritos inline no Markdown para que renderizem na página do
repositório sem nenhum passo de build. Mantenha-os consistentes:

- **Coloque todo rótulo entre aspas** — `id["Texto"]`. As aspas são o que
  permite que um rótulo contenha `@`, `()`, `/` ou `·` com segurança.
- **Nunca use entidades HTML** (`&#64;`, `&amp;`). Elas renderizam
  literalmente onde quer que rótulos HTML estejam desativados, que é como o
  rótulo acaba mostrando `&#64;deck-shelves/api`. Escreva o caractere real
  dentro das aspas em vez disso. O `docs:check` falha nesse caso.
- `<br/>` para quebras de linha está tudo bem; mantenha o texto do nó em duas linhas curtas.
- **A cor carrega significado**, e toda classe combina um preenchimento claro
  com texto escuro para permanecer legível tanto no tema claro quanto no escuro:

  | Classe | Significado | Preenchimento / traço |
  |---|---|---|
  | `ds` | Código do próprio Deck Shelves | `#dbeafe` / `#2563eb` |
  | `contract` | Contratos publicados (`api` / `host`) | `#e0e7ff` / `#4f46e5` |
  | `platform` | Host Steam / Decky | `#ede9fe` / `#7c3aed` |
  | `data` | Armazenamento local / caches | `#dcfce7` / `#16a34a` |
  | `ext` | Rede ou terceiros | `#fef3c7` / `#d97706` |
  | `sensitive` | Módulos de alto risco (traço mais grosso) | `#fee2e2` / `#dc2626` |
  | `opt` | Opcional / inerte | `#f1f5f9` / `#94a3b8` |

- Diga o que uma cor significa na prosa quando ela carrega significado (como o
  diagrama de módulos da [arquitetura](architecture.md) faz para o grupo
  vermelho) — a cor sozinha nunca deve ser o único sinal.
