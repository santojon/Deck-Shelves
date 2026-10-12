/* Compatibility facade. Theme detection now lives in src/themes (one adapter
   per theme + a registry); the names below keep their original import path so
   existing call sites are untouched. New code should import from "../themes". */
export { isCssLoaderActive, cssLoaderStyleCount, getNativeRecentsClassName, refreshCssLoaderThemes, getActiveCssLoaderThemes } from "../themes/detect";
export { isArtHeroActive } from "../themes/adapters/artHero";
export { isBigArtModeActive } from "../themes/adapters/bigArt";
export { isFocusRoundCompatActive } from "../themes/adapters/focusRoundCompat";
export { isTiltedHomeActive, getTiltedHomeMode } from "../themes/adapters/tiltedHome";
export { isGrayUninstalledActive } from "../themes/adapters/grayUninstalled";
export { getCleanCapsuleFeatures } from "../themes/adapters/cleanCapsule";
