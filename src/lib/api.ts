import { supabase } from './supabase';
import type {
  ContexteScan,
  ExpeditionOuverte,
  LigneReception,
  LingeSale,
  Operateur,
  ResultatExpedition,
  ResultatMouvement,
  ResultatReception,
  StatutVetement,
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

// --- Expédition ------------------------------------------------------------

/** La corbeille du linge sale, la plus ancienne d'abord. */
export async function listerLingeSale(): Promise<LingeSale[]> {
  const linge = await table<LingeSale>(
    'v_linge_sale',
    'vetement_id, code_barre, type_libelle, type_id, taille, rebut, retour_le, jours_depuis_retour',
  );
  return linge.sort(
    (a, b) => (b.jours_depuis_retour ?? 0) - (a.jours_depuis_retour ?? 0),
  );
}

/**
 * Un bulletin, N mouvements, une seule transaction : l'expédition est un
 * événement physique unique, et le bulletin doit décrire exactement le bac.
 *
 * Réservée à l'administratrice — le bulletin part chez Elis et engage la
 * pharmacie. D'où l'absence d'opérateur et de PIN : la garde est est_admin().
 */
export function enregistrerExpedition(vetementIds: number[]) {
  return rpc<ResultatExpedition>('enregistrer_expedition', {
    p_vetement_ids: vetementIds,
  });
}

// --- Entrée marchandise ----------------------------------------------------

/** Les expéditions auxquelles aucune réception n'est encore rattachée. */
export function listerExpeditionsOuvertes() {
  return table<ExpeditionOuverte>(
    'v_expeditions_ouvertes',
    'id, numero, date, nb_envoyes, jours',
  );
}

/**
 * Cherche une référence par son code-barre. Renvoie null si elle est inconnue
 * — cas normal en entrée marchandise, pas une erreur : c'est le signal qu'il
 * faut créer la référence.
 */
export async function chercherVetement(codeBarre: string) {
  const { data, error } = await client()
    .from('vetement')
    .select('id, code_barre, taille, rebut, statut, nb_lavages, type_id')
    .eq('code_barre', codeBarre.trim())
    .maybeSingle();
  if (error) throw erreurDeSupabase(error.message, error.code);
  return data as {
    id: number;
    code_barre: string;
    taille: number;
    rebut: boolean;
    statut: StatutVetement;
    nb_lavages: number;
    type_id: number;
  } | null;
}

/** Un bulletin, N réceptions, une transaction — comme pour l'expédition. */
export function enregistrerReception(
  lignes: LigneReception[],
  expeditionId: number | null,
  referenceElis: string | null,
) {
  return rpc<ResultatReception>('enregistrer_reception', {
    p_lignes: lignes.map((l) => ({
      code_barre: l.code_barre,
      type_id: l.type_id ?? null,
      taille: l.taille ?? null,
      rebut: l.rebut ?? false,
    })),
    p_expedition_id: expeditionId,
    p_reference_elis: referenceElis,
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
