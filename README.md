# Deck-Shelves

**Put Steam Shelves into Deck UI.**

Deck-Shelves injeta uma ou mais “shelves” na Home do Steam Deck (rota **`/library/home`**), logo abaixo do shelf principal de jogos recentes.

## O que ele faz

- Adiciona shelves horizontais na Home.
- Cada shelf pode ser:
  - **Coleção** (Steam Collections)
  - **Tab/Seção** (aproximações como Favoritos, Recentes, Ocultos, Não-Steam)
  - **Filtro custom** (JSON com um conjunto pequeno de campos suportados)

> Observação: A API interna do Steam (SteamClient) e o formato de dados de coleções podem variar entre versões do SteamOS/Steam Client. O plugin tenta múltiplas rotas de API e falha de forma “graciosa” quando algo não existe.

## Como configurar

Abra o Decky Loader → **Deck-Shelves**.

- Ative/desative a injeção na Home.
- Adicione/remova shelves.
- Defina:
  - Nome
  - Fonte (coleção / tab / filtro)
  - Limite de jogos

### Filtro (JSON)

Campos suportados (subset pragmático):

```json
{
  "favorites": true,
  "playedWithinDays": 30,
  "deckCompatibility": ["verified", "playable"],
  "nameIncludes": "doom"
}
```

## Desenvolvimento

Requer **Node.js 16.14+** e **pnpm v9** (padrão do template). citeturn5view0

```bash
pnpm i
pnpm run build
```

Para build contínuo:

```bash
pnpm run watch
```

## Distribuição (zip)

Siga o padrão do Decky Plugin Template para o zip instalável (pasta do plugin contendo `dist/index.js`, `plugin.json`, `package.json`, etc.). citeturn5view0

## Licença

MIT
