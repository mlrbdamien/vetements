/** Miroir des enums et vues du schéma `supabase/schema_vetements_p24.sql`. */

export type StatutVetement =
  | 'nouveau'
  | 'en_stock'
  | 'en_utilisation'
  | 'sale'
  | 'chez_elis';

export type TypeMouvement =
  | 'RECEPTION'
  | 'SORTIE'
  | 'RETOUR_SALE'
  | 'ENVOI_ELIS';

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

/** Retour de `enregistrer_expedition`. */
export interface ResultatExpedition {
  document_id: number;
  numero: string;
  date: string;
  nb_envoyes: number;
  /** Ce qui est resté `sale` : ni scanné ni coché, donc absent du bac. */
  nb_restants: number;
  /** Le contenu du bac, tel qu'il figure sur le bulletin remis à Elis. */
  lignes: {
    code_barre: string;
    type_libelle: string;
    taille: number;
    rebut: boolean;
    nb_lavages: number;
  }[];
  /** Interne : ce qui n'est pas parti. N'a pas sa place sur le papier Elis. */
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
 * codes-barres inconnus, que la base crée à la volée : Elis fournit les
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
  /** Numéro du bon de livraison d'Elis, pour rapprocher les deux papiers. */
  reference_elis: string | null;
  /** Vide si la réception n'est rattachée à aucune expédition. */
  ecarts: EcartReception[];
  nb_recus: number;
  /** Références créées à la volée, jamais vues auparavant. */
  nb_crees: number;
  /** Pièces qui revenaient de chez Elis : les seules dont le compteur monte. */
  nb_laves: number;
  expedition: string | null;
  lignes: {
    code_barre: string;
    type_libelle: string;
    taille: number;
    rebut: boolean;
    nb_lavages: number;
  }[];
}

export const LIBELLE_STATUT: Record<StatutVetement, string> = {
  nouveau: 'Jamais réceptionné',
  en_stock: 'En stock',
  en_utilisation: 'En utilisation',
  sale: 'Linge sale',
  chez_elis: 'Chez Elis',
};

export const LIBELLE_MOUVEMENT: Record<TypeMouvement, string> = {
  RECEPTION: 'Réception',
  SORTIE: 'Sortie',
  RETOUR_SALE: 'Retour sale',
  ENVOI_ELIS: 'Envoi chez Elis',
};

export function nomComplet(o: Pick<Operateur, 'prenom' | 'nom'>): string {
  return `${o.prenom} ${o.nom}`.trim();
}
