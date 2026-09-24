# Auditoria de performance

*[Read in English](../performance.md)*

O Steam Deck tem um orçamento apertado de CPU/bateria compartilhado com o jogo em execução. Este documento acompanha as baselines medidas para os caminhos de renderização que rodam no nosso hot loop e as otimizações aplicadas sobre eles.

Otimizações sempre são entregues acompanhadas de um número antes/depois, capturado em um Steam Deck OLED real (SteamOS 3.7+ stable).

## Método

Os números vêm de uma combinação de:

- **`React.Profiler`** — envolve `DeckRow`, `Shelf`, `GameCard`, `HomeInject`. Registra a duração do commit e conta re-renders por interação.
- **`performance.measure` / `performance.mark`** — marcadores explícitos de início/fim em torno de mount, scroll, e caminhos de resolução.
- **Deltas de `requestAnimationFrame`** — timing de frame durante o scroll, capturado em janelas de 60 frames.
- **`SteamClient.System.Battery`** — drift ao longo de uma janela ociosa de 30 minutos vs. a baseline nativa da Steam.
- **`vite build --reporter detailed`** — deltas de tamanho de bundle.
- **`console` do CDP** no modo `--duration N` — stream passivo de warnings / logs de re-render ao longo de uma janela de teste fixa.

Os fixtures de reprodução ficam em `assets/import/` e são carregados via `actions.import` para que uma medição comece a partir de um conjunto conhecido de prateleiras.

## Caminhos críticos e o que observamos

| Superfície | Métrica | Alvo |
|---------|--------|--------|
| Re-renders do `DeckRow` por edição de prateleira | Contagem de commits do React.Profiler | ≤ 1 commit por prateleira editada |
| Round-trip do resolver da `Shelf` | `resolveShelfAppIds` em ms | < 50 ms em cache, < 250 ms a frio |
| Mount a frio da Home | `home visible` → `first shelf rendered` | < 500 ms a frio, < 200 ms aquecido |
| FPS de scroll (horizontal) | intervalo p95 do rAF durante scroll da prateleira | ≥ 16,67 ms p95 (≈ 60 fps sustentado) |
| Drift de bateria em ocioso | delta de `Battery.flLevel` em 30 min | dentro de ±0,5 pp da baseline nativa |
| Tamanho do bundle | gzip de `dist/index.js` | acompanhar semana a semana |

## Ganhos já aplicados

- **`generation-id cancellation`** em `Shelf.tsx` — descarta promises de resolução obsoletas para que uma re-edição rápida não enfileire trabalho redundante.
- **`shelf refresh emitter`** em `core/shelfRefresh.ts` — um único barramento de eventos global em vez de polling por prateleira. Mudanças de configuração disparam um único emit, cada prateleira escuta.
- **`reparent poll throttle 750 → 3000 ms`** — o splice da árvore de foco é repetido a cada 3 s em vez de a cada 750 ms; cobre re-mounts do React sem inundar o controller.
- **`memo + stable refs`** em `DeckRow`, `ShelfView`, `GameCard` — as props são computadas no componente pai e passadas adiante por referência; lambdas inline foram eliminadas em auditoria.
- **`MutationObserver` só em `.deck-shelves-root`** — os observers ficam restritos ao ponto de mount, não ao document body inteiro.
- **`webpackCompat.discoverNativeCardDimensions`** faz cache do resultado pela chave viewport+DPR para que o mount a frio evite uma nova medição.
- **`cardsize` no localStorage** — persiste as últimas dimensões conhecidas entre boots para que a primeira pintura já bata antes da descoberta terminar.

## Como reproduzir uma medição

```bash
# 1. Reset to a known fixture (6 representative shelves):
pnpm qa:all-shelves-show-recents
# Wait for re-deploy; restart Steam.

# 2. Open the CDP console for a fixed window:
python3 devkit/cdp.py console --duration 30

# 3. Profile a specific path. Inside the BP devtools console:
performance.mark('home-mount-start')
# ... navigate to home ...
performance.measure('home-mount', 'home-mount-start')
performance.getEntriesByName('home-mount')[0].duration
```

Registre achados em PRs com a tag `[PERF]` mais números de antes/depois na descrição para que revisores consigam validar o delta.

## Próximos passos em aberto

- Passe de auditoria de re-render sobre `EditShelfModal` e `EditSmartShelfModal` — a linha de prévia recalcula a cada tecla pressionada; candidata a debounce.
- Divisão de bundle: carregar sob demanda a rota da página About. Hoje está empacotada no chunk principal.
- Revisão de orçamento de `MutationObserver` — contar observers ativos e consolidar onde o mesmo nó é observado por dois caminhos.
- Medição de bateria de longa duração — um teste ocioso de 6 horas para descartar vazamentos lentos na cadeia de patches de substituição de recentes.
