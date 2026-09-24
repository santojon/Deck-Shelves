# Ferramentas para usuário avançado

*[Read in English](../power-user-tools.md)*

Um conjunto de ferramentas de diagnóstico, backup e visão geral para quem
quer olhar por baixo do capô ou manter um controle mais rígido sobre sua
configuração. A maior parte disso fica atrás do [modo Avançado](display-modes.md)
— ative isso primeiro.

## Snapshots de configurações

Toda mudança relevante de configuração ganha um backup contínuo e
versionado automaticamente (limitado a mais ou menos um por dia, mantendo os
últimos doze), então você pode voltar atrás se algo der errado. Você também
pode fazer um snapshot manual antes de tentar algo arriscado, e
exportar/importar snapshots como arquivos — útil para fazer backup de uma
configuração ou movê-la para outra instalação. Restaurar um snapshot também
pode ser desfeito, então é seguro experimentar.

## Gerenciamento de cache

Veja exatamente quanto espaço cada cache local do Deck Shelves está usando,
e limpe individualmente ou todos de uma vez, se você quiser um recomeço
limpo (ex.: depois de muitas mudanças na biblioteca) sem mexer nas suas
prateleiras ou configurações de verdade.

## Informações do sistema

Um painel de diagnóstico somente-leitura: versão do plugin, versão do
SO/Steam, tema ativo do CSS Loader, e quais outros plugins Decky estão
carregados junto — com um botão Copiar de um toque, então colar sua
configuração num report de bug leva segundos.

## Estatísticas e Sugestões

Mais duas abas, opcionais:
- **Estatísticas** (precisa do rastreamento de uso ativado) — gráficos de
  tendência e detalhamentos de sua biblioteca e de como suas prateleiras
  estão compostas, construídos a partir dos seus próprios dados de uso
  locais, nada enviado a lugar nenhum.
- **Sugestões** — dicas proativas agrupadas em "coisas que você pode querer
  criar" e "coisas que você pode querer limpar", baseadas na sua
  configuração real, com um aviso quando novas aparecem.

## Extras do modo desenvolvedor

Mais uma alternância dentro do modo Avançado desbloqueia mais algumas
ferramentas de inspeção profunda, úteis principalmente para rastrear um
problema específico:
- **Inspetor do resolvedor de fonte** — mostra exatamente quais jogos a
  cadeia de filtros de uma prateleira resolveu, passo a passo.
- **Overlay de debug na tela** — FPS/tempo de quadro ao vivo, contagem de
  prateleiras e nós, e contornos de renderização, se você está tentando
  identificar um problema de performance.
- **Visualizador de log de diagnóstico** — eventos recentes do plugin com
  copiar/limpar, além de atalhos de reset rápido (só prateleiras, só smart
  prateleiras, tudo).

## Tudo aqui só observa

Nenhuma dessas ferramentas muda suas prateleiras ou configurações por conta
própria — elas leem e reportam. A única exceção são os atalhos explícitos de
reset, que fazem exatamente o que dizem e nada mais.
