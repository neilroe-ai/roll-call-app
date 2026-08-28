import { defineConfig } from 'vite';

export default defineConfig({
  /** Pages serves the app from https://neilroe-ai.github.io/roll-call-app/, so
      asset URLs need that prefix. Keep it in step with the repo name. */
  base: '/roll-call-app/',
  /** Fixed port: this exact origin is registered on the Google OAuth client,
      so a shifting port would break sign-in. Fail rather than pick another. */
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist' },
});
