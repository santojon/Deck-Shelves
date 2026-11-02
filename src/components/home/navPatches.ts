// Barrel re-export so existing imports (`./home/navPatches`) keep
// working after the file was split into `./home/navPatches/` folder.
export { reparentNavTreeNodes, releaseDetachedNavNodes, patchMenuButton, patchShelfEdgeNavigation, installVerticalFocusBridge } from "./navPatches/index";
