# Notas de Lançamento

*[Read in English](../../RELEASE_NOTES.md)*

Destaques voltados ao usuário de cada versão do Deck Shelves. Para o changelog
técnico completo, veja [CHANGELOG.md](CHANGELOG.md).

## [Unreleased]

- **Nova configuração para ocultar as opções de prateleira do menu de botão direito de cada jogo.** Se você só quer as ações rápidas por card ali, agora dá para desativar o grupo mais completo de Ordenar/Gerenciamento/Exibição/Visual/Decoração/Combinar com — vem ativado por padrão, então nada muda a menos que você desative.

## [3.3.1] - 2026-09-24

- **Um perfil ativado automaticamente (por um trigger como conectar na doca ou carregar) podia reverter as configurações de uma Prateleira Inteligente mesmo quando você havia escolhido não vincular prateleiras a esse perfil.** Corrigido — perfis trocados automaticamente agora deixam suas prateleiras exatamente como estão, igual a quando você troca manualmente.
- **Sombras dos cards e melhorias de compatibilidade com temas.** A sombra projetada sob cada card agora acompanha exatamente a arte em vez de se estender além dela. Corrigidos alguns problemas visuais relacionados que apareciam com certos temas do CSS Loader (Switch Like Home / Switch-like Banners): os cards agora combinam corretamente com o visual nativo redimensionado do tema, e "Usar prateleira como Recents" não renderiza mais invisível fora da tela nem deixa o título da linha preso no texto padrão sob o tema SLH.
- **Nova forma recomendada de instalação: ShelvesHub.** Um host independente, sem necessidade do Decky Loader — instaladores de um clique para Steam Deck, Linux, macOS e Windows, com atualizações automáticas para si mesmo e para o Deck Shelves. As opções de Decky Store, zip manual e instalação por URL continuam todas disponíveis e inalteradas; o ShelvesHub é simplesmente o caminho mais fácil para quem está começando do zero.
- **Melhorias no protetor de tela.** Agora ele mostra uma mistura justa de todas as prateleiras em vez de principalmente a primeira, retoma de onde parou em vez de reiniciar toda vez, e pode opcionalmente mostrar a descrição do jogo ao lado do logo (acima ou abaixo, com um espaçamento ajustável). Uma nova configuração também permite controlar quantos jogos ele puxa de cada prateleira por vez. Corrigido um bug em que, com 2 ou mais prateleiras ativadas, nenhuma delas conseguia mostrar seu número total configurado de jogos. Ele também pode agora incluir opcionalmente as capturas de tela oficiais online de cada jogo, não só as que você mesmo capturou (requer que os recursos Online estejam ativados).
- **Ícones de compatibilidade que se adaptam ao seu dispositivo.** Em um Steam Deck / SteamOS, os cards continuam mostrando a classificação de compatibilidade do Steam Deck; no macOS, Windows e Linux desktop eles agora mostram ícones de suporte a controle (total ou parcial) — a mesma coisa que o Steam nativo mostra ali — em vez de uma classificação do Deck que não se aplica. É a mesma alternância "ícones de compatibilidade" que você já tem, por prateleira ou globalmente.
- **A sincronização de configurações entre dispositivos ficou muito mais confiável.** Se você usa a sincronização opcional entre dispositivos, dois dispositivos agora mesclam suas mudanças prateleira por prateleira em vez de um sobrescrever o outro, e um bug que podia fazer prateleiras sincronizadas desaparecerem (ou o plugin inteiro ser lido como desligado) foi corrigido. Se a mesma prateleira foi criada separadamente em cada dispositivo, elas aparecerão como duas — apague a extra uma vez e ela some para sempre.
- **Seu perfil ativo agora permanece no dispositivo ao qual pertence.** Com a sincronização entre dispositivos ativada, um perfil que troca automaticamente naquela máquina — um perfil *Modo Vitrine* quando você conecta na doca, por exemplo — não segue mais a sincronização para seus outros dispositivos nem os troca para esse perfil também. Cada dispositivo mantém seu próprio perfil atual (seja por ter trocado via trigger ou por você ter escolhido manualmente), enquanto suas configurações subjacentes e a lista de perfis continuam sincronizando como antes.
- **As informações do sistema e os relatórios de bug agora mostram também seu cartão SD e drives USB/externos, não só o armazenamento interno.** Cada drive externo detectado ganha sua própria leitura de espaço livre/total.
- **Novo filtro: local da biblioteca Steam.** Monte uma prateleira com jogos instalados no armazenamento interno, em um drive externo (cartão SD / USB / SSD externo) ou em uma biblioteca de rede. Combina com uma nova condição de Regras de Visibilidade / troca automática — por exemplo, fixar automaticamente uma prateleira ou trocar de perfil no momento em que seu cartão SD é conectado.
- **Nova ação de prateleira: Compor com.** Abra o menu "…" de uma prateleira — ou clique com o botão direito em qualquer jogo e abra o submenu "Prateleira" dele — e escolha "Compor com" para mesclar direto nela os jogos de outra prateleira — as duas viram uma só, e a prateleira de origem é removida. Um backup é salvo automaticamente antes.
- **O site agora também mostra as notas de versão e a lista completa de recursos em português**, alternando ao vivo com o seletor de idioma já existente — voltando automaticamente para o inglês em qualquer trecho ainda não traduzido. O README, o changelog e todas as páginas de guias também já têm uma versão em português, com link a partir de cada página em inglês.
- **Corrigido um flash visual rápido ao pressionar para baixo depois da última prateleira.** Podia mostrar por um instante um pedaço da arte de fundo da primeira prateleira antes de voltar de repente — esse flash e esse salto não acontecem mais.

## [3.3.0] - 2026-09-16

### Added

- **Todo atalho de gamepad agora também pode ser vinculado a uma tecla do teclado.** Na tela de atalhos, cada ação (ocultar/destacar/lançar rapidamente um card, Busca Rápida, Navegação Lateral, abrir/fechar o sidecar) tem um segundo slot de captura para uma tecla do teclado — vincule uma e tanto a combinação do gamepad quanto a tecla disparam a mesma ação. Suporta combinações com modificadores como Ctrl+F, e nunca dispara enquanto você está digitando em um campo de texto.
- **Nova alternância opcional: sincronize suas configurações entre dispositivos na mesma conta Steam.** Usa o armazenamento em nuvem da sua própria conta (não o Steam Cloud, sem cadastro, sem custo extra) para manter prateleiras, filtros, perfis e todas as outras preferências sincronizadas entre seus Decks/PCs, com uma linha de status mostrando a última sincronização. Desativado por padrão, ainda experimental — se dois dispositivos alterarem configurações offline, a mudança mais recente prevalece.
- **Nova alternância opcional: o próprio protetor de tela ocioso do Deck Shelves.** Em vez do protetor de tela nativo do Steam, mostra um slideshow com tudo que sua tela inicial exibe — Recents e jogos das prateleiras — misturando opcionalmente suas capturas de tela locais (mostradas com o logo do jogo também, quando há um para mostrar) — com seu próprio atraso inicial, tempo por imagem e uma sobreposição opcional do logo do jogo que você pode redimensionar e reposicionar em qualquer canto. Ainda experimental. Desativado por padrão.

