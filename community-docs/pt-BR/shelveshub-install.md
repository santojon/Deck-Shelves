# ShelvesHub: a nova forma recomendada de instalar o Deck Shelves

*[Read in English](../shelveshub-install.md)*

**Não precisa de Decky Loader.**

Até agora, a única forma de rodar o Deck Shelves era através do Decky
Loader — instalar o Decky primeiro, depois instalar o plugin da Decky
Store. Isso continua totalmente suportado e inalterado. Mas se você está
configurando um Deck novo (ou só não quer lidar com um carregador de
plugins), agora existe um caminho mais simples: **ShelvesHub**, um host
standalone construído especificamente para o Deck Shelves.

## O que o ShelvesHub realmente é

O ShelvesHub é um pequeno serviço em segundo plano. Ele observa o cliente
Steam, injeta o Deck Shelves diretamente, e dá a ele tudo que precisa para
rodar — sem carregador de plugins no meio. Na prática, isso significa:

- **Instalação em um clique**, sem precisar configurar o Decky antes.
- **Atualizações automáticas** — para si mesmo e para o Deck Shelves, cada
  um com seu próprio canal opcional de pré-lançamento.
- **Sua própria aba no Menu de Acesso Rápido**, com o editor de
  configurações completo.
- Funciona em **Steam Deck, Linux, macOS e Windows**.

Se você já tem o Decky Loader instalado, o ShelvesHub coexiste bem com ele
— instale os dois, e eles compartilham as mesmas configurações. Só uma aba
do Deck Shelves aparece por vez, então não fica duplicado.

## Como instalar

1. Pegue o instalador para sua plataforma na
   [página de releases do ShelvesHub](https://github.com/santojon/ShelvesHub/releases/latest).
2. Execute:
   - **Steam Deck / SteamOS**: dê duplo clique no arquivo `.desktop` no Modo
     Desktop e siga a instrução no terminal. Não precisa de sudo.
   - **Linux**: arquivo `.desktop` de um clique, ou um pacote + `install.sh`
     para uma instalação no sistema inteiro.
   - **macOS**: `Install ShelvesHub.app` — duplo clique, depois clique com o
     botão direito → Abrir na primeira execução para passar pelo Gatekeeper.
   - **Windows**: `shelveshub-setup.exe`, aceite o aviso do UAC.
3. Reinicie o Steam se pedido. O Deck Shelves aparece no seu Menu de Acesso
   Rápido automaticamente — sem etapa separada de instalação de plugin.

Detalhes completos e os passos exatos de cada plataforma: o
[README do ShelvesHub](https://github.com/santojon/ShelvesHub#installation).

## Desinstalando

Toda plataforma vem com um desinstalador de um clique correspondente junto
com o instalador (mesma página de download). Suas configurações do Deck
Shelves são mantidas a não ser que você passe explicitamente `--purge` no
script de desinstalação — então se você só está resolvendo um problema, uma
simples desinstalação/reinstalação não apaga suas prateleiras.

## Solução de problemas

- **Nada aparece depois de instalar.** Reinicie o Steam completamente (não
  só o jogo — o cliente de verdade). O ShelvesHub precisa capturar o Steam
  na inicialização para injetar.
- **Eu tenho o Decky Loader também e agora vejo duas abas, ou as
  configurações parecem fora de sincronia.** Isso não deveria acontecer —
  reporte um bug com a versão dos dois hosts. Como projetado, só uma aba
  deve aparecer e ambos devem ler/gravar o mesmo arquivo de configurações.
- **As atualizações não estão aparecendo.** Confira a própria seção de
  atualização na aba do ShelvesHub — ela tem canais de atualização
  independentes para si mesma e para o pacote do Deck Shelves, cada um com
  uma alternância opcional de pré-lançamento.
- Referência completa de solução de problemas (conflitos de porta, casos de
  coexistência, recuperação):
  [doc de solução de problemas do ShelvesHub](https://github.com/santojon/ShelvesHub/blob/main/docs/troubleshooting.md).

## Ainda quer o Decky Loader?

Nada muda para você — instale o Decky Loader, depois pegue o Deck Shelves na
Decky Store como sempre. O ShelvesHub é aditivo, não um substituto.
