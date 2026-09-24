# Fontes de prateleira e filtros

*[Read in English](../shelf-sources-and-filters.md)*

Toda prateleira precisa de uma **fonte** — de onde vêm os jogos dela — e, se
você quiser mais controle, **filtros** por cima dessa fonte para
refiná-la. Essa é a parte mais profunda do Deck Shelves; aqui está o mapa
do que está disponível.

## Fontes: de onde vêm os jogos de uma prateleira

Escolha uma ao criar ou editar uma prateleira:
- **Uma coleção Steam** que você já fez.
- **Uma aba da biblioteca** (Todos os Jogos, Favoritos, Instalados, e
  qualquer aba personalizada que você tenha, incluindo do TabMaster se
  estiver instalado).
- **Um filtro** — construa uma consulta do zero (veja abaixo) em vez de
  apontar para algo que já existe.
- **Fontes online** — sua lista de desejos, ou "Em promoção" da loja
  (precisa das Funcionalidades online ativadas — veja
  [Funcionalidades online](online-features.md)).
- **Fontes embutidas** — mais de uma dezena já prontas cobrindo coisas como
  jogos atualizados recentemente, jogos com atualizações de workshop, seus
  jogos fixados, e bibliotecas de launcher não-Steam (EmuDeck, RetroDECK,
  Heroic, Lutris, Moonlight, Chiaki), se estiverem instalados.

### Combinando mais de uma fonte

Uma prateleira não fica limitada a uma fonte. Adicione uma segunda (ou
terceira) e escolha como elas se combinam:
- **União** — jogos que aparecem em *qualquer* uma das fontes (ex.:
  Favoritos + Lista de desejos, então os dois aparecem juntos).
- **Interseção** — só jogos que aparecem em *todas* as fontes (ex.:
  Instalados ∩ sua coleção "Roguelikes").

## Filtros: refinando uma fonte

Depois de ter uma fonte, filtros permitem refiná-la ainda mais — por
instalado/tempo de jogo/gênero/compatibilidade/preço e dezenas mais. São
cerca de 70 tipos de filtro em alguns grupos:

- **Básicos de biblioteca** — instalado, favoritos, ocultos, não-Steam,
  nota de compatibilidade Deck/SteamOS, demo, faixa de tempo de jogo,
  correspondência de nome.
- **Metadados da loja** — gênero, categoria, franquia, suporte a VR, tipo
  de multijogador, nota de avaliação, data de lançamento, "em breve". Esses
  funcionam também em jogos que você ainda não possui (cards de lista de
  desejos/loja), e precisam das Funcionalidades online ativadas já que os
  dados não são locais.
- **Uso e progresso** — número de execuções, duração de sessão, conclusão
  de conquistas, "jogado uma vez e abandonado", "instalado mas nunca
  jogado".
- **Armazenamento** — interno vs. cartão SD, faixa de tamanho de
  instalação.
- **Não-Steam / launchers** — filtre atalhos por qual launcher pertencem
  (EmuDeck, Heroic, Lutris, …), tipo de executável, opções de lançamento.
- **Só online** — faixa de desconto, faixa de preço, amigos jogando agora,
  amigos jogaram recentemente.

Combine filtros com **AND** (toda condição precisa corresponder) ou **OR**
(qualquer uma basta), e inverta qualquer filtro individual para significar
"não isso." Você também pode aninhar um subgrupo dentro de um filtro, para
casos como "(gênero é RPG OU Estratégia) E instalado."

## Ordenação

Cerca de 40 opções de ordenação, cobrindo alfabética, jogado por último,
tempo de jogo, data de lançamento, tamanho em disco, nota de avaliação,
compatibilidade com o Deck, preço/desconto (online), e ordenações por
padrão de uso como "mais ignorado" ou "mais perto da conclusão." Você
também pode encadear duas chaves de ordenação — uma primária e um
desempate — e inverter qualquer uma delas independentemente. Ordem
**Manual** (arraste seu próprio arranjo) e **Aleatória** (um embaralhamento
estável que atualiza diariamente) também estão disponíveis como ordenação
primária.

## Prateleiras compostas e multi-fonte

Além de combinar fontes, você pode empilhar múltiplos **filtros** da mesma
forma — uma prateleira pode ser "instalado E (gênero RPG OU Estratégia) E
NÃO oculto," tudo construído visualmente no editor, sem precisar de JSON
manual para nada disso (os exemplos acima mostram a forma subjacente só
como referência).

## Onde procurar no app

O editor de prateleira mostra toda opção de filtro/ordenação/fonte ao vivo
enquanto você constrói, com os parâmetros exatos que cada uma aceita — este
documento é o mapa, o editor é o menu completo.
