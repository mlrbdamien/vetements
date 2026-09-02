/**
 * Fonctionnalités masquées, pas supprimées.
 *
 * Les opérateurs ne prennent pas leurs vêtements pour le moment : une pièce
 * est en stock au laboratoire, chez le prestataire, ou au rebut. Les statuts
 * « en utilisation » et « linge sale » existent toujours en base — l'écran
 * Scan les déclencherait si un opérateur actif existait — mais aucun écran
 * de suivi ne les montre.
 *
 * Passer à `true` réaffiche les compteurs et la vue correspondants, sans
 * migration : le modèle n'a jamais bougé.
 */
export const SORTIES_ACTIVES = false;
