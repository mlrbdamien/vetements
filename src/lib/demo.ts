/**
 * Vitrine : un modèle en mémoire, sans backend.
 *
 * Ce module rejoue en JavaScript ce que fait le schéma PostgreSQL — cycle de
 * vie, transitions interdites, rejeu du journal, messages d'erreur français.
 * Il sert au build public destiné aux parties prenantes.
 *
 * Il n'existe QUE pour la vitrine. La production passe par Supabase, où ces
 * règles sont tenues par la base et non par le navigateur : ici, tout est
 * réécrivable depuis la console, ce qui n'aurait aucun sens en pharmacie.
 * Un rechargement de page remet tout à zéro.
 */
import type {
  BesoinPrevisionnel,
  ChezElis,
  Compteurs,
  ContexteScan,
  ControleFacturation,
  EnUtilisation,
  LigneHistorique,
  LigneJournal,
  LingeSale,
  Operateur,
  ResultatMouvement,
  StatutVetement,
  StockDisponible,
  TypeMouvement,
  TypeVetement,
  Vetement,
} from '../types';

export const VITRINE = import.meta.env.VITE_VITRINE === '1';

/* --- Modèle ------------------------------------------------------------- */

interface VetementInterne {
  id: number;
  code_barre: string;
  type_id: number;
  taille: number;
  rebut: boolean;
  statut: StatutVetement;
  nb_lavages: number;
  detenteur_id: number | null;
  cree_le: string;
}

interface MouvementInterne {
  id: number;
  vetement_id: number;
  type: TypeMouvement;
  operateur_id: number | null;
  document_id: number | null;
  horodatage: string;
  annule: boolean;
  annule_le: string | null;
  annule_par: number | null;
}

const TYPES: TypeVetement[] = [
  { id: 1, libelle: 'Blouse bleue', ordre: 1, actif: true },
  { id: 2, libelle: 'Blouse balance', ordre: 2, actif: true },
  { id: 3, libelle: 'Tunique', ordre: 3, actif: true },
  { id: 4, libelle: 'Pantalon', ordre: 4, actif: true },
  { id: 5, libelle: 'Chaussettes', ordre: 5, actif: true },
];

/** Les codes sont affichés sur la vitrine : ce sont de faux comptes. */
const PINS: Record<number, string> = { 1: '1234', 2: '5678' };

const OPERATEURS: Operateur[] = [
  { id: 1, prenom: 'Chantal', nom: 'Berset', actif: true, pin_defini: true },
  { id: 2, prenom: 'Tanguy', nom: 'Devaud', actif: true, pin_defini: true },
  { id: 3, prenom: 'Morgan', nom: 'Rieder', actif: true, pin_defini: false },
  { id: 4, prenom: 'Alix', nom: 'Fournier', actif: true, pin_defini: false },
  { id: 5, prenom: 'Guillaume', nom: '', actif: false, pin_defini: false },
];

const DOCUMENTS: { id: number; numero: string; genre: string; date: string; expedition_liee_id: number | null }[] = [];
const VETEMENTS: VetementInterne[] = [];
const MOUVEMENTS: MouvementInterne[] = [];

let prochainMouvement = 1;

const jour = 86_400_000;
const ilYA = (n: number) => new Date(Date.now() - n * jour).toISOString();

function typeLibelle(id: number) {
  return TYPES.find((t) => t.id === id)?.libelle ?? '—';
}

function nomOperateur(id: number | null) {
  const o = OPERATEURS.find((x) => x.id === id);
  return o ? `${o.prenom} ${o.nom}`.trim() : null;
}

/* --- Amorce -------------------------------------------------------------- */

/** Deux bulletins d'expédition, dont le dernier attend encore son retour. */
function amorcerDocuments() {
  DOCUMENTS.push(
    { id: 1, numero: 'EXP-2026-0001', genre: 'expedition', date: ilYA(24).slice(0, 10), expedition_liee_id: null },
    { id: 2, numero: 'REC-2026-0001', genre: 'reception', date: ilYA(20).slice(0, 10), expedition_liee_id: 1 },
    { id: 3, numero: 'EXP-2026-0002', genre: 'expedition', date: ilYA(4).slice(0, 10), expedition_liee_id: null },
  );
}

