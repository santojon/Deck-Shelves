function slugifyForTab(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

// English is always included: stock tabs from other plugins stay in English on every system.
const NATIVE_TAB_NAME_SLUGS: Record<string, ReadonlySet<string>> = {
  all: new Set(['all', 'all_games', 'todos_os_jogos', 'todos_los_juegos', 'tous_les_jeux', 'alle_spiele', 'tutti_i_giochi', 'alle_games', 'wszystkie_gry', 'vse_igry', 'usi_igri', 'tum_oyunlar', 'subete_no_geemu', 'modeun_geim', 'suoyou_youxi']),
  favorites: new Set(['favorites', 'favoritos', 'favoris', 'favoriten', 'preferiti', 'favorieten', 'ulubione', 'izbrannoe', 'obrane', 'favoriler', 'okiniiri', 'jeulgyeochajgi', 'shoucangjia']),
  installed: new Set(['installed', 'instalados', 'instalado', 'installes', 'installiert', 'installati', 'geinstalleerd', 'zainstalowane', 'ustanovlennye', 'vstanovleni', 'yuklu', 'insutoorudumi', 'seolchidoem', 'yianzhuang']),
  hidden: new Set(['hidden', 'ocultos', 'oculto', 'masques', 'ausgeblendet', 'nascosti', 'verborgen', 'ukryte', 'skrytye', 'prikhovani', 'gizli', 'hihyouji', 'sumgim', 'yincang']),
  nonsteam: new Set(['nonsteam', 'non_steam', 'nao_steam', 'no_steam', 'nicht_steam', 'niet_steam', 'spoza_steam', 'ne_iz_steam', 'ne_zi_steam', 'steam_disi', 'steam_iwai', 'steam_oe', 'feisteam']),
};

const NATIVE_TAB_I18N_KEY: Record<string, string> = {
  all: 'tab_all',
  favorites: 'tab_favorites',
  installed: 'tab_installed',
  hidden: 'tab_hidden',
  nonsteam: 'tab_nonsteam',
};

export function detectNativeTabKey(item: { id: string; name: string }): string | null {
  const idSlug = slugifyForTab(item.id);
  const nameSlug = slugifyForTab(item.name);
  for (const native of Object.keys(NATIVE_TAB_I18N_KEY)) {
    if (idSlug === native) return NATIVE_TAB_I18N_KEY[native];
    const slugSet = NATIVE_TAB_NAME_SLUGS[native];
    if (slugSet.has(idSlug) || slugSet.has(nameSlug)) return NATIVE_TAB_I18N_KEY[native];
  }
  return null;
}

// Collections is a native tab of groups, not a card set.
const UNSUPPORTED_TAB_SLUGS: ReadonlySet<string> = new Set([
  'collections', 'collection', 'colecoes', 'colecao', 'colecciones', 'coleccion',
  'collezioni', 'sammlungen', 'kolekcje', 'kollektsii', 'kolektsiyi', 'koleksiyonlar',
  'korekushon', 'kolleksyeon', 'shoucang', 'shoucangji',
]);

export function isUnsupportedTab(item: { id: string; name: string }): boolean {
  return UNSUPPORTED_TAB_SLUGS.has(slugifyForTab(item.id))
    || UNSUPPORTED_TAB_SLUGS.has(slugifyForTab(item.name));
}
