import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
// Les nouveaux projets Supabase appellent cette clé « publishable key »
// (sb_publishable_…), les anciens « anon key » — les deux sont sûres côté
// client, l'une ou l'autre variable convient.
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Null tant que Supabase n'est pas configuré — l'app le signale à l'écran. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