function ajouterMouvement(
  vetementId: number,
  type: TypeMouvement,
  operateurId: number | null,
  jours: number,
  documentId: number | null = null,
) {
  MOUVEMENTS.push({
    id: prochainMouvement++,
    vetement_id: vetementId,
    type,
    operateur_id: operateurId,
    document_id: documentId,
    horodatage: ilYA(jours),
    annule: false,
    annule_le: null,
    annule_par: null,
  });
}

/**
 * Le parc : 24 pièces réparties sur les cinq types, avec des trajectoires
 * volontairement différentes pour que chaque tableau de bord ait de la matière
 * — des pièces en stock, une sortie qui traîne, une corbeille non vide, un bac
 * encore chez Elis et une pièce jamais revenue du précédent.
 */
function amorcerParc() {
  let id = 1;
  for (const type of TYPES) {
    for (const taille of [3, 4, 5]) {
      const n = type.id === 5 ? 1 : 2; // une seule paire de chaussettes par taille
      for (let k = 0; k < n; k++) {
        VETEMENTS.push({
          id,
          code_barre: `P24-${String(id).padStart(4, '0')}`,
          type_id: type.id,
          taille,
          rebut: id % 9 === 0,
          statut: 'nouveau',
          nb_lavages: 0,
          detenteur_id: null,
          cree_le: ilYA(60),
        });
        id++;
      }
    }
  }

  for (const v of VETEMENTS) {
    // Entrée du neuf : ne compte pas comme un lavage.
    ajouterMouvement(v.id, 'RECEPTION', 1, 60);

    // Premier cycle complet, du bac parti il y a 24 jours.
    ajouterMouvement(v.id, 'SORTIE', v.id % 2 ? 1 : 2, 34);
    ajouterMouvement(v.id, 'RETOUR_SALE', v.id % 2 ? 1 : 2, 27);
    ajouterMouvement(v.id, 'ENVOI_ELIS', 1, 24, 1);

    // Une pièce n'est jamais revenue de ce bac : c'est l'écart que le
    // contrôle de facturation doit chiffrer.
    if (v.id === 7) continue;
    ajouterMouvement(v.id, 'RECEPTION', 2, 20, 2);

    // Second cycle, partiel : chaque pièce s'arrête à un endroit différent.
    const reste = v.id % 5;
    if (reste === 0) continue; // reste en stock
    ajouterMouvement(v.id, 'SORTIE', v.id % 2 ? 2 : 1, 12);
    if (reste === 1) continue; // encore sortie
    ajouterMouvement(v.id, 'RETOUR_SALE', v.id % 2 ? 2 : 1, 7);
    if (reste === 2) continue; // attend dans la corbeille
    ajouterMouvement(v.id, 'ENVOI_ELIS', 1, 4, 3);
  }

  VETEMENTS.forEach((v) => recalculer(v.id));
}

/* --- Rejeu du journal ---------------------------------------------------- */

/** Miroir exact de `recalculer_vetement` : on rejoue, on ne défait jamais. */
function recalculer(vetementId: number) {
  const v = VETEMENTS.find((x) => x.id === vetementId);
  if (!v) return;

  let statut: StatutVetement = 'nouveau';
  let lavages = 0;
  let detenteur: number | null = null;

  MOUVEMENTS.filter((m) => m.vetement_id === vetementId && !m.annule)
    .sort((a, b) => a.horodatage.localeCompare(b.horodatage) || a.id - b.id)
    .forEach((m) => {
      switch (m.type) {
        case 'RECEPTION':
          // Le compteur ne monte qu'au retour de chez Elis.
          if (statut === 'chez_elis') lavages++;
          statut = 'en_stock';
          detenteur = null;
          break;
        case 'SORTIE':
          statut = 'en_utilisation';
          detenteur = m.operateur_id;
          break;
        case 'RETOUR_SALE':
          statut = 'sale';
          detenteur = null;
          break;
        case 'ENVOI_ELIS':
          statut = 'chez_elis';
          detenteur = null;
          break;
      }
    });

  v.statut = statut;
  v.nb_lavages = lavages;
  v.detenteur_id = detenteur;
}

amorcerDocuments();
amorcerParc();

