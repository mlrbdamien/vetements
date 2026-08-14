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
