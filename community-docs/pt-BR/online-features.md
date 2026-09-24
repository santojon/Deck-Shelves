# Funcionalidades online

*[Read in English](../online-features.md)*

Linhas de lista de desejos, prateleiras "Em promoção", ordenação por preço,
e alguns filtros de metadados da loja (gênero, nota de avaliação, data de
lançamento, e mais) — tudo opcional, tudo desligado até você ativar.

## O que fica atrás do interruptor principal

Nada aqui toca a rede até você ativar as **Funcionalidades online**. Com
elas desligadas:
- Nenhuma verificação de conectividade, nenhuma requisição à loja —
  genuinamente zero sondagens de rede, não só resultados ocultos.
- Todo template de prateleira e tipo de filtro só-online (lista de desejos,
  em promoção, faixa de desconto, faixa de preço, gênero, categoria,
  franquia, nota de avaliação, data de lançamento, "em breve", filtros
  relacionados a amigos) desaparece completamente do seletor, então não tem
  nada pra disparar sem querer.

## Ativando

1. Abra as configurações do Deck Shelves, encontre **Funcionalidades
   online**, e ative o interruptor principal. Você vai ver um breve aviso de
   privacidade na primeira vez — ele lista exatamente quais URLs são
   contatadas.
2. Sub-alternâncias permitem ativar lista de desejos e ordenação por preço
   independentemente, se você quiser uma sem a outra.

## O que você ganha

- **Lista de desejos como fonte de prateleira**, sozinha ou combinada com
  sua biblioteca.
- **Prateleiras "Em promoção"**, vindas do próprio catálogo de promoções do
  Steam.
- **Ordenação por preço/desconto**, e filtros de faixa de desconto e faixa
  de preço.
- **Filtragem de jogos já possuídos** em prateleiras de lista de
  desejos/loja — oculte jogos que você já tem (incluindo atalhos não-Steam,
  e uma opção para se entradas de jogo em nuvem como Xbox Cloud Gaming
  contam como "possuído").
- **Metadados da loja como filtros/ordenações em todo lugar**, não só em
  prateleiras online — gênero, categoria, franquia, nota de avaliação, data
  de lançamento, e "em breve" funcionam nas suas prateleiras normais de
  biblioteca também, já que sua própria biblioteca também não carrega esses
  dados localmente.
- **Filtros de atividade de amigos** — quem está jogando agora, quem jogou
  recentemente.

## Detalhes de privacidade

- A lista de desejos sincroniza no máximo uma vez por dia, com cache local.
- Preços ficam em cache por 6 horas por jogo, e só são buscados para jogos
  que uma prateleira está de fato prestes a mostrar — nada é buscado
  antecipadamente por especulação.
- Nada é enviado a lugar nenhum; as únicas requisições de saída são
  chamadas somente-leitura à própria loja do Steam, e só acontecem para
  funcionalidades que você realmente ativou.

## Solução de problemas

- **Uma prateleira/filtro que eu quero não está no seletor.** Confira
  primeiro o interruptor principal de Funcionalidades online — toda opção
  dependente de online fica oculta, não só desativada, enquanto ele está
  desligado.
- **Os filtros de gênero/nota de avaliação/data de lançamento não mostram
  nada no início.** Numa biblioteca grande, esses dados são preenchidos
  gradualmente ao longo de algumas atualizações em vez de tudo de uma vez
  na primeira execução — dê um tempo.
