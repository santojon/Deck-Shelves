# Sincronize suas configurações entre dispositivos (experimental)

*[Read in English](../cloud-sync.md)*

Tem o Deck Shelves em mais de um dispositivo logado na mesma conta Steam —
um Deck e um PC de jogos, digamos? Agora você pode manter suas prateleiras,
filtros, perfis, e toda outra configuração sincronizados entre eles, sem
precisar de conta ou serviço extra.

## Como funciona

Isso usa o mesmo armazenamento em nuvem por conta que o próprio cliente
Steam já usa para configurações que "acompanham a conta" entre máquinas.
**Não** é o Steam Cloud (esse sistema é por jogo, e um plugin não tem um
jogo próprio para usá-lo) — não tem cadastro, não tem cota, e não tem
custo, já que aproveita a infraestrutura que o Steam já roda.

Suas configurações locais sempre continuam sendo a fonte da verdade real em
cada dispositivo. A sincronização é um espelho por cima disso, não um
substituto do armazenamento local — desativá-la só para a espelhagem, nada
é apagado.

## Como ativar

1. Abra as configurações do Deck Shelves no primeiro dispositivo, encontre
   a alternância de sincronização, e ative.
2. Faça o mesmo no(s) outro(s) dispositivo(s).
3. Pronto — o dispositivo com as mudanças mais recentes vence quando dois
   dispositivos se reconciliam (veja "Como conflitos são tratados" abaixo),
   e uma linha de status abaixo da alternância mostra quando sincronizou
   pela última vez.

Você recebe uma notificação sempre que uma mudança de outro dispositivo é
aplicada no que você está usando, então nunca é uma surpresa silenciosa.

## Quando de fato sincroniza

- **Uma vez, assim que você ativa a alternância** (ou quando o app inicia
  com ela já ativada) — puxa o que estiver na nuvem, ou envia suas
  configurações locais se a cópia na nuvem estiver ausente ou mais antiga.
- **Alguns segundos depois de qualquer mudança local**, enquanto a
  alternância continua ativada.
- **Não** faz polling contínuo em segundo plano — uma mudança feita em
  outro dispositivo enquanto os dois estão rodando não aparece neste até
  você abrir o app de novo ou alternar o interruptor. Isso mantém a
  funcionalidade leve e econômica de bateria de propósito, não é um bug.

## Como conflitos são tratados

É por escrita-mais-recente-vence por timestamp: o dispositivo que fez uma
mudança mais recentemente é quem "vence" se os dois dispositivos mudaram
configurações separadamente antes de sincronizar. Não tem mesclagem por
campo nem seletor de conflito — se você editou prateleiras em dois
dispositivos independentemente antes deles sincronizarem, o conjunto mais
antigo de edições é sobrescrito, não mesclado. Se isso importa para você,
sincronize os dispositivos com frequência em vez de deixá-los divergir por
muito tempo.

## O que é deliberadamente excluído da sincronização

Dois tipos de configuração nunca viajam entre dispositivos, de propósito:
- A alternância de sincronização e seu próprio controle interno — ativar a
  sincronização num dispositivo não consegue ativá-la remotamente em outro.
- Alguns valores técnicos específicos do dispositivo que não fariam sentido
  (ou estariam ativamente errados) se copiados para outra máquina.

## Solução de problemas

- **A linha de status diz "ainda não sincronizado" e continua assim.**
  Confira se você está online, e dê alguns segundos depois de ativar — a
  primeira sincronização acontece logo após ativar, não instantaneamente ao
  clicar. Se continuar travado depois de um minuto, tente desativar e
  ativar de novo.
- **Eu fiz uma mudança e ela não está aparecendo no meu outro
  dispositivo.** A sincronização não é contínua — reabra o app (ou alterne
  a sincronização) no outro dispositivo para puxar o mais recente.
- **Minhas prateleiras voltaram para uma versão mais antiga depois de
  sincronizar.** Esse é o comportamento de escrita-mais-recente-vence acima
  — o dispositivo com a mudança mais antiga foi tratado como "mais recente"
  pelo horário do relógio. Confira se os relógios do sistema dos dois
  dispositivos estão realmente corretos se isso acontecer inesperadamente.

Desativado por padrão, e ainda marcado como experimental enquanto ganha
mais uso no mundo real — mas o mecanismo central de sincronização em si já
foi testado a fundo, incluindo uma correção para um caso sutil onde certos
valores de configuração podiam silenciosamente falhar ao transferir.
