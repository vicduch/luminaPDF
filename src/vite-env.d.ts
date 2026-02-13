/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_GOOGLE_API_KEY: string
    readonly VITE_GOOGLE_CLIENT_ID: string
    readonly VITE_GOOGLE_APP_ID: string
    readonly VITE_GEMINI_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare global {
    interface Window {
        gapi: any;
        google: any;
    }
}