/* --- Erreurs ------------------------------------------------------------- */

/** Même classe que la production : le message s'affiche tel quel. */
export class ErreurVitrine extends Error {}

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

const libelleStatut: Record<StatutVetement, string> = {
  nouveau: 'jamais réceptionné',
  en_stock: 'en stock',
  en_utilisation: 'en utilisation',
  sale: 'linge sale',
  chez_elis: 'chez Elis',
};

/* --- API ----------------------------------------------------------------- */

export const demo = {
  async listerOperateurs(): Promise<Operateur[]> {
    return [...OPERATEURS].sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'));
  },

  async listerTypes(): Promise<TypeVetement[]> {
    return [...TYPES];
  },

  /** La vitrine ouvre tous les écrans : il n'y a rien à protéger. */
  async estAdmin(): Promise<boolean> {
    return true;
  },

  async verifierPin(operateurId: number, pin: string): Promise<boolean> {
    const o = OPERATEURS.find((x) => x.id === operateurId);
    if (!o) throw new ErreurVitrine('Opérateur inconnu.');
    if (!o.actif) throw new ErreurVitrine(`Le compte de ${o.prenom} ${o.nom} est désactivé.`);
    if (!PINS[operateurId]) {
      throw new ErreurVitrine(
        `Aucun code PIN défini pour ${o.prenom}. Demandez à l'administratrice de l'initialiser.`,
      );
    }
    return PINS[operateurId] === pin;
  },

  async enregistrerMouvement(
    codeBarre: string,
    operateurId: number,
    pin: string,
    contexte: ContexteScan = 'scan',
  ): Promise<ResultatMouvement> {
    if (!(await demo.verifierPin(operateurId, pin))) {
      throw new ErreurVitrine('Code PIN incorrect.');
    }

    const v = VETEMENTS.find((x) => x.code_barre === codeBarre.trim());
    if (!v) {
      throw new ErreurVitrine(
        `Code-barre inconnu : ${codeBarre.trim()}. Cette référence doit d'abord être créée en entrée marchandise.`,
      );
    }

    const dernier = MOUVEMENTS.filter((m) => m.vetement_id === v.id && !m.annule).at(-1);
    let type: TypeMouvement;

    if (contexte === 'scan') {
      if (v.statut === 'en_stock') type = 'SORTIE';
      else if (v.statut === 'en_utilisation') type = 'RETOUR_SALE';
      else if (v.statut === 'sale') {
        throw new ErreurVitrine(
          'Ce vêtement est déjà dans la corbeille du linge sale, il partira au prochain envoi Elis.',
        );
      } else if (v.statut === 'chez_elis') {
        throw new ErreurVitrine(
          `Ce vêtement est chez Elis depuis le ${dateFr(dernier?.horodatage ?? v.cree_le)}. Il doit être réceptionné avant d'être repris.`,
        );
      } else {
        throw new ErreurVitrine(
          "Ce vêtement n'a jamais été réceptionné. Passez par l'entrée marchandise.",
        );
      }
    } else if (contexte === 'expedition') {
      if (v.statut !== 'sale') {
        throw new ErreurVitrine(
          `Seul le linge sale part chez Elis. Ce vêtement est actuellement « ${libelleStatut[v.statut]} ».`,
        );
      }
      type = 'ENVOI_ELIS';
    } else {
      if (v.statut !== 'nouveau' && v.statut !== 'chez_elis') {
        throw new ErreurVitrine(
          `Ce vêtement n'était pas chez Elis : il est « ${libelleStatut[v.statut]} ». Réception impossible.`,
        );
      }
      type = 'RECEPTION';
    }

    const id = prochainMouvement++;
    MOUVEMENTS.push({
      id,
      vetement_id: v.id,
      type,
      operateur_id: operateurId,
      document_id: null,
      horodatage: new Date().toISOString(),
      annule: false,
      annule_le: null,
      annule_par: null,
    });
    recalculer(v.id);

    return {
      mouvement_id: id,
      mouvement_type: type,
      vetement_id: v.id,
      code_barre: v.code_barre,
      type_libelle: typeLibelle(v.type_id),
      taille: v.taille,
      rebut: v.rebut,
      statut: v.statut,
      nb_lavages: v.nb_lavages,
      detenteur: nomOperateur(v.detenteur_id),
    };
  },

  async annulerMouvement(mouvementId: number): Promise<unknown> {
    const m = MOUVEMENTS.find((x) => x.id === mouvementId);
    if (!m) throw new ErreurVitrine('Mouvement introuvable.');
    if (m.annule) {
      throw new ErreurVitrine(`Ce mouvement a déjà été annulé le ${dateFr(m.annule_le!)}.`);
    }
    m.annule = true;
    m.annule_le = new Date().toISOString();
    m.annule_par = m.operateur_id;
    recalculer(m.vetement_id);
    return {};
  },

  async lireCompteurs(): Promise<Compteurs> {
    const par = (s: StatutVetement) => VETEMENTS.filter((v) => v.statut === s).length;
    const stock = await demo.lireStockDisponible();
    return {
      en_stock: par('en_stock'),
      en_utilisation: par('en_utilisation'),
      sale: par('sale'),
      chez_elis: par('chez_elis'),
      parc_total: VETEMENTS.length,
      sous_seuil: stock.filter((s) => s.manque > 0).length,
      detenteurs_inactifs: VETEMENTS.filter(
        (v) => v.detenteur_id !== null && !OPERATEURS.find((o) => o.id === v.detenteur_id)?.actif,
      ).length,
      expeditions_ouvertes: DOCUMENTS.filter(
        (d) => d.genre === 'expedition' && !DOCUMENTS.some((r) => r.expedition_liee_id === d.id),
      ).length,
    };
  },

  async lireDerniersMouvements(limite = 8): Promise<LigneJournal[]> {
    return (await demo.lireJournalComplet()).slice(0, limite);
  },

  async lireJournalComplet(): Promise<LigneJournal[]> {
    return MOUVEMENTS.map((m) => {
      const v = VETEMENTS.find((x) => x.id === m.vetement_id)!;
      const d = DOCUMENTS.find((x) => x.id === m.document_id);
      return {
        mouvement_id: m.id,
        horodatage: m.horodatage,
        type: m.type,
        code_barre: v.code_barre,
        type_libelle: typeLibelle(v.type_id),
        taille: v.taille,
        rebut: v.rebut,
        operateur: nomOperateur(m.operateur_id),
        document: d?.numero ?? null,
        document_genre: d?.genre ?? null,
        annule: m.annule,
        annule_le: m.annule_le,
        annule_par: nomOperateur(m.annule_par),
        annule_par_admin: false,
      };
    }).sort((a, b) => b.horodatage.localeCompare(a.horodatage));
  },

  async chercherParc(terme: string): Promise<Vetement[]> {
    const t = terme.trim().toLowerCase();
    return VETEMENTS.filter((v) => !t || v.code_barre.toLowerCase().includes(t))
      .map((v) => demo.enVetement(v))
      .sort((a, b) => a.code_barre.localeCompare(b.code_barre));
  },

  enVetement(v: VetementInterne): Vetement {
    const dernier = MOUVEMENTS.filter((m) => m.vetement_id === v.id && !m.annule).at(-1);
    const det = OPERATEURS.find((o) => o.id === v.detenteur_id);
    return {
      vetement_id: v.id,
      code_barre: v.code_barre,
      type_id: v.type_id,
      type_libelle: typeLibelle(v.type_id),
      taille: v.taille,
      rebut: v.rebut,
      statut: v.statut,
      nb_lavages: v.nb_lavages,
      detenteur_id: v.detenteur_id,
      detenteur: nomOperateur(v.detenteur_id),
      detenteur_actif: det ? det.actif : null,
      cree_le: v.cree_le,
      dernier_mouvement_le: dernier?.horodatage ?? null,
    };
  },

  async lireHistorique(vetementId: number): Promise<LigneHistorique[]> {
    const v = VETEMENTS.find((x) => x.id === vetementId)!;
    return MOUVEMENTS.filter((m) => m.vetement_id === vetementId)
      .map((m) => ({
        mouvement_id: m.id,
        vetement_id: m.vetement_id,
        code_barre: v.code_barre,
        type: m.type,
        horodatage: m.horodatage,
        operateur: nomOperateur(m.operateur_id),
        document: DOCUMENTS.find((d) => d.id === m.document_id)?.numero ?? null,
        annule: m.annule,
        annule_le: m.annule_le,
        annule_par: nomOperateur(m.annule_par),
        annule_par_admin: false,
      }))
      .sort((a, b) => b.horodatage.localeCompare(a.horodatage));
  },

  async lireStockDisponible(): Promise<StockDisponible[]> {
    const seuils: Record<string, number> = {
      '1-3': 2, '1-4': 3, '2-4': 2, '3-3': 2, '4-4': 3, '4-7': 2, '5-4': 2,
    };
    const cles = new Set([
      ...VETEMENTS.map((v) => `${v.type_id}-${v.taille}`),
      ...Object.keys(seuils),
    ]);

    return [...cles]
      .map((cle) => {
        const [ti, ta] = cle.split('-').map(Number);
        const lot = VETEMENTS.filter((v) => v.type_id === ti && v.taille === ta);
        const compte = (s: StatutVetement, rebut?: boolean) =>
          lot.filter((v) => v.statut === s && (rebut === undefined || v.rebut === rebut)).length;
        const dispo = compte('en_stock', false);
        const minimum = seuils[cle] ?? null;
        return {
          type_id: ti!,
          type_libelle: typeLibelle(ti!),
          taille: ta!,
          disponible: dispo,
          disponible_rebut: compte('en_stock', true),
          en_utilisation: compte('en_utilisation'),
          sale: compte('sale'),
          chez_elis: compte('chez_elis'),
          parc_total: lot.length,
          minimum,
          manque: Math.max((minimum ?? 0) - dispo, 0),
        };
      })
      .sort((a, b) => a.type_libelle.localeCompare(b.type_libelle) || a.taille - b.taille);
  },

  async lireChezElis(): Promise<ChezElis[]> {
    return VETEMENTS.filter((v) => v.statut === 'chez_elis').map((v) => {
      const m = MOUVEMENTS.filter(
        (x) => x.vetement_id === v.id && x.type === 'ENVOI_ELIS' && !x.annule,
      ).at(-1)!;
      return {
        vetement_id: v.id,
        code_barre: v.code_barre,
        type_libelle: typeLibelle(v.type_id),
        taille: v.taille,
        rebut: v.rebut,
        envoye_le: m.horodatage,
        bulletin_expedition: DOCUMENTS.find((d) => d.id === m.document_id)?.numero ?? null,
        jours_chez_elis: Math.floor((Date.now() - Date.parse(m.horodatage)) / jour),
      };
    });
  },

  async lireEnUtilisation(): Promise<EnUtilisation[]> {
    return VETEMENTS.filter((v) => v.statut === 'en_utilisation').map((v) => {
      const m = MOUVEMENTS.filter(
        (x) => x.vetement_id === v.id && x.type === 'SORTIE' && !x.annule,
      ).at(-1)!;
      const o = OPERATEURS.find((x) => x.id === v.detenteur_id)!;
      return {
        vetement_id: v.id,
        code_barre: v.code_barre,
        type_libelle: typeLibelle(v.type_id),
        taille: v.taille,
        rebut: v.rebut,
        detenteur_id: o.id,
        detenteur: `${o.prenom} ${o.nom}`.trim(),
        detenteur_actif: o.actif,
        sorti_le: m.horodatage,
        jours_en_utilisation: Math.floor((Date.now() - Date.parse(m.horodatage)) / jour),
      };
    });
  },

  async lireLingeSale(): Promise<LingeSale[]> {
    return VETEMENTS.filter((v) => v.statut === 'sale')
      .map((v) => {
        const m = MOUVEMENTS.filter(
          (x) => x.vetement_id === v.id && x.type === 'RETOUR_SALE' && !x.annule,
        ).at(-1);
        return {
          vetement_id: v.id,
          code_barre: v.code_barre,
          type_libelle: typeLibelle(v.type_id),
          type_id: v.type_id,
          taille: v.taille,
          rebut: v.rebut,
          retour_le: m?.horodatage ?? null,
          jours_depuis_retour: m
            ? Math.floor((Date.now() - Date.parse(m.horodatage)) / jour)
            : null,
        };
      })
      .sort((a, b) => (b.jours_depuis_retour ?? 0) - (a.jours_depuis_retour ?? 0));
  },

  async lireControleFacturation(): Promise<ControleFacturation[]> {
    const lignes: ControleFacturation[] = [];

    for (const exp of DOCUMENTS.filter((d) => d.genre === 'expedition')) {
      const rec = DOCUMENTS.find((d) => d.expedition_liee_id === exp.id) ?? null;
      const envois = MOUVEMENTS.filter(
        (m) => m.type === 'ENVOI_ELIS' && m.document_id === exp.id && !m.annule,
      );

      const groupes = new Map<string, { envoyes: number; recus: number }>();
      for (const m of envois) {
        const v = VETEMENTS.find((x) => x.id === m.vetement_id)!;
        const cle = `${v.type_id}-${v.taille}`;
        const g = groupes.get(cle) ?? { envoyes: 0, recus: 0 };
        g.envoyes++;
        groupes.set(cle, g);
      }
      if (rec) {
        for (const m of MOUVEMENTS.filter(
          (x) => x.type === 'RECEPTION' && x.document_id === rec.id && !x.annule,
        )) {
          const v = VETEMENTS.find((x) => x.id === m.vetement_id)!;
          const cle = `${v.type_id}-${v.taille}`;
          const g = groupes.get(cle) ?? { envoyes: 0, recus: 0 };
          g.recus++;
          groupes.set(cle, g);
        }
      }

      for (const [cle, g] of groupes) {
        const [ti, ta] = cle.split('-').map(Number);
        lignes.push({
          bulletin_expedition: exp.numero,
          date_expedition: exp.date,
          bulletin_reception: rec?.numero ?? null,
          date_reception: rec?.date ?? null,
          type_libelle: typeLibelle(ti!),
          taille: ta!,
          envoyes: g.envoyes,
          recus: g.recus,
          rapproche: rec !== null,
          // Un bac encore chez Elis n'a pas de manquant : il a un retour à venir.
          manquants: rec ? g.envoyes - g.recus : null,
        });
      }
    }
    return lignes;
  },

  async lireBesoinsPrevisionnels(): Promise<BesoinPrevisionnel[]> {
    const stock = await demo.lireStockDisponible();
    return stock
      .filter((s) => s.parc_total > 0)
      .map((s) => {
        const sorties = MOUVEMENTS.filter((m) => {
          const v = VETEMENTS.find((x) => x.id === m.vetement_id)!;
          return m.type === 'SORTIE' && !m.annule && v.type_id === s.type_id && v.taille === s.taille;
        }).length;
        const parJour = sorties / 60;
        const cycle = 14;
        const conseille = Math.ceil(parJour * cycle * 1.2);
        return {
          type_id: s.type_id,
          type_libelle: s.type_libelle,
          taille: s.taille,
          demande_quotidienne: Math.round(parJour * 100) / 100,
          duree_cycle_jours: cycle,
          parc_reel: s.parc_total,
          parc_recommande: conseille,
          ecart: Math.max(conseille - s.parc_total, 0),
        };
      });
  },

  async listerExpeditionsOuvertes() {
    return DOCUMENTS.filter(
      (d) => d.genre === 'expedition' && !DOCUMENTS.some((r) => r.expedition_liee_id === d.id),
    ).map((d) => ({
      id: d.id,
      numero: d.numero,
      date: d.date,
      nb_envoyes: MOUVEMENTS.filter((m) => m.document_id === d.id && !m.annule).length,
      jours: Math.floor((Date.now() - Date.parse(d.date)) / jour),
    }));
  },

  async vetementsDetenus(operateurId: number) {
    return (await demo.lireEnUtilisation())
      .filter((v) => v.detenteur_id === operateurId)
      .map((v) => ({
        code_barre: v.code_barre,
        type_libelle: v.type_libelle,
        taille: v.taille,
        jours_en_utilisation: v.jours_en_utilisation,
      }));
  },

  /** L'administration n'écrit rien sur la vitrine : elle explique pourquoi. */
  async refuserEcriture(): Promise<never> {
    throw new ErreurVitrine(
      "Ceci est une démonstration : les modifications ne sont pas enregistrées. Sur l'application réelle, cette action serait appliquée en base.",
    );
  },
};
