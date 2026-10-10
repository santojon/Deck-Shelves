# Decky Loader ou ShelvesHub?

*[Read in English](../decky-or-shelveshub.md)*

O Deck Shelves roda em dois hosts. Os dois entregam o mesmo build do plugin e as mesmas
configurações; diferem em como o plugin chega ao dispositivo, como atualiza e o que mais
existe em volta. Escolha pela plataforma primeiro, depois pelo que você já tem.

| | Decky Loader | ShelvesHub (host standalone) |
|---|---|---|
| **Plataformas** | SteamOS / Steam Deck e distribuições Linux que trazem o Decky (Bazzite) | Steam Deck, Linux, macOS, Windows; ARM64 experimental |
| **Instalação** | Instale o Decky Loader e depois o plugin pela Decky Store (ou os caminhos zip / URL) | Instalador de um clique por plataforma; sem passo de loader |
| **Atualizações** | Atualizações da Decky Store; pré-release só pela flag de testes | Atualiza a si mesmo e o plugin, cada um com canal de pré-release opcional |
| **Backend** | O backend Python roda dentro do processo de plugin do loader | O host roda o mesmo backend Python como serviço próprio |
| **Aba de acesso rápido** | A aba de plugins do Decky | Aba própria com estilo nativo e o editor completo de configurações |
| **Outros plugins** | Funciona ao lado de todo plugin Decky, inclusive temas do CSS Loader | Sem loader de plugins no dispositivo — temas do CSS Loader precisam do Decky presente |
| **Os dois juntos** | Suportado: a primeira cópia a montar é dona da home, a outra se afasta | Igual; as configurações são espelhadas entre as duas instalações |
| **Configurações e perfis** | Guardadas no diretório de configurações do loader | Guardadas no diretório de dados do host; espelhadas para o do loader quando os dois existem |
| **Remover** | Desinstalar pela Decky Store | Desinstalador / remover o serviço de usuário |
| **Melhor quando** | Você já roda o Decky e outros plugins, ou quer temas do CSS Loader | Dispositivo novo, sem Decky, plataforma fora do SteamOS, ou quer atualizações automáticas do plugin |

Guias de instalação: o [README](README.md#instalação) cobre os dois caminhos; o texto da comunidade
sobre o host standalone está em [community-docs/pt-BR/shelveshub-install.md](../../community-docs/pt-BR/shelveshub-install.md).
Quais configurações foram exercitadas na release atual: [validation-matrix.md](validation-matrix.md).
