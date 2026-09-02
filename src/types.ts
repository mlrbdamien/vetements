/** Miroir des enums et vues du schéma `supabase/schema_vetements.sql`. */

export type StatutVetement =
  | 'nouveau'
  | 'en_stock'
  | 'en_utilisation'
  | 'sale'
  | 'chez_prestataire'
  /** État final : rangé à part, ne circule plus. Décidé à la réception. */
  | 'rebut';

export type TypeMouvement =
  | 'RECEPTION'
  | 'SORTIE'
  | 'RETOUR_SALE'
  | 'ENVOI_PRESTATAIRE'
  | 'MISE_AU_REBUT';

/** Le contexte restreint, côté base, les actions déductibles d'un scan. */
export type ContexteScan = 'scan' | 'expedition' | 'reception';

/** Vue `operateur_public` — jamais la table `operateur`. */
export interface Operateur {
  id: number;
  prenom: string;
  nom: string;
  actif: boolean;
  pin_defini: boolean;
}

export interface TypeVetement {
  id: number;
  libelle: string;
  ordre: number;
  actif: boolean;
}

/** Retour de `enregistrer_mouvement`. */
export interface ResultatMouvement {
  mouvement_id: number;
  mouvement_type: TypeMouvement;
  vetement_id: number;
  code_barre: string;
  type_libelle: string;
  taille: number;
  rebut: boolean;
  statut: StatutVetement;
  nb_lavages: number;
  detenteur: string | null;
}

/** Vue `v_linge_sale` — la corbeille, telle que l'écran Expédition l'affiche. */
export interface LingeSale {
  vetement_id: number;
  code_barre: string;
  type_libelle: string;
  type_id: number;
  taille: number;
  rebut: boolean;
  retour_le: string | null;
  jours_depuis_retour: number | null;
}

/** Vue `v_expediable` — le stock, tel que l'écran Expédition le propose. */
export interface Expediable {
  vetement_id: number;
  code_barre: string;
  type_libelle: string;
  type_id: number;
  taille: number;
  nb_lavages: number;
  recu_le: string | null;
  jours_en_stock: number | null;
}

/** Retour de `enregistrer_expedition`. */
export interface ResultatExpedition {
  document_id: number;
  numero: string;
  date: string;
  nb_envoyes: number;
  /** Ce qui est resté `sale` : ni scanné ni coché, donc absent du bac. */
  nb_restants: number;
  /** Le contenu du bac, tel qu'il figure sur le bulletin remis au prestataire. */
  lignes: {
    code_barre: string;
    type_libelle: string;
    taille: number;
    rebut: boolean;
    nb_lavages: number;
  }[];
  /** Interne : ce qui n'est pas parti. N'a pas sa place sur le bulletin remis au prestataire. */
  restants: {
    code_barre: string;
    type_libelle: string;
    taille: number;
    jours: number | null;
  }[];
}

/** Vue `v_expeditions_ouvertes` — les envois sans réception rattachée. */
export interface ExpeditionOuverte {
  id: number;
  numero: string;
  date: string;
  nb_envoyes: number;
  jours: number;
}

/**
 * Une pièce du bac reçu. `type_id`, `taille` et `rebut` ne servent qu'aux
 * codes-barres inconnus, que la base crée à la volée : Le prestataire fournit les
 * vêtements autant qu'il les lave.
 */
export interface LigneReception {
  code_barre: string;
  type_id?: number;
  taille?: number;
  rebut?: boolean;
  /** Renseignés côté client pour l'affichage d'une pièce déjà connue. */
  connu: boolean;
  type_libelle?: string;
}

/** Une ligne du tableau d'écart : ce qui est parti face à ce qui revient. */
export interface EcartReception {
  type_libelle: string;
  taille: number;
  envoyes: number;
  recus: number;
  manquants: number;
}

export interface ResultatReception {
  document_id: number;
  numero: string;
  date: string;
  /** Numéro du bon de livraison d'le prestataire, pour rapprocher les deux papiers. */
  reference_prestataire: string | null;
  /** Vide si la réception n'est rattachée à aucune expédition. */
  ecarts: EcartReception[];
  nb_recus: number;
  /** Références créées à la volée, jamais vues auparavant. */
  nb_crees: number;
  /** Pièces qui revenaient de chez le prestataire : les seules dont le compteur monte. */
  nb_laves: number;
  /** Pièces passées au rebut à cette réception. */
  nb_rebuts: number;
  expedition: string | null;
  lignes: {
    code_barre: string;
    type_libelle: string;
    taille: number;
    rebut: boolean;
    nb_lavages: number;
  }[];
}

