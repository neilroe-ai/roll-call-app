/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public by design — see ADR 0001. Set by scripts/setup-google-cloud.sh. */
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
