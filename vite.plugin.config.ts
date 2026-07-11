import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  return {
    plugins: [react({ jsxRuntime: "automatic" })],
    define: {
      "process.env.NODE_ENV": JSON.stringify(isProd ? "production" : "development"),
      __DECK_SHELVES_ENABLE_HOME_PATCH__: JSON.stringify(true),
      __DEV__: JSON.stringify(!isProd),
      // Build stamp injected per build so `window.__ds_build` always reflects the
      // actually-loaded bundle (a hardcoded string silently went stale for weeks).
      __BUILD_ID__: JSON.stringify(
        `${new Date().toISOString().slice(0, 16).replace("T", " ")} ${isProd ? "rel" : "dev"}`,
      ),
      __QA_FIRST_RUN__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_FIRST_RUN === "1"),
      __QA_QAM_ERROR__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_QAM_ERROR === "1"),
      __QA_SHELF_ERROR__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_SHELF_ERROR === "1"),
      __QA_ALL_SHELVES_HIDE_RECENTS__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_ALL_SHELVES_HIDE_RECENTS === "1"),
      __QA_ALL_SHELVES_SHOW_RECENTS__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_ALL_SHELVES_SHOW_RECENTS === "1"),
      __QA_ALL_SHELVES_HIDE_HOME_TABS__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_ALL_SHELVES_HIDE_HOME_TABS === "1"),
      __QA_ALL_SHELVES_SHOW_HOME_TABS__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_ALL_SHELVES_SHOW_HOME_TABS === "1"),
      __QA_FORCE_TABMASTER__: JSON.stringify(!isProd ? (process.env.DS_QA_FORCE_TABMASTER ?? "") : ""),
      __QA_FORCE_UNIFIDECK__: JSON.stringify(!isProd ? (process.env.DS_QA_FORCE_UNIFIDECK ?? "") : ""),
      __QA_FORCE_NONSTEAMBADGES__: JSON.stringify(!isProd ? (process.env.DS_QA_FORCE_NONSTEAMBADGES ?? "") : ""),
      __QA_SMART_SHELVES_FIXTURE__: JSON.stringify(!isProd && process.env.DS_QA_SMART_SHELVES_FIXTURE === "1"),
      __QA_SAVED_FILTERS_FIXTURE__: JSON.stringify(!isProd && process.env.DS_QA_SAVED_FILTERS_FIXTURE === "1"),
      __QA_FORCE_HIDDEN_SHELF__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_HIDDEN_SHELF === "1"),
      __QA_SMART_SURPRISE_ME__: JSON.stringify(!isProd && process.env.DS_QA_SMART_SURPRISE_ME === "1"),
      __QA_FORCE_HOME_CRASH__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_HOME_CRASH === "1"),
      __QA_FORCE_REPLACE_FAILED__: JSON.stringify(!isProd && process.env.DS_QA_FORCE_REPLACE_FAILED === "1"),
      __QA_UPDATE_AVAILABLE__: JSON.stringify(!isProd && process.env.DS_QA_UPDATE_AVAILABLE === "1"),
      __QA_UPDATE_DISMISSED__: JSON.stringify(!isProd && process.env.DS_QA_UPDATE_DISMISSED === "1"),
      __QA_UPDATE_OFFLINE__: JSON.stringify(!isProd && process.env.DS_QA_UPDATE_OFFLINE === "1"),
      __QA_COLLECTION_EMPTY__: JSON.stringify(!isProd && process.env.DS_QA_COLLECTION_EMPTY === "1"),
      __QA_COLLECTION_INVERTED__: JSON.stringify(!isProd && process.env.DS_QA_COLLECTION_INVERTED === "1"),
      __QA_SOURCES_FIXTURE__: JSON.stringify(!isProd && process.env.DS_QA_SOURCES_FIXTURE === "1"),
      __QA_TEMPLATES_FIXTURE__: JSON.stringify(!isProd && process.env.DS_QA_TEMPLATES_FIXTURE === "1"),
      __QA_STRESS_FIXTURE__: JSON.stringify(!isProd && process.env.DS_QA_STRESS_FIXTURE === "1"),
    },
    resolve: {
      alias: [
        { find: /^react$/, replacement: path.resolve(__dirname, "src/shims/react.ts") },
        { find: /^react\/jsx-runtime$/, replacement: path.resolve(__dirname, "src/shims/react-jsx-runtime.ts") },
        { find: /^react-dom$/, replacement: path.resolve(__dirname, "src/shims/react-dom.ts") },
        { find: /^react-dom\/client$/, replacement: path.resolve(__dirname, "src/shims/react-dom-client.ts") },
        { find: /^@decky\/api$/, replacement: path.resolve(__dirname, "src/shims/decky-api.ts") },
        { find: /^@decky\/ui$/, replacement: path.resolve(__dirname, "src/shims/decky-ui.ts") },
        { find: /^@decky\/manifest$/, replacement: path.resolve(__dirname, "src/shims/decky-manifest.ts") },
        { find: /^@deck-shelves\/host$/, replacement: path.resolve(__dirname, "host/src/contract/index.ts") },
        { find: /^@deck-shelves\/api$/, replacement: path.resolve(__dirname, "api/src/index.ts") },
        { find: /^@$/, replacement: path.resolve(__dirname, "src") },
      ],
    },
    build: {
      target: "es2020",
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: !isProd,
      minify: isProd ? "esbuild" : false,
      lib: {
        entry: path.resolve(__dirname, "src/index.tsx"),
        formats: ["es"],
        fileName: () => "index.js",
      },
      rollupOptions: {
        output: {
          entryFileNames: "index.js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          // Force `onlineStore` into its own chunk. Without this, Rollup
          // co-locates it with the steam chunk (because the resolver does
          // `await import("../core/onlineStore")`) but rewrites the dynamic
          // import target to `../index.js` (the main bundle), which has no
          // onlineStore exports — so `getWishlistIds`, `getPriceMap`,
          // `getStoreGameIds` all come back undefined at runtime and the
          // wishlist / store branches throw "X is not a function". A
          // dedicated chunk makes the dynamic import resolve to its real
          // location.
          manualChunks(id: string) {
            if (id.includes("/src/core/onlineStore")) return "onlineStore";
            return undefined;
          },
        },
      },
    },
  };
});

