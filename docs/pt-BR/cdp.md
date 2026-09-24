# CDP CLI

*[Read in English](../cdp.md)*

`deckprobe/cdp.py` é um pequeno wrapper em torno do Chrome DevTools Protocol que cobre o ciclo de debug do dia a dia contra um cliente Steam ativo: escolher um target, rodar uma probe, inspecionar o resultado. Ele substitui a dupla `cdp_eval.py` / `cdp_probe.py`, criada de forma improvisada, em `tools/` para os casos mais comuns, e funciona da mesma forma seja o target um Steam Deck, uma sessão Big Picture no desktop, ou um cliente de desenvolvimento local — no SteamOS, Linux, macOS ou Windows.

## Pré-requisitos

- Depuração remota do CEF habilitada no cliente Steam alvo (porta padrão `8081`), e o Big Picture / Game Mode aberto. Como habilitar depende do SO do alvo:
  - **SteamOS / Steam Deck** — habilitado automaticamente assim que o Decky Loader é instalado; nenhum passo manual necessário.
  - **Linux (desktop)** — `touch ~/.steam/steam/.cef-enable-remote-debugging`, depois reinicie a Steam.
  - **macOS** — `open -a Steam --args -cef-enable-remote-debugging`.
  - **Windows** — inicie a Steam com `steam.exe -cef-enable-remote-debugging`.
- `.env` na raiz do repositório com `DECK_HOST` e `DECK_CDP_PORT` (`pnpm run deck:setup` escreve um `.env` funcional para um target Deck na primeira execução; para um target local/desktop defina `DECK_HOST=127.0.0.1` e a porta que você habilitou acima).
- `pip install websocket-client` na máquina que roda a CLI (necessário só para `eval`, `screenshot`, `console` — `targets` funciona sem isso).

## Targets e aliases

O cliente Steam alvo expõe várias superfícies CDP. Use o alias ao escrever scripts; o ID bruto do target serve bem para consultas pontuais.

| Alias       | Fragmento do título   | O que é                                                           |
|-------------|------------------------|--------------------------------------------------------------------|
| `bp`        | `Big Picture`        | A UI da Steam mostrada no Big Picture / Game Mode — prateleiras, modais, recentes nativos. |
| `qam`       | `QuickAccess`        | O painel do lado direito onde vive a UI de configurações do plugin. |
| `sjc`       | `SharedJSContext`    | Árvore React por trás tanto do BP quanto do QAM — melhor para probes de store/router. |
| `mainmenu`  | `MainMenu`           | Popup do menu principal do Big Picture.                            |

## Subcomandos

### `targets`

```
python3 deckprobe/cdp.py targets
```

Lista todo target CDP com seu alias (se houver) e ID. Rode isso primeiro quando um alias parar de resolver — atualizações de build da Steam ocasionalmente renomeiam uma superfície.

### `eval`

Avalia uma expressão JS em um target. O valor de retorno é serializado como JSON quando é um objeto ou array, e impresso como está caso contrário. Promises são aguardadas.

```
python3 deckprobe/cdp.py eval bp 'document.title'

# Read expression from stdin (handy for multi-line probes):
echo 'JSON.stringify({n: document.querySelectorAll(".ds-card").length})' \
  | python3 deckprobe/cdp.py eval bp -
```

Erros e promises rejeitadas são escritos no stderr e encerram com código 1, então a CLI é segura para encadear em pipelines de shell.

### `screenshot`

```
python3 deckprobe/cdp.py screenshot bp /tmp/bp.png
```

Captura o viewport do target como um PNG. O caminho de saída é impresso em caso de sucesso.

### `console`

Transmite `console.{warn,error}` e exceções não capturadas até Ctrl-C. Passe `--all` para incluir também `log`/`info`. Passe `--duration N` para parar automaticamente após N segundos (útil em execuções via script).

```
python3 deckprobe/cdp.py console sjc
python3 deckprobe/cdp.py console qam --all --duration 30
```

## Receitas comuns de debug

```
# How many shelves are mounted right now?
python3 deckprobe/cdp.py eval bp \
  'document.querySelectorAll("[data-ds-shelf]").length'

# What does the React store say about the active settings?
python3 deckprobe/cdp.py eval sjc \
  'JSON.stringify(window.__DECK_SHELVES__?.snapshot?.() ?? null)'

# Capture the QAM after toggling a setting:
python3 deckprobe/cdp.py screenshot qam /tmp/qam-after.png
```

## Solução de problemas

- **`alias 'bp' did not match any target`** — a Steam está em um estado transitório (reiniciando, tela de splash). Espere alguns segundos e rode `targets` novamente.
- **`websocket-client not installed`** — `pip install websocket-client` (ou `python3 -m pip install --user websocket-client` no próprio dispositivo alvo).
- **Conexão recusada na porta CDP** — a depuração remota não está habilitada no cliente alvo, ou a Steam não foi reiniciada desde que foi habilitada. Veja os passos por SO em Pré-requisitos acima.
