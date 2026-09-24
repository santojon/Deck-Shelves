# Perfis, troca automática e prateleiras sensíveis ao contexto

*[Read in English](../profiles-and-triggers.md)*

Salve configurações inteiras como **perfis**, troque entre eles
automaticamente com base em condições reais (encaixado, bateria baixa, um
controle específico conectado, hora do dia, e mais), e faça prateleiras
individuais reagirem a essas mesmas condições sem precisar de um perfil
separado.

## Perfis

Um perfil é um snapshot salvo da sua configuração. Útil para contextos
genuinamente diferentes — um layout "Encaixado" com prateleiras maiores
para uma TV, um layout mínimo "Portátil" pra usar em movimento, o que
combinar com o jeito que você realmente usa seu Deck. Existe um perfil
**Padrão** embutido que é um reset de fábrica de verdade, não só mais um
save.

Crie, troque, importe e exporte perfis nas configurações — exportar é útil
para fazer backup de uma configuração, ou compartilhar uma.

## Troca automática de perfis

Dê a um perfil uma condição de gatilho, ative o interruptor principal de
troca automática, e o Deck Shelves troca para ele automaticamente no
momento em que aquela condição se torna verdadeira — sem polling, ele reage
ao evento real do sistema (tela conectada, limiar de bateria cruzado, etc.).
Você recebe um aviso quando troca, que pode ser silenciado se preferir que
seja discreto.

## Quais condições estão disponíveis

Um conjunto amplo, e qualquer uma delas pode ser invertida ("NÃO
carregando", "nenhum controle conectado"):
- **Tempo** — faixa de horário, dia da semana, fim de semana,
  manhã/tarde/noite/madrugada, estação do ano, faixas de data específicas
  (feriados).
- **Dispositivo** — porcentagem de bateria, estado de carregamento, offline,
  uma tela externa conectada (encaixado), resolução de tela, ultrawide.
- **Sessão** — de onde você lançou o último jogo, se um jogo está rodando
  no momento.
- **Performance** — carga alta de CPU, memória baixa, taxa de quadros baixa.
- **Periféricos** — um controle conectado, fones de ouvido conectados, ou um
  dispositivo Bluetooth específico por nome.

Você pode combinar várias condições com lógica AND/OR, igual aos filtros.

## Comportamentos de prateleira (sem precisar de um perfil inteiro)

O mesmo sistema de condições também funciona em prateleiras individuais,
sem precisar trocar de perfil:
- **Auto-fixar** — flutua uma prateleira para o topo da tela inicial quando
  sua condição é verdadeira.
- **Auto-recolher** — dobra uma prateleira até mostrar só o cabeçalho quando
  uma condição é verdadeira, ou quando está vazia.

## Solução de problemas

- **Um gatilho não disparou depois que meu Deck acordou do sono.**
  Condições baseadas em mudanças de tela/controle/bateria que aconteceram
  *durante* o sono podem passar despercebidas (nada roda enquanto
  suspenso) — o Deck Shelves reverifica isso automaticamente ao acordar,
  então deve se autocorrigir em poucos segundos após acordar. Se ainda
  estiver errado depois disso, vale reportar um bug.
- **A troca automática não disparou mesmo com a condição parecendo
  verdadeira.** Confira se o interruptor principal de troca automática está
  ativado — o gatilho de um perfil não faz nada sem ele.
