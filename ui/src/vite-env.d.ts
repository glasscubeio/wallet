/// <reference types="vite/client" />

/**
 * Without this, `import.meta.env` is `any` and every read off it silently
 * defeats type checking.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
