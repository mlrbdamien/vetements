import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  plugins: [
    react(),
    tailwindcss(),
    // La PWA sert ici à mettre l'app en favori sur les postes et à garder le
    // shell en cache — pas à travailler hors ligne : un mouvement non parti en
    // base n'est pas un mouvement (voir lib/connexion.ts).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vêtements de laboratoire — Pharmacie 24',
        short_name: 'Vêtements P24',
        description: 'Suivi du parc de vêtements de laboratoire lavés par Elis',
        lang: 'fr-CH',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#fafafa',
        theme_color: '#fafafa',
      },
    }),
  ],
});
