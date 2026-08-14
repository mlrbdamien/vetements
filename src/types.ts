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
