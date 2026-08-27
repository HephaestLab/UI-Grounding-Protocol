interface ImportMetaEnv {
  readonly VITE_BUILD_COMMIT?: string;
  readonly VITE_UGP_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