- **Cinco novos filtros: Nota de avaliação, Data de lançamento, Em breve, Demo e Compatibilidade com o SteamOS.** Filtre uma prateleira por um limiar de nota do Metacritic ou de avaliações Steam, por data de lançamento (antes/depois de um dia escolhido), somente para títulos ainda não lançados, somente demos, ou pela classificação verified/playable/unsupported do SteamOS (separada da classificação do Steam Deck). Os filtros de nota/data usam os mesmos dados online das opções de ordenação online, então os Recursos Online precisam estar ativados para esses.
- **Importar uma prateleira do TabMaster agora traz seus filtros corretamente.** Tabs que usavam filtros de regex, tags, tempo de jogo, tamanho, nota de avaliação, data de lançamento, "em breve", demo, transmissível, cartão SD ou compatibilidade com o SteamOS antes eram importadas como um filtro de nome sem relação; agora elas convertem para o filtro correspondente do Deck Shelves.
- **Duas novas opções de ordenação: "Jogos que possuo" e "Jogos compartilhados em família".** Úteis para prateleiras que misturam sua biblioteca com uma wishlist ou fonte da loja — ordene pelo que já é seu, ou pelo que é compartilhado via Family Sharing.
- **Filtros como gênero, categoria, franquia, suporte a VR e tipo de multiplayer agora realmente funcionam em cards de wishlist/loja que você ainda não possui**, não só na sua própria biblioteca. Monte uma prateleira que mistura sua biblioteca com a loja, filtre ambos os lados por jogos multiplayer, e agora o filtro funciona corretamente nos dois — o plugin busca e armazena em cache os dados da Store necessários automaticamente na primeira vez que você usa um desses filtros (os recursos Online precisam estar ativados).
- **Gênero, categoria e franquia agora mostram o mesmo selo online dos outros filtros exclusivamente online, e só aparecem quando os Recursos Online estão ativados** — agora eles precisam disso, onde quer que sejam usados, já que nunca tiveram dados locais utilizáveis como alternativa.
- **Os números de uso do projeto agora são públicos.** O README e o [site](https://santojon.github.io/Deck-Shelves/) mostram instalações via Decky Store, tráfego do GitHub e downloads via npm, atualizados semanalmente — sem conta ou análise externa envolvida. Números maiores agora aparecem de forma compacta (`16.7k` em vez de `16.692`).
- **Nova alternância opcional: sua própria aba do Deck Shelves diretamente no Quick Access Menu, ao lado de Notifications e Settings** — sem precisar mais abrir a lista de plugins do Decky primeiro. Desativada por padrão; ative em Experimental e reinicie o Steam (desativá-la também pede um reinício — a aba só some completamente depois de um). Ainda experimental — deixe desligada a menos que você esteja confortável testando algo novo.
- **Nova alternância opcional: Modo Vitrine.** Quando você deixa a Home ociosa, o Deck Shelves percorre lentamente suas prateleiras como um protetor de tela, passando pelos jogos de cada prateleira antes de seguir para a próxima — qualquer botão, toque ou rolagem interrompe imediatamente. Atraso e tempo por prateleira configuráveis. Desativado por padrão.
- **Novo no site: páginas de guia dedicadas para TabMaster, UnifiDeck e CSS Loader**, cada uma com um passo a passo de como a integração funciona — linkadas diretamente nos cards "Funciona com sua configuração".
- **A seção "Additional Features" do QAM e do sidecar estava ficando lotada, então agora são quatro seções menores**: Additional Features, Navigation & Search, Online Features e Experimental. Nada nas suas configurações mudou — só a forma como elas estão agrupadas.

### Fixed

- **No cliente Beta do Steam, o selo "New"/desconto de um card selecionado desaparecia enquanto ele estava com foco na Home.** O selo que flutua acima do anel de foco não acompanhava o foco do controle no Beta; agora acompanha, então o selo permanece visível.
- **No cliente Beta do Steam, o menu de contexto de um jogo estava sem as linhas do Deck Shelves ("Adicionar à prateleira", "Destacar", "Ocultar") ao rodar sob o host independente.** Elas voltaram.
- **O filtro de compatibilidade de sistema no macOS agora oculta corretamente jogos que não estão disponíveis para sua plataforma — e não deixa mais as páginas da loja do Steam em branco.**
- **O selo "New" ou de desconto de um card podia sumir para sempre no momento em que você o selecionava dentro da pré-visualização do editor de prateleira ou da lista de reordenação manual.** Ele deve ocultar-se ali em favor de uma versão flutuante desenhada acima do anel de foco — mas isso só existe na tela Home de verdade, o único lugar onde esse selo flutuante existe. Corrigido para que o selo permaneça sempre visível em qualquer outro lugar.
- **Ao reiniciar o Steam, o foco podia cair em uma prateleira online (wishlist/loja) em vez da sua primeira prateleira de verdade**, rolando brevemente até lá antes mesmo de você navegar para qualquer lugar. Prateleiras locais podem levar um pouco mais para carregar logo após um reinício, e uma prateleira online podia vencer essa corrida simplesmente por carregar mais rápido — não por ser realmente a primeira na sua ordem de prateleiras. Corrigido.
- **Se o painel de configurações travasse, sua tela de erro mostrava um título em português independentemente do seu idioma.** Corrigido.
- **Um perfil ativado por um trigger de tela, controle ou carregamento podia ficar preso ativo depois que o Deck dormia e acordava em um estado diferente.** O trigger agora verifica tela, controle e bateria novamente assim que o Deck acorda, em vez de esperar a próxima mudança real para perceber.
- **O filtro de multiplayer nunca correspondia a um jogo já na sua biblioteca — só a jogos da loja que você não possui.** Ele lia dados que seu cliente Steam simplesmente não fornece dessa forma para jogos que você possui; agora ele lê a coisa certa, então o filtro de multiplayer finalmente funciona também na sua própria biblioteca.
- **Os filtros de gênero, categoria e franquia nunca correspondiam a nada, para nenhum jogo, em lugar nenhum.** Agora funcionam também na sua biblioteca — na primeira vez que você usa um deles em uma biblioteca grande, pode levar algumas atualizações até capturar todos os jogos enquanto os dados necessários são buscados e armazenados em cache, mas ele chega lá.
- **"Amigos jogando agora", "mais amigos possuem" e "em alta entre amigos" agora aparecem como opções de ordenação em qualquer prateleira, não só nas de wishlist/loja.** Eles só precisavam da sua lista de amigos do Steam, a mesma coisa que a sobreposição "amigos jogando" da própria tela inicial já usa — nada de exclusivamente online nelas. Os filtros correspondentes de atividade de amigos também deixaram de ficar ocultos fora de prateleiras online.
- **Traduções revisadas em todos os 17 idiomas além do inglês**, incluindo um par de seções — o tour de recursos no próprio plugin e o guia de recursos online da página Sobre — que nunca haviam sido traduzidas em algumas delas.
- **Se suas prateleiras parecerem apagadas depois de uma redefinição ou restauração de configurações, a tela de primeira execução agora se oferece para trazê-las de volta.** Antes ela só se oferecia para criar novas prateleiras padrão; agora, se o plugin consegue identificar que isso não é realmente uma instalação nova, ela também mostra seus snapshots salvos para restaurar.
- **Ordenar uma prateleira por mais de um critério (por exemplo, "jogos que possuo" como critério de desempate) podia ignorar silenciosamente algumas das opções de ordenação mais novas e cair de volta para alfabética.** Uma prateleira misturando sua biblioteca com sugestões da loja, ordenada para priorizar seus próprios jogos, podia acabar mostrando só itens da loja. Corrigido — agora toda opção de ordenação funciona corretamente como parte de uma cadeia com múltiplos critérios, não só sozinha.
- **A pré-visualização ao vivo no editor de prateleira podia mostrar uma ordem diferente da que realmente aparece na sua tela inicial**, para uma prateleira que combina uma fonte de filtro com outra fonte (como uma mistura de biblioteca + loja). A pré-visualização agora combina exatamente com a Home.
- **Uma prateleira que combina sua biblioteca com outra fonte (como a loja) podia deixar de fora um jogo que genuinamente merecia estar ali**, cortado antes mesmo de ter uma comparação justa contra os jogos da outra fonte. Corrigido — agora todo jogo elegível recebe uma chance real de entrar na lista final.
- **A arte de fundo de uma prateleira podia ficar presa mostrando um jogo que não está mais de fato naquela prateleira** (oculto, filtrado, ou apenas corrigido após o boot), às vezes por um tempo até que outra coisa acontecesse para corrigir isso. Agora ela se corrige na hora em vez de esperar.
- **Pressionar Cima ou Baixo logo depois que um jogo fechava podia ser ignorado e voltar ao card anterior cerca de um segundo e meio depois.** Corrigido.
- **O perfil embutido "Default" e o rótulo "(cópia)" em perfis duplicados ou importados sempre apareciam em português, não importa o idioma da sua interface.** Corrigido — agora aparecem no seu próprio idioma, nos 19 locais suportados.
- **Os selos "New" e de desconto podiam mostrar texto ilegível branco sobre branco com o tema Colored Toggles do CSS Loader (opção de cor White).** Corrigido.
- **Navegar rapidamente por uma prateleira e depois se mover para cima ou para baixo logo em seguida podia fazer você voltar para a linha que acabou de deixar.** Corrigido.
- **Rolar por uma prateleira tinha um atraso perceptível em comparação com as linhas nativas do Steam.** Os cards agora adiam a busca de descrições e o pré-carregamento de imagens até estarem realmente próximos da área visível, em vez de todo card na linha fazer esse trabalho de uma vez — a rolagem deve parecer visivelmente mais rápida, especialmente em prateleiras longas.
- **No Steam Client Beta atual, os filtros de compatibilidade SteamOS e Deck pararam de funcionar, lendo todo jogo como "Desconhecido".** Corrigido — ambos os filtros voltam a ler corretamente no beta, sem mudanças no cliente estável.
- **No Steam Client Beta atual, prateleiras na Home podiam renderizar completamente vazias.** Corrigido.
- **No Steam Client Beta atual, as prateleiras podiam renderizar mas não serem alcançáveis pelo gamepad — e uma vez que isso foi corrigido, os cards não tinham destaque visível, não centralizavam na tela, rolavam de forma irregular, e a hero art nunca atualizava.** Tudo corrigido — as prateleiras agora são totalmente navegáveis pelo gamepad, com destaque de foco, centralização, rolagem suave e hero art funcionando novamente, tanto no cliente estável quanto neste beta.
- **No Steam Client Beta atual, o Modo Vitrine podia rodar ao mesmo tempo que o novo protetor de tela do próprio beta.** O Modo Vitrine agora se afasta automaticamente sempre que o protetor de tela nativo assume, e retoma por conta própria assim que fica genuinamente ocioso de novo.

## [3.2.1] - 2026-08-15

### Fixed

- **O tour de primeira execução podia ficar preso reabrindo toda vez que você o fechava, sem forma de alcançar a alternância que liga o plugin.** Um bug no backend descartava a flag salva de "tour visto" sempre que você ainda não tinha ativado o plugin ou adicionado uma prateleira — exatamente o estado logo após ver o tour pela primeira vez. Corrigido.
- **O botão "Reportar um problema" na página Sobre podia simplesmente não fazer nada.** Agora ele funciona de forma confiável, e pergunta que tipo de relatório você está enviando — **bug**, **melhoria** ou **pedido de recurso** — antes de abrir o formulário correspondente do GitHub já preenchido com seus dados.
- **A página Sobre agora começa com "Apoie o desenvolvedor"**, com os links da comunidade logo abaixo.

## [3.2.0] - 2026-08-14

### Added

- **Uma caixa de ferramentas bem maior para montar prateleiras.** Dezenas de filtros, ordenações e fontes prontas que o plugin já entendia nunca haviam sido oferecidas em nenhum lugar da interface — agora todas estão. Filtre por gênero, categoria, franquia, suporte a VR, tipo de multiplayer, compartilhamento familiar, posse de DLC ou trilha sonora; por como você realmente joga (número de lançamentos, duração média de sessão, progresso de conquistas, nunca terminado, instalado mas nunca tocado, jogado uma vez, recém-abandonado); por onde um jogo está instalado e quanto espaço ocupa; ou por qual launcher um atalho não-Steam pertence (EmuDeck, RetroDECK, Heroic, Lutris, Chiaki, Moonlight). **Todo filtro pode ser invertido**, então qualquer um deles também funciona como "tudo, exceto isso".
- **Novas formas de ordenar** — mais ou menos lançados, sessões mais longas ou mais curtas, mais perto de completar, conquistas mais raras, instalados mais recentes ou mais antigos, não jogados há mais tempo, instalação maior ou menor, armazenamento interno ou cartão SD primeiro, e o que seus amigos estão jogando ou possuem. Cada uma inverte a direção com a seta já existente.
- **Fontes de prateleira prontas.** Uma nova opção de **Fonte embutida** no editor de prateleira preenche uma prateleira com suas coleções dinâmicas, jogos seguidos ou ignorados, DLC, trilhas sonoras, jogos fixados, histórico de jogo, jogos atualizados recentemente, jogos com eventos ou atualizações de workshop, títulos com suporte total a controle, ou a biblioteca de um launcher específico — sem precisar configurar filtros.
- **Combine condições de formas mais poderosas.** "Pelo menos N destas condições", "qualquer uma destas" e "nenhuma destas" agora funcionam com **qualquer** filtro que você escolher, então dá para expressar coisas como "instalado, e pelo menos duas de: Deck Verified, nunca terminado, abaixo de 20 GB".
- **Leia as notas de lançamento da versão que você está usando**, direto pela página Sobre.
- **Um ícone novo e mais claro.** O ícone do plugin no menu do Decky agora é uma marca mais simples de "prateleira de livros", mais fácil de identificar, e uma versão colorida correspondente aparece nas notificações e na aba do navegador.

### Changed

- **As notificações de atualização agora baixam a atualização para você.** Tocar no banner de atualização, no ícone do cabeçalho ou na notificação salva o pacote da versão na sua pasta de Downloads em vez de só abrir uma página web — você mesmo instala a partir daí, como antes. Nada instala ou atualiza automaticamente.

### Fixed

- **O diagrama de arquitetura na documentação mostrava marcação bruta** em vez do diagrama.
- **A documentação se atualizou em relação ao plugin** — as referências de filtro, prateleira inteligente e template estavam sem entradas que já haviam sido lançadas, e uma nova verificação automatizada evita que elas fiquem defasadas de novo.
- **O título da próxima prateleira podia acabar sobrepondo a linha do Recents** quando "Usar prateleira como Recents" estava ativado.
- **As prateleiras podiam continuar ausentes da tela inicial** depois de voltar de um jogo ou da página de detalhes de um jogo, até que você mudasse alguma configuração por acaso.
- **Os botões na seção de ordenação do editor de prateleira podiam ficar cortados na borda do painel**, mais perceptível em telas ultrawide — o dropdown agora encolhe para abrir espaço.
- **O anel de destaque ao redor do primeiro card na pré-visualização do editor de prateleira podia parecer cortado.**
- **"Usar prateleira como Recents" podia levar um tempo para se atualizar** depois de uma mudança, às vezes exigindo uma ida e volta da tela inicial.
- **O menu do card podia mostrar as opções erradas (faltando "Atualizar", por exemplo)** quando "Ocultar Recents nativo" estava ativado.
- **Trocar de perfil podia trazer de volta inesperadamente o tour de recursos de primeira execução** — mesmo entre dois perfis que já haviam completado o tour. Uma vez visto, ele fica marcado como visto.
- **As alternâncias de notificação por área agora só aparecem quando podem de fato fazer alguma diferença** — enquanto a alternância mestre "desativar notificações" está ligada.
- **Ativar o plugin sem prateleiras configuradas, ou abrir os detalhes de um jogo, podia deixar a Home nativa incapaz de rolar até o card destacado**, e desativar prateleiras enquanto o foco estava em uma deixava você navegando às cegas. Ambos corrigidos.
- **O controle deslizante de tamanho do texto da descrição, uma opção de posição do título da prateleira e o escurecimento do fundo para legibilidade** já estão no editor de prateleira para quem pediu textos mais fáceis de ler.

## [3.1.0] - 2026-07-20

### Added

- **Condições para seus periféricos.** Mostre uma prateleira — ou troque de perfil — quando um controle está conectado, quando fones de ouvido estão plugados, ou quando um dispositivo Bluetooth específico está conectado, além do inverso de cada uma.
- **Funciona em todos os seus dispositivos.** As condições de bateria, CPU, memória e tela externa agora também funcionam no Windows e no macOS, não só no Steam Deck.
- **As informações do sistema agora mostram seu sistema operacional real** — SteamOS, sua distribuição Linux, Windows ou macOS, com versão e arquitetura — para que o relatório de bug de um toque seja preciso onde quer que você rode o plugin.
- **Os recursos Online autenticam em todo sistema desktop** — Linux, macOS e Windows — em vez de só Linux; se algo não puder ser lido, eles voltam para os dados públicos.
- **Relate um problema em um toque.** O botão de relatório da página Sobre agora preenche um relatório de bug para você — incluindo os detalhes do seu dispositivo e logs recentes — para que reportar um problema leve segundos.
- **Visibilidade de prateleira mais inteligente.** Uma prateleira agora pode aparecer somente quando as condições que você escolher forem verdadeiras — horário do dia, dia da semana, e agora o estado do seu dispositivo: bateria baixa, carregando, offline, na doca / em uma tela externa, ou uma resolução de tela específica ou tela ultrawide. Combine várias com "corresponder a qualquer" ou "corresponder a todas", ou comece a partir de um preset de Noites / Fins de semana.
- **Ainda mais condições de visibilidade.** Fim de semana vs. dia de semana, parte do dia (manhã / tarde / noite / madrugada), estação do ano e seus próprios intervalos de datas de feriado; se o último jogo que você jogou foi Steam ou não-Steam, ou se um jogo está rodando no momento; e — lidos somente quando uma prateleira realmente precisa — CPU alta ou memória baixa.
- **Perfis que trocam sozinhos.** Dê a um perfil salvo um trigger (as mesmas condições acima) e ative a troca automática: o Deck Shelves aplica esse perfil sozinho quando o trigger corresponde — um perfil "Na doca" quando você conecta, um perfil "Economia de bateria" quando a bateria fica baixa. A alternância de troca automática fica no painel do Quick Access, no sidecar e em Settings → Profiles, e cada perfil define seus próprios triggers.
- **Cinco novos filtros:** mantenha só jogos que rodam na sua plataforma atual, filtre por Remote Play (instalado aqui, em outro dispositivo, só remoto, ou ambos), por uma faixa de preço na sua própria moeda, pelo que você **jogou nas últimas duas semanas**, ou por jogos que você **negligenciou** (jogou antes, mas não recentemente).
- **Prateleiras que sobem ao topo quando você precisa delas.** Dê a uma prateleira uma condição de fixação automática — as mesmas condições das regras de visibilidade — e ela flutua para o topo da sua Home enquanto a condição for verdadeira (uma prateleira "Na doca" quando você conecta, uma prateleira "Economia de bateria" quando a bateria fica baixa), e volta ao normal quando a condição deixa de valer.
- **Prateleiras que se recolhem sozinhas.** Ative o Auto-collapse e dê a uma prateleira condições (ou "recolher quando vazia") — ela se dobra até mostrar só o título nesse contexto e se expande de novo quando a condição deixa de valer.
- **Veja quando um perfil troca sozinho.** Quando um trigger de troca automática aplica um perfil, uma notificação rápida avisa qual foi. Prefere silêncio? Uma nova alternância **Desativar notificações** desliga só as notificações próprias do Deck Shelves.
- **Recupere-se de uma falha em um toque.** Se a tela de configurações falhar ao carregar e você tiver snapshots salvos, agora ela oferece **Restaurar um snapshot** para você voltar a uma configuração funcional.
- **A versão do plugin agora aparece em toda página de configurações e no painel do Quick Access**, para que seja sempre fácil de encontrar ao reportar um bug.
- **As informações do sistema agora mostram seus temas reais do CSS Loader** — os nomes reais dos temas ativos e quantos estão instalados.
- **Um tour rápido de recursos.** Na primeira vez que você abre o Deck Shelves, ele te guia pelos principais recursos — prateleiras, prateleiras inteligentes, filtros, personalização, busca, navegação lateral, perfis e triggers, recursos online e ferramentas avançadas. Pule a qualquer momento, e reproduza de novo quando quiser pelo botão **Reproduzir tour de recursos** na página Sobre.
- **Links de Discord e Reddit** na página Sobre, ao lado dos botões de GitHub e de reportar problema.

### Changed

- **Perfis: vincule suas prateleiras só se você quiser.** Ao salvar um perfil, agora você pode escolher se ele carrega suas prateleiras. Perfis vinculados trocam as prateleiras mostradas na Home; perfis não vinculados mudam tudo o mais, mas deixam suas prateleiras como estão.
- **O perfil "Default" é mais gentil.** Ele restaura as configurações padrão, mas mantém o plugin ligado e, a menos que você marque **Também redefinir prateleiras**, deixa suas prateleiras no lugar.
- As regras de fixação automática e recolhimento automático agora estão disponíveis em toda prateleira, e as alternâncias globais **Auto-collapse** e **Desativar notificações** ficam em **Behaviour**.
- **Os preços da loja e os jogos em destaque agora usam a loja Steam do seu país** em vez de sempre a dos EUA.
- **Os perfis com troca automática agora voltam ao estado anterior.** Quando um trigger deixa de corresponder, o perfil volta para o que você tinha antes dele disparar — é uma substituição temporária, não uma mudança de mão única. Você também pode usar qualquer condição invertida agora ("parou de carregar", "ficou online", "sem tela externa"), o perfil Default também pode ter seu próprio trigger, e a notificação só aparece quando o perfil realmente mudou.
- **O editor de condições está mais organizado** — as condições são agrupadas em seções recolhíveis por tipo (data & hora, sessão, energia, conectividade, tela, desempenho), cada uma com seu próprio ícone.
- **Toda confirmação pode ser confirmada com o botão Menu**, e todas as notificações do Deck Shelves agora compartilham o mesmo visual com identidade própria.

### Fixed

- **O sidecar do Quick Access se comporta corretamente.** Ele não se recolhe mais sozinho um instante depois de você abri-lo, volta **fechado** depois que você abre o menu do Steam e retorna, e apertar **B** agora o fecha (permanecendo na aba do Deck Shelves, como o D-pad esquerdo) em vez de pular de volta para a lista de plugins.
- **Suas configurações estão mais seguras.** Um único valor inválido não pode mais redefinir tudo para o padrão — o plugin mantém o que consegue ler e deixa o restante da sua configuração intacto.
- **A primeira prateleira não fica mais grudada no topo absoluto da tela quando você oculta o recents nativo.** Agora ela mantém o mesmo espaçamento superior que a linha nativa de recents tinha, em vez de colar o título na borda superior.
- **O filtro de faixa de preço agora funciona para os jogos da loja que você não possui.** Uma prateleira de preço de loja ou wishlist deve mostrar jogos que você pode comprar — mas antes ela listava **todo** jogo não possuído independentemente do preço, incluindo os free-to-play. Jogos que você não possui agora só aparecem quando o preço real deles cai na faixa escolhida, então a prateleira permanece uma lista de compra de verdade e títulos gratuitos não aparecem mais em uma faixa paga.
- **Corrigido um travamento recorrente na Home.** A cada ~30 segundos, a interface podia congelar por alguns segundos — às vezes engolindo o toque de um botão, então a navegação parecia presa em uma prateleira. O Deck Shelves agora reaproveita os dados de preço já analisados em vez de reler tudo para cada jogo, então a Home permanece fluida.
- **Os triggers de troca automática de perfil agora funcionam na Home**, não só enquanto o painel de configurações está aberto.
- **A confirmação de "aplicar / excluir perfil" agora funciona com o controle**, então você não pode disparar isso sem querer.

## [3.0.2] - 2026-07-10

### Added

- **Snapshots — backups automáticos das suas configurações.** O Deck Shelves mantém um histórico contínuo (um por dia, além dos que você salvar manualmente). Restaure, exporte ou apague pela Settings → Advanced, e desfaça uma restauração se mudar de ideia.
- **Novas ferramentas para usuários avançados (Settings → Advanced).** Limpe caches, leia um resumo copiável de **Informações do sistema**, e ative o **Modo desenvolvedor** para uma sobreposição de depuração na Home e o log do plugin.
- **Tamanho de texto da descrição ajustável.** Um controle deslizante escala o texto de descrição da prateleira de 100% a 200%, globalmente ou por prateleira.
- **Mais gráficos na aba Estatísticas.**

### Changed

- **Ícones consistentes** entre as páginas de configurações e o painel do Quick Access.

### Fixed

- **Prateleiras de hero em página inteira não oscilam mais alguns pixels para cima e para baixo enquanto você se move entre jogos.**
- **As notificações de atualização voltam a aparecer** — e os recursos de wishlist online / preço voltam a funcionar — depois de corrigir uma verificação de conectividade que estava falhando erroneamente.
- **O teclado na tela agora fecha depois que você escolhe um jogo na Busca Rápida.**
- **Selos de card e avatares de "amigos jogando" não cobrem mais o teclado de busca** nem o painel de Navegação Lateral.

## [3.0.1] - 2026-07-05

### Added

- **Rode o Deck Shelves na máquina em que você está desenvolvendo.** Se seu Deck / PC Linux / PC Windows já tem o Decky Loader, `pnpm run deploy:local` compila e instala o plugin direto nele — sem SSH, sem uma segunda máquina. Ele nunca instala o Decky para você; aponte `DECKY_PLUGINS_DIR` para sua instalação se ela estiver em um local não padrão.
- **Outros plugins agora podem oferecer seus próprios formatos de exportação / importação.** Quando um plugin complementar adiciona um, ele aparece em Settings → Backup, para que você possa mover suas prateleiras, prateleiras inteligentes e filtros salvos entre ferramentas sem perder nada.

### Changed

- **O tile "Ver mais" agora é mais inteligente.** Ele só aparece quando sua prateleira realmente tem mais jogos do que cabem — então uma prateleira que já mostra tudo não termina mais com um "Ver mais" inútil. Você ainda pode ocultá-lo manualmente sempre que quiser.

## [3.0.0] - 2026-06-30

### Added

- **Estatísticas e Sugestões agora são duas abas separadas, com gráficos de verdade.** Sugestões vivem na própria aba (agrupadas em "Criação" e "Limpeza"). A aba Estatísticas ganha cards de tendência (esta semana vs. a passada, com uma seta para cima/baixo), um gráfico de atividade diária com linhas de tendência, gráficos empilhados e cumulativos, e gráficos de pizza para a distribuição dos seus cards e prateleiras. Um botão `#`/`%` alterna todo gráfico entre contagens exatas e porcentagens, e sua escolha fica salva. Todo gráfico é navegável pelo gamepad.
- **Veja do que suas prateleiras são feitas.** Novas distribuições mostram seus cards por tipo (jogos, não-Steam, **loja, wishlist** — contados mesmo quando vivem dentro de uma prateleira de múltiplas fontes e você nunca os abriu), por estado (normal, destacado, decorativo, oculto), e suas prateleiras por tipo (normal vs. smart) e por fonte (coleção, filtro, loja, wishlist, composta, …) — onde uma prateleira composta também conta cada uma de suas partes. A seção Uso agora lista tudo, sem limite.
- **Remapeie os atalhos de abrir/fechar o sidecar.** "Abrir Sidecar" (padrão dpad-direita ×2) e "Fechar Sidecar" (padrão dpad-esquerda) agora estão na aba Shortcuts e podem ser remapeados para qualquer combinação. A aba Shortcuts foi dividida em "Ações do card" e "Navegação", cada uma com seu próprio botão de redefinir, e todo atalho agora mostra seu padrão na tela mesmo que você nunca o tenha mudado.
- **Alternância "Mostrar todos os logs" (Advanced → Logs).** Ative para encaminhar todo log — incluindo os exclusivos de desenvolvedor — para a lista de logs no próprio dispositivo, para que você possa inspecionar o que o plugin está fazendo sem um console de PC. Desativado por padrão.

- **Nova aba Estatísticas em Settings.** Veja sua biblioteca de relance — jogos totais/Steam/não-Steam/instalados/favoritos, totais e médias de tempo de jogo, distribuição de compatibilidade com o Steam Deck — além de métricas de prateleira: quantas prateleiras você tem por tipo (filtro, tab, coleção, wishlist, loja, composta, smart), quantos cards são decorativos e médias acompanhadas ao longo do tempo. A página é totalmente navegável pelo gamepad e traduzida em todos os 19 idiomas. Até cinco sugestões contextuais (por exemplo, "você tem N jogos nunca jogados") aparecem como cards que você pode selecionar para adicionar uma prateleira correspondente com um único toque. Outros plugins podem adicionar suas próprias áreas de estatísticas a essa página.
- **Dois novos templates de prateleira: "Nunca Jogado" e "Compatível com o Deck".** Monte rapidamente uma prateleira de backlog com jogos que você possui mas nunca abriu, ou uma prateleira com tudo classificado como Deck Playable.

- **A página de Integrações mostra todo tipo de provedor.** O card Settings → Integrations agora lista provedores de menu lateral, provedores de contexto, widgets, renderizadores de prateleira, provedores de metadados, provedores de estatísticas e provedores de recomendação, além das já existentes fontes de prateleira / smart sources / filtros / ordenações / importadores / provedores de busca — cada um com seu próprio cabeçalho de grupo. As traduções chegam nos 19 idiomas.
- **Sobre → Como usar: parágrafo de encerramento.** Adicionado um passo final focável depois da dica e nota existentes, para que a página termine em texto simples em vez de dois callouts empilhados.
- **Busca Rápida / Navegação Lateral fecham menus ambientes antes de abrir.** Quando você aciona qualquer uma das combinações na Home, o Deck Shelves agora fecha o QAM, o menu principal do Steam e qualquer menu de contexto aberto primeiro, depois abre a sobreposição. Você não precisa mais dispensar isso manualmente antes de acionar a combinação.

- **Remapeie (ou desative) os botões do gamepad que disparam ações de prateleira.** Novo card Shortcuts em Settings permite mudar quais botões disparam: ocultar/remover um card, alternar destaque, lançamento rápido (Instalar / Jogar / Retomar / Desinstalar / Pausar), abrir Busca Rápida, abrir Navegação Lateral. Os padrões combinam com o layout atual (`X`, `Y`, `View`, `L1+R1`, `L1+L1`). Escolha uma linha → "Capturar", pressione sua nova combinação (botão único, combo de dois botões, ou toque duplo do mesmo botão), e ela é salva. Atalhos em nível de card podem ser totalmente desativados se você não os quiser. Os atalhos de navegação podem ser remapeados mas não desativados (são o único ponto de entrada para esses recursos). `A`, `B`, `Menu`, `Steam` e o botão de captura de tela são reservados pelo sistema e recusados — mesmo em combinações.
- **Reordenação por arrastar-e-soltar para a lista unificada de prateleiras.** Com "Lista unificada" ativada, cada linha em Settings → Prateleiras agora tem uma alça `⋮⋮` à esquerda. Segure e solte a linha em qualquer lugar da lista — a ordem persiste entre reinícios. Os botões ↑ / ↓ continuam lá, então usuários exclusivamente de gamepad mantêm um caminho rápido.
- **Descoberta de jogos de launchers externos.** Se você tem EmuDeck, RetroDECK, Heroic, Lutris, Moonlight ou Chiaki instalados, o Deck Shelves agora lê as listas de jogos deles em segundo plano (somente leitura — sem escrita, sem telemetria) e os apresenta através das fontes de prateleira correspondentes (por exemplo, "Biblioteca Heroic", "Coleções EmuDeck"). Jogos que você já adicionou como atalhos não-Steam aparecem; o restante fica em cache para uma futura opção de "importar como atalho". A sondagem nunca bloqueia o boot do plugin, e um launcher instalado no meio da sessão é detectado em até 15 minutos sem reiniciar o Steam.
- **76 novos filtros + ordenações + fontes de prateleira embutidos.** Filtre jogos por gêneros, categorias, franquia, suporte a VR, tipo de multiplayer, compartilhamento familiar, posse de DLC, posse de trilha sonora, número de lançamentos, duração média de sessão, nunca completado, recém-abandonado, instalado mas nunca jogado, jogado só uma vez, faixa de porcentagem de conquistas, dispositivo de armazenamento (SSD vs. SD), tamanho instalado, qualidade dos dados de compatibilidade, launchers EmuDeck/RetroDECK/Heroic/Lutris/Chiaki/Moonlight, tipo de executável, tags de opções de lançamento, tags personalizadas, categorias de parser, atalhos de launcher ocultos. Ordene por mais/menos lançados, sessão mais longa/curta, mais ignorados, redescobertos recentemente, % de conclusão, mais perto de completar, conquistas mais raras, instalados mais recentes/antigos, não jogados há mais tempo, comprados mais recentemente, instalação maior/menor, prioridade SSD/SD, amigos jogando agora, mais amigos possuindo, em alta entre amigos, além de 5 variantes de aleatorização. Use as novas fontes de prateleira: coleções dinâmicas do Steam, jogos seguidos, jogos ignorados, DLC, trilhas sonoras, jogos fixados, histórico, filas de sessão, jogos atualizados recentemente, jogos com eventos, jogos com atualizações de workshop, específico de controle. (As fontes de launcher externo aparecem, mas precisam da próxima versão do backend para popular as listas de jogos.)
- **Modos de filtro compostos.** Novo "Filtro ponderado" (soma de pesos ≥ limiar), "Filtro por prioridade" (a primeira correspondência vence), "Grupo de exclusão" (qualquer correspondência exclui). Cada um envolve múltiplos filtros filhos com uma política de combinação diferente dos grupos AND/OR já existentes.
- **Selo "embutido" em toda integração de primeira parte do Deck Shelves.** Abra Settings → Integrations e você verá uma tag verde BUILT-IN em toda entrada distribuída pelo próprio Deck Shelves, distinguindo-as de plugins de terceiros.
- **Perfis exportam para arquivo + importam de arquivo.** Mova perfis entre Steam Decks ou faça backup antes de reinstalar. Os arquivos vão para sua pasta de Downloads por padrão (`deck-shelves-profiles.json` para a lista inteira, ou `profile-<name>.json` para uma exportação individual). Importar um arquivo que já existe no mesmo dispositivo desduplica os nomes automaticamente.
- **Perfil "Default" no topo da lista.** Entrada somente-leitura sempre presente que redefine toda configuração para o padrão de fábrica quando você o aplica. Seus perfis salvos permanecem intactos (nada é apagado). Marcado com um selo "embutido" para que você o distinga dos seus próprios.
- **QR Code do Ko-fi escaneável na página de Suporte.** Um QR code de 128×128 agora fica ao lado do botão do Ko-fi na aba Sobre → Suporte. Aponte a câmera do seu celular para abrir a página de doação sem sair do Deck.
- **O painel de Integrações liga ou desliga cada plugin.** O card Integrations agora lista todo descritor registrado (embutido OU de terceiros) com uma alternância. Desative uma integração e qualquer contribuição que ela faz (resultados de busca, fontes de prateleira personalizadas, etc.) some do funcionamento até você ligá-la de volta. Um selo verde "BUILT-IN" marca as entradas próprias do Deck Shelves.
- **O seletor "Adicionar prateleira" tem abas Standard + Smart quando a unificação está ativada.** Com "Lista unificada de prateleiras" ativada, escolher "Adicionar prateleira" abre um único modal com duas abas cobrindo todos os templates de uma vez. Desligada, é o fluxo separado original.
- **Reordene prateleiras diretamente pela página Settings.** Cada linha no painel de detalhes de Prateleiras (em modo unificado) mostra botões ↑ / ↓ que reordenam a prateleira na hora. Salva imediatamente; reflete na Home da próxima vez que você a abrir.
- **A seção "Features" do QAM oculta superfícies inteiras.** Nova seção com 5 alternâncias: Prateleiras regulares, prateleiras inteligentes, Filtros, Cards sintéticos, Integrações da API do plugin. Cada uma vem ativada por padrão; desligar uma oculta toda superfície de interface relacionada (os dados são preservados — reativar restaura tudo).
- **A seção "Network features" consolida as alternâncias online.** As quatro alternâncias dependentes de rede (recursos online mestre + wishlist + ordenação por preço + ocultar-possuídos) agora vivem em um único bloco rotulado em vez de espalhadas.
- **O Modo Leve agora oculta mais superfícies avançadas.** Com o "Modo Leve" ativado, o QAM/sidecar também oculta: prateleiras inteligentes na base, surprise-me, os quatro sliders visuais globais (tamanho do logo, deslocamento superior do logo, altura da descrição, espaçamento logo-descrição). Oito controles avançados somem; os valores continuam salvos.
- **Perfis no QAM.** Nova seção recolhível "Profiles" fica acima de Behavior. Aparece assim que você tem pelo menos uma prateleira. Salve sua configuração atual com um toque (➕), ou escolha um perfil salvo no dropdown para aplicá-lo instantaneamente. "None" desvincula o marcador ativo sem mudar nada.
- **A página Sobre foi redesenhada para combinar com a nova página Settings.** Mesma seta de voltar, mesma tipografia de título, mesmo espaço de ícone final — agora elas formam um par.
- **A lista unificada de prateleiras finalmente renderiza na Home.** Com "Lista unificada de prateleiras" ativada, a Home mescla prateleiras regulares + smart usando a ordem que você definiu no painel de detalhes de Prateleiras. Novas prateleiras que você criar caem no final até você posicioná-las.
- **O Modo Leve oculta a primeira alternância avançada.** Com "Modo Leve" ativado, a alternância avançada "Forçar temas do CSS Loader" desaparece do QAM/sidecar. Mais seções avançadas ganham tratamento do Modo Leve em versões futuras.
- **Perfis de uso.** Salve toda a sua configuração (cada alternância, cada prateleira, cada filtro salvo) como um perfil nomeado pela página Settings → card Profiles. Aplicar troca sua configuração ativa pelo snapshot salvo com um toque (com uma confirmação de "isso vai substituir tudo"). Duplicar bifurca um perfil, Renomear altera o rótulo, Excluir remove o snapshot. Um selo "Ativo" marca qual perfil está aplicado no momento; Desvincular desliga sem perder nada.
- **Os detalhes de Prateleiras agora fazem CRUD completo.** Botões Adicionar / Editar / Excluir inline em toda prateleira (os mesmos modais que a lista do QAM abre). Prateleiras regulares e smart lado a lado, com um pequeno selo Normal / Smart em cada linha para que o tipo fique óbvio de relance.
- **Alternância de lista unificada de prateleiras (prévia).** Nova alternância em prateleiras inteligentes: "Lista unificada de prateleiras". Desativada por padrão. Ligá-la por enquanto muda os detalhes de Prateleiras para uma única coluna mesclada ordenada por `allShelvesOrder` — a Home em si continua separada até a próxima versão trazer o caminho de renderização mesclado.
- **Alternância de Modo Leve (prévia).** Nova alternância em prateleiras inteligentes: "Modo Leve". Ligá-la persiste, mas ainda não oculta nada no QAM — os controles de visibilidade por seção chegam na próxima versão.
- **Painéis de detalhes na página Settings.** Escolher um card agora abre um painel de detalhes vindo da borda direita em vez do placeholder "Em breve". Os quatro novos painéis são:
  - **Quick settings** — uma checklist focada que permite alternar "mostrar no QAM" para cada alternância e seção. Os valores continuam ativos; isso é só gerenciamento de visibilidade.
  - **Prateleiras** — lista de toda prateleira com título + descrição da fonte.
  - **Backup** — três linhas (prateleiras regulares / prateleiras inteligentes / configurações completas) com botões de Exportar + Importar cada. Os arquivos vão para sua pasta de Downloads por padrão.
  - **Advanced tools** — visualizador de logs de diagnóstico (últimos 50 eventos do plugin com timestamps, níveis e botão de limpar) além dos três atalhos de reset de fábrica (só prateleiras / só smart / tudo). Reset ainda pede confirmação.
- **A página Settings agora vem ativada por padrão.** O ícone de engrenagem ao lado do ícone de documentação no QAM abre a nova página imediatamente na primeira instalação / atualização. Se você já tinha desligado esse recurso explicitamente antes, essa escolha é preservada.
- **Página Settings dedicada (shell de dois painéis).** O ícone de engrenagem no QAM abre uma nova página Settings organizada em dois painéis: o lado esquerdo espelha toda alternância do sidecar (ligar uma reflete instantaneamente no QAM / sidecar), e o lado direito adiciona uma grade de cards 2×3 com destinos mais profundos — **Quick settings**, **Prateleiras**, **Profiles**, **Integrations**, **Backup** e **Advanced tools**. Escolher um card desliza um painel de detalhes vindo da direita; B fecha de volta para a grade. Prateleiras e Integrations vêm com seu conteúdo existente imediatamente; os outros quatro cards chegam na próxima versão.
- **Duas novas opções de Busca Rápida.** "Abrir teclado virtual" (ativada por padrão) mantém o comportamento de abertura automática que você já tinha. Desligue se você digita em um teclado físico e não quer o teclado na tela no caminho. "Buscar só ao pressionar Enter" (desativada por padrão) substitui o timer de esperar-e-buscar por um gatilho exclusivo de Enter — digite o quanto quiser, a busca só dispara quando você pressiona Enter. Ambas as alternâncias aparecem na seção Busca Rápida e respeitam o botão de olho de ocultar-do-QAM como qualquer outra configuração.
- **A Busca Rápida encontra mais jogos.** A busca agora varre todo jogo em toda prateleira que você tem na tela — incluindo cards abaixo da dobra ou ainda carregando seus metadados. Nomes acentuados correspondem à sua grafia sem acento (por exemplo, "café" ↔ "cafe") automaticamente. Se você acerta um jogo cujo card ainda não foi montado, o ativador rola a prateleira correspondente até ela ficar visível e espera o card aparecer antes de focá-lo.
- **O teclado de busca sai de forma limpa.** Fechar a busca (via R1+L1, B, ao encontrar uma correspondência, ou por tempo esgotado sem correspondência) agora também dispensa o teclado na tela. A prateleira de onde você veio recupera o foco.
- **A Navegação Lateral abre na sua prateleira atual.** Pressionar L1 duas vezes agora leva o foco do painel para a linha correspondente à prateleira em que você estava, não a primeira. Três tentativas cobrem a breve janela em que a árvore de navegação do Steam ainda está indexando o novo painel.
- **A Navegação Lateral fica escura.** O fundo é um preto mais profundo com desfoque mais forte. A linha em foco usa um gradiente preto com uma barra de borda esquerda na cor do tema (o acento `--gpSystemLighter` do Steam), então ela se destaca sem gritar branco sobre seu papel de parede.
- **Faixa de logo / descrição / ícone em toda prateleira.** Ligue "Mostrar logo" e a arte de logo transparente do jogo em foco aparece com destaque acima dos cards (por prateleira, ou globalmente para todas). Combine com "Mostrar descrição" e o trecho da loja Steam fica logo abaixo do logo. Uma segunda alternância "Descrição abaixo do logo" decide se a descrição segue o logo ou fica sob a linha de tempo de jogo de cada card. A largura é limitada a cerca de quatro cards normais para que trechos longos façam reticências de forma limpa em vez de empurrar outras linhas.
- **Controles de posição + tamanho para tudo o que é visual.** Novos dropdowns esquerda / centro / direita para: posição do logo, posição da descrição, posição do título da prateleira, posição do nome do jogo e a linha de tempo de jogo. Além de sliders para tamanho do logo (50-200%), deslocamento superior, e (quando a descrição está sob o logo) quantas linhas de altura tem o bloco de descrição (1-6). Defina um padrão globalmente, sobrescreva por prateleira — os globais vencem quando configurados.
- **Pequeno ícone do jogo ao lado do rótulo do card.** "Mostrar ícone" sobrepõe o ícone do jogo à esquerda do bloco de nome + tempo de jogo. Um novo dropdown "Alinhamento vertical do ícone" escolhe alinhamento no topo / centro / base para ele.
- **Alternância "Prateleira em página inteira".** Promove qualquer prateleira para o mesmo layout de hero em tela cheia que a primeira prateleira recebe quando "Ocultar recents" está ativado. Disponível por prateleira, com uma sobrescrita global. Fica por último na seção Visual do QAM e como penúltimo item no modal Edit Prateleira (logo antes dos destaques por card).
- **Os valores dos sliders agora aparecem ao lado dos rótulos.** Todo slider no plugin (QAM, sidecar, modal de edição, modal de prateleira inteligente, filtros) renderiza o valor ao vivo alinhado à direita acima da barra. O `(valor)` redundante que costumávamos embutir em alguns rótulos de slider foi removido — o valor é mostrado automaticamente e não é mais cortado em superfícies mais estreitas.
- **Cache de logo, ícone e descrição.** As URLs de logo e ícone agora passam pelo cache compartilhado de blobs de imagem, então assim que você foca um card os recursos ficam em memória e o próximo foco no mesmo card é instantâneo. As descrições também são salvas em armazenamento local — reabrir o plugin mantém os trechos que você já viu em vez de buscá-los de novo do Steam.
- **Rota Settings em página inteira.** Ative `settingsPageEnabled` e o ícone de engrenagem no QAM abre uma página dedicada com cinco abas: General (espelha toda alternância do painel lateral), Prateleiras (lista com editar / excluir + entrada de adicionar prateleira), Filters (lista de filtros salvos), Templates (navegue por toda a biblioteca e abra o editor pré-preenchido) e Integrations (retrato de todo plugin que registrou fontes de prateleira, smart sources, tipos de filtro, opções de ordenação ou importadores via a API pública).
- **Sobreposição de Busca por Contexto.** Em qualquer lugar da Home, comece a digitar e uma sobreposição centralizada aparece com o buffer digitado destacado. Quando você para de digitar, o plugin busca os jogos atualmente renderizados nas suas prateleiras e mostra correspondências ranqueadas. Escolher uma correspondência foca o card exato na sua prateleira (rolando até ele ficar visível). Enter ativa o melhor resultado; Esc / B fecha.
- **Navegação lateral no dpad-esquerda.** Pressione esquerda no primeiro card de qualquer prateleira e um painel lateral desliza para dentro listando toda prateleira visível (regular + smart) — escolha uma para pular direto ao primeiro card dela.
- **Scripts `pnpm pnpm:upgrade` / `pnpm pnpm:upgrade:api`.** Fixe o Corepack na versão mais recente do pnpm em um único comando, para o repositório do plugin e para o pacote independente da API.
- **Proteção contra falhas para o painel lateral.** Um erro de renderização dentro do painel de quick settings não derruba mais o painel inteiro; uma caixa de erro inline aparece no lugar enquanto o resto do QAM continua funcionando.

### Changed

- **Os temas do CSS Loader agora podem restilizar toda cor de texto na interface do plugin.** As páginas Sobre, os detalhes de configurações, os banners de erro / aviso e os auxiliares de filtro costumavam ter tons fixos de branco e cinza; agora eles lêem das variáveis CSS `--ds-text` / `--ds-text-dim` / `--ds-text-faint` / `--ds-danger` / `--ds-warn` / `--ds-link`. A aparência padrão continua a mesma, a menos que um tema sobrescreva esses tokens.
- **Plugins externos construídos contra `@deck-shelves/api` agora recebem dados de jogo no formato correto.** O contrato publicado prometia um `PublicAppMeta` limpo (com `isSteam`, `playtimeMinutes`, …), mas o runtime estava entregando aos plugins o objeto bruto do Steam (`is_non_steam`, `playtime_forever`, …). Predicados de filtro e funções de ordenação de plugins externos efetivamente rodavam sobre o formato errado. Corrigido na fronteira do runtime; os filtros de primeira parte do Deck Shelves continuam funcionando sem alteração. Nenhuma ação necessária da sua parte — qualquer um distribuindo um plugin contra o pacote api verá valores corretos a partir desta versão.
- **O devkit vive na sua própria pasta.** As ferramentas exclusivas de desenvolvimento (sondas CDP, pipeline de capturas de tela, benchmark de desempenho) saíram de `scripts/devtools/deck/` para `deckprobe/`, com seu próprio README / CHANGELOG / `package.json` / estrutura de pacote Python. Impacto no usuário final: nenhum — seu plugin instalado não distribui o deckprobe. Contribuidores usando `pnpm devtools:cli`, `pnpm screenshots`, `pnpm perf:bench`, `pnpm uitests` usam os novos caminhos de forma transparente (os scripts npm foram atualizados).
- **O título do painel lateral agora começa com o ícone de engrenagem** para que o painel se leia como uma superfície de configurações de relance. O ícone da seção de comportamento foi trocado por um pictograma de sliders para que a engrenagem fique reservada para a entrada da página Settings em página inteira.
- **O fundo do painel lateral combina com o tema do QAM.** Antes o painel lateral forçava uma cor escura fixa mesmo quando o QAM ao redor estava com um tema aplicado; agora ele deixa transparecer qualquer tema que o QAM esteja usando.
- **Campos visuais agrupados pelo seu dono.** No modal Edit Prateleira, na seção Visual do QAM e no painel lateral, cada alternância pai é imediatamente seguida por seus controles dependentes, e eles só aparecem depois que o pai é ligado. Chega de caçar o dropdown "posição do logo" três linhas abaixo da alternância "Mostrar logo".
- **Sliders em superfícies estreitas não abrem mais o painel lateral por acidente.** Segurar para a direita em um slider enquanto ajusta o valor não abre mais o painel lateral sem querer.

### Fixed

- **A dica do botão View dizia "Pausar" em jogos com uma atualização na fila.** Quando um jogo (ou uma ferramenta como o Proton Experimental) tinha uma atualização esperando mas não sendo baixada ativamente, a dica lia "Pausar" em vez de "Atualizar". Agora ela lê "Atualizar" até que o download esteja de fato em progresso.
- **A hero art tremia para cima e para baixo enquanto você se movia entre cards.** Com a hero art por prateleira ativada, a imagem de fundo alternava entre dois enquadramentos verticais ligeiramente diferentes de card para card. Ambas as camadas de cross-fade agora usam o mesmo enquadramento, então a hero fica estável enquanto você navega.
- **O foco podia ficar preso na linha de recents nativa ao tentar voltar para o Deck Shelves.** Depois de pressionar CIMA na barra de busca do sistema / recents nativo, pressionar BAIXO três vezes às vezes pulava entre camadas ocultas acima das prateleiras em vez de cair em um card do Deck Shelves. A ponte de foco agora detecta esse caso e te leva direto para o primeiro card do DS.
- **A Busca Rápida não estava navegando até o jogo que encontrava.** A sobreposição estava restaurando o foco ao card de onde você abriu a busca logo depois que o ativador movia o foco para o resultado — então o resultado visível era "busca fechada, nada aconteceu". Reordenado para que a sobreposição feche primeiro, e então o ativador rode depois de uma pequena pausa.
- **R1+L1 parava de fechar a sobreposição de busca depois que você digitava algo.** Enquanto o campo de entrada segurava o foco de navegação, o barramento de botão home não disparava, então a combinação era ignorada silenciosamente. O pill agora também se inscreve diretamente no barramento do controle, então R1, L1 ou B sempre o fecham.
- **A alternância da Navegação Lateral não a desativava de fato.** Desligar a alternância costumava deixar o painel respondendo ao seu gatilho de L1 duas vezes até um recarregamento. Agora ele para de escutar imediatamente e fecha o painel na hora se um estiver aberto.
- **Prateleiras sumindo depois de ativar logos.** Algumas prateleiras desapareciam da Home até o QAM ser reaberto porque os novos campos de posição rejeitavam o `null` retornado pelo sanitizador de configurações. O schema agora aceita o caso ausente de forma limpa.
- **O painel lateral podia ser empurrado para fora da área visível** com logo + descrição ativados. Prateleiras promovidas (página inteira) não adicionam mais preenchimento extra para a zona do logo — o logo compõe dentro da área de hero existente em vez de empurrar a linha de cards para fora da tela.
- **Abertura acidental do painel lateral** ao mover para o botão mais à direita de uma linha. Pressionar direita duas vezes no mesmo elemento em foco agora é necessário para expandir o painel; o primeiro toque só leva o foco até lá.

> Mudanças na API do plugin (`registerSearchProvider`, `registerSideMenuProvider`, novos tipos de descritor, getters públicos de registro) são acompanhadas em [api/RELEASE_NOTES.md](../../api/RELEASE_NOTES.md). Adições do CDP deckprobe são acompanhadas em [deckprobe/RELEASE_NOTES.md](../../deckprobe/RELEASE_NOTES.md).

## [2.4.3] - 2026-06-12

### Added

- **Painel lateral expansível para Settings.** Pressionar direita no item mais à direita da aba do Deck Shelves no QAM agora expande o QAM da mesma forma que Friends & Chat faz e desliza para dentro um painel lateral intitulado "Settings" — uma única visão rolável que espelha toda alternância do painel DS normal. Construído para ficar fora do caminho até você realmente querer usá-lo: sem um dpad-direita extra não há expansão.
- **Oculte alternâncias individuais ou seções inteiras do QAM.** Toda alternância e seção no painel lateral tem um botão de olho ao lado. Toque nele e essa alternância (ou a seção inteira) some do QAM normal mas continua acessível no painel lateral. Ocultar um pai como "Ocultar recents" também remove suas subalternâncias (`Hero background`, `Recents replace source`) do QAM automaticamente. A alternância mestre "Enable" é isenta — você não pode ocultá-la.
- **Dica de Pausa no botão View.** Cards de jogo mostrando um estado pausado / em fila / baixando ativamente agora exibem "Pausar" na dica do botão View (antes era "Atualizar" ou "Instalar", dependendo do estado), com o mesmo mapeamento de ação que o menu de contexto nativo usa para retomar o download.

## [2.4.2] - 2026-06-10

### Added

- **Cards destacados aleatórios (`highlightRandom`).** Uma nova alternância visual que destaca aleatoriamente ~25% dos cards de uma prateleira — dá à Home uma mistura de cards grandes e pequenos sem você precisar escolher cada um manualmente. Disponível no menu de contexto de toda prateleira, na aba Visual do modal de edição, e como uma alternância global na seção Visual do QAM. A escolha é determinística por prateleira, então os mesmos cards permanecem destacados entre sessões (sem sorteio a cada vez).
- **Heroes carregam instantaneamente para jogos possuídos.** O plugin agora usa a própria URL de cache do Steam (`steamloopback.host`) para a hero art em vez do CDN público — os heroes aparecem em 3-9 ms quando você foca um card em vez de surgir gradualmente ao longo de 200-500 ms. Apps que o Steam ainda não armazenou em cache continuam caindo para o CDN.
- **Pacote `@deck-shelves/api`.** Outros plugins e temas do Decky agora podem se integrar com o Deck Shelves através de um pacote npm pequeno — `npm install @deck-shelves/api`, então `import { register } from '@deck-shelves/api'`. Registre fontes, templates de prateleira inteligente, tipos de filtro, opções de ordenação, manipuladores de importação, filtros salvos. Novo nesta versão: assine mudanças no card em foco e peça ao Deck Shelves para construir a URL correta de um recurso para um appid sem reimplementar a cadeia loopback / CDN. Distribuído a partir da pasta `api/` deste repositório.
- **Provedor centralizado de URL de imagem.** Todas as URLs de recurso (hero, retrato, paisagem, logo, ícone, e as novas variantes de placeholder borrado e fundo de página da loja) vêm de um único módulo com uma cadeia consistente loopback-primeiro, CDN-por-último. Os getters de logo e ícone são expostos mesmo que nenhum recurso atual os use — eles estão prontos para quando um futuro layout de espinha ou visualização em lista precisar deles.

### Changed

- **A animação de foco do card agora combina com a do próprio Steam.** Os cards fazem a transição em 400 ms com a curva de desaceleração lenta do Steam em vez dos 160 ms rápidos anteriores — parece menos abrupto durante a navegação. O pop de foco reproduz o zoom percebido do nativo via uma escala de 1,02×.
- **A navegação horizontal não engole mais todo outro toque.** Segurar direita (ou toques rápidos) agora move o foco continuamente em vez de derrubar metade dos toques — a transição de transformação anterior estava conflitando com a janela de debounce do controlador de navegação do Steam.
- **D-pad Baixo a partir do recents nativo do Steam entra de forma confiável nas prateleiras do DS.** Alguns usuários ficavam presos pressionando Baixo a partir da linha de recents nativa sem nada acontecer; a ponte que leva o foco para as prateleiras do DS estava desistindo cedo demais. Corrigido.
- **A hero art não fica mais preta durante uma troca.** Navegar entre cards costumava piscar um vazio de 200-500 ms enquanto a nova hero carregava; agora a hero carregada anteriormente permanece visível até a nova estar pronta, então elas fazem cross-fade suavemente.
- **O posicionamento do selo combina exatamente com o do Steam nativo.** A tag de NEW / desconto fica à mesma distância da borda do card que as próprias prateleiras nativas do Steam, incluindo o leve afundamento quando o card está em foco. O deslocamento sem foco também foi ajustado em 2px para parecer menos flutuante.
- **Anel de foco um pouco mais afastado da arte da capa.** Aumentado o espaçamento do contorno de 1px para 2px para um indicador de foco mais espaçoso.
- **A verificação de atualização é instantânea quando você está online.** Antes, o plugin lembrava do último resultado por 24 horas — então uma versão publicada no meio do dia não aparecia até o dia seguinte. Agora ele sempre pergunta ao GitHub quando há internet, e o resultado em cache só é usado quando você está offline.

### Fixed

- **Regressão de travamento no boot.** Um aquecimento de descrições adicionado em uma iteração anterior desta versão disparava ~100 requisições de dados da loja + timers de sondagem na montagem da prateleira; revertido para que as descrições só sejam buscadas sob demanda (por exemplo, quando uma futura tooltip / visualização de detalhes realmente precisar do trecho).
- **O template "Jogos instalados" não produz mais uma prateleira vazia.** Quando o sistema de abas da biblioteca do Steam ainda não havia populado a aba de instalados (timing de boot ou certas combinações de tema), o template simplesmente não mostrava nada. Agora ele volta para o filtro `installed: true`, que sempre funciona.
- **A alternância de destaque aleatório persiste.** A alternância estava visualmente ligando e depois voltando para desligada ao fechar/reabrir o modal ou o QAM porque o backend em Python não estava na lista de campos permitidos do novo campo — corrigido tanto no escopo por prateleira quanto no global.

- **O selo de NEW / desconto não desaparece mais em alguns cards em foco.** A sobreposição que desenha o selo acima do anel de foco só lia o estado do selo uma vez, então jogos cuja informação chegava um pouco depois (prateleiras online, preços da loja) acabavam sem selo. Agora a sobreposição escuta atualizações tardias e re-renderiza automaticamente.
- **Card de atualizar ausente em prateleiras combinadas com fontes online.** Uma prateleira que misturava fontes online (wishlist ou loja) com fontes offline não mostrava o card de atualizar no fim da linha, mesmo quando o cache podia estar desatualizado. Agora o card aparece sempre que qualquer fonte precisa de uma atualização manual — a mesma regra da ação do menu.

## [2.4.1] - 2026-06-06

### Changed

- **Prateleiras combinadas com duas fontes online agora têm um bloco de filtro por fonte** (Wishlist + Loja ganham painéis separados, cada um com seu próprio % de desconto, faixa de preço, etc.). O mesmo vale para as alternâncias "Ignorar jogos que já tenho" — um bloco por fonte online, então você pode misturar e combinar.
- **Novas prateleiras abrem sem nenhuma aba pré-selecionada.** A pré-visualização fica vazia até você escolher uma, em vez de mostrar todo jogo da aba padrão "Todos os jogos". Editar uma prateleira existente mantém o que você já tinha selecionado.
- **A reordenação no QAM acompanha a linha movida.** Pressionar cima/baixo em modo de reordenação costumava prender o foco no slot onde você começou — o próximo toque trocava uma linha diferente em vez daquela que você acabou de mover. O foco agora viaja junto com o item movido.
- **O menu de ações da prateleira mostra o nome da prateleira como título** (antes era "Actions").
- **A dica "Abrir opções da prateleira" foi encurtada para "Opções".**
- **O indicador online (ícone de nuvem)** nas prateleiras do QAM agora também aparece para prateleiras combinadas que tenham pelo menos uma fonte online.
- **Uma fonte de filtro sem critérios agora mostra uma prateleira vazia** (antes mostrava sua biblioteca inteira).
- **Escolher "Filtro" como fonte não preenche mais previamente o critério "Instalado".** Você começa com um filtro em branco e adiciona o que quiser.

### Fixed

- **Opção "Atualizar cache" ausente em prateleiras combinadas com fontes online.** A ação só aparecia para prateleiras puras de wishlist / loja — escolher uma prateleira composta que incluía uma fonte de wishlist ou loja pelo menu do card não tinha como limpar os resultados em cache. Agora a opção está de volta no submenu Prateleira → Management sempre que qualquer fonte online está envolvida.
- **O selo de NEW / desconto não desaparece mais nem duplica no card em foco.** Uma mudança recente havia removido a sobreposição dedicada que desenhava o selo acima do anel de foco do Steam; o selo dentro do card sozinho é desenhado sob o anel, então o selo parecia ter sumido no momento em que um card era selecionado. Trazer a sobreposição de volta sem coordenação deixava as duas cópias empilhadas visivelmente. A sobreposição voltou E a cópia inline agora é ocultada no foco, então exatamente um selo aparece em todo estado.
- **Lentidão na Home (#81).** Cada card com um selo de "NEW" ou desconto rodava seus próprios observadores de DOM e listeners de foco para acompanhar o estado da sobreposição do QAM/modal. Em uma Home com 30+ cards visíveis, isso virava dezenas de observadores reagindo a toda mudança de DOM. Agora um único detector compartilhado atende a Home inteira — o uso de CPU em repouso cai visivelmente.
- **Prateleiras com ordenação aleatória agora realmente embaralham de novo (#82).** A versão anterior armazenava o embaralhamento em cache por 24 horas, e o cache sobrevivia a reinícios do Steam — então uma prateleira com ordenação aleatória ficava congelada na mesma ordem até o dia seguinte. Agora o cache é limpo a cada boot do plugin e a cada atualização de prateleira.
- **O botão View em jogos rodando não mostra mais "Aplicativo já aberto".** Pressionar View em um jogo que está rodando agora te leva corretamente de volta ao jogo sem o toast de erro — mesmo comportamento de escolher manualmente o primeiro item do menu.
- **O botão View em runtimes com atualização pendente não falha mais com "Configuração de jogo inválida".** Itens não executáveis diretamente, como Steam Linux Runtime / Proton Hotfix, agora passam pela ação real de "Atualizar" do menu em vez de tentar lançar.
- **O botão View agora também funciona em cards sem arte de biblioteca.** Alguns jogos (notavelmente runtimes do Steam) mostram um fundo de placeholder; pressionar View nesses cards costumava não fazer nada. Agora usa o mesmo disparo de um card normal.

## [2.4.0] - 2026-06-03

### Added

- **Dois novos filtros de atividade de amigos.** "Amigos jogando agora" corresponde a qualquer jogo em que pelo menos um amigo Steam esteja jogando neste momento. "Amigos jogaram recentemente" corresponde a qualquer jogo que um amigo foi visto jogando nos últimos N dias (1–30, padrão 14). Ambos funcionam em qualquer prateleira regular e dentro de composições — por exemplo, "jogos na minha coleção Backlog que qualquer amigo jogou esta semana". Ambos são invertíveis (use como exclusão). Requer que a alternância de Recursos Online esteja ativada.
- **O modo de prateleira inteligente agora é editável.** A aba Source do editor de prateleira inteligente tem um dropdown de modo (antes era somente leitura). Mude a fonte de dados de uma prateleira inteligente sem recriá-la.
- **Combine modos de prateleira inteligente.** Um novo seletor "Combinar modos" no editor de prateleira inteligente permite misturar vários modos smart em uma única prateleira — escolha União (qualquer modo corresponde) ou Interseção (todos os modos correspondem). O mesmo modelo mental de combinar fontes em prateleiras regulares.
- **Pressione View em um card de jogo em foco para Jogar ou Instalar** — invoca diretamente a primeira ação do menu de contexto do jogo. O Steam escolhe Jogar (se instalado) ou Instalar (se não) — a mesma chamada que o primeiro item do menu faz. A legenda no card reflete o rótulo dinâmico. Só é mostrado para jogos na sua biblioteca (cards de wishlist / loja / decoração não recebem o glifo View, já que não há alvo de instalação / jogo).

- **O rótulo do botão Y agora é constante ("Alternar") em todo card** em vez de alternar entre "Destacar" / "Remover destaque" conforme o card está ou não em destaque no momento. Menos ruído visual na legenda; a ação continua alternando o destaque como antes.
- **Dica "Opções" no botão de menu** — o glifo do botão start na parte inferior da tela agora mostra "Opções" quando um card de jogo está em foco, combinando com as legendas X / Y / A / B já mostradas nas prateleiras.

- **6 novos templates de prateleira inteligente** que leem dados ao vivo de dispositivo + Steam:
  - **Modo de bateria baixa** — quando o Deck está na bateria abaixo de 30% (ajustável), apresenta primeiro os jogos menores e de tempo de jogo mais curto. Na tomada / bateria desconhecida, cai de volta para os candidatos de "bateria curta" para a prateleira não ficar vazia.
  - **Quase terminado** — jogos com progresso de conquistas em 70% ou mais (ajustável). Melhor esforço: depende dos dados de conquistas do Steam estarem em cache para cada jogo.
  - **Jogo em sofá** — jogos marcados com multiplayer Compartilhado/Tela Dividida.
  - **Pronto para co-op** — jogos marcados com Co-op ou Co-op Online.
  - **Jogos de festa** — jogos marcados com Multiplayer Local / PvP Local / Festa.
  - **Amigos jogando** — jogos que seus amigos do Steam estão jogando agora (ou, opcionalmente, jogaram nos últimos 14 dias). Mostra jogos que você possui E jogos que você não possui — cards não possuídos levam à loja. Requer que os Recursos Online estejam ativados; reaproveita a alternância Online já existente.
  - Os templates baseados em categoria dependem dos dados de categoria da loja Steam estarem acessíveis. A primeira renderização pode estar vazia; os ciclos de atualização seguintes a populam.

- **Cards de decoração.** Uma nova aba "Decoration" permite fixar cards de slot fixo em qualquer prateleira: um rótulo de texto, um banner de imagem, um atalho de URL focável, ou uma lacuna transparente que o foco pula. Novos cards caem no slot que você focou na pré-visualização, e a prateleira muda automaticamente para ordenação manual para você poder arrastá-los depois.
- **Combine fontes em uma única prateleira.** Escolha uma fonte primária, então "+ Adicionar fonte" empilha extras inline. Uma alternância União / Interseção aparece assim que uma segunda fonte é adicionada.
- **Ordenação multi-chave (primária + critérios de desempate).** "Adicionar ordenação secundária" adiciona chaves extras; por exemplo, escolher `% de desconto` + `metacritic` ordena por desconto com o metacritic desempatando. Cada chave tem sua própria alternância asc/desc. `manual` e `random` só são válidas como chave primária única.
- **Quatro templates de prateleira inteligente focados em mídia:** Trilhas sonoras, Vídeos, Demos e Jogos na nuvem (atalhos não-Steam em coleções de nuvem no estilo Unifideck). Os templates focados em jogos (Quick Play, Recently Played, Long Sessions, Daily Pick, Random, Spare Time, etc.) agora excluem entradas que não são jogos, para mostrar só jogos de verdade.
- **Três templates heurísticos de prateleira inteligente:** Resgate de Backlog (jogos instalados mas parados, em rotação para que a prateleira avance em vez de fixar sempre os mesmos cinco), Joias Esquecidas (títulos possuídos mas nunca jogados com boas avaliações), Rotação Semanal (uma fatia diferente da sua biblioteca a cada semana). Cada um vem com controles ajustáveis (cooldown, janela de estagnação, nota mínima de avaliação, cadência de rotação).
- **Templates de prateleira inteligente salvos.** prateleiras inteligentes podem ser salvas como templates reutilizáveis e lidas de volta pela API pública.
- **Adicionar à prateleira, a partir do menu de contexto de qualquer jogo.** Tanto as prateleiras do DS quanto a biblioteca nativa do Steam expõem "Adicionar à prateleira" — a lista só mostra prateleiras que ainda têm espaço e ainda não contêm o jogo (limite por prateleira + teto de 50 cards).
- **Ação rápida do botão Y** alterna o destaque por card sem abrir o menu de contexto.
- **Entrada "Decoration" no menu de contexto da prateleira** leva o modal de edição direto para a aba de decoração. Cards de decoração expõem seu próprio menu alternativo, já que não são apps de verdade.
- **Mais opções de filtro.** "Tipo de atalho" ganhou 10 novos tipos de app Steam (Demos, DLC, Música / Trilhas sonoras, Vídeos, Quadrinhos, Guias, Drivers, Configurações, Hardware, Betas, Aplicativos). "Status do app" ganhou 10 status mais detalhados (Iniciando, Reconfigurando, Validando, Baixando ativamente, Preparando, Comitando, Atualização na fila, Atualização pausada, Não instalado, Instalado ocioso).
- **Aba "Filtros online" em prateleiras com fontes online.** Quando sua prateleira usa wishlist / loja diretamente — ou combina várias fontes e pelo menos uma é wishlist / loja — uma nova aba "Filtros online" aparece no editor com os predicados exclusivos de online (% de desconto, faixas de preço). Em uma prateleira combinada, os filtros online se aplicam DEPOIS que as fontes são mescladas, então as mesmas regras atingem toda fonte contribuinte.

### Changed

- **Todas as abas de pré-visualização agora se parecem e se comportam da mesma forma.** As abas Source, Filters, Visual, Display e Decoration de ambos os tipos de modal de prateleira renderizam através de um único componente de pré-visualização — mesmos cards, mesmas flags de ocultação, mesmos cards finais, mesmo comportamento de foco e rolagem. A ordenação manual na aba Source é apenas uma camada de interação sobre a mesma renderização.
- **Marcas de seleção sempre visíveis na pré-visualização.** Jogos destacados mostram um check verde, jogos ocultos mostram um ✕ vermelho com uma sobreposição escurecida, e jogos que você adicionou manualmente via "Adicionar à prateleira" mostram um + azul. As marcas aparecem em toda aba, esteja ou não aberto o seletor daquele modo, então você pode ver de relance o que está destacado / oculto / adicionado.
- **Entrada "Decoration" no menu de contexto da prateleira** fica no mesmo nível visual de Display e Visual, não mais enterrada em Management.
- **O botão "Prateleira em branco" no seletor de templates agora se destaca** da grade de templates categorizados — linha de largura total com um separador fino e um rótulo em texto simples, combinando com como o editor de prateleira inteligente renderiza sua entrada "Custom / Blank". Parece o óbvio "pular os templates e começar vazio" em vez de mais um tile de template qualquer.

### Fixed

- **Prateleiras combinadas estavam descartando quase todo item quando a aba "Filtros online" tinha algum filtro ativado.** O filtro online (por exemplo, % de desconto) estava sendo aplicado a todo item mesclado — incluindo jogos de fontes de coleção / tab / filtro que não têm dados de preço online — então itens de coleção desapareciam silenciosamente da linha. Agora cada fonte aplica seus próprios critérios primeiro (filtros online só rodam contra filhos de wishlist / loja), depois tudo se mescla e a ordenação do pai se aplica. Combina com o modelo "cada fonte faz sua parte, depois combinamos".
- **Prateleiras combinadas com a alternância "excluir possuídos" ativada também estavam ocultando jogos dos filhos de coleção / filtro** mesmo que esses sejam obviamente jogos que o usuário possui e colocou ali de propósito. A ocultação em tempo de renderização agora se restringe a itens que vieram de um filho online.

- **Prateleiras combinadas com uma ordenação não manual estavam renderizando fora de ordem.** Quando uma prateleira mesclava várias fontes (por exemplo, duas coleções + uma wishlist) e era ordenada por algo diferente de manual, a linha final intercalava a ordenação própria de cada fonte em vez de aplicar a ordenação sobre o conjunto mesclado inteiro. Prateleiras combinadas agora reordenam o resultado mesclado para que a ordem combine com uma prateleira de fonte única com a mesma ordenação.
- **Prateleiras combinadas com um filho online (wishlist / loja) agora mostram as alternâncias "Excluir jogos que já possuo"** no editor — E as alternâncias agora realmente filtram a linha em tempo de renderização. Antes, a propagação por filho existia, mas o filtro de possuídos em tempo de renderização (o que oculta itens de wishlist que você possui via outras lojas pelo nome) só rodava para prateleiras online diretas, não para composições. Itens de wishlist que você já possui em outro lugar agora somem também de prateleiras combinadas quando a alternância está ativada.

- **Prateleiras compostas com um filho de wishlist ou loja** estavam mostrando esses cards como `#12345` em vez do nome real do jogo, e mostrando o indicador de instalação + texto de status "Não instalado" que não fazia sentido para jogos que você não possui. Os nomes agora vêm da API da Steam Store (o mesmo caminho que prateleiras de wishlist / loja já usam), e os visuais de estado de instalação são ocultados SOMENTE para os cards realmente não possuídos — cards possuídos na mesma composição mantêm seu tempo de jogo e estado de instalação.

- **A hero art da primeira prateleira ocasionalmente piscava um ícone de imagem quebrada por um frame** quando essa prateleira era promovida ao slot de recents. O fade-out entre URLs de hero (quando uma URL alternativa entra em ação) agora é instantâneo; só o fade-IN permanece.

- **"Prateleira como recents" (experimental) ainda forçava ordem alfabética em prateleiras usando ordenação manual.** Agora a prateleira promovida respeita sua ordem manual E volta para o `manualBaseSort` escolhido (com asc/desc por chave e cadeias multi-chave) para itens fora da ordem manual — combinando exatamente com o que você vê na Home.

- **Novas prateleiras inteligentes não estavam salvando.** Criar qualquer um dos novos templates (amigos jogando, modo de bateria baixa, quase terminado, jogos em sofá / co-op / festa, bateria curta, sessão longa à noite, modo viagem, joias escondidas, clássicos nunca tocados, instalações ocultas recentes, destaque mensal, rotação sazonal) falhava silenciosamente — a prateleira desaparecia logo depois de clicar em Salvar. A lista de modos permitidos do backend em Python não havia sido atualizada quando esses foram lançados; agora ela combina com o enum do TypeScript.

- **Prateleiras da loja "100% de desconto" / "Grátis agora" continuavam perdendo jogos gratuitos no momento mesmo depois da correção anterior.** O endpoint de ofertas do Steam limita silenciosamente cada consulta a ~100 linhas, não importa o que pedimos, então só as primeiras 100 ofertas chegavam à prateleira — qualquer coisa além disso, mais títulos marcados como Free Weekend (uma taxonomia do Steam separada dos descontos normais), nunca entravam. Agora lemos 3 páginas de ofertas mais a categoria Free Weekend junto com os endpoints de preço gratuito existentes, e forçamos o cache da loja a atualizar na próxima montagem para que usuários existentes não esperem pelo cache antigo.

- **Voltar da página de detalhes de um jogo não "recarrega" mais tudo.** Antes, navegar até um jogo (ou qualquer outra tela) destruía toda a árvore React da Home, então voltar disparava a reresolução de toda prateleira, todo card piscando pelo efeito shimmer, e toda hero art buscando de novo. Agora a árvore permanece viva enquanto a Home está invisível — quando você volta, tudo está exatamente onde você deixou, instantâneo.
- **"Adicionar à prateleira" realmente adiciona o jogo.** O "Adicionar à prateleira" do menu de contexto da biblioteca não estava tendo efeito — o appid estava sendo descartado silenciosamente porque não estava na fonte subjacente da prateleira. Jogos adicionados pelo menu agora aparecem no final da prateleira (e a pré-visualização os mostra com o novo marcador + azul).
- **O botão X em um card agora é sensível ao contexto.** Em um jogo que você adicionou manualmente → "Remover da prateleira" (o card desaparece). Em qualquer outro card → "Ocultar da prateleira" / "Mostrar na prateleira". A remoção incondicional anterior fazia cards ordenados manualmente voltarem para uma posição diferente quando você pressionava X.
- **O menu de contexto do card na biblioteca mostra os submenus do DS em todo jogo.** "Adicionar à prateleira" e "Remover da prateleira" agora aparecem em todo card na biblioteca nativa do Steam, não só nos cards dentro de prateleiras do DS. (A saída antecipada anterior acontecia em clientes Steam modernos que não expõem `_owner.pendingProps.overview.appid`.)
- **A hero art por prateleira aparece mais rápido**, especialmente em boots da Home com múltiplas prateleiras de hero. Várias otimizações: uma única descoberta compartilhada do tema ativo do CSS Loader (antes eram N varreduras paralelas, uma por prateleira de hero), observadores de mutação com limitação de taxa, decodificação de imagem assíncrona fora da thread principal, cache de imagem persistente (heroes que você já viu aparecem instantaneamente entre sessões), cross-fade curto.
- **Sem mais o flash do glifo de imagem quebrada antes de um card ou hero carregar.** A remoção do cache em memória não invalida mais a URL enquanto um card ainda a está usando (a revogação é adiada em 30s), e o cache agora tem o tamanho ajustado para Homes populadas (320 entradas em vez de 120). Os cards também percorrem a cadeia de URLs alternativas no momento da montagem e começam direto pela URL em cache, pulando os 1-2 404s locais inúteis que toda remontagem costumava pagar.
- **A Home não trava mais a thread da interface.** Uma tempestade de eventos de mutação (pulsos de shimmer, trocas de classe de foco, resoluções de rótulo) estava rodando o conjunto completo de instalações de patch de forma síncrona a cada evento — centenas de vezes por segundo em uma Home populada. Agora consolidado para no máximo uma vez por frame. A navegação parece visivelmente mais rápida.
- **Cards de decoração / sintéticos e jogos adicionados pelo menu aparecem corretamente em toda aba de pré-visualização** (antes só apareciam na aba Source). Todas as pré-visualizações agora são estritamente consistentes entre abas e tipos de prateleira.
- **Sem selo de desconto em prateleiras onde você já possui os jogos.** A pré-visualização agora combina com a Home: só prateleiras de wishlist / loja / compostas com filho online podem mostrar o selo de % de desconto.
- **Os itens do menu de contexto da biblioteca não aparecem mais duplicados** ("Adicionar à prateleira" 2× / "Prateleira" 2×) em certos jogos.

- **Prateleiras online não ocultam mais jogos que você de fato não possui.** Em dispositivos com muitos atalhos de cloud-play (catálogos de cloud-play apresentados via Unifideck, etc.), as linhas de wishlist / loja em promoção estavam comparando nomes contra essas entradas de nuvem e ocultando itens de wishlist que compartilham título com um jogo ao qual você tem acesso via assinatura mas não possui. A desduplicação baseada em nome agora respeita a mesma alternância "incluir jogos de cloud-play" que a desduplicação baseada em appid usa, e ignora diferenças de pontuação (então um título escrito com dois-pontos ainda corresponde de forma limpa ao mesmo título escrito sem eles).
- **Prateleiras de wishlist + loja com uma ordenação multi-chave baseada em preço.** A prateleira estava retornando zero jogos depois de uma mudança recente; agora ela ranqueia a linha inteira pela chave de preço primeiro (com a chave secundária como critério de desempate real) em vez de ordenar só o subconjunto local.
- **Prateleiras de filtro com ordenação multi-chave + reverso persistem corretamente.** Tanto as flags de reverso por chave quanto a uniforme chegam ao resolvedor para prateleiras de filtro de toda versão de schema.
- **O seletor de coleção no modal Edit Prateleira não fica mais vazio depois do boot do Steam.** Uma atualização de 30 segundos + uma nova busca local do modal preenchem o seletor assim que o Steam expõe os dados.
- **Alinhamento da linha de ação do QAM.** A linha `+ / import / export` acima de cada lista de prateleira agora mantém os botões da direita dentro da borda do QAM, independentemente da versão do Steam.
- **A pré-visualização do Edit Prateleira agora mostra os selos de desconto + NEW**, dimensionados para os cards menores de pré-visualização, nunca cortados no topo, e posicionados de forma limpa acima do indicador de foco.
- **Os selos das prateleiras na Home não tremem mais ao rolar.** O rastreamento de selo por frame foi removido; os selos se reancoram apenas em rolagem, redimensionamento, foco e perda de foco.

## [2.3.2] - 2026-05-27

### Added

- **Alternâncias separadas para as tags NEW e DISCOUNT** — globalmente (seção Visual do QAM) e por prateleira (aba Display do Edit Prateleira / Prateleira Inteligente e no menu por card). Agora você pode ocultar uma sem ocultar a outra.
- **A hero art atrás das prateleiras agora mostra um sutil placeholder de brilho enquanto carrega** (mesma aparência do brilho de shimmer do card de jogo), e uma resposta corrompida do CDN do Steam agora é tratada como falha de carregamento — então uma imagem quebrada nunca é pintada, nem por um instante.

### Fixed

- **A notificação de atualização volta a funcionar depois de você mesmo atualizar.** Antes, o cache diário podia "lembrar" da versão que você acabou de instalar e reportar silenciosamente "sem atualização" por até 24 horas. O notificador agora atualiza seu cache antes da verificação de boot (sempre que o Steam Deck está online), então uma versão nova aparece na próxima vez que o Steam iniciar. Desligar a notificação e ligar de novo no QAM (com rede) faz o mesmo — e agora também limpa qualquer versão dispensada anteriormente, então uma versão que você dispensou antes (ou clicou em dispensar por acidente) pode ressurgir. A verificação de boot também é adiada por alguns segundos para a rede ter tempo de subir.

## [2.3.1] - 2026-05-27

### Changed

- **Sem mais tag de desconto em jogos que você já possui.** O selo verde de % de desconto para de aparecer em cards da sua biblioteca — só jogos que você não possui (wishlist / loja) continuam mostrando o desconto.
- **A dica "Abrir opções" agora é traduzida.** O rótulo de ação ao lado do botão ⋯ em cada prateleira agora aparece no seu idioma em vez de inglês simples.
- **As dicas do botão X "Reordenar" / "Salvar ordem" na lista de prateleiras do QAM agora são traduzidas** em todos os 19 idiomas suportados, combinando com o resto do QAM.
- **Import / Export agora aponta para a pasta de Downloads correta no Bazzite e em outros sistemas não-SteamOS.** Os padrões pararam de assumir que a conta de usuário se chama `deck` — o modal abre no seu `~/Downloads` real, independentemente da distro ou nome de login.
- **A wishlist no Bazzite (Steam via Flatpak) agora funciona.** As buscas de cookie e ID de usuário do Steam agora também verificam `~/.var/app/com.valvesoftware.Steam/...`, então prateleiras baseadas em wishlist resolvem em sistemas que distribuem o Steam via Flatpak.

### Fixed

- **A atualização em uma prateleira agora mostra um leve escurecimento visual só naquela prateleira** — para você ver que o clique teve efeito mesmo quando o resultado em cache não mudou, sem a Home inteira piscar de uma vez.
- **Os cards não somem mais no meio de uma atualização em prateleiras online.** Cards que sobreviveram a uma atualização permanecem visíveis enquanto os novos metadados carregam, em vez de desaparecer e reaparecer momentaneamente ao rolar.
- **A entrada "Atualizar" por card em prateleiras online agora diz "Atualizar cache" — e já estava de fato limpando o cache.** O rótulo dizia "Atualizar", mas a ação subjacente era a mesma limpeza de cache usada pelo menu de prateleira do QAM. O rótulo agora combina com o que a ação faz.
- **Falha em prateleiras alimentadas por uma fonte de Filtro depois de um tempo.** Alguns resultados de filtro correspondem a jogos cuja arte inteira cai para um placeholder; esse caminho estava causando um erro de renderização do React depois de um tempo e travando a linha. Corrigido — os cards de placeholder agora renderizam de forma limpa sem nunca disparar o erro.

## [2.3.0] - 2026-05-24

### Added

- **Hero art atrás das suas prateleiras (#41).** Cada prateleira (regular ou smart) tem uma alternância "Ativar hero art" na aba Visual do modal de edição — ligue e a arte do jogo em foco aparece atrás daquela prateleira, acompanhando-a onde quer que ela esteja. Uma nova alternância global no QAM (seção Visual) liga a hero art para *toda* prateleira de uma vez.
- **Nome do jogo acima da prateleira, como o Recents nativo.** Com um tema do CSS Loader no estilo ArtHero ativo, cada prateleira em página inteira mostra o nome e as informações do jogo em foco acima da sua linha — o mesmo efeito que a prateleira de Recents nativa do Steam tem, e o rótulo acompanha o jogo em que você está.
- **Subalternância de cloud-play para as prateleiras online** (QAM Online Features + modal Edit Prateleira). Entradas de catálogo exclusivas de nuvem — como entradas de catálogo de cloud-gaming apresentadas via Unifideck — agora permanecem visíveis nas suas prateleiras de wishlist / loja em promoção por padrão, mesmo com "Incluir atalhos não-Steam" ativado. Jogos não-Steam instalados localmente (de outras lojas) continuam contando como possuídos. Ligue a nova subalternância se quiser que entradas exclusivas de nuvem também sejam tratadas como possuídas.
- **Integração de tema para suas prateleiras.** Temas instalados via CSS Loader agora chegam automaticamente às prateleiras promovidas do Deck Shelves: **No Hero Gradient** limpa a máscara da hero; **Hero Fullscreen / Art Hero FullBG** encaixa a prateleira em 100vh com a hero preenchendo a tela; **No Home Text** oculta os rótulos de card do DS (só sob "Forçar temas do CSS Loader"). **Transparency Tweaks** escurece os retratos de card sem foco; **Round / More Round** arredonda as tags NEW e de desconto.
- **"Forçar temas do CSS Loader" só aparece quando o CSS Loader está instalado.** Sem mais alternância morta em dispositivos sem o plugin.
- **Suporte ao tema Focus Highlight Color.** Instale o tema e o Deck Shelves se ajusta automaticamente: com Round Compatibility ativado, o foco do card do DS desaparece (combinando com o comportamento nativo do tema); sem ele, o contorno colorido animado aparece atrás do selo NEW / desconto com um espaçamento limpo de 1px em todos os lados.
- **Suporte ao tema Game Cover Shine Animation Color.** O brilho ao focar chega automaticamente aos cards do Deck Shelves — sem nenhuma configuração extra necessária.
- **Selos NEW / desconto sempre por cima.** Os selos agora renderizam em uma sobreposição separada acima de toda a interface, então permanecem na frente dos anéis de foco de tema e outras sobreposições do Steam, independentemente da combinação de tema.

### Changed

- **"Forçar temas do CSS Loader" agora se aplica a toda prateleira** — e funciona seja mantendo a linha nativa de Recents visível ou ocultando-a. Temas como ArtHero chegam a todas as suas prateleiras de forma consistente.
- **Filtro de possuídos online reescrito** para usar diretamente as coleções de biblioteca do próprio Steam, em vez de adivinhar por se o Steam tem metadados em cache para um jogo. Resultados de wishlist que o Steam por acaso conhece (porque você os viu na loja) não somem mais das suas prateleiras de "em promoção".
- **O tamanho da prateleira online respeita seu limite configurado.** O resolvedor agora busca uma margem acima do limite para que a prateleira ainda preencha até N jogos depois da filtragem de possuídos/nome, em vez de ficar abaixo do limite.
- **A contagem "encontrados X jogos" e a pré-visualização do modal Edit Prateleira agora combinam com a prateleira renderizada.** Alternar "Ignorar jogos que possuo" por prateleira ou a nova subalternância de cloud-play dentro do modal atualiza os dois imediatamente.
- **Descrições de subalternância online removidas** para o QAM e o modal Edit Prateleira parecerem menos poluídos. A alternância principal "Recursos online" ainda mantém sua descrição.

### Fixed

- **A hero art piscando brevemente e depois sumindo enquanto você navega entre cards com o d-pad** (com a alternância "Forçar temas" DESLIGADA). Suavizado.
- **"Forçar temas" com temas de hero em tela cheia — a hero da primeira prateleira não fica mais abaixo do cabeçalho.** Cada prateleira promovida agora preenche a viewport de forma limpa; a hero da próxima prateleira não espia mais na parte de baixo da que você está vendo.
- **Mesclagem de hero entre prateleiras refinada.** Com o recents oculto, a hero da primeira prateleira do DS alcança o topo da tela, e a transição para a segunda prateleira tem um fade mais sutil. Com o recents nativo visível, a hero da primeira prateleira do DS se sobrepõe ao nativo com um fade mais suave em vez de uma faixa preta entre as duas artes.
- **As tags NEW e de desconto agora arredondam sob os temas Round / More Round** — elas ficavam travadas em 0px de canto mesmo com o tema instalado.
- **Retratos de card sem foco respeitam "Transparency Tweaks"** (escurecidos sem foco, opacidade total quando focados). As tags NEW / desconto agora permanecem totalmente visíveis independentemente do estado escurecido do card.
- **Os rótulos de jogo não aparecem mais em todo card o tempo todo** — só ao focar, como antes.
- **O gradiente roxo de brilho da capa não trava mais em todo card.** "Game Cover Shine Animation Color" toca sua animação de foco como pretendido, em vez de deixar o gradiente visível em todo lugar.
- **A alternância "Ocultar cloud-play não-Steam" agora permanece como você deixou** em vez de voltar para desligada a cada reinício.
- **"Forçar temas do CSS Loader" e a alternância global de hero agora permanecem ativadas.** Elas estavam se perdendo a cada salvamento; corrigido.
- **D-pad para cima não faz mais a Home tremer / recarregar.** Pressionar para cima a partir da prateleira do topo costumava mergulhar na linha oculta de Recents e sacudir a tela — o foco agora permanece nas suas prateleiras.
- **Sem mais flash de prateleiras recarregando no primeiro movimento depois de um reinício do Steam.**
- **A hero art e o nome não mostram mais um jogo que você ocultou** (com "ignorar jogos que possuo" ativado) — eles seguem o primeiro jogo realmente mostrado.
- **Sair de uma prateleira mantém a hero art do último jogo** em vez de voltar de repente para o primeiro jogo.
- **Prateleiras online: o nome do jogo não fica mais travado como um "#número"** enquanto carrega — o nome real aparece assim que é buscado.
- **Forçar temas + ArtHero: as prateleiras não transbordam mais da tela.**
- **O menu de contexto da prateleira online agora mostra o nome do jogo** como título em vez de "Prateleira".
- **O tamanho do card destacado e o espaçamento de card do TiltedHome** estão corretos de novo com "Combinar tamanho de card nativo" ativado.
- **Atualizar funciona em cards de prateleira inteligente** a partir do menu de contexto por toque longo / Menu.

## [2.2.2] - 2026-05-15

### Fixed

- **"Usar prateleira como Recents (experimental)" não trava mais a biblioteca depois de um reinício do Steam (#60).** Com a alternância ativada, abrir a Library em um boot recente podia mostrar a página de erro do Steam (`An error occurred while rendering this content`). A injeção agora espera o catálogo de biblioteca do Steam ficar pronto antes de tocar na prateleira de recents, e só envia jogos que você realmente possui — entradas de wishlist / loja que você não possui são puladas automaticamente. Se sua primeira prateleira for uma prateleira de wishlist ou loja, o recents cai para a próxima prateleira visível em vez de tentar usar um jogo não possuído (o que causava a falha).
- **"Usar prateleira como Recents" se aplica sem precisar reiniciar o Steam.** Ligar a opção agora atualiza a prateleira de recents assim que o Steam terminar de carregar sua biblioteca — geralmente em poucos segundos — em vez de exigir um reinício para a troca ter efeito.

## [2.2.1] - 2026-05-14

### Added

- **"Ocultar jogos possuídos" em duas etapas — Steam primeiro, não-Steam opcional.** Tanto a alternância global (no QAM, em Additional Features) quanto a alternância por prateleira (em cada prateleira de wishlist / loja) agora revelam uma subopção quando ativadas: a alternância principal oculta jogos que você possui no Steam, e a subalternância também oculta atalhos não-Steam (jogos que você adicionou manualmente que compartilham nome com uma entrada da loja). Útil quando você quer uma wishlist limpa sem perder de vista jogos que só roda via um launcher.

### Changed

- **Prateleiras de wishlist / loja agora mostram jogos possuídos por padrão.** As alternâncias "Ocultar jogos possuídos" (global e por prateleira) começam desligadas — você verá sua wishlist ou lista da loja completa, incluindo jogos que já tem, a menos que opte por filtrar. Usuários existentes que já haviam ativado a alternância mantêm sua configuração.

### Fixed

- **A alternância global "Ocultar jogos possuídos" agora faz o que diz.** Ligá-la no QAM oculta corretamente jogos possuídos em toda prateleira de wishlist / loja, e desligá-la os mostra de novo. Antes a alternância global não tinha efeito visível — jogos possuídos ficavam sempre ocultos, não importa o quê. A subalternância para atalhos não-Steam também funciona corretamente agora e não se desliga mais sozinha depois de salvar.
- **A subalternância por prateleira "Incluir atalhos não-Steam" reflete na pré-visualização.** Ligá-la no editor de prateleira agora atualiza a pré-visualização imediatamente, combinando com o que a prateleira na Home vai mostrar.

## [2.2.0] - 2026-05-14

### Added

- **Seção "Additional Features" no QAM.** Extras do plugin inteiro agora vivem em sua própria seção recolhível (entre Behavior e Prateleiras) — Verificar atualizações e Recursos online (com subalternâncias para Wishlist / Ordenação por preço / Ocultar possuídos). O banner de notificação de atualização também se moveu para acima da chave principal de liga/desliga, então lembretes de atualização permanecem visíveis não importa qual seção você tenha recolhida.
- **Navegar / wishlist como uma prateleira — integração embutida com a Steam Store.** Ligue "Ativar recursos online" na nova seção Additional Features (desligada por padrão) e crie prateleiras alimentadas pela sua wishlist do Steam ou por jogos da Steam Store atualmente em promoção. Você verá primeiro o aviso de privacidade para saber exatamente o que o Deck Shelves acessa e com que frequência. Duas novas opções de ordenação permitem ordenar por **Preço (menor para maior)** ou **Desconto (maior para menor)**; quatro templates rápidos são adicionados: "Wishlist", "Wishlist em promoção", "Wishlist grátis" e "Grátis agora" (qualquer jogo Steam temporariamente grátis — wishlist não é necessária).
- **Exclua jogos que você já tem.** Alternância por prateleira em fontes de wishlist / loja. Ligue e a prateleira oculta qualquer jogo cujo nome exato combine com um título na sua biblioteca local — incluindo atalhos não-Steam que compartilham nome com uma entrada da Steam Store. Útil para prateleiras de "descoberta" onde você não quer ver o que já está na sua biblioteca.
- **Selos de desconto nos cards.** Cards em prateleiras online mostram um selo verde no canto (por exemplo, "75% off") sempre que o jogo está em promoção. O selo permanece visível mesmo em cards de placeholder (quando a arte ainda está carregando ou indisponível).
- **O botão A abre a página da Steam Store em cards de wishlist / loja.** Pressione A em qualquer card de uma prateleira de wishlist / loja e o Steam pula direto para a página da loja daquele jogo no navegador de sobreposição. "Ver mais" em uma prateleira de wishlist abre sua wishlist completa; "Ver mais" em uma prateleira de loja abre a página de Ofertas.
- **Ação de atualizar em toda prateleira.** Prateleiras online expõem "Atualizar cache" (limpa os caches de wishlist / preço e busca de novo); prateleiras aleatórias e smart expõem "Atualizar" (embaralha a fonte de novo). Disponível pelo menu de ações do QAM, pelo menu do card de prateleira, e pelo tile de atualização no final da linha.
- **A arte cai para mais variantes alternativas.** Jogos recém-lançados às vezes chegam à Steam Store antes de sua arte de retrato padrão ser gerada (alguns títulos recém-lançados motivaram isso). O plugin agora tenta um conjunto mais amplo de variantes do CDN do Steam (retratos em alta resolução, múltiplos tamanhos de cápsula, o cabeçalho paisagem) antes de cair para um placeholder de nome — e o placeholder ainda mostra o selo de desconto.
- **Página Sobre — nova aba "Online".** Documenta os recursos online do início ao fim: como ativar, o limite de privacidade, as fontes de wishlist + loja, os templates online, as ordenações de preço/desconto, a alternância "Excluir jogos possuídos", o selo de desconto e o comportamento de atualização / cache. Traduzido em todos os 19 idiomas.
- **Sua wishlist do Steam, como uma prateleira.** Ligue "Ativar recursos online" na seção Additional Features do QAM (desligada por padrão) e você pode criar uma prateleira que mostra sua wishlist da Steam Store — sincronizada automaticamente uma vez por dia. Você verá primeiro o aviso de privacidade para saber exatamente o que o Deck Shelves acessa e com que frequência. Duas novas opções de ordenação permitem ordenar a wishlist por **Preço (menor para maior)** ou **Desconto (maior para menor)**, e três templates rápidos são adicionados ao seletor de prateleira: "Wishlist", "Wishlist em promoção" e "Wishlist grátis". Prateleiras de wishlist mostram um pequeno ícone de globo ao lado do nome na lista do QAM para serem fáceis de identificar.
- **Os rótulos de ação de prateleira agora são mais claros.** As ações Ocultar / Mostrar / Excluir no menu do card de prateleira agora dizem "Ocultar prateleira", "Mostrar prateleira" e "Excluir prateleira" (traduzido em todos os 19 idiomas), então fica óbvio que se aplicam à prateleira e não ao jogo.
- **Notificações de atualização dentro do QAM.** O Deck Shelves agora verifica o GitHub uma vez por dia em busca de uma nova versão e mostra um pequeno banner no topo do painel do QAM quando uma está disponível, com links rápidos para ver a versão ou dispensá-la para essa versão. A verificação só roda quando você a tem ativada (alternância em Behavior; ligada por padrão), só quando você está online, e nunca atrapalha.
- **Atalho de clique direito / Menu nos cards de prateleira — `Deck Shelves > Shelf > …`.** Toque longo ou pressione o botão de menu em qualquer card das suas prateleiras para receber um submenu do Deck Shelves com **Editar · Duplicar · Recolher / Expandir prateleira · Ocultar / Mostrar · Mover para cima / Mover para baixo · Excluir** — as mesmas ações que você já tem na lista do QAM, disponíveis bem onde você está.
- **Mais entradas no estilo nativo no menu alternativo.** Quando o Deck Shelves não consegue extrair o menu nativo completo do Steam (builds mais antigos, configurações incomuns), o menu alternativo agora também mostra **Verificar integridade dos arquivos instalados**, **Desinstalar** e **Ver capturas de tela** junto com Jogar / Propriedades / Ver Detalhes — as mesmas chamadas `SteamClient` que o Steam usa, então o comportamento combina com o menu nativo.
- **Três novas opções de "Ordenar por".** O seletor de ordenação no editor de prateleira agora inclui **Status do App** (Rodando / Instalando / Baixando primeiro), **Compatibilidade com o Deck** (Verified → Playable → Unsupported → Unknown) e **Suporte a controle** (Total → Parcial → Nenhum). Todas as três suportam a alternância ascendente / descendente já disponível para outras ordenações.

### Fixed

- **A pré-visualização do modal de edição agora combina com a prateleira na Home — revisão completa.** Uma pilha de pequenas diferenças entre a pré-visualização e a prateleira real na Home foram eliminadas nesta versão: trocar de aba não deixa mais a pré-visualização mostrando a contagem antiga de jogos; os tiles "Ver mais" e de atualizar agora seguem as mesmas regras da prateleira na Home e aparecem na ordem certa (atualizar, depois "Ver mais"); cards de placeholder só com nome deixam de ultrapassar seus vizinhos; os tiles "Ver mais" / atualizar não roubam mais o foco do gamepad; a margem azul/cinza fraca ao redor de cards destacados sumiu; o destaque de foco agora abraça a imagem em vez de flutuar ao redor dela; nomes de jogo e tempo de jogo só aparecem no card em foco (combinando com a Home); os tamanhos de card permanecem consistentes quando você muda para ordenação manual, o seletor de destaque ou o seletor de jogos ocultos. O tile de Atualizar na pré-visualização também agora realmente reresolve a prateleira (prateleiras aleatórias / smart embaralham visivelmente), com um escopo de cache que não perturba suas prateleiras salvas na Home.
- **O foco retorna ao jogo certo ao sair da página de um jogo.** A tela inicial não volta mais o foco para o primeiro jogo quando você sai da visualização de um jogo — ele permanece no card de onde você veio, mesmo com "Mostrar arte de fundo da primeira prateleira" desligado (o que costumava ser uma solução alternativa).
- **Filtro de Coleção — comportamento melhor e mais fácil de configurar.** Duas melhorias emparelhadas: (1) prateleiras com um filtro de Coleção não misturam mais entradas aleatórias da biblioteca quando o nome da coleção não resolvia para nenhum jogo (reportado no Bazzite — resultado vazio agora é visível em vez de vazar a biblioteca inteira); (2) o campo agora é um dropdown preenchido com suas coleções reais do Steam (mesma fonte do seletor de Source), então buscas por nome são completamente evitadas. A alternância de inversão também está disponível agora para filtros de Coleção — útil para prateleiras de "tudo, exceto esta coleção".
- **Correção de emergência da confiabilidade de salvamento das configurações.** Uma regressão nesta atualização podia fazer prateleiras "sumirem" na próxima carga (na verdade elas eram silenciosamente redefinidas para o padrão porque as novas configurações do notificador de atualização eram rejeitadas pelo carregador). Corrigido antes do lançamento; prateleiras existentes são preservadas.
- **prateleiras inteligentes agora respeitam "Combinar tamanho nativo" na primeira aparição.** Antes, uma prateleira inteligente podia renderizar no tamanho de card padrão quando era montada mais tarde do que o resto (por exemplo, prateleiras inteligentes com janelas de visibilidade), mesmo com a alternância global "Combinar tamanho nativo" ativada. Agora elas assumem as dimensões nativas já no primeiro frame.
- **O filtro `appStatus = running` detecta jogos em execução prontamente — e não há mais um "vão vazio" de carregamento entre prateleiras.** Duas correções emparelhadas para a mesma área. O plugin agora assina o evento de lançamento de jogo do Steam e relê o estado ao vivo imediatamente (com debounce de 1,5s para que a sequência multi-evento de lançamento se consolide em uma única atualização) — prateleiras de Rodando atualizam sem esperar a sondagem de 30 segundos. E o spinner transitório que costumava piscar entre prateleiras a cada atualização (visível como uma faixa vazia de 30px) agora fica reservado só para a primeira carga; atualizações seguintes mantêm o conteúdo anterior visível até os novos metadados chegarem.
- **Menu do card de prateleira — a entrada `Deck Shelves` aparece de forma confiável no menu nativo (do SteamOS 3.5 ao 3.9).** Toque longo ou pressione o botão de menu em qualquer card das suas prateleiras e o menu nativo completo do Steam (Jogar, Gerenciar, Propriedades, conquistas, amigos jogando, etc.) agora abre com o submenu do Deck Shelves anexado no final — sem substituir as entradas nativas. Vários problemas empilhados estavam ocultando silenciosamente o submenu: o carregador do pacote não conseguia encontrar as ações do menu; o Steam moderno envolve o menu de contexto em um memo / wrapper de função fina que ocultava a classe real que nossa injeção precisava corrigir; os rótulos do menu estavam lendo da instância i18next errada e caindo para inglês. Todos foram resolvidos, além de um caminho de injeção paralelo que corrige a classe de menu do Steam diretamente na montagem do plugin como uma rede de segurança para futuras mudanças na interface do Steam. O menu alternativo do DFL (quando o nativo não pode ser alcançado) também foi enriquecido com Verificar integridade / Desinstalar / Ver capturas de tela para combinar mais de perto com o menu nativo.

## [2.1.1] - 2026-05-09

### Added

- **O D-pad agora para em prateleiras recolhidas.** A navegação vertical com o D-pad agora leva o foco para a linha "+ Título" de uma prateleira recolhida em vez de pulá-la. Pressione A para expandir. Clique com mouse / toque continua alternando como antes.
- **Inglês britânico e francês canadense.** O plugin agora suporta `en-GB` (inglês britânico — "Favourites", etc.) e `fr-CA` (francês canadense — acentos corrigidos e vocabulário canadense). Ambos são selecionados automaticamente com base no idioma do sistema do Steam Deck.
- **Chinês tradicional** (`zh-TW`) traduções adicionadas.
- **Filtro por status do app.** Novo tipo de filtro com quatro alternâncias: **Baixando / Atualizando** (atualização em progresso ativo), **Na fila / Pausado** (atualização pendente mas ainda não em execução), **Instalando** (primeira instalação), **Rodando** (lançando ou jogando no momento). A seleção padrão é ambos os estados de download, habilitando uma prateleira de "Fila de Downloads" pronta para uso. Estende o filtro booleano existente "Atualização pendente" com granularidade por estado.

### Fixed

- **Janela do selo "New" corrigida para 14 dias.** O filtro do selo usava 30 dias internamente enquanto o renderizador de prateleira já usava 14 — agora ambos combinam, consistentes com o selo nativo do Steam de "novo na biblioteca".
- **Hero art não restaurava depois de voltar de um jogo.** A capa podia ficar presa mostrando o último jogo jogado em vez de atualizar quando você voltava para a Home. Corrigido.

## [2.1.0] - 2026-05-08

### Added

- **Filtro por tipo de atalho.** Novo tipo de filtro no editor de prateleira: escolha quais tipos de entradas de biblioteca incluir — **Jogos** (jogos Steam), **Software** (apps Steam como apps de streaming), **Ferramentas** (Proton, runtimes, redistribuíveis), ou **Links não-Steam** (atalhos adicionados fora do Steam). Misture e combine; cada tipo tem sua própria alternância.
- **Desduplicar por nome exato.** Nova alternância na aba Display de cada prateleira (e uma contraparte global nas configurações). Quando ativada, se duas entradas compartilham um nome exato, só uma é mantida — Steam vence sobre atalhos não-Steam.
- **Oculte jogos manualmente por prateleira.** Nova alternância "Ocultar jogos específicos" (última entrada na aba Display) revela um mini-seletor de cards onde você toca em um jogo para excluí-lo daquela prateleira. A prateleira ainda mira no número configurado de jogos visíveis — extras são buscados automaticamente para preencher a lacuna.
- **Restrinja fontes de coleção e tab com filtros.** Quando a fonte de uma prateleira é uma coleção ou uma tab de biblioteca, uma aba dedicada **Additional Filters** aparece no editor de prateleira com um painel de filtro completo — mesmas opções da aba Filters normal, aplicadas em cima dos resultados da fonte (por exemplo, fonte = coleção Favorites, refinado para só instalados).
- **Agenda por dia para prateleiras inteligentes.** Uma nova alternância **Permitir agenda por dia** na aba Smart Filters abre uma aba dedicada **Overrides** onde você pode definir faixas de horário diferentes para dias específicos da semana — por exemplo, "10:00–12:00 nas seg/qua/sex mas 18:00–22:00 nos fins de semana". A aba Overrides mostra um resumo dos dias/horas configurados no topo e editores de faixa de horário por dia da semana abaixo. As configurações básicas de visibilidade (restringir por hora, faixas de horário padrão, dias da semana) agora ficam na parte de baixo da própria aba Smart Filters.
- **Pré-visualização ao vivo de como cada prateleira renderiza.** A área de pré-visualização em ambos os editores de prateleira agora mostra cards reais como aparecem na Home: arte da capa, **nome do jogo**, **linha de status** (tempo de jogo / instalação / atualização), **selos de nível de compatibilidade** (Verified / Playable / Unsupported), e o selo **New** — com o **título da prateleira** acima e os tiles finais **Ver mais** / **Atualizar** onde aplicável. Toda alternância da aba Display atualiza a pré-visualização instantaneamente, então você pode ver o efeito de "ocultar ícones de compatibilidade" / "ocultar nomes de jogo" / etc. enquanto você as alterna.

### Changed

- **Modais de edição — área de conteúdo mais alta.** Os modais de edição estão ~60–80px mais altos e o conteúdo rolável das abas tem espaço extra correspondente, então configurar uma prateleira com muitos filtros ou parâmetros de prateleira inteligente não parece mais apertado.
- **Carregamento de prateleira mais rápido depois de um reinício do Steam.** As buscas de metadados por jogo de cada prateleira agora rodam em paralelo em vez de sequencialmente. Em um cache frio (típico logo após reiniciar o Steam), isso reduz o tempo de população de "N jogos × latência por chamada" para aproximadamente "a chamada única mais lenta", então arte / tempo de jogo / status aparece com muito menos efeito escada.

### Fixed

- **Prateleiras com janelas de horário agora somem na hora certa.** Uma combinação de um cache de resolução de 60 minutos e uma etapa de rerenderização ausente podia manter uma prateleira visível por até uma hora depois do fim da janela configurada. A visibilidade agora é reverificada imediatamente no limite, os caches são esvaziados, e modos com lógica de horário embutida (por exemplo, Spare Time) também são cobertos mesmo quando nenhuma agenda explícita está definida.
- **Dias da semana — seleção vazia agora avisa em vez de significar silenciosamente "todo dia".** Quando você desmarca todos os 7 chips de dia da semana, o seletor mostra um aviso laranja de que a prateleira não vai aparecer. O padrão para novas prateleiras continua sendo todos os 7 dias marcados.

## [2.0.1] - 2026-05-06

### Added

- **Cancelar realmente cancela — para todo template.** Adicionar uma prateleira a partir de qualquer entrada do seletor (Blank, todo template regular, todo template smart, Custom) agora abre o editor contra um rascunho — nada é criado na sua lista de prateleiras até você pressionar **Salvar**. Fechar o modal ou pressionar Cancelar descarta o rascunho, então os antigos restos de "New prateleira vazia" não aparecem mais depois de navegar pelos seletores.
- **Alternâncias de ocultação por prateleira para "Ver mais" e o tile de atualizar.** Duas novas alternâncias na aba Display de cada prateleira e contrapartes globais na seção Visual do QAM. A prateleira ainda recalcula / atualiza na sua cadência normal; só o card final visível é suprimido.
- **Alternância de direção de ordenação.** Cada dropdown de ordenação nos editores de prateleira e prateleira inteligente agora tem um pequeno botão **↓ / ↑** ao lado, que alterna entre descendente (a ordem natural) e ascendente. Oculto para **Manual** e **Random**, onde direção não tem significado.
- **Ícones nos botões de template Steam Cloud e Deck Verified** no seletor de templates de prateleira (☁️ e 🛡✓), combinando com o estilo visual das outras entradas de template.

### Changed

- **Até 50 cards por prateleira.** O controle deslizante de limite por prateleira agora vai até 50 tanto no editor regular quanto no de prateleira inteligente.
- **A tag "New" combina com a nativa.** Temas que recolorem o selo nativo do SteamOS "Novo / New" (Colored Toggles, Obsidian, Outrun, etc.) agora tingem nosso selo na mesma cor automaticamente — sem configuração extra. Sem um tema, ele permanece no azul nativo do Steam.
- **Random não é mais oferecido como ordenação base sob ordem manual.** Ordem manual + random reembaralhava a prateleira a cada renderização, derrotando a ordenação explícita. Prateleiras existentes que tinham essa combinação mantêm seu valor salvo; a opção só fica oculta no dropdown.
- **Menos ruído de Proton / runtime nas prateleiras inteligentes.** Quick Play, Deck Picks, Rediscover e On Deck agora pulam entradas que não são jogos (Proton, Steam Linux Runtime, redistribuíveis, ferramentas), então as prateleiras apresentam jogos de verdade mesmo quando sua biblioteca tem muitas instalações gerenciadas pelo sistema.

### Fixed

- **O filtro Merge é editável de novo.** Escolher **Merge** como tipo de filtro agora abre um painel interno onde você pode adicionar, remover e reordenar seus filtros filhos e escolher seu próprio modo AND/OR. Aninhar Merge dentro de Merge também funciona — útil para "Steam instalado **ou** qualquer atalho não-Steam" em uma única prateleira.
- **Atalhos do Unifideck não contam mais sempre como instalados.** Atalhos registrados pelo Unifideck costumavam reportar como instalados mesmo quando o app subjacente não estava no disco. O plugin agora verifica a coleção `[Unifideck] Installed` (com tamanho em disco e último jogo como alternativas) para que o filtro **Instalado** e os indicadores reflitam a realidade.

## [2.0.0] - 2026-04-30

### Added

- **prateleira inteligente personalizada.** Nova entrada "Custom / Blank" no topo do seletor de templates de prateleira inteligente. Monte uma prateleira inteligente do zero com seus próprios filtros e ordenação — a mesma flexibilidade de uma prateleira regular, mas vivendo na seção de prateleira inteligente.
- **Visibilidade por horário do dia para prateleiras inteligentes.** Cada prateleira inteligente agora pode se restringir a uma ou mais faixas de horário (por exemplo, mostrar as escolhas de "Spare Time" entre 06–09, 12–14 e 19–22) e/ou a dias específicos da semana. Adicione quantas faixas quiser com o botão **+ Adicionar faixa**; remova faixas individuais com o botão ✕. Os chips de dia da semana e os controles de faixa são totalmente navegáveis pelo gamepad (D-pad esquerda/direita entre os seletores de horário e ao longo da linha de 7 dias). Prateleiras Spare Time vêm pré-populadas com suas janelas embutidas; prateleiras Time of Day mostram os limites internos de horário como contexto informativo. Os dias vêm todos marcados por padrão — desmarque os que você quer excluir (uma seleção vazia significa "nunca visível"). As mudanças de visibilidade acontecem exatamente no limite — sem sondagem.
- **Mais controles por template de prateleira inteligente.** Toda prateleira inteligente que antes fixava um filtro de compatibilidade com o Steam Deck (Quick Play, Deck Picks, Rediscover, On Deck, Spare Time, Long Session, Best Unplayed, Not Started, Interrupted) agora expõe um dropdown **Compatibilidade com o Deck** no editor — escolha "Qualquer / Unsupported e acima / Playable e acima / Só Verified" por prateleira. Spare Time também ganha um campo **Tempo máximo de jogo** (antes fixo em 120 min). Valores de tempo de jogo agora são editáveis como campos numéricos em vez de sliders, para um controle mais fino.
- **Nova aba "Smart filters"** no editor de prateleira inteligente agrupa o ajuste específico do modo (parâmetros, janela de visibilidade, filtro de dia, limites de horário do dia) para que a aba Source permaneça focada no básico (título, ordenação, limite, intervalo de atualização). A antiga aba "Filters" agora se chama "Additional filters" e a alternância que a controlava foi removida — adicionar linhas de filtro já é suficiente.
- **Centralização da pré-visualização de ordenação manual corrigida.** Ao reordenar um card para a esquerda na linha de pré-visualização de destaque/ordenação, o card ocasionalmente rolava para fora da borda esquerda. Agora ele permanece centralizado em ambas as direções.

- **Sem mais dropdowns vazios.** Os seletores de fonte (coleção / tab de biblioteca / externa) e o seletor de ordenação de prateleira inteligente agora sempre mostram um valor: o correspondente quando existe um, ou um placeholder localizado de "Selecionar" quando nenhuma opção carregou ainda. A ordenação de prateleira inteligente tem como padrão um valor sensato por modo (recente / tempo de jogo / aleatório / alfabético) em vez de um opaco "usar padrão".

## [1.6.3] - 2026-04-29

### Added

- **Card de atualizar em prateleiras com ordenação aleatória.** Prateleiras que você definiu como ordem **Random** agora ganham um tile de Atualizar no final da linha — clicar nele reembaralha só aquela prateleira com uma rápida animação de giro. Espelha como prateleiras inteligentes como Roleta e Hora do dia já funcionam; o tile de atualizar só aparece onde o resultado pode realmente mudar entre dois cliques.
- **Ocultar nomes de jogo (por prateleira e global).** Nova alternância na aba Display de cada prateleira e na seção Visual do QAM. Quando ativada, o nome do jogo desaparece dos cards — só a arte (e opcionalmente o tempo de jogo / linha de status) é mostrada. Útil para configurações com muito tema onde a arte já carrega o título.
- **Ocultar indicador de instalação (por prateleira e global).** Nova alternância que oculta os ícones de instalação / download / atualização / jogar na linha de status enquanto mantém o tempo de jogo visível. Use junto com **Ocultar linha de status** para uma grade de cards mais limpa, ou sozinha para manter o tempo de jogo mas remover o ícone de estado de instalação.

### Fixed

- **O menu de contexto de jogo volta a funcionar no SteamOS 3.7.21.** O plugin agora detecta a versão do sistema operacional e volta para a detecção de menu mais simples usada em versões mais antigas ao rodar no SteamOS 3.7 ou anterior — com o fluxo moderno mantido intacto para 3.8 / 3.9. O menu alternativo (Jogar / Propriedades / Ver Detalhes) é o mesmo em toda versão, então mesmo se a detecção de menu falhar, o botão MENU sempre apresenta algo utilizável.

## [1.6.2] - 2026-04-28

### Added

- **Três novos templates de prateleira aparecem na documentação Sobre → Prateleiras.** Steam Cloud, Deck Verified e Top Reviewed agora têm descrições adequadas no seu idioma — os templates em si chegaram antes; isso completa o texto de ajuda nos 16 idiomas suportados.
- **Traduções mais limpas na documentação de prateleiras inteligentes.** As linhas "Sort: alphabetical / Sort: last session / …" que apareciam em inglês em todo idioma não inglês agora estão traduzidas, além dos rótulos de parâmetro de prateleira inteligente (Dias atrás, Tempo de jogo mín/máx, Intervalo de atualização, etc.) e nomes de categoria (Diário, Descoberta, Pronto para o Deck, Vale Tudo).
- **Ocultar título da prateleira (por prateleira e global).** Nova alternância na seção Visual do QAM e dentro da aba Display de cada prateleira — quando ativada, o bloco de título da linha desaparece e a linha de cards permanece visível independentemente do estado de recolhimento. Útil para configurações com muito tema onde o título da linha duplica arte que já está no card.
- **Sobre → Saiba mais.** Nova seção na página Sobre com botões **GitHub** e **Reportar problema / pedir recurso** (o D-pad navega entre eles lateralmente), além de um link inline **Outras versões** no rodapé de versão apontando para a página de lançamentos.
- **Ícones mais leves e amigáveis no QAM e nos modais de edição.** Filters, Display, Sort, Prateleiras Inteligentes, Saved Filters, About, Behavior, Prateleiras, os cabeçalhos de seção Visual Global ganharam ícones combinando no estilo pena; Source / Visual / Overview / How to / Prateleiras docs permaneceram intencionalmente sem ícone.

### Changed

- **Traduções revisadas em todos os 16 idiomas.** Removidas 20 chaves não usadas (strings de tradução que não combinavam mais com nenhuma superfície de interface) e traduzidas 380 strings que haviam ficado em inglês em idiomas não ingleses. Os arquivos de idioma agora estão ordenados alfabeticamente para diffs estáveis.

### Fixed

- **O template "Jogados recentemente" agora abre com a fonte correta no modal de edição.** Um id de tab errado ("recent" — nunca exposto pelo Steam) fazia o campo de fonte cair para a primeira opção disponível sempre que você abria o modal. O template agora usa uma fonte de filtro ordenada por recente. Prateleiras existentes afetadas são migradas automaticamente na primeira vez que você abre o plugin depois desta atualização.
- **A pré-visualização de mini-card não corta mais o contorno verde de seleção nem o brilho de foco.** A borda inferior de cards em foco no seletor de destaque / linha de ordenação manual ficava cortada pela borda de overflow do container ao redor; as linhas de pré-visualização agora rolam o card em foco totalmente para a área visível.
- **O rótulo de hero do ArtHero se alinha com a borda esquerda do card em foco.** Um piso de 40px no deslocamento de posição do rótulo o empurrava 16px para a direita quando a linha ficava perto da borda da tela — resolvido agora.

## [1.6.1] - 2026-04-27

### Added

- **API do plugin v2.** Outros plugins agora podem estender o Deck Shelves em tempo de execução — registrando fontes de prateleira personalizadas, templates de prateleira inteligente, tipos de filtro, opções de ordenação, formatos de importação e filtros salvos pré-configurados. Qualquer coisa que eles registrem fica disponível em todo lugar onde naturalmente apareceria (dropdowns do editor de prateleira, seletor de prateleira inteligente, resolvedor de filtro). Contratos somente leitura também são expostos para plugins que queiram consumir o estado do Deck Shelves no futuro. Guia completo e exemplos trabalhados em `docs/plugin-api.md`.
- **Compatibilidade com CSS Loader (família ArtHero).** Quando o recents nativo está oculto e um tema do CSS Loader está ativo, a primeira prateleira agora está conectada ao estilo de recents do tema — temas que pintam uma hero ou reestilizam o bloco de recents agora fluem para a prateleira promovida sem quebrar o estilo do plugin. Com o ArtHero especificamente, o nome e o status do jogo em foco agora aparecem acima da linha combinando exatamente com o ArtHero nativo (tamanhos de fonte, ícone de status oculto quando o jogo está instalado e atualizado, o rótulo acompanha o tile em foco horizontalmente enquanto você rola). A imagem da hero segue só o card em foco na primeira prateleira/promovida — focar cards em prateleiras abaixo não sequestra mais a hero — e atualiza instantaneamente quando o ArtHero é ligado/desligado sem precisar reiniciar o Steam.
- **Compatibilidade com TiltedHome.** Quando um tema do CSS Loader define um ângulo de inclinação (TiltedHome / Renaissance), o card inteiro da prateleira inclina como um paralelogramo — imagem, rótulo, brilho de foco, card de "ver mais" e card de "atualizar" todos participam. O card em foco se destaca com o levantamento de escala nativo mais a inclinação; os cards se sobrepõem visualmente como no TiltedHome nativo, sem precisar de espaço artificial entre eles. Zero sobrecarga quando nenhum tema está ativo.
- **Card de atualizar em prateleiras inteligentes.** prateleiras inteligentes cujo resultado pode realmente mudar entre cliques (Roleta, Hora do dia, Tempo livre, Jogados recentemente) agora terminam com um card **Atualizar** em vez de "ver mais na biblioteca" — clicar nele reresolve só aquela prateleira com uma rápida animação de giro. prateleiras inteligentes cujo resultado é determinístico (Daily Pick, Quick Play, Deck Picks, Best Unplayed, etc.) descartam o card final por completo, para você não tocar em um botão que não mudaria nada.

### Changed

- **A promoção de "primeira prateleira" é mais confiável.** Quando o recents nativo está oculto e a primeira prateleira na sua configuração resolve para zero jogos, o slot agora pula para a próxima prateleira na sua ordem de configuração — sem que o título da prateleira vazia reivindique nominalmente o slot. A mesma lógica também mantém o mesmo candidato mesmo quando uma prateleira não-Steam por acaso carrega mais rápido que uma do Steam — sua prateleira do topo pretendida vence, independentemente de qual terminou de resolver primeiro.
- **Modais de edição se ajustam ao tamanho da tela.** As abas Source, Filters, Visual e Display agora ajustam sua área de conteúdo à viewport (até 720px de altura em telas grandes, ~410px no Steam Deck) em vez de serem cortadas fixamente em 410px. Campos no estilo Decky não são mais cortados na borda direita de abas roláveis (Source / Visual) em telas maiores — o conteúdo se alinha com as abas não roláveis (Filters / Display).

## [1.6.0] - 2026-04-24

### Added

- **Salve e reutilize filtros.** Monte uma combinação de filtro dentro da aba Filters de uma prateleira, nomeie-a e aplique-a a qualquer outra prateleira depois — os filtros salvos vivem em sua própria seção recolhível no Quick Access Menu, onde você pode renomear ou excluir.
- **Edite prateleiras inteligentes.** As prateleiras inteligentes (Quick Play, Deck Picks, Daily Pick, etc.) finalmente podem ser personalizadas. Sobrescreva a ordenação embutida com qualquer uma das ordens padrão (alfabética, tempo de jogo, data de lançamento, nota de avaliação…), estreite o pool de candidatos com filtros extras, e ajuste as mesmas opções visuais das prateleiras regulares (destacar primeiro, destacar todos, ocultar selos, etc.).
- **Escolha sua ordem para prateleiras de ordenação manual.** Quando você define uma prateleira como ordem manual, um novo dropdown permite escolher a ordenação base para os jogos que você não posicionou explicitamente — então jogos não posicionados podem cair em ordem de tempo de jogo, data de lançamento, ou qualquer outra ordem que você preferir, não só alfabética.
- **Arraste prateleiras pelo título na tela inicial.** Segure o título de uma prateleira por cerca de um terço de segundo com mouse ou toque e arraste para uma nova posição. A navegação por D-pad não é afetada, prateleiras inteligentes são excluídas (sua posição é controlada pela alternância "no final").
- **Arraste prateleiras no painel do QAM também.** Segurar e arrastar agora funciona junto com os botões existentes de mover para cima / mover para baixo — use o que for mais rápido para você.
- **Templates agrupados por categoria.** Tanto o seletor normal quanto o de prateleira inteligente agora organizam os templates em categorias recolhíveis (Por Status, Por Tempo, Por Compatibilidade, Por Plataforma, Outros), para encontrar o que você quer mais rápido.
- **Destaque jogos específicos.** Uma prateleira pode destacar qualquer conjunto de jogos individuais, não só o primeiro ou todos. Ative "Destacar jogos específicos" na aba Visual e marque os que você quer — uma pré-visualização ao vivo mostra exatamente como a prateleira vai renderizar.
- **Filtros de saves na nuvem e suporte a controle.** Dois novos tipos de filtro permitem restringir prateleiras a jogos com Steam Cloud ou suporte a controle parcial/total.

### Changed

- **O conteúdo do modal não é mais cortado nas laterais.** Dropdowns, alternâncias e linhas de pré-visualização dentro dos modais de edição agora usam o mesmo ritmo horizontal dos campos nativos do Decky — o conteúdo se alinha de ponta a ponta em vez de ser cortado.
- **As linhas de pré-visualização permanecem centralizadas quando você move cards.** Clicar em uma seta em um mini-card na linha de ordenação manual recentraliza suavemente o card deslocado, e alternar um card para destacado na pré-visualização de destaque o recentraliza quando seus vizinhos se reorganizam.
- **As prateleiras na Home são mais rápidas.** As prateleiras agora pulam rerenderizações desnecessárias quando configurações não relacionadas mudam, então a Home permanece ágil quando você alterna algo no QAM. Timers de segurança em segundo plano rodam com menos frequência (4× menos ativações no patch de navegação da Home), economizando um pouco, mas de fato, de bateria durante visualização ociosa.
- **As prateleiras não tremem mais com resultados desatualizados.** Mudar rapidamente as configurações de uma prateleira — alternar a ordenação para lá e para cá, editar um filtro — não deixa mais uma resolução anterior lenta sobrescrever uma mais nova. Só o resultado mais recente é renderizado.
- **Prateleiras regulares e prateleiras inteligentes compartilham a mesma experiência de edição.** Mesmas abas, mesmos controles visuais, mesmo comportamento de pré-visualização — você só vê o que é relevante para cada tipo de prateleira.
- **Layouts do seletor de templates + importação do TabMaster.** Grades de 2 colunas mais limpas; entradas nativas do Steam na importação do TabMaster agora mostram um logo do Steam para serem fáceis de identificar.
- **Mais opções de ordenação para todo tipo de prateleira.** Ordene por alfabética, última sessão, tempo de jogo, data de lançamento, tamanho em disco, Metacritic, nota de avaliação Steam, adicionado recentemente, ou aleatório — não importa se a prateleira é de uma coleção, uma tab de biblioteca, ou um filtro.

### Fixed

- **O botão de menu volta a responder depois de um reinício do Steam Deck** (issue #25). O botão agora abre o menu de contexto do jogo de forma confiável a cada toque, mesmo na primeira tentativa depois de um boot frio. O menu alternativo mais simples (Jogar / Propriedades / Ver Detalhes) aparece quando o menu nativo completo não está disponível na sua build do SteamOS; se você abrir um menu nativo do Steam em outro lugar, o menu real fica disponível automaticamente para os próximos toques.
- **Sem mais inclinação visual ao rolar para BAIXO além da última prateleira** quando você tem as tabs da Home ocultas.
- **A ordenação base manual realmente tem efeito** em prateleiras baseadas em filtro — antes a ordem base silenciosamente caía para alfabética nessas.
- **Traduções ausentes.** Todo o texto novo desta versão está traduzido em todo idioma suportado (en-US, pt-BR, pt-PT, es-419, es-ES, de-DE, fr-FR, it-IT, ja-JP, ko-KR, nl-NL, pl-PL, ru-RU, tr-TR, uk-UA, zh-CN).
- **Uma prateleira recolhida permanece recolhida quando perde o slot de recents nativo.** Se você havia recolhido manualmente uma prateleira e então ligava "Ocultar jogos recentes" (o que promove aquela prateleira a ser a primeira na Home), a prateleira ficava recolhida para sempre depois — seu estado lembrado estava sendo sobrescrito. Agora a prateleira só é forçada a expandir enquanto detém o slot; sua escolha original de recolhida/expandida é restaurada assim que ela se move para baixo.
- **O slot de "primeira prateleira" agora promove a primeira prateleira que realmente mostra jogos.** Se sua prateleira do topo é um filtro que às vezes resolve para zero jogos (por exemplo, "Jogos aguardando atualização"), o slot costumava ficar vazio e a próxima prateleira populada abaixo permanecia recolhida. O slot agora se realoca automaticamente para qualquer prateleira que seja a primeira na tela, expandindo-a e travando-a até outra prateleira tomar seu lugar.

## [1.5.3] - 2026-04-22

### Added

- **Páginas dedicadas de Prateleiras Inteligentes e Sort em Sobre.** A documentação dentro do plugin agora tem abas separadas para todos os 15 templates de prateleira inteligente (agrupados por categoria com notas de ordenação/horário) e todos os 8 modos de ordenação.
- **Botão de menu em cards de sobreposição.** Com "Usar prateleira como Recents" ativo, pressionar o botão de menu/opções em um card em foco agora abre o menu de contexto do jogo.
- **A sobreposição se recupera sozinha.** Se a sobreposição falha ao entrar em ação em um boot frio ou depois de dormir, timers de inicialização mais longos, uma atualização a cada 2 minutos, e um gancho de retomada de suspensão tentam a injeção automaticamente de novo.

### Fixed

- **A hero art acompanha o jogo em foco atual** quando jogos são substituídos na sobreposição — sem mais fundo remanescente do jogo focado anteriormente.
- **Transições de foco mais suaves em cards de sobreposição.** Callbacks de renderização empilhados estavam quebrando o cross-fade nativo; eles não empilham mais.
- **O menu de contexto se recupera de erros de renderização no SteamOS 3.9.** Se a renderização falha, o componente de menu em cache é limpo para que o próximo toque reextraia contra o pacote atual.
- **As seções recolhíveis do QAM mostram um destaque de foco adequado** ao navegar com um gamepad.

## [1.5.2] - 2026-04-21

### Added

- **Ordenação para todo tipo de prateleira.** O dropdown de ordenação completo (alfabética, última sessão, tempo de jogo, data de lançamento, tamanho em disco, Metacritic, nota de avaliação Steam, adicionado recentemente, aleatório) agora está disponível para prateleiras de coleção, tab e externas — não só para prateleiras de filtro.
- **Ordenação aleatória.** Embaralha os jogos de uma prateleira a cada resolução.
- **A contagem de "Me Surpreenda" fica visível no rótulo do slider do QAM** — por exemplo, "Me Surpreenda (3)" — então você lê a contagem configurada sem abrir o slider.
- **Escolha qualquer prateleira como substituta do recents nativo.** Com "Usar prateleira como Recents" ativado, agora você pode escolher uma prateleira específica em um dropdown em vez de sempre pegar a primeira visível.
- **"Destacar primeiro" respeita sua alternância de sobreposição.** Quando uma prateleira alimenta o recents nativo, o primeiro card em tamanho hero agora respeita `highlightFirst` / `globalHighlightFirst` em vez de estar sempre ativado.

### Fixed

- **As coleções agora carregam de forma confiável no editor de prateleira,** inclusive em builds do SteamOS onde a API de loja normal não está disponível.
- **Apps não-Steam na substituição do recents nativo** não bloqueiam mais a sobreposição — só prateleiras verdadeiramente nativas renderizam, apps não-Steam passam direto com a armadilha de erro existente como segurança.
- **O fade inferior da hero art foi restaurado.** O sutil fade de 10% para a cor de fundo da página ao longo dos últimos 5px está de volta — sem mais uma sobreposição de 30%.
- **A hero art envolve a prateleira** em 60px acima e abaixo, combinando com o visual nativo original.
- **Tempo de jogo mostrado em atalhos não-Steam** no card em foco (estava restrito incorretamente).
- **Mudar a ordenação em uma prateleira que não é de filtro agora realmente reordena** os jogos e invalida o cache, para você não ver a ordem antiga piscar primeiro.
- **Duplicatas não-Steam entre launchers preservadas.** Um jogo com o mesmo nome de duas lojas diferentes é mantido como entradas separadas; só duplicatas verdadeiras são mescladas.

## [1.5.1] - 2026-04-19

### Fixed

- **"Destacar todos" volta a ser salvo.** Tanto a alternância por prateleira quanto a global estavam sendo descartadas silenciosamente ao salvar — agora persistem corretamente.
- **Aba de filtro navegável com o gamepad.** Os filtros dentro do editor de prateleira estavam inalcançáveis via D-pad; agora todo dropdown e botão está na árvore de navegação.

### Changed

- **Descrições dos filtros de desenvolvedor / publicadora / lista de app-id traduzidas** em todos os 15 idiomas além do inglês (antes ficavam em inglês).

## [1.5.0] - 2026-04-19

### Added

- **Destacar todos.** Nova alternância (por prateleira e global) renderiza todo card de uma prateleira como um card em destaque no formato paisagem.
- **Filtro de publicadora.** Filtre jogos por nome da publicadora, no mesmo padrão do filtro de desenvolvedor já existente.
- **Filtro de lista de app ID.** Combine jogos por uma lista explícita de app IDs separados por vírgula (equivalente ao filtro de lista branca do TabMaster).
- **Primeira prateleira amigável a temas do CSS Loader.** Quando "Ocultar jogos recentes" está ativo e um tema do CSS Loader está em uso, a primeira prateleira recebe as mesmas classes nativas da área de recents, então temas como o ArtHero podem estilizá-la de forma consistente.

### Changed

- **O QAM fica organizado quando o plugin está desativado.** As seções Prateleiras Inteligentes e alternâncias globais ficam ocultas quando a chave principal está desligada — só a chave principal e a lista de prateleiras permanecem.

### Fixed

- **A navegação BAIXO na última prateleira** não volta mais para a primeira quando as tabs da Home estão ocultas — o foco permanece no lugar.
- **A ponte de foco das tabs nativas** não pula mais para a primeira prateleira por acidente quando você está navegando dentro das próprias tabs.

## [1.4.0] - 2026-04-18

### Added

- **prateleiras inteligentes.** Um novo tipo de prateleira cujo conteúdo é escolhido automaticamente por heurísticas — aparece na Home só quando a heurística retorna resultados, some caso contrário. Quinze templates: Daily Pick, Deck Picks, On Deck, Recently Played, Long Sessions, Not Started, Best Unplayed, Quick Play, Interrupted, Non-Steam, Spare Time, Time of Day, Rediscover, Forgotten e Roulette.
- **Me Surpreenda.** Escolhe de 1 a 5 templates smart para você todo dia usando uma semente diária determinística. Um slider (0–5) define a contagem exata; 0 deixa o sistema alternar entre 2, 3 ou 4 por dia.
- **Templates Forgotten** (possuído há 3+ anos, nunca lançado) **e Spare Time** (instalado + menos de 2h, só durante 6–9h / 12–14h / 19–22h) adicionados.
- **Ícones em todo botão do seletor de templates** — verificação visual mais rápida.
- **Sobre → Prateleiras agora documenta os templates de prateleira padrão** antes da seção de prateleiras inteligentes.
- **Dois novos templates de prateleira padrão:** Non-Steam / Emuladores e Sessões Longas.
- Traduções completas para toda string de prateleira inteligente e template em todos os 16 idiomas.

### Changed

- **A centralização de prateleira para prateleira fica suave** ao navegar verticalmente — eliminada a soluço causada por chamadas de rolagem competindo entre si.
- **O anel de foco do card usa a cor de destaque do tema** quando o tema ativo define uma, com uma alternativa transparente segura.
- **As animações nativas de foco tocam por completo** em cards de prateleira sob o ArtHero e temas similares do CSS Loader.
- **O fundo hero combina com a geometria do recents nativo** — se alinha com o layout do ArtHero.

### Fixed

- **O carregamento de coleção não trava mais o limite de erro do Decky** quando o armazenamento de coleções do Steam ainda não está totalmente inicializado.
- **Recuperação da Home depois de ativar substituição de fonte.** Sem primeira prateleira duplicada, sem heroes empilhadas, sem linha presa recolhida.

## [1.3.1] - 2026-04-17

### Changed

- **A Home renderiza mais rápido.** Várias alocações por card e recomputações por prateleira eliminadas com memoização.
- **README e documentação** ganharam as alternâncias experimentais e tipos de filtro mais recentes documentados.

### Fixed

- **A substituição de recents se autocorrige.** Depois de falhas silenciosas repetidas, o recurso muda para a alternativa padrão de "Ocultar jogos recentes" em vez de permanecer em um estado quebrado.

## [1.3.0] - 2026-04-16

### Added

- **Usar a primeira prateleira como recents (experimental).** Com "Ocultar jogos recentes" ativo, os jogos da primeira prateleira visível são injetados no slot de recents nativo. Você reaproveita 100% do visual e comportamento nativo (zoom da hero, anel de foco, suporte ao CSS Loader). Se desativa automaticamente com um banner se a injeção encontrar erros.
- **Ocultar tabs da Home.** Oculta a área nativa de Novidades / Amigos / Recomendações independentemente de "Ocultar jogos recentes".

### Changed

- **Alternativa automática para o modo visual "Ocultar recents"** se o recurso experimental de substituição de fonte encontrar erros em tempo de execução.

## [1.2.5] - 2026-04-16

### Changed

- **Restauração de foco depois de voltar de um jogo.** Muito mais confiável — o foco volta exatamente para o card/prateleira que você ativou, em vez de às vezes voltar para a primeira prateleira.
- **O tamanho do card é estável no boot frio.** Sem mais reflow breve de card quando a Home renderiza pela primeira vez — as dimensões em cache são usadas imediatamente.
- **O foco nunca "se perde" das prateleiras** depois de vários ciclos de recolher/expandir.

### Fixed

- **Recolher uma prateleira distante não rouba mais o foco** da prateleira atualmente em foco.
- **O filtro "Instalado" agora é preciso para atalhos não-Steam** — apps do UnifiDeck são cruzados com a coleção `[Unifideck] Installed` para evitar falsos positivos.

## [1.2.4] - 2026-04-14

### Changed

- **Menos trabalho em segundo plano.** Intervalos de sondagem são substituídos por atualizações orientadas a evento onde possível — mais leve para a bateria.
- **Layout do QAM mais limpo.** Botões de ação reagrupados (Adicionar / Importar / Exportar à esquerda; TabMaster à direita) e linhas de botão alinhadas com a borda do QAM.
- **Primeira renderização mais rápida.** As dimensões dos cards são armazenadas em cache por viewport/DPI, então a primeira prateleira pinta com os tamanhos corretos imediatamente.
- **A alternância "Mostrar arte de fundo" fica oculta** quando "Ocultar jogos recentes" está desligado (em vez de desativada) — sem mais estado de interface morto.
- **As seções da página Sobre rolam** de forma confiável em toda subpágina.

## [1.2.3] - 2026-04-11

### Added

- **Scripts de fluxo de desenvolvimento.** `pnpm run precommit`, `deploy:verify`, e uma família completa de `update` para gerenciamento de dependências.
- **Recents oculto = o gamepad pula a seção de recents.** Elementos focáveis no recents oculto recebem `tabindex=-1` para que o D-pad pule direto para as prateleiras. O foco programático se move para o primeiro card de prateleira com tentativas repetidas se necessário.
- **Novas prateleiras aparecem no topo da lista.** Prateleiras duplicadas aparecem logo abaixo da original, e criar uma prateleira em branco abre o modal de edição imediatamente.
- **Automação de captura de tela** cobre o seletor de Criar Prateleira e o modal de Importar Prateleiras, e navega de forma confiável até a aba do plugin no Decky independentemente do idioma.

### Changed

- **Lógica de validação da Home reescrita.** O recents é sempre forçado a ficar visível quando o plugin está desativado, nenhuma prateleira resolve, ou todas as prateleiras estão ocultas — o valor da alternância nunca é forçado a mudar sem seu conhecimento.
- **Layout do QAM.** Cabeçalhos de seção claros "Prateleiras" e "Aplicar globalmente"; entradas da lista de prateleira fazem reticências em uma única linha.
- **O fade da hero acompanha seu tema.** Usa a cor de fundo de página do tema (via `--ds-page-bg`) automaticamente.

### Fixed

- **O título da segunda prateleira não fica mais escondido atrás da hero.**
- **O card em destaque não pisca/redimensiona mais depois da renderização inicial.**

## [1.2.2] - 2026-04-09

### Fixed

- Cor de fundo dentro da região da hero.

## [1.2.1] - 2026-04-09

### Added

- **"Mostrar arte de fundo"** — quando o recents está oculto, a primeira prateleira mostra a arte de fundo hero ao focar um card, combinando com o comportamento nativo e ajustes de tema do CSS Loader.
- **Alternâncias globais "Combinar tamanho nativo de card" e "Destacar primeiro jogo"** com precedência sobre as configurações por prateleira.
- **Cards de placeholder** para jogos sem arte — card estilizado com o nome do jogo em vez de uma imagem quebrada.
- **Suporte a hover do mouse** — rótulos de card, brilho e selos de compatibilidade ativam ao passar o mouse sem interferir no gamepad.

### Changed

- **O tamanho do card faz a transição suavemente** quando um card se torna destacado.
- **O fundo hero replica a cadeia DOM nativa** para compatibilidade com temas do CSS Loader.
- **Documentação consolidada** em um diretório `docs/`.

### Fixed

- **Centralização vertical de prateleira** funciona em telas onde a matemática de rolagem alternativa estava errada.

## [1.2.0] - 2026-04-09

### Added

- **Dimensionamento dinâmico de card** — cards de prateleira combinam com o tamanho de card nativo do SteamOS por viewport.
- **"Destacar primeiro jogo"** renderiza o primeiro card de uma prateleira como um card em destaque no formato paisagem.
- **Alternância "Ocultar jogos recentes"** oculta a seção de recents nativa da Home.
- **Proteção contra falhas** — erros de montagem na Home desativam automaticamente as prateleiras com um botão de tentar de novo no QAM.
- **Filtro de desenvolvedor / publicadora** — pré-carrega dados em lotes para que listas longas de publicadoras não fiquem lentas.

### Changed

- **Mais leve para a bateria.** Sondagem substituída por MutationObservers; frequências de timer reduzidas na Home, no QAM e na restauração de foco.
- **Cadeia de alternativa de arte paisagem** — imagens de hero personalizadas têm prioridade, depois o `header.jpg` local, depois variantes do CDN.

### Fixed

- **O anel de foco respeita a altura da arte** em cards destacados.
- **"Ocultar recents" persiste entre reaberturas do QAM.**

## [1.1.3] - 2026-04-07

### Changed

- **A navegação horizontal de prateleira combina com o ritmo do recents nativo.** Um toque de D-pad = um card, com uma pausa de ~200ms ao segurar, para que foco e rolagem fiquem sincronizados.

### Fixed

- **A extração do menu de contexto** sempre restaura sua substituição do React via `try/finally` — sem monkey-patches obsoletos se a extração lançar um erro.

## [1.1.2] - 2026-04-07

### Added

- **Selos de nível de compatibilidade nos cards** (Steam Deck Verified / Playable) com cores temáticas.
- **Compatibilidade com CSS Loader / DeckThemes**: os cards de prateleira agora recebem as mesmas classes nativas de card do Steam, então a maioria das regras de CSS de tema se aplica aos cards de prateleira exatamente como se aplica aos cards nativos de recents.
- **A cor de animação de foco nativa** acompanha a cor de destaque do tema ativo.

### Fixed

- **A detecção de instalado agora é precisa.** Só `installed: true` explícito em `per_client_data` marca um jogo como instalado — sem mais falsos positivos para jogos disponíveis em clientes remotos.
- **Atalhos não-Steam vêm como não instalados por padrão** quando não há evidência de instalação.
- **O ícone de jogar e o texto de status** herdam a cor correta do tema depois de mudanças de tema, sem recarregar o Steam.

## [1.1.1] - 2026-04-06

### Added

- **Descoberta de classes webpack em tempo de execução.** Os nomes de classe ofuscados do Steam são descobertos na montagem do plugin, então os seletores de prateleira sobrevivem a atualizações do Steam sem hashes fixos.
- **Semente estática do mapa de classes.** Os seletores ficam disponíveis imediatamente na inicialização, antes da descoberta em tempo de execução terminar.

### Changed

- **Melhorias de CI e fluxo de trabalho.** Fluxo de lançamento mais enxuto, incrementos de versão disparados por tags no título do PR (`[CLEANUP]` / `[ENHANCEMENT]`).
- **Traduções:** as strings "Folder" e "Browse" agora traduzidas em todo idioma.

### Fixed

- **Verificações de compatibilidade** em francês, alemão e italiano (antes strings de status não traduzidas).
- **A navegação vertical de prateleira não rola mais em dobro** entre prateleiras.

## [1.1.0] - 2026-04-04

### Added

- **Idiomas.** Expandido para 16 idiomas totalmente traduzidos — adicionados PT-PT, ES-419, RU, PL, NL, TR, UK, JA, KO, ZH-CN.
- **Ordenação "Adicionado recentemente"** — ordena pela data de aquisição na biblioteca em vez do último jogo.
- **Favorites localizada.** A prateleira Favorites agora funciona em todo idioma (FR, DE, ES, IT, PT, etc.) independentemente do idioma do Steam.
- **A página Sobre é rolável com o gamepad.**
- **Documentação de filtro expandida** na página Sobre com todos os 15 tipos de filtro e 8 opções de ordenação.
- **Cache de app ID de prateleira em localStorage** — exibição instantânea depois de voltar da suspensão.
- **Nova tentativa de prontidão de inicialização** — as prateleiras esperam pelos dados de app do Steam em vez de mostrar vazio.

### Changed

- **A borda arredondada do card de prateleira herda do tema ativo** via uma propriedade CSS personalizada.
- **A navegação horizontal de prateleira centraliza o card em foco** em vez de fixar na borda esquerda.

### Fixed

- **A prateleira Favorites agora é exibida em sistemas não ingleses.**
- **O template "Adicionado recentemente" agora ordena corretamente pela data de aquisição.**
- **As capas de jogo combinam com o estilo visual dos cards nativos do Steam** quando temas do CSS Loader estão ativos.
- **Atalhos não-Steam não são mais marcados incorretamente como instalados** com base em exe_path.

## [1.0.0] - 2026-04-02

### Added

- **API pública do plugin** — outros plugins podem registrar fontes de prateleira via `window.__DECK_SHELVES_API__`.
- **Banner de primeira execução** com templates prontos para uso (Favorites, Recently Played, Installed).
- **Templates de prateleira** — prateleiras comuns como mais jogado, adicionado recentemente, aguardando atualização, e jogado nos últimos 7 dias.
- **Integração com UnifiDeck** — apps não-Steam gerenciados pelo UnifiDeck (de outras lojas) aparecem como fontes e tabs no editor.
- **Ganchos de suspensão / retomada** — timers pausam quando o Deck dorme e o estado é revalidado ao retomar.
- **Escritas atômicas de configurações** — backup `settings.json.bak` evita corrupção em caso de perda de energia.

### Changed

- **As prateleiras atualizam via um emissor de evento global** em vez de sondagem por prateleira — mais leve para o trabalho em segundo plano.
- **O CI roda testes Python junto com os testes TypeScript.**

### Fixed

- **A importação do TabMaster mostra estados de carregamento/erro adequados** no QAM.

## [0.2.0] - 2026-04-02

### Added

- **Grupos de filtro avançados** — filtros agora podem ser combinados com lógica AND/OR e aninhados, permitindo consultas como "instalado E (favoritos OU jogado nos últimos 7 dias)".
- **Novos tipos de filtro:** tags da loja, faixa de contagem de conquistas, amigos que possuem, atualização pendente, e merge (combine várias fontes em uma prateleira).
- **Novas opções de ordenação:** data de lançamento, tamanho em disco, nota Metacritic, nota de avaliação.
- **Integração com TabMaster** — "Importar do TabMaster" aparece no QAM quando o TabMaster está instalado; tabs viram prateleiras.
- **Integração com UnifiDeck** — apps não-Steam aparecem automaticamente em prateleiras de filtro e tab.
- **A seleção de tab de biblioteca mostra tabs reais em tempo de execução,** incluindo tabs personalizadas de outros plugins, em vez de uma lista estática.

### Changed

- **Editor de prateleira de filtro redesenhado** para a interface de filtro baseada em grupos.

### Fixed

- **O botão de excluir prateleira não vaza mais estilo destrutivo** para o menu de desligamento do Steam.
- **Prateleiras de tab com UUID legadas migram automaticamente** para a fonte baseada em filtro correta.

## [0.1.0] - 2026-03-25

### Added

- **Deck Shelves** é lançado — prateleiras configuráveis injetadas na tela inicial do Steam Deck.
- **Painel do Quick Access Menu** para gerenciar prateleiras.
- **Três tipos de prateleira:** Coleção, Tab de Biblioteca e Filtro.
- **Reordene, renomeie e oculte** prateleiras sem excluí-las.
- **Aviso de pré-visualização de prateleira vazia** quando uma prateleira resolve para nada.
- **Seis idiomas iniciais:** en-US, pt-BR, es-ES, fr-FR, de-DE, it-IT.
