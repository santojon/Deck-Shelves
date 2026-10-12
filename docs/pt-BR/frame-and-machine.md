# Suporte a Frame e Machine

*[Read in English](../frame-and-machine.md)*

O Deck Shelves roda em mais do que o Steam Deck. Esta página descreve o que o plugin sabe sobre o dispositivo em que roda, como esse conhecimento chega às prateleiras e aos cards, e como testar os caminhos de Frame e Machine sem ter o hardware.

## Modelo de dispositivo

Três coisas são rastreadas separadamente, e a família nunca é inferida da arquitetura da CPU (um build ARM64 num desktop continua sendo um PC):

| Campo | Valores | Fonte |
|---|---|---|
| Família | `deck`, `frame`, `machine`, `pc`, `handheld`, `unknown` | variante do SO, fabricante/produto, o handshake do host |
| Arquitetura | `x86_64`, `aarch64`, `unknown` | a sonda de plataforma do backend |
| Capacidades | bateria, tela externa, VR, controle — cada uma `sim`, `não` ou `desconhecido` | a família mais sinais ao vivo |

Desconhecido continua desconhecido: uma regra de visibilidade que pergunta por um sinal que o dispositivo não consegue responder nunca esconde uma prateleira.

## Compatibilidade por dispositivo

A Steam classifica cada jogo para o Deck e, separadamente, para o Steam Machine e o Steam Frame. O Deck Shelves lê as três:

- **Selos nos cards** mostram a classificação do dispositivo em uso — a do Frame num Frame, a do Machine num Machine, a do Deck em todo o resto.
- **Filtros** `Compatibilidade com Steam Frame` e `Compatibilidade com Steam Machine` funcionam exatamente como `Compatibilidade com o Deck` (verificado / jogável / não suportado / desconhecido).

## VR em três valores

O filtro `Suporte a VR` agora distingue **Somente VR**, **Suporta VR** e **Sem VR** (a partir das próprias categorias da loja Steam, com a etiqueta antiga de VR como reserva). Escolha os dois primeiros num headset, o último para uma prateleira de tela plana. Filtros salvos antes desta mudança continuam combinando com qualquer título VR.

## Pacotes de configuração por dispositivo

O grupo "Por dispositivo" do assistente de configuração tem pontos de partida para um Frame, um Machine e uma configuração para jogar em qualquer lugar — veja [shelf-templates.md](shelf-templates.md).

## Testando sem o hardware

- **Simulador do modo Desenvolvedor** (Configurações → Desenvolvedor): troque o tipo de dispositivo simulado em tempo de execução; regras de visibilidade, selos e filtros reagem na hora.
- **Flag de build de QA:** `DS_QA_FORCE_DEVICE=frame` (ou `machine`, `deck`, …) com um build de desenvolvimento finge o dispositivo desde o boot — `pnpm run qa:device-frame` / `pnpm run qa:device-machine` enviam esse build ao dispositivo de teste.
- **Relatório de hardware:** o bloco de hardware do relatório de bug (opcional) agora inclui a família, a arquitetura e as capacidades resolvidas, então um testador com hardware real de Frame ou Machine mostra o que foi detectado numa colagem só.

## ARM64 como alvo de primeira classe

O CI compila, empacota e testa o plugin num runner arm64 nativo ao lado do x86-64, audita que toda dependência do backend tem wheel aarch64 e varre o zip empacotado procurando binários nativos — qualquer binário só-x86 falha o build. O plugin distribui fontes Python e um bundle JavaScript, então o resultado esperado é "nenhum binário nativo".

Hardware real de Frame e Machine ainda não foi validado; o caminho do Frame continua experimental até lá.
