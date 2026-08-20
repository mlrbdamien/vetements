import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sert le site sous /vetements/ ; le workflow de
// déploiement renseigne BASE_PATH. En local, la racine suffit.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => ({
  base,
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  // Vite charge .env.local dans TOUS les modes, et .env.local a priorité sur
  // .env.vitrine : sans ce blocage, les identifiants Supabase réels seraient
  // compilés en clair dans le build public. Une variable VITE_* n'est pas une
  // configuration, c'est une chaîne littérale insérée dans le JavaScript servi.
  //
  // `define` s'applique après l'injection des variables d'environnement, et
  // écrase donc ce que .env.local avait apporté.
  define:
    mode === 'vitrine'
      ? {
          'import.meta.env.VITE_SUPABASE_URL': 'undefined',
          'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined',
          'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': 'undefined',
          'import.meta.env.VITE_POSTE_EMAIL': 'undefined',
          'import.meta.env.VITE_POSTE_MOT_DE_PASSE': 'undefined',
        }
      : {},

  plugins: [
    react(),
    tailwindcss(),
    // La PWA sert ici à mettre l'app en favori sur les postes et à garder le
    // shell en cache — pas à travailler hors ligne : un mouvement non parti en
    // base n'est pas un mouvement (voir lib/connexion.ts).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vêtements de laboratoire',
        short_name: 'Vêtements',
        description: 'Suivi du parc de vêtements de laboratoire lavés par le prestataire',
        lang: 'fr-CH',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#fafafa',
        theme_color: '#fafafa',
      },
    }),
  ],
}));
