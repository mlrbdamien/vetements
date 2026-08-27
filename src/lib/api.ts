import { supabase } from './supabase';
import { VITRINE, demo } from './demo';
import { definirSonde, estPanneReseau, signalerReseau } from './connexion';
import type {
  BesoinPrevisionnel,
  ChezPrestataire,
  Compteurs,
  ContexteScan,
  ControleFacturation,
  EnUtilisation,
  ExpeditionOuverte,
  LigneHistorique,
  LigneJournal,
  LigneReception,
  LingeSale,
  Operateur,
  ResultatExpedition,
  ResultatMouvement,
  ResultatReception,
  StatutVetement,
  StockDisponible,
  TypeVetement,
  Vetement,
} from '../types';

/**
 * Erreur métier remontée par la base.
 *
 * Les exceptions du schéma sont rédigées en français POUR L'UTILISATEUR :
 * « Ce vêtement est chez le prestataire depuis le 12.08.2026. » On les affiche telles
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
  // Vitrine : aucun réseau, le modèle vit en mémoire (voir lib/demo.ts).
  if (VITRINE) return routerVitrine(nom, args) as Promise<T>;
  return surveiller(async () => {
    const { data, error } = await client().rpc(nom, args);
    if (error) throw erreurDeSupabase(error.message, error.code);
    return data as T;
  });
}

/**
 * Enveloppe une requête pour tenir l'état de connexion à jour.
 *
 * Un refus métier remonte tel quel et compte comme une réussite réseau : la
 * base a répondu. Seule une panne de transport bascule l'application hors
 * ligne.
 */
async function surveiller<T>(faire: () => Promise<T>): Promise<T> {
  try {
    const r = await faire();
    signalerReseau(true);
    return r;
  } catch (e) {
    if (estPanneReseau(e)) {
      signalerReseau(false);
      throw new Error(
        'La base est injoignable. Le mouvement n’a pas été enregistré — rien n’est mis en attente.',
      );
    }
    signalerReseau(true);
    throw e;
  }
}

async function table<T>(nom: string, colonnes: string): Promise<T[]> {
  if (VITRINE) return routerVitrineTable(nom) as Promise<T[]>;
  return surveiller(async () => {
    const { data, error } = await client().from(nom).select(colonnes);
    if (error) throw erreurDeSupabase(error.message, error.code);
    return (data ?? []) as T[];
  });
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
 * Réservée à l'administratrice — le bulletin part chez le prestataire et engage
 * l'établissement. D'où l'absence d'opérateur et de PIN : la garde est est_admin().
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
  if (VITRINE) {
    const v = (await demo.chercherParc(codeBarre)).find(
      (x) => x.code_barre === codeBarre.trim(),
    );
    return v ? { ...v, id: v.vetement_id } : null;
  }

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
  referencePrestataire: string | null,
) {
  return rpc<ResultatReception>('enregistrer_reception', {
    p_lignes: lignes.map((l) => ({
      code_barre: l.code_barre,
      type_id: l.type_id ?? null,
      taille: l.taille ?? null,
      rebut: l.rebut ?? false,
    })),
    p_expedition_id: expeditionId,
    p_reference_prestataire: referencePrestataire,
  });
}

// --- Compteurs de la barre latérale ---------------------------------------

/**
 * Une seule ligne, une seule requête. La barre latérale les affiche en
 * permanence : c'est ce qui manquait le plus — on scannait sans jamais voir
 * l'état du parc.
 */
export async function lireCompteurs(): Promise<Compteurs> {
  if (VITRINE) return demo.lireCompteurs() as never;
  const { data, error } = await client()
    .from('v_compteurs')
    .select(
      'en_stock, en_utilisation, sale, chez_prestataire, parc_total, sous_seuil, ' +
        'detenteurs_inactifs, expeditions_ouvertes',
    )
    .maybeSingle();
  if (error) throw erreurDeSupabase(error.message, error.code);
  return data as unknown as Compteurs;
}

