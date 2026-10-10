# Matriz de validação

*[Read in English](../validation-matrix.md)*

O que foi de fato exercitado em dispositivos reais para a linha de release atual
(plugin 3.3.4, host standalone 0.5.0 beta), e o que ainda precisa de um validador.
"Validado" significa que os gates de device de `docs/performance.md` rodaram naquela
configuração (boot a frio, volta à Home, seleção mantida, recarga do plugin, reinício da
Steam, suspender/acordar, CPU ociosa e bateria). O que não está como validado é
**não testado nesta release**, não "quebrado".

## Estado atual

| Plataforma | Canal da Steam | Host | Status | Evidência |
|---|---|---|---|---|
| Steam Deck (LCD) | Client Beta, home Big Art | Decky Loader (com CSS Loader e outros plugins) | Validado 2026-10-10 | Gate 20× de volta à Home, 20/20 recargas, 99/100 reinícios da Steam, 50/50 suspender/acordar, soaks de CPU ociosa e bateria — registros em `site/reports/perf/` |
| Steam Deck (LCD) | Client Beta | Só host standalone | Validado 2026-10-10 | Boot, layout da Home, CPU ociosa, meia hora de bateria |
| Steam Deck (LCD) | Client Beta | Decky Loader + host standalone juntos | Validado 2026-10-10 | 10/10 reinícios da Steam, 5/5 recargas do plugin, uma raiz e um painel de shelves em todo ciclo |
| macOS (Apple silicon) | Stable | Só host standalone | Validado (básico) 2026-10-10 | Home renderiza, faixa do hero, pausa em idle — sem gamepad conectado, sensação de teclado/controle não coberta |
| Steam Deck (OLED) | qualquer | qualquer | Precisa de validador | Só hardware LCD disponível |
| SteamOS | Stable / Preview | qualquer | Precisa de validador | Só o Client Beta estava disponível neste ciclo |
| Bazzite | qualquer | Decky Loader ou host standalone | Precisa de validador | Os reports #57, #96 e #101 vieram do Bazzite; nada retestado lá desde então |
| Windows | Stable | Host standalone | Precisa de validador | Instalador existe; não exercitado neste ciclo |
| Linux desktop (não SteamOS) | Stable | Host standalone | Precisa de validador | — |
| ARM64 / aarch64 | qualquer | Host standalone (experimental) | Precisa de validador | Sem hardware; só builds de CI |

## Como validar uma célula

Dez minutos com o plugin instalado e pelo menos três shelves configuradas:

1. **Boot a frio:** reinicie a Steam. As shelves aparecem poucos segundos depois da home nativa;
   o foco cai num card, não no campo de busca.
2. **Volta à Home:** abra a página de um jogo, aperte B. As shelves voltam na hora, o card
   selecionado continua selecionado, a home nativa não pisca no meio.
3. **Recarga do plugin / reinício do host:** reinicie o loader ou o host standalone. Exatamente
   uma cópia das shelves na tela depois.
4. **Suspender / acordar:** suspenda e retome. Shelves intactas, navegação funciona.
5. **Com um jogo rodando:** lance um jogo, aperte o botão Steam, vá à Home. Shelves presentes e
   navegáveis; de volta ao jogo nada mudou.
6. **Ocioso:** deixe a Home parada por dois minutos. Nenhum engasgo quando apertar uma direção de novo.

Depois abra **Configurações → Sobre → Diagnóstico** e use a cópia do relatório de bug; cole
numa issue do GitHub com a plataforma e o host no título, ou no canal de validação do Discord.
Inclua o número de build do cliente Steam (Configurações → Sistema) e se temas do CSS Loader
estão ligados.

## O que um validador ganha

Uma linha com o nome nesta tabela, o agradecimento nas notas de release e acesso antecipado ao
próximo beta do host em que validou.
