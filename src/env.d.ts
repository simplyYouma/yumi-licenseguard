/**
 * Local declarations for the Vite-style environment variables this package
 * reads at runtime. Consumers (Tailor, Barber, Djami…) all run in Vite, which
 * provides the actual values at build time. This file just narrows the type
 * so we don't need a full `vite/client` types dependency in the package.
 */

interface ImportMetaEnv {
    readonly VITE_YUMI_HUB_URL?: string;
    readonly VITE_YUMI_PROJECT_ID?: string;
    readonly VITE_PROJECT_NAME?: string;
    readonly VITE_ACCENT_COLOR?: string;
    readonly VITE_FONT_SERIF?: string;
    readonly VITE_FONT_SANS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
