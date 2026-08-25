import { defineConfig } from 'vite';

export default defineConfig({
  /** Fixed port: this exact origin is registered on the Google OAuth client,
      so a shifting port would break sign-in. Fail rather than pick another. */
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist' },
});
