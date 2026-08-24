// Stub for @host/manifest used in tests. The real module is injected by
// Decky's build pipeline at compile time; in Vitest we only need a default
// export so @host/api's `import _manifest from '@host/manifest'` resolves.
const manifest = { name: 'deck-shelves', version: '0.0.0-test' };
export default manifest;
