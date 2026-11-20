// Serves dist-apps/ (the apps site) for local testing at http://localhost:4174 (npm run preview:apps).
export default { root: 'dist-apps', configFile: false, preview: { port: 4174, strictPort: true }, build: { outDir: '.' } };