/** Vue `v_compteurs` — l'état du parc en une ligne, pour la barre latérale. */
export interface Compteurs {
  en_stock: number;
  en_utilisation: number;
  sale: number;
  chez_prestataire: number;
  parc_total: number;
  /** Combinaisons type × taille sous leur seuil minimum. */
  sous_seuil: number;
  /** Pièces détenues par un collaborateur désactivé — personne ne les réclame. */
  detenteurs_inactifs: number;
  /** Expéditions dont le retour n'est pas encore arrivé. */
  expeditions_ouvertes: number;
  /** Pièces au rebut : rangées à part, ne circulent plus. */
  rebut: number;
}

/* --- Lot 4 : fiche vêtement et tableaux de bord -------------------------- */

/** Vue `v_vetement` — la fiche, et la surface de recherche du parc. */
export interface Vetement {
  vetement_id: number;
  code_barre: string;
  type_id: number;
  type_libelle: string;
  taille: number;
  rebut: boolean;
  statut: StatutVetement;
  nb_lavages: number;
  detenteur_id: number | null;
  detenteur: string | null;
  detenteur_actif: boolean | null;
  cree_le: string;
  dernier_mouvement_le: string | null;
}

/** Vue `v_historique_vetement` — une ligne par mouvement, annulations comprises. */
export interface LigneHistorique {
  mouvement_id: number;
  vetement_id: number;
  code_barre: string;
  type: TypeMouvement;
  horodatage: string;
  operateur: string | null;
  document: string | null;
  annule: boolean;
  annule_le: string | null;
  annule_par: string | null;
  annule_par_admin: boolean;
}

export interface StockDisponible {
  type_id: number;
  type_libelle: string;
  taille: number;
  disponible: number;
  /** Au rebut : compté à part, ne comble jamais un manque. */
  au_rebut: number;
  en_utilisation: number;
  sale: number;
  chez_prestataire: number;
  parc_total: number;
  minimum: number | null;
  manque: number;
}

export interface ChezPrestataire {
  vetement_id: number;
  code_barre: string;
  type_libelle: string;
  taille: number;
  rebut: boolean;
  envoye_le: string;
  bulletin_expedition: string | null;
  jours_chez_prestataire: number;
}

export interface EnUtilisation {
  vetement_id: number;
  code_barre: string;
  type_libelle: string;
  taille: number;
  rebut: boolean;
  detenteur_id: number;
  detenteur: string;
  detenteur_actif: boolean;
  sorti_le: string;
  jours_en_utilisation: number;
}

/**
 * Vue `v_controle_facturation`.
 *
 * `rapproche` distingue un bac dont le retour est arrivé d'un bac encore chez
 * le prestataire. Sans lui, tout envoi récent apparaîtrait comme une perte, et le seul
 * chiffre qui sert à contester une facture perdrait toute crédibilité.
 * `manquants` est donc nul — pas zéro — tant que le retour n'est pas là.
 */
export interface ControleFacturation {
  bulletin_expedition: string;
  date_expedition: string;
  bulletin_reception: string | null;
  date_reception: string | null;
  type_libelle: string;
  taille: number;
  envoyes: number;
  recus: number;
  rapproche: boolean;
  manquants: number | null;
}

export interface BesoinPrevisionnel {
  type_id: number;
  type_libelle: string;
  taille: number;
  demande_quotidienne: number;
  duree_cycle_jours: number;
  parc_reel: number;
  parc_recommande: number;
  ecart: number;
}

/** Une ligne du journal complet, telle qu'elle part à l'export. */
export interface LigneJournal {
  mouvement_id: number;
  horodatage: string;
  type: TypeMouvement;
  code_barre: string;
  type_libelle: string;
  taille: number;
  rebut: boolean;
  operateur: string | null;
  document: string | null;
  document_genre: string | null;
  annule: boolean;
  annule_le: string | null;
  annule_par: string | null;
  annule_par_admin: boolean;
}

export const LIBELLE_STATUT: Record<StatutVetement, string> = {
  nouveau: 'Jamais réceptionné',
  en_stock: 'En stock',
  en_utilisation: 'En utilisation',
  sale: 'Linge sale',
  chez_prestataire: 'Chez le prestataire',
  rebut: 'Au rebut',
};

export const LIBELLE_MOUVEMENT: Record<TypeMouvement, string> = {
  RECEPTION: 'Réception',
  SORTIE: 'Sortie',
  RETOUR_SALE: 'Retour sale',
  ENVOI_PRESTATAIRE: 'Envoi chez le prestataire',
  MISE_AU_REBUT: 'Mise au rebut',
};

export function nomComplet(o: Pick<Operateur, 'prenom' | 'nom'>): string {
  return `${o.prenom} ${o.nom}`.trim();
}
