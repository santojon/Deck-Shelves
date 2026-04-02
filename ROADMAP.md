# Deck Shelves — Roadmap de Melhorias

## Context

O plugin Deck Shelves (v0.2.0) está arquiteturalmente sólido, mas tem lacunas em performance, testes, resiliência e integração com o ecossistema Decky. Este plano consolida oportunidades identificadas via análise profunda do código + pesquisa do ecossistema Decky, priorizadas em sprints executáveis.

PR de publicação na loja (#1008) está pendente por itens específicos — esses são os desbloqueadores mais urgentes.

---

## Sprint 1 — Desbloqueadores da Loja (todos Low complexity, sem dependências)

### 1.1 Remover flag `debug` do plugin.json no empacotamento por padrão
- O script `checks/decky/decky-submission.sh` não deve detectar e rejeitar a flag
- Automatizar remoção no `scripts/build/package.sh` antes de empacotar por padrão
- nos builds padrão também remover a flag por padrão a não ser que seja pediod explicitamente por modo dev
- pnpm run deploy:deck:hard deve rodar em debug

### 1.2 Verificar icon.png para listing da loja
- `checks/decky/decky-submission.sh` adverte sobre `assets/icon.png` faltando
- Tarefa de design (32x32 px), sem mudança de código

### 1.3 Fix: `resetSettings` sem timeout (bug silencioso)
- **Arquivo:** `src/settingsStore.ts`
- `resetSettings()` chama `call("reset_settings")` sem `withTimeout()`, ao contrário de `get_settings` e `set_settings`
- Pode bloquear UI indefinidamente se o backend estiver irresponsivo
- Fix de uma linha: envolver com `withTimeout`

### 1.4 Fix: interval leak em `focusRestore.ts`
- **Arquivo:** `src/core/focusRestore.ts`
- `beginFocusRestoreLoop` chamado duas vezes antes do deadline: o `pollId` da primeira chamada nunca é limpo
- Fix: adicionar `clearInterval(pollId)` no caminho de cleanup do `focusObserver.disconnect()`

---

## Sprint 2 — Estabilização (CI, Testes, Correções)

### 2.1 CI pipeline no GitHub Actions
- **Arquivo novo:** `.github/workflows/ci.yml`
- Steps: `pnpm install` → `typecheck` → `build:release` → `validate.mjs` → `validate-compat.sh` → `decky-submission.sh`
- Gatea PRs para não mergearem com erros de tipo ou bloqueadores de submissão

### 2.2 Testes unitários para lógica de domínio
- **Arquivos novos:** `src/__tests__/domain/`, `tests/test_main.py`
- Adicionar Vitest (já disponível via Vite)
- Cobrir: `mapFilterTypeToInternal()`, `containerToShelfSource()`, `applyFilterGroup()` com todos os 14 tipos de filtro, `_sanitize_settings()` em Python com pytest
- Sem mocks de Steam — tudo lógica pura

### 2.3 Fix: tratamento de erro no import do TabMaster
- **Arquivo:** `src/components/DeckQAMSettings.tsx`
- `loadTabs` captura erros silenciosamente; usuário vê lista vazia sem feedback
- Adicionar estado de loading + mensagem de erro no modal

### 2.4 Fix: diagnóstico para shelf com zero apps em produção
- **Arquivos:** `src/components/Shelf.tsx`, `src/runtime/homePatch.tsx`
- `logWarn("HOME", "shelf resolved zero apps")` tem guard `!__DEV__` — silencioso em prod
- Fix: usar `logDiagnostic("warn", ...)` para surfacear no painel About em builds de produção

### 2.5 Fix: intervalo de 2s em `homePatch.tsx` desnecessariamente curto
- **Arquivo:** `src/runtime/homePatch.tsx`
- `setInterval` de 2s para `scheduleRun` quando o `MutationObserver` já cobre o fast-path
- Aumentar para 10s como fallback apenas

---

## Sprint 3 — Performance e Integração com SteamOS

### 3.1 Substituir polling por refresh orientado a eventos
- **Arquivos:** `src/components/Shelf.tsx`, `src/steam.ts`, novo `src/core/shelfRefresh.ts`
- Problema atual: cada shelf polls a cada 3–15s independentemente (5 shelves = até 5 ciclos paralelos a cada 3s)
- Solução: `ShelfRefreshEmitter` global que:
  - Subscreve `SteamClient.Apps.RegisterForAppOverviewChanges` e `collectionStore.onChange`
  - Mantém polling global único a cada 30s como fallback
  - Cada `ShelfView` subscreve ao emitter ao invés de ter seu próprio timer
- Manter `deck-shelves-settings-changed` como trigger de refresh imediato (já correto)

### 3.2 Hooks de Suspend/Resume do SteamOS
- **Arquivos:** novo `src/runtime/systemEvents.ts`, `src/steam.ts`, `src/components/HomeInject.tsx`
- Subscrever `SteamClient.System.RegisterForSuspendResumeEvents`
- No suspend: pausar timers de refresh, parar `MutationObserver`
- No resume: invalidar `appOverviewCache`, re-executar `findOrCreateMount()`, disparar refresh imediato
- Envolver em try/catch — tratar como feature opcional

### 3.3 Aumentar TTL de refresh de tabs na controller
- **Arquivo:** `src/features/settings/controller.tsx`
- Tabs mudam raramente; `setInterval(refreshTabs, 5000)` pode ir para 30s
- Invalidar imediatamente apenas no evento `deck-shelves-settings-changed`

---

## Sprint 4 — Resiliência e Compatibilidade

### 4.1 Desacoplar de seletores CSS hardcoded
- **Arquivos:** `src/runtime/homePatch.tsx`, `src/components/HomeInject.tsx`
- Classes obfuscadas como `_282X0J4BtrSF1IXctmOe-X` mudam a cada update do Steam
- Estratégia: array de seletores ordenado por estabilidade (aria-labels > substrings de classe > estrutura DOM)
- Cada candidato em try/catch; logar qual teve sucesso no buffer de diagnóstico

### 4.2 Fallback para nav tree do gamepad
- **Arquivos:** `src/components/HomeInject.tsx`, `src/core/focusRestore.ts`
- `m_rgChildren`, `m_Parent`, `BTakeFocus` são APIs internas que podem mudar
- Adicionar feature-detection no mount; prover fallback DOM (`.focus()` nativo) quando nav tree indisponível
- `tryRestoreFocus` já faz isso parcialmente — estender para o reparenting

### 4.3 Detecção de versão do SteamOS nos diagnósticos
- **Arquivo:** `src/runtime/diagnostics.ts`
- Adicionar `SteamClient.System.GetOSType()` ou `navigator.userAgent` no log de startup
- Facilita debugging de suporte sem precisar que o usuário descreva o ambiente

---

## Sprint 5 — Usabilidade e Novas Features

### 5.1 Fluxo de primeiro uso
- **Arquivos:** `src/types.ts`, `src/domain/defaults.ts`, novo `src/components/FirstRunBanner.tsx`, `src/components/DeckQAMSettings.tsx`
- Quando `shelves.length === 0` e plugin nunca foi habilitado: mostrar banner com botão "Criar shelves padrão"
- Templates: Favoritos, Jogados Recentemente, Instalados
- Campo `firstRun: boolean` no schema (Zod ignora graciosamente via `safeParse`)

### 5.2 Templates de shelves inteligentes
- **Arquivos:** novo `src/domain/templates.ts`, `src/components/DeckQAMSettings.tsx`, arquivos i18n
- Picker de template ao adicionar shelf (antes do modal de edição):
  - "Jogados nos últimos 7 dias"
  - "Mais jogados de todos os tempos"
  - "Adicionados recentemente"
  - "Esperando atualização"
- Reutiliza filtros existentes — só agrega UX de descoberta

### 5.3 API pública para outros plugins registrarem shelf sources
- **Arquivos:** novo `src/core/pluginApi.ts`, `src/types.ts`, `src/steam.ts`, `src/index.tsx`
- Expor `window.__DECK_SHELVES_API__` com interface versionada:
  ```ts
  interface DeckShelvesAPI {
    version: number;
    registerShelfSource(descriptor: {
      id: string;
      displayName: string;
      resolve: (limit: number) => Promise<number[]>;
    }): () => void; // retorna função de cleanup
  }
  ```
- Novo tipo de source: `{ type: "external", sourceId: string }` no `ShelfSourceSchema`
- QAM mostra sources externos no dropdown quando disponíveis
- Versionar a API desde o início (breaking changes = bump de versão)

### 5.4 UnifiDeck como source explícita no editor
- **Arquivos:** `src/components/DeckQAMSettings.tsx`, `src/features/settings/controller.tsx`
- Quando `isUnifiDeckInstalled()`, mostrar tabs do UnifiDeck no dropdown de source com nomes reais
- Já suportado via `domtabs.ts` — só falta surfacear na UI

### 5.5 Ações de contexto para Collection-backed shelves
- **Arquivos:** `src/core/steamGameMenu.ts`, `src/components/HomeInject.tsx`
- Contexto já funciona (Options button → menu do jogo)
- Para shelves de Collection: adicionar "Remover desta shelf" que remove o app da collection Steam subjacente

### 5.6 Collapse/expand de shelf persistido
- **Arquivo:** `src/runtime/homePatch.tsx`
- `rowScrollState` já persiste scroll por shelf em um Map
- Mesmo padrão para estado collapsed/expanded em localStorage
- Toggle no header da shelf (`<h3>`)

---

## Sprint 6 — Automação e Ecossistema (pós-publicação)

### 6.1 Release automation via GitHub Actions
- **Arquivo novo:** `.github/workflows/release.yml`
- Trigger em tags `v*.*.*`
- Build produção + strip do debug flag + zip + upload como GitHub Release asset

### 6.2 Atomic writes + backup de settings no backend
- **Arquivo:** `main.py`
- Write atômico: escrever em `.tmp`, renomear para `.json`
- Manter `settings.json.bak` do último write bem-sucedido
- Infrastructure de migração de schema para versões futuras

### 6.3 Compatibilidade verificada com CSS Loader
- **Arquivo:** `checks/plugins/cssloader.sh`
- Rodar e documentar qualquer colisão de classes
- Prefixos `deck-shelves-*` já estão em uso — confirmar consistência

---

## Arquivos Críticos

| Arquivo | Motivo |
|---------|--------|
| `plugin.json` | Bloqueador de publicação (debug flag) |
| `src/settingsStore.ts` | Bug de timeout + base dos testes de lifecycle |
| `src/core/focusRestore.ts` | Bug de interval leak |
| `src/components/Shelf.tsx` | Polling → eventos (impacto de bateria) |
| `src/steam.ts` | Cache de app overviews + subscriptions (hub central) |
| `src/runtime/homePatch.tsx` | Seletores CSS frágeis + intervalo 2s |
| `src/components/HomeInject.tsx` | Nav tree frágil + suspend hooks |
| `src/features/settings/controller.tsx` | TTL de refresh de tabs |
| `src/components/DeckQAMSettings.tsx` | Error handling TabMaster + novos UX flows |
| `main.py` | Atomic writes + backup + testes Python |

---

## Verificação End-to-End

1. **Loja:** Rodar `checks/decky/decky-submission.sh .` — deve passar 7/7 itens
2. **Types:** `pnpm typecheck` sem erros
3. **Build:** `pnpm build:release` → bundle < 300KB, sem sourcemaps
4. **Testes:** `pnpm vitest run` + `pytest tests/` — todos verdes
5. **Performance:** Com 5 shelves ativas, verificar logs do CDP — máximo 1 ciclo de resolução a cada 30s em idle
6. **Suspend/resume:** No Deck real — suspender → retomar → shelves atualizam corretamente
7. **Plugin API:** Registrar uma source externa de teste → aparece no dropdown QAM → shelf renderiza
8. **Deploy:** `pnpm deploy:deck` → reiniciar Steam → todas as shelves renderizam com gamepad navigation funcional
