import { supabase } from './supabase';
import type {
  ContexteScan,
  Operateur,
  ResultatMouvement,
  TypeVetement,
} from '../types';

/**
 * Erreur métier remontée par la base.
 *
 * Les exceptions du schéma sont rédigées en français POUR L'UTILISATEUR :
 * « Ce vêtement est chez Elis depuis le 12.08.2026. » On les affiche telles
 * quelles. Toute reformulation ici perdrait la date, le nom, le décompte —
 * précisément ce qui rend le message actionnable.
 */
export class ErreurMetier extends Error {}

function erreurDeSupabase(message: string, code?: string): Error {
  // P0001 = RAISE EXCEPTION explicite dans une fonction PL/pgSQL : c'est un
  // message écrit pour l'utilisateur. Le reste est une panne technique.
  if (code === 'P0001') return new ErreurMetier(message);
  return new Error(
    `Erreur technique : ${message}. Si cela se reproduit, notez l'heure et prévenez l'administratrice.`,
  );
}

function client() {
  if (!supabase) {
    throw new Error(
      "L'application n'est pas configurée (VITE_SUPABASE_URL manquant). Prévenez l'administratrice.",
    );
  }
  return supabase;
}

async function rpc<T>(nom: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(nom, args);
  if (error) throw erreurDeSupabase(error.message, error.code);
  return data as T;
}

async function table<T>(nom: string, colonnes: string): Promise<T[]> {
  const { data, error } = await client().from(nom).select(colonnes);
  if (error) throw erreurDeSupabase(error.message, error.code);
  return (data ?? []) as T[];
}

// --- Lecture ---------------------------------------------------------------

/** Toujours `operateur_public` : la table `operateur` porte `pin_hash`. */
export async function listerOperateurs(): Promise<Operateur[]> {
  const ops = await table<Operateur>(
    'operateur_public',
    'id, prenom, nom, actif, pin_defini',
  );
  return ops.sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'));
}

export async function listerTypes(): Promise<TypeVetement[]> {
  const types = await table<TypeVetement>(
    'type_vetement',
    'id, libelle, ordre, actif',
  );
  return types.sort((a, b) => a.ordre - b.ordre);
}

export async function estAdmin(): Promise<boolean> {
  return rpc<boolean>('est_admin', {});
}

// --- Mouvements ------------------------------------------------------------

export function verifierPin(operateurId: number, pin: string) {
  return rpc<boolean>('verifier_pin', {
    p_operateur_id: operateurId,
    p_pin: pin,
  });
}

export function enregistrerMouvement(
  codeBarre: string,
  operateurId: number,
  pin: string,
  contexte: ContexteScan = 'scan',
  documentId: number | null = null,
) {
  return rpc<ResultatMouvement>('enregistrer_mouvement', {
    p_code_barre: codeBarre,
    p_operateur_id: operateurId,
    p_pin: pin,
    p_contexte: contexte,
    p_document_id: documentId,
  });
}

export function annulerMouvement(
  mouvementId: number,
  operateurId: number | null,
  pin: string | null,
) {
  return rpc<unknown>('annuler_mouvement', {
    p_mouvement_id: mouvementId,
    p_operateur_id: operateurId,
    p_pin: pin,
  });
}

// --- Administration des opérateurs ----------------------------------------

export function creerOperateur(prenom: string, nom: string, pin: string) {
  return rpc<Operateur>('creer_operateur', {
    p_prenom: prenom,
    p_nom: nom,
    p_pin: pin,
  });
}

export function definirPinOperateur(operateurId: number, pin: string) {
  return rpc<void>('definir_pin_operateur', {
    p_operateur_id: operateurId,
    p_pin: pin,
  });
}

export function desactiverOperateur(operateurId: number) {
  return rpc<Operateur>('desactiver_operateur', { p_operateur_id: operateurId });
}

export function reactiverOperateur(operateurId: number) {
  return rpc<Operateur>('reactiver_operateur', { p_operateur_id: operateurId });
}

/** Combien de vêtements un opérateur détient — pour expliquer un refus. */
export async function vetementsDetenus(operateurId: number) {
  const { data, error } = await client()
    .from('v_en_utilisation')
    .select('code_barre, type_libelle, taille, jours_en_utilisation')
    .eq('detenteur_id', operateurId);
  if (error) throw erreurDeSupabase(error.message, error.code);
  return (data ?? []) as {
    code_barre: string;
    type_libelle: string;
    taille: number;
    jours_en_utilisation: number;
  }[];
}
