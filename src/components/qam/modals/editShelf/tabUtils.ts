// Pure tab-label + tab-detection helpers for EditShelfModal. Native
// tab IDs/names get an i18n key + Steam icon prefix; unsupported tabs
// (like Collections) are filtered out of the source dropdown.

export function slugifyForTab(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

// Per-native-id allowlist of display-name slugs across the locales we
// ship. English form always included (TabMaster's stock tabs ship in
// English even on non-English systems).
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

/** Returns the i18n key for a native library tab (`tab_all` etc.) or
 *  null when the item is a custom (TabMaster / Unifideck / user) tab. */
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

// "Collections" is a native library tab that exposes collection groups
// — not a renderable card set, so we hide it from the source dropdown
// until the Stacks render mode lands.
const UNSUPPORTED_TAB_SLUGS: ReadonlySet<string> = new Set([
  'collections', 'collection', 'colecoes', 'colecao', 'colecciones', 'coleccion',
  'collezioni', 'sammlungen', 'kolekcje', 'kollektsii', 'kolektsiyi', 'koleksiyonlar',
  'korekushon', 'kolleksyeon', 'shoucang', 'shoucangji',
]);

/** True for tabs whose underlying source the plugin doesn't render. */
export function isUnsupportedTab(item: { id: string; name: string }): boolean {
  return UNSUPPORTED_TAB_SLUGS.has(slugifyForTab(item.id))
    || UNSUPPORTED_TAB_SLUGS.has(slugifyForTab(item.name));
}