/** Les derniers mouvements, pour le journal de session de l'écran Scan. */
export async function lireDerniersMouvements(limite = 8) {
  if (VITRINE) return demo.lireDerniersMouvements(limite) as never;
  const { data, error } = await client()
    .from('v_journal_complet')
    .select(
      'mouvement_id, horodatage, type, code_barre, type_libelle, taille, ' +
        'operateur, document, document_genre, rebut, annule, annule_le, ' +
        'annule_par, annule_par_admin',
    )
    .order('horodatage', { ascending: false })
    .limit(limite);
  if (error) throw erreurDeSupabase(error.message, error.code);
  return (data ?? []) as unknown as LigneJournal[];
}

// --- Parc et fiche vêtement ------------------------------------------------

const COLONNES_VETEMENT =
  'vetement_id, code_barre, type_id, type_libelle, taille, rebut, statut, ' +
  'nb_lavages, detenteur_id, detenteur, detenteur_actif, cree_le, dernier_mouvement_le';

/**
 * Recherche dans le parc. Un terme vide renvoie tout le parc — c'est voulu :
 * l'écran sert autant à chercher une pièce précise qu'à parcourir l'inventaire.
 */
export async function chercherParc(terme: string): Promise<Vetement[]> {
  if (VITRINE) return demo.chercherParc(terme) as never;
  let q = client().from('v_vetement').select(COLONNES_VETEMENT);
  const t = terme.trim();
  if (t) q = q.ilike('code_barre', `*${t}*`);

  const { data, error } = await q.order('code_barre');
  if (error) throw erreurDeSupabase(error.message, error.code);
  // Les colonnes sont assemblées à l'exécution : supabase-js ne peut pas
  // inférer la forme du résultat, d'où le passage par unknown.
  return (data ?? []) as unknown as Vetement[];
}

export async function lireVetement(codeBarre: string): Promise<Vetement | null> {
  if (VITRINE) {
    return (await demo.chercherParc(codeBarre)).find(
      (x) => x.code_barre === codeBarre.trim(),
    ) ?? null;
  }

  const { data, error } = await client()
    .from('v_vetement')
    .select(COLONNES_VETEMENT)
    .eq('code_barre', codeBarre.trim())
    .maybeSingle();
  if (error) throw erreurDeSupabase(error.message, error.code);
  return (data as unknown as Vetement) ?? null;
}

/** L'historique complet d'une pièce, du plus récent au plus ancien. */
export async function lireHistorique(vetementId: number) {
  if (VITRINE) return demo.lireHistorique(vetementId) as never;
  const { data, error } = await client()
    .from('v_historique_vetement')
    .select(
      'mouvement_id, vetement_id, code_barre, type, horodatage, operateur, ' +
        'document, annule, annule_le, annule_par, annule_par_admin',
    )
    .eq('vetement_id', vetementId)
    .order('horodatage', { ascending: false });
  if (error) throw erreurDeSupabase(error.message, error.code);
  return (data ?? []) as unknown as LigneHistorique[];
}

// --- Tableaux de bord ------------------------------------------------------

export function lireStockDisponible() {
  return table<StockDisponible>(
    'v_stock_disponible',
    'type_id, type_libelle, taille, disponible, disponible_rebut, ' +
      'en_utilisation, sale, chez_prestataire, parc_total, minimum, manque',
  );
}

export function lireChezPrestataire() {
  return table<ChezPrestataire>(
    'v_chez_prestataire',
    'vetement_id, code_barre, type_libelle, taille, rebut, envoye_le, ' +
      'bulletin_expedition, jours_chez_prestataire',
  );
}

export function lireEnUtilisation() {
  return table<EnUtilisation>(
    'v_en_utilisation',
    'vetement_id, code_barre, type_libelle, taille, rebut, detenteur_id, ' +
      'detenteur, detenteur_actif, sorti_le, jours_en_utilisation',
  );
}

export function lireControleFacturation() {
  return table<ControleFacturation>(
    'v_controle_facturation',
    'bulletin_expedition, date_expedition, bulletin_reception, date_reception, ' +
      'type_libelle, taille, envoyes, recus, rapproche, manquants',
  );
}

