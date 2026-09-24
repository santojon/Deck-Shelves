# Webpack classmap — descoberta e mapeamento em runtime

*[Read in English](../webpack-classmap.md)*

Um guia curto para descobrir as classes com hash do webpack da Steam (viewport / prateleira / cards / seções nativas) e injetar um mapeamento em runtime que o plugin usa para localizar elementos de scroll/foco e para espelhar o estilo nativo em prateleiras injetadas.

## Propósito
- Tornar a descoberta de seletores determinística entre versões e temas da Steam.
- Permitir que o `DeckRow` use um seletor de `viewport` fornecido em runtime antes de recorrer a heurísticas.
- Permitir que prateleiras injetadas herdem classes nativas (`nativeShelf`, `nativeShelfTitle`, `nativeShelfRow`, `nativeCard*`) para que temas do CSS Loader — incluindo ArtHero e TiltedHome — se apliquem automaticamente.

> **Atenção:** os tokens de classe com hash do webpack mudam a cada atualização da Steam sem aviso. Nunca fixe um token (ex.: `_3PhGYbMWIcIaZCfllWN19N`) na lógica da aplicação — sempre passe pelo mapa em runtime ou pela cadeia de fallback heurístico.

## Tokens em runtime (chaves atuais)

O mapa em runtime (`window.__DS_CLASS_MAP__` e a semente em `src/runtime/classmap.json`) carrega estas chaves. Novas chaves são preenchidas por `discoverClassMap()` a cada mount; valores já existentes na semente prevalecem em conflitos, então uma descoberta parcial nunca apaga um token que já se sabe funcionar.

| Chave | Descoberta a partir de | Uso |
|---|---|---|
| `viewport` | primeiro ancestral com overflow vertical + altura relevante | matemática de scroll-center do `DeckRow`, restauração de foco |
| `row` | container de linha da prateleira | (legado; reservado) |
| `card` | raiz do card de jogo | (legado; reservado) |
| `nativeShelf` | wrapper em nível de prateleira ao redor do título + linha | promoção aditiva da primeira prateleira do DS para o slot de recentes quando o CSS Loader está ativo |
| `nativeShelfTitle` | elemento de título irmão (font-size ≥ 16px) | corresponder à tipografia nativa do título |
| `nativeShelfRow` | linha irmã do título | corresponder ao espaçamento/transições nativos da linha |
| `nativeCard*` | tokens nativos do card de jogo (`Panel`, arte, rótulo, status, badge) | aplicar estilos nativos ao nosso `.ds-card` e afins |
| `nativeSection*` | tokens em nível de seção ao redor do bloco de recentes | restaurar a classe de wrapper na primeira prateleira promovida |

## Snippet de descoberta (rode no console CDP/CEF)
Cole isto no console da página (ou rode via `cdp_probe.py` se suportado):

```js
(function(){
  const nodes = Array.from(document.querySelectorAll('[class]'));
  const candidates = new Set();
  nodes.forEach(n=>{
    try{
      const cs = getComputedStyle(n);
      const oy = (cs.overflowY||'').toLowerCase();
      if((oy==='auto' || oy==='scroll' || oy==='overlay') && n.scrollHeight>n.clientHeight && n.clientHeight>80){
        for(const c of Array.from(n.classList)){
          if(c && c.startsWith('_') && c.length>5) candidates.add(c);
        }
      }
    }catch(e){}
  });
  console.log('ds:candidates', Array.from(candidates));
  return Array.from(candidates);
})();
```

Esse snippet retorna tokens de classe que parecem ter hash do webpack e pertencem a elementos com scroll (candidatos a viewport).

## Snippet de injeção em runtime
Depois de identificar tokens candidatos (por exemplo `._3PhGYbMWIcIaZCfllWN19N`), injete um mapeamento:

```js
// define in the global context (run in the Steam/CEF console)
window.__DS_CLASS_MAP = {
  viewport: '_3PhGYbMWIcIaZCfllWN19N', // token (without leading '.') or with '.' prefixed
  row: '_39tNvaLedsTrVh0fFsP4Jm',
  card: '_CARDTOKEN_EXAMPLE'
};

// or persist via localStorage (the plugin reads this too)
localStorage.setItem('ds_class_map', JSON.stringify(window.__DS_CLASS_MAP));
```

Notas:
- O `DeckRow` busca, nesta ordem: (1) seletor fixo conhecido; (2) `window.__DS_CLASS_MAP` / `localStorage['ds_class_map']`; (3) heurística de token com hash; (4) fallback genérico.
- Os valores em `__DS_CLASS_MAP` podem incluir ou omitir o ponto inicial. Se omitido, o plugin converte o token em um seletor de classe.
- **Ordem de merge entre descoberta e semente:** a cada mount, `homePatch` chama `getRuntimeClassMap()` (existente) e `discoverClassMap()` (nova), depois faz o merge com **o valor existente prevalecendo em conflitos**. Isso protege tokens fixados manualmente enquanto ainda preenche chaves faltantes após uma atualização do SteamOS.

## Verificar usando a CLI unificada de CDP

A CLI de CDP (`devkit/cdp.py`, veja [cdp.md](./cdp.md)) substitui o antigo `cdp_probe.py`. Para inspecionar o classmap ao vivo em um Deck em execução:

```bash
# List the current runtime classmap (after the plugin mounts)
python3 devkit/cdp.py eval bp 'JSON.stringify(window.__DS_CLASS_MAP__ || null)'

# Inspect a focused element's class chain
python3 devkit/cdp.py eval bp 'document.activeElement?.className'

# Force a re-discovery (development helper)
python3 devkit/cdp.py eval bp 'window.__DS_CLASS_MAP__ = null; location.reload()'
```

Tokens como `_3PhGYbMWIcIaZCfllWN19N` aparecem como valores das chaves do mapa em runtime.

## Recomendações
- Prefira injetar `window.__DS_CLASS_MAP` a partir de um snippet de inicialização (CDP) em vez de depender só de heurísticas.
- Mantenha um arquivo de mapeamento pequeno por versão se você pretende distribuir internals para o QA.
- Registre tokens descobertos pelo `cdp_probe` para montar um histórico de versões.

> **Dica:** depois de uma atualização do SteamOS, rode o snippet de descoberta primeiro e compare com a semente anterior de `classmap.json`. Se os tokens mudaram, atualize a semente e faça o redeploy — o fallback heurístico vai manter as coisas funcionando enquanto isso, mas com menos precisão.

## Segurança e limpeza
- Não persista dados sensíveis no `localStorage`. O mapeamento é seguro para tokens de UI.
- Remova ou atualize o mapeamento quando a Steam ou a UI mudar.
