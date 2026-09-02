import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
// Les nouveaux projets Supabase appellent cette clé « publishable key »
// (sb_publishable_…), les anciens « anon key » — les deux sont sûres côté
// client, l'une ou l'autre variable convient.
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * En mode vitrine, aucun client n'est construit : c'est une seconde barrière
 * derrière le `define` de vite.config.ts. Si une variable réapparaissait dans
 * le build public, aucune requête ne partirait pour autant.
 */
const vitrine = import.meta.env.VITE_VITRINE === '1';
const configure = !vitrine && !!url && !!key;

/**
 * Deux clients, deux sessions, deux durées de vie.
 *
 * LE POSTE — compte technique partagé, relié UNE FOIS à la main depuis
 * l'écran de mise en service. Sa session vit dans localStorage : elle survit
 * aux redémarrages, et le mot de passe n'a jamais à figurer dans le code.
 * Auparavant il était compilé dans le bundle via une variable VITE_*, donc
 * lisible par quiconque ouvrait la page — et impossible à changer sans
 * reconstruire.
 *
 * L'ADMINISTRATRICE — session dans sessionStorage : elle meurt avec l'onglet.
 * Un poste partagé qu'on referme sans « quitter l'admin » ne reste plus
 * administrateur pour la personne suivante. Et les deux sessions cohabitent :
 * quitter l'admin ne déconnecte plus le poste.
 */
// Les builds antérieurs ouvraient la session du poste sous la clé par défaut de
// supabase-js. Plus personne ne la lit : on la retire, pour ne pas laisser un
// jeton de rafraîchissement dormir dans le navigateur de chaque poste.
if (configure && url) {
  try {
    localStorage.removeItem(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`);
  } catch {
    // Stockage indisponible : il n'y a rien à nettoyer.
  }
}

export const supabasePoste: SupabaseClient | null = configure
  ? createClient(url, key, {
      auth: { storageKey: 'vetements-poste', persistSession: true },
    })
  : null;

export const supabaseAdmin: SupabaseClient | null = configure
  ? createClient(url, key, {
      auth: {
        storageKey: 'vetements-admin',
        storage: window.sessionStorage,
        persistSession: true,
      },
    })
  : null;

/** Compatibilité : l'ancien export désignait le seul client existant. */
export const supabase = supabasePoste;

let adminActif = false;

/** Appelé par la session quand l'administratrice se connecte ou se retire. */
export function definirAdminActif(actif: boolean) {
  adminActif = actif;
}

/**
 * Le client à employer pour la prochaine requête : celui de l'administratrice
 * quand elle est connectée — ses RPC exigent son JWT — sinon celui du poste.
 */
export function obtenirClient(): SupabaseClient | null {
  return adminActif ? supabaseAdmin : supabasePoste;
}