export function lireBesoinsPrevisionnels() {
  return table<BesoinPrevisionnel>(
    'v_besoins_previsionnels',
    'type_id, type_libelle, taille, demande_quotidienne, duree_cycle_jours, ' +
      'parc_reel, parc_recommande, ecart',
  );
}

/**
 * Le journal complet. C'est la sauvegarde de fait : le plan Supabase gratuit
 * n'offre pas de restauration à un instant donné, et ce journal est ce qui
 * donne du poids face à une facture du prestataire contestable.
 */
export function lireJournalComplet() {
  return table<LigneJournal>(
    'v_journal_complet',
    'mouvement_id, horodatage, type, code_barre, type_libelle, taille, rebut, ' +
      'operateur, document, document_genre, annule, annule_le, annule_par, annule_par_admin',
  );
}

/** Un minimum à 0 supprime le seuil : une absence de seuil, pas un seuil nul. */
export function definirSeuil(typeId: number, taille: number, minimum: number) {
  return rpc<void>('definir_seuil', {
    p_type_id: typeId,
    p_taille: taille,
    p_minimum: minimum,
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
  if (VITRINE) return demo.vetementsDetenus(operateurId) as never;
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


/* --- Vitrine ------------------------------------------------------------- */

/**
 * Aiguillage du build public vers le modèle en mémoire.
 *
 * La correspondance est écrite à la main plutôt que déduite du nom : si une
 * RPC est ajoutée en production sans équivalent ici, la vitrine échoue
 * bruyamment au lieu d'afficher silencieusement des données fausses.
 */
function routerVitrine(nom: string, args: Record<string, unknown>): Promise<unknown> {
  switch (nom) {
    case 'est_admin':
      return demo.estAdmin();
    case 'verifier_pin':
      return demo.verifierPin(args.p_operateur_id as number, args.p_pin as string);
    case 'enregistrer_mouvement':
      return demo.enregistrerMouvement(
        args.p_code_barre as string,
        args.p_operateur_id as number,
        args.p_pin as string,
        args.p_contexte as ContexteScan,
      );
    case 'annuler_mouvement':
      return demo.annulerMouvement(args.p_mouvement_id as number);
    // Tout ce qui écrit durablement est refusé, avec une explication.
    case 'creer_operateur':
    case 'definir_pin_operateur':
    case 'desactiver_operateur':
    case 'reactiver_operateur':
    case 'definir_seuil':
    case 'creer_vetement':
    case 'enregistrer_expedition':
    case 'enregistrer_reception':
      return demo.refuserEcriture();
    default:
      throw new Error(`Vitrine : la fonction « ${nom} » n'a pas d'équivalent hors ligne.`);
  }
}

function routerVitrineTable(nom: string): Promise<unknown[]> {
  switch (nom) {
    case 'operateur_public':
      return demo.listerOperateurs();
    case 'type_vetement':
      return demo.listerTypes();
    case 'v_stock_disponible':
      return demo.lireStockDisponible();
    case 'v_chez_prestataire':
      return demo.lireChezPrestataire();
    case 'v_en_utilisation':
      return demo.lireEnUtilisation();
    case 'v_linge_sale':
      return demo.lireLingeSale();
    case 'v_controle_facturation':
      return demo.lireControleFacturation();
    case 'v_besoins_previsionnels':
      return demo.lireBesoinsPrevisionnels();
    case 'v_journal_complet':
      return demo.lireJournalComplet();
    case 'v_expeditions_ouvertes':
      return demo.listerExpeditionsOuvertes();
    default:
      throw new Error(`Vitrine : la vue « ${nom} » n'a pas d'équivalent hors ligne.`);
  }
}


/**
 * Sonde de reprise. Hors ligne, plus aucune requête ne part : sans elle,
 * l'application resterait bloquée après le retour de la base.
 */
if (!VITRINE) {
  definirSonde(() => estAdmin());
}
