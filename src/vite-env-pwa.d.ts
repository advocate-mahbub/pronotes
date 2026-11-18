/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth Client ID for Drive backups, given to the build by the GitHub Actions secret GOOGLE_CLIENT_ID. Not in the repository. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
