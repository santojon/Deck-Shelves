# Ajude a validar o Deck Shelves 3.3.4 na sua plataforma

*[Read in English](../call-for-validators.md)*

A 3.3.4 é a release de estabilidade: volta à Home em menos de um segundo, card
selecionado mantido, home ociosa que não mantém mais a CPU ocupada, Modo de
Segurança automático para inicializações ruins, e um conjunto de gates no
dispositivo que agora rodam a cada release (soak de reinício, soak de
suspender/acordar, recarga do plugin, bateria). Tudo isso foi medido num Steam
Deck LCD no Steam Client Beta e num Mac — o que deixa muitas configurações
reais sem verificação.

**Procurando um validador nomeado para cada:**

- Steam Deck **OLED** (qualquer canal da Steam)
- SteamOS **Stable** e **Preview**
- **Bazzite** (Decky Loader e o host standalone)
- **Windows** (host standalone)
- Linux desktop fora do SteamOS (host standalone)
- **ARM64** (o build experimental do host standalone)

**O que precisa:** dez minutos, três shelves, as seis checagens em
[docs/pt-BR/validation-matrix.md](../../docs/pt-BR/validation-matrix.md#como-validar-uma-célula)
(boot a frio, volta à Home, recarga, suspender/acordar, Home com jogo rodando,
ocioso), e então a cópia do relatório de bug de Configurações → Sobre →
Diagnóstico numa issue do GitHub com sua plataforma e host no título — ou uma
mensagem no canal de validação do Discord.

**O que você ganha:** seu nome na matriz de validação, agradecimento nas notas de
release e acesso antecipado ao próximo beta do host em que validou.
