# Release announcements

*[Read in English](../release-announcements.md)*

Texto de post para a comunidade a cada release — Reddit primeiro, reaproveitável para o Discord.
Isto *não* é o changelog: [CHANGELOG.md](../../CHANGELOG.md) é o registro técnico completo,
mudança por mudança, e [RELEASE_NOTES.md](../../RELEASE_NOTES.md) é o
resumo voltado ao usuário, linkado a partir da página About. Este arquivo é mais curto,
mais direto, e escrito para ser lido em um feed, não em um diff.

## Quando escrever um

Rascunhe o post em `## [Unreleased]` (abaixo) conforme as entradas de CHANGELOG.md /
RELEASE_NOTES.md de um release vão se firmando — a mesma seção que o workflow de
bump de versão promove para uma entrada datada, então ele só precisa estar lá até
o momento em que um release sai. Reaproveite o texto — não reinvente o tom a cada
release. Poste no [r/DeckShelves](https://www.reddit.com/r/DeckShelves/) usando o link
que o job de CI de anúncio de release gera.

## Template

```
Deck Shelves vX.Y.Z is here!

Deck Shelves X.Y.Z is now available.

This release focuses on <one-sentence theme — the 2-3 things a returning
user would actually notice>:

<emoji> <Bold-ish short label> — <one line, plain language, no jargon>
<emoji> <Bold-ish short label> — <one line>
...
<emoji> A collection of fixes and polish for <2-4 areas touched>.

📖 Full release notes:
https://github.com/santojon/Deck-Shelves/blob/main/RELEASE_NOTES.md

💬 Community & support

🔵 Discord: https://discord.gg/EChuVEDakk
🟠 Reddit: https://www.reddit.com/r/DeckShelves/
🌐 Website: https://santojon.github.io/Deck-Shelves/

Thanks to everyone who has been testing Deck Shelves, reporting bugs and
suggesting improvements. ❤️

Deck Shelves — Your Steam Deck Home Screen. Your Way.
```

**Regras para os itens de destaque:**
- Extraia-os das entradas "Added"/"Changed" do RELEASE_NOTES.md do
  release, não do CHANGELOG.md — condense ainda mais, não apenas reescreva.
- Um emoji por item, escolhido pelo assunto da linha (não decorativo) —
  uma ferramenta para filtros, um livro para docs, um inseto para a linha de
  correções, e assim por diante.
- Linguagem simples em vez de nomes de funcionalidade: "tudo exceto…" lê
  melhor que "filtros invertíveis."
- Correções de bugs são sempre um único item combinado ("uma coleção de
  correções e polimentos para…"), nunca detalhadas — é para isso que
  serve o RELEASE_NOTES.md.
- Mantenha apenas o que um usuário recorrente notaria em cinco segundos de
  rolagem.

## Posts

O mesmo fluxo `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD` do CHANGELOG.md /
RELEASE_NOTES.md: escreva o rascunho do post para o próximo release em
`## [Unreleased]` conforme seus destaques vão se firmando, e o workflow de
bump de versão o promove para uma entrada datada `## [X.Y.Z]` da mesma
forma que promove esses dois arquivos — mesma extração via `awk`, mesmo
skip não fatal quando `[Unreleased]` está vazio (o job de anúncio então
recorre ao corpo bruto do release para aquela versão). Os títulos usam o
formato `## [X.Y.Z]` com colchetes de propósito, para continuar
extraíveis pelo mesmo padrão.

## [Unreleased]

## [3.2.0] - 2026-08-14

```
Deck Shelves v3.2.0 is here!

Deck Shelves 3.2.0 is now available.

This release focuses on making shelves much more flexible and powerful:

🧰 Many more filters & sorts — genre, franchise, VR, multiplayer, achievements, playtime, launch count, install size, storage device, launcher and more.

🔄 Invert any filter — easily build shelves like “everything except…”

📚 New built-in shelf sources — dynamic collections, followed/ignored games, DLC, soundtracks, pinned games, play history, recently updated games, events, Workshop updates and more.

🧩 More powerful filter combinations — combine conditions with at least N, any and none logic.

📝 Release notes inside the plugin — see the notes for your installed version directly from About.

🎨 New Deck Shelves icon — a cleaner shelf-of-books design across Decky, notifications and the browser tab.

⬇️ Easier updates — update notifications can now download the release package directly to your Downloads folder, while keeping installation manual.

🐛 A collection of fixes and polish for shelf visibility, Recents integration, editor layout, profiles, "what's new" loop, notifications and navigation.

📖 Full release notes:
https://github.com/santojon/Deck-Shelves/blob/main/RELEASE_NOTES.md

💬 Community & support

🔵 Discord: https://discord.gg/EChuVEDakk
🟠 Reddit: https://www.reddit.com/r/DeckShelves/
🌐 Website: https://santojon.github.io/Deck-Shelves/

Thanks to everyone who has been testing Deck Shelves, reporting bugs and suggesting improvements. ❤️

Deck Shelves — Your Steam Deck Home Screen. Your Way.
```
