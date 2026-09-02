import { useCallback, useEffect, useState } from 'react';
import {
  Boxes,
  Clock,
  Download,
  FileWarning,
  Hourglass,
  Info,
  Sheet,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import {
  definirSeuil,
  lireBesoinsPrevisionnels,
  lireChezPrestataire,
  lireControleFacturation,
  lireEnUtilisation,
  lireJournalComplet,
  lireStockDisponible,
} from '../lib/api';
import { exporterClasseur, formatDate, formatHorodatage } from '../lib/export';
import { useSession } from '../lib/session';
import { SORTIES_ACTIVES } from '../lib/fonctionnalites';
import {
  LIBELLE_MOUVEMENT,
  type BesoinPrevisionnel,
  type ChezPrestataire,
  type ControleFacturation,
  type EnUtilisation,
  type LigneJournal,
  type StockDisponible,
} from '../types';
import { Tableau, type ColonneTableau } from '../components/Tableau';
import {
  Alerte,
  Button,
  Card,
  Chargement,
  cn,
  inputClass,
} from '../components/ui';

/** Au-delà, une pièce restée dehors mérite qu'on la réclame. */
const JOURS_UTILISATION_SUSPECT = 21;
/** Au-delà, un séjour chez le prestataire sort de l'ordinaire et se discute. */
const JOURS_PRESTATAIRE_SUSPECT = 14;

type Vue =
  | 'stock'
  | 'prestataire'
  | 'utilisation'
  | 'facturation'
  | 'besoins'
  | 'journal';

const VUES: { id: Vue; libelle: string; icone: typeof Boxes }[] = [
  { id: 'stock', libelle: 'Stock', icone: Boxes },
  { id: 'prestataire', libelle: 'Chez le prestataire', icone: Hourglass },
  // Les sorties sont masquées pour le moment : sans opérateur actif, cette
  // vue serait toujours vide.
  ...(SORTIES_ACTIVES
    ? [{ id: 'utilisation' as Vue, libelle: 'En utilisation', icone: Clock }]
    : []),
  { id: 'facturation', libelle: 'Facturation', icone: FileWarning },
  { id: 'besoins', libelle: 'Besoins', icone: TrendingUp },
  { id: 'journal', libelle: 'Journal', icone: Download },
];

export function TableauxDeBord() {
  const [vue, setVue] = useState<Vue>('stock');
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1.5">
        {VUES.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setVue(v.id);
              setErreur(null);
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer',
              vue === v.id
                ? 'bg-accent-soft text-accent'
                : 'bg-surface-2 text-ink-2 hover:bg-line',
            )}
          >
            <v.icone size={14} strokeWidth={1.75} />
            {v.libelle}
          </button>
        ))}
      </nav>

      {erreur && <Alerte>{erreur}</Alerte>}

      {vue === 'stock' && <Stock onErreur={setErreur} />}
      {vue === 'prestataire' && <ChezPrestataireVue onErreur={setErreur} />}
      {vue === 'utilisation' && <EnUtilisationVue onErreur={setErreur} />}
      {vue === 'facturation' && <Facturation onErreur={setErreur} />}
      {vue === 'besoins' && <Besoins onErreur={setErreur} />}
      {vue === 'journal' && <Journal onErreur={setErreur} />}
    </div>
  );
}

/** Charge une vue une fois, en remontant l'erreur au conteneur. */
function useVue<T>(
  charger: () => Promise<T[]>,
  onErreur: (e: string) => void,
): [T[], () => void, boolean] {
  const [lignes, setLignes] = useState<T[]>([]);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(() => {
    setChargement(true);
    charger()
      .then(setLignes)
      .catch((e: Error) => onErreur(e.message))
      .finally(() => setChargement(false));
    // `charger` est recréé à chaque rendu par l'appelant ; le dépendre ici
    // bouclerait. La vue se recharge sur demande explicite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(recharger, [recharger]);
  return [lignes, recharger, chargement];
}

/* --- Stock disponible et seuils ------------------------------------------ */

function Stock({ onErreur }: { onErreur: (e: string) => void }) {
  const { admin } = useSession();
  const [stock, recharger, chargement] = useVue<StockDisponible>(
    lireStockDisponible,
    onErreur,
  );

  const enManque = stock.filter((s) => s.manque > 0).length;
  const sansSeuil = stock.filter((s) => s.minimum === null).length;

  const colonnes: ColonneTableau<StockDisponible>[] = [
    { cle: 'type_libelle', entete: 'Type', largeur: 18 },
    { cle: 'taille', entete: 'Taille', nombre: true, largeur: 8 },
    {
      cle: 'disponible',
      entete: 'Disponible',
      nombre: true,
      largeur: 11,
      rendu: (s) => (
        <span className={cn(s.manque > 0 && 'text-critical-text font-semibold')}>
          {s.disponible}
        </span>
      ),
    },
    ...(SORTIES_ACTIVES
      ? [
          { cle: 'en_utilisation' as const, entete: 'En utilisation', nombre: true, largeur: 13 },
          { cle: 'sale' as const, entete: 'Sale', nombre: true, largeur: 8 },
        ]
      : []),
    { cle: 'chez_prestataire', entete: 'Chez le prestataire', nombre: true, largeur: 10 },
    { cle: 'au_rebut', entete: 'Au rebut', nombre: true, largeur: 10 },
    { cle: 'parc_total', entete: 'Parc', nombre: true, largeur: 8 },
    {
      cle: 'minimum',
      entete: 'Seuil',
      nombre: true,
      largeur: 8,
      rendu: (s) =>
        admin ? (
          <ChampSeuil ligne={s} onFait={recharger} onErreur={onErreur} />
        ) : (
          <span className={cn(s.minimum === null && 'text-ink-3')}>
            {s.minimum ?? '—'}
          </span>
        ),
    },
    {
      cle: 'manque',
      entete: 'Manque',
      nombre: true,
      largeur: 9,
      rendu: (s) =>
        s.manque > 0 ? (
          <span className="text-critical-text font-semibold">{s.manque}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ];

  if (chargement && stock.length === 0) return <Chargement quoi="Lecture du stock" />;

  return (
    <Tableau
      titre="Stock disponible"
      description={
        <>
          Ce qui est en stock au laboratoire, prêt à partir au lavage. Les
          pièces au rebut sont comptées à part : rangées ailleurs, elles ne
          circulent plus et ne comblent jamais un manque.
          {sansSeuil > 0 && (
            <>
              {' '}
              <span className="text-warning-text">
                {sansSeuil} combinaison(s) sans seuil
              </span>{' '}
              — sans seuil, aucun manque ne peut être signalé.
            </>
          )}
        </>
      }
      colonnes={colonnes}
      lignes={stock}
      cle={(s) => `${s.type_id}-${s.taille}`}
      nomExport="stock-disponible"
      vide="Le parc est vide et aucun seuil n’est défini."
      tonLigne={(s) => (s.manque > 0 ? 'bg-critical-soft/40' : undefined)}
      entete={
        enManque > 0 ? (
          <p className="flex items-start gap-2 text-sm text-critical-text">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            {enManque} combinaison(s) sous leur seuil.
          </p>
        ) : (
          admin && (
            <p className="flex items-start gap-2 text-xs text-ink-3">
              <Info size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
              La colonne « Seuil » est éditable. Un seuil à 0 revient à ne pas
              en fixer.
            </p>
          )
        )
      }
    />
  );
}

/** Saisie d'un seuil, enregistrée à la sortie du champ. */
function ChampSeuil({
  ligne,
  onFait,
  onErreur,
}: {
  ligne: StockDisponible;
  onFait: () => void;
  onErreur: (e: string) => void;
}) {
  const [valeur, setValeur] = useState(String(ligne.minimum ?? ''));

  useEffect(() => {
    setValeur(String(ligne.minimum ?? ''));
  }, [ligne.minimum]);

  async function enregistrer() {
    const n = valeur.trim() === '' ? 0 : Number(valeur);
    if (!Number.isFinite(n) || n < 0) {
      setValeur(String(ligne.minimum ?? ''));
      return;
    }
    if (n === (ligne.minimum ?? 0)) return;

    try {
      await definirSeuil(ligne.type_id, ligne.taille, n);
      onFait();
    } catch (err) {
      onErreur((err as Error).message);
      setValeur(String(ligne.minimum ?? ''));
    }
  }

  return (
    <input
      value={valeur}
      onChange={(e) => setValeur(e.target.value.replace(/\D/g, ''))}
      onBlur={() => void enregistrer()}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      inputMode="numeric"
      aria-label={`Seuil pour ${ligne.type_libelle} taille ${ligne.taille}`}
      className={cn(inputClass, 'w-16 px-2 py-1 text-right tabular text-[13px]')}
      placeholder="—"
    />
  );
}

/* --- Chez le prestataire ------------------------------------------------------------ */

function ChezPrestataireVue({ onErreur }: { onErreur: (e: string) => void }) {
  const [lignes, , chargement] = useVue<ChezPrestataire>(lireChezPrestataire, onErreur);
  const vieux = lignes.filter((l) => l.jours_chez_prestataire > JOURS_PRESTATAIRE_SUSPECT);

  const colonnes: ColonneTableau<ChezPrestataire>[] = [
    {
      cle: 'code_barre',
      entete: 'Code-barre',
      largeur: 14,
      rendu: (l) => <span className="tabular">{l.code_barre}</span>,
    },
    { cle: 'type_libelle', entete: 'Type', largeur: 18 },
    { cle: 'taille', entete: 'Taille', nombre: true, largeur: 8 },
    {
      cle: 'bulletin_expedition',
      entete: 'Bulletin',
      largeur: 16,
      rendu: (l) => <span className="tabular">{l.bulletin_expedition ?? '—'}</span>,
    },
    {
      cle: 'envoye_le',
      entete: 'Envoyé le',
      largeur: 13,
      rendu: (l) => <span className="tabular">{formatDate(l.envoye_le)}</span>,
    },
    {
      cle: 'jours_chez_prestataire',
      entete: 'Jours',
      nombre: true,
      largeur: 8,
      rendu: (l) => (
        <span
          className={cn(
            l.jours_chez_prestataire > JOURS_PRESTATAIRE_SUSPECT &&
              'text-critical-text font-semibold',
          )}
        >
          {l.jours_chez_prestataire}
        </span>
      ),
    },
  ];

  if (chargement && lignes.length === 0)
    return <Chargement quoi="Lecture des pièces en lavage" />;

  return (
    <Tableau
      titre="Chez le prestataire"
      description="Chaque pièce actuellement en lavage, et depuis combien de jours. C’est l’argument concret face à une facture qu’on veut discuter."
      colonnes={colonnes}
      lignes={lignes}
      cle={(l) => l.vetement_id}
      nomExport="chez-prestataire"
      vide="Rien n’est actuellement chez le prestataire."
      tonLigne={(l) =>
        l.jours_chez_prestataire > JOURS_PRESTATAIRE_SUSPECT ? 'bg-critical-soft/40' : undefined
      }
      entete={
        vieux.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-critical-text">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            {vieux.length} pièce(s) sont chez le prestataire depuis plus de{' '}
            {JOURS_PRESTATAIRE_SUSPECT} jours.
          </p>
        )
      }
    />
  );
}

/* --- En utilisation ------------------------------------------------------- */

function EnUtilisationVue({ onErreur }: { onErreur: (e: string) => void }) {
  const [lignes, , chargement] = useVue<EnUtilisation>(lireEnUtilisation, onErreur);
  const orphelines = lignes.filter((l) => !l.detenteur_actif);

  const colonnes: ColonneTableau<EnUtilisation>[] = [
    {
      cle: 'code_barre',
      entete: 'Code-barre',
      largeur: 14,
      rendu: (l) => <span className="tabular">{l.code_barre}</span>,
    },
    { cle: 'type_libelle', entete: 'Type', largeur: 18 },
    { cle: 'taille', entete: 'Taille', nombre: true, largeur: 8 },
    {
      cle: 'detenteur',
      entete: 'Détenteur',
      largeur: 20,
      rendu: (l) => (
        <span className={cn(!l.detenteur_actif && 'text-critical-text')}>
          {l.detenteur}
          {!l.detenteur_actif && ' (désactivé)'}
        </span>
      ),
    },
    {
      cle: 'sorti_le',
      entete: 'Sorti le',
      largeur: 13,
      rendu: (l) => <span className="tabular">{formatDate(l.sorti_le)}</span>,
    },
    {
      cle: 'jours_en_utilisation',
      entete: 'Jours',
      nombre: true,
      largeur: 8,
      rendu: (l) => (
        <span
          className={cn(
            l.jours_en_utilisation > JOURS_UTILISATION_SUSPECT &&
              'text-critical-text font-semibold',
          )}
        >
          {l.jours_en_utilisation}
        </span>
      ),
    },
  ];

  if (chargement && lignes.length === 0)
    return <Chargement quoi="Lecture des sorties" />;

  return (
    <Tableau
      titre="En utilisation"
      description="Qui détient quoi, et depuis quand. Une pièce qui traîne ici n’a jamais été rendue — elle ne repartira jamais chez le prestataire d’elle-même."
      colonnes={colonnes}
      lignes={lignes}
      cle={(l) => l.vetement_id}
      nomExport="en-utilisation"
      vide="Aucun vêtement n’est actuellement sorti."
      tonLigne={(l) =>
        !l.detenteur_actif
          ? 'bg-critical-soft/40'
          : l.jours_en_utilisation > JOURS_UTILISATION_SUSPECT
            ? 'bg-warning-soft/40'
            : undefined
      }
      entete={
        orphelines.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-critical-text">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            {orphelines.length} pièce(s) sont chez un collaborateur désactivé.
            Personne ne les réclamera : il faut aller les chercher.
          </p>
        )
      }
    />
  );
}

/* --- Contrôle de facturation ---------------------------------------------- */

function Facturation({ onErreur }: { onErreur: (e: string) => void }) {
  const [lignes, , chargement] = useVue<ControleFacturation>(
    lireControleFacturation,
    onErreur,
  );

  const rapproches = lignes.filter((l) => l.rapproche);
  const perdus = rapproches.reduce((n, l) => n + (l.manquants ?? 0), 0);
  const enTransit = lignes.filter((l) => !l.rapproche);

  const colonnes: ColonneTableau<ControleFacturation>[] = [
    {
      cle: 'bulletin_expedition',
      entete: 'Expédition',
      largeur: 16,
      rendu: (l) => <span className="tabular">{l.bulletin_expedition}</span>,
    },
    {
      cle: 'bulletin_reception',
      entete: 'Réception',
      largeur: 16,
      rendu: (l) =>
        l.bulletin_reception ? (
          <span className="tabular">{l.bulletin_reception}</span>
        ) : (
          <span className="text-ink-3">en attente</span>
        ),
    },
    { cle: 'type_libelle', entete: 'Type', largeur: 18 },
    { cle: 'taille', entete: 'Taille', nombre: true, largeur: 8 },
    { cle: 'envoyes', entete: 'Envoyés', nombre: true, largeur: 9 },
    {
      cle: 'recus',
      entete: 'Reçus',
      nombre: true,
      largeur: 9,
      rendu: (l) =>
        l.rapproche ? l.recus : <span className="text-ink-3">—</span>,
    },
    {
      cle: 'manquants',
      entete: 'Manquants',
      nombre: true,
      largeur: 11,
      rendu: (l) => {
        // `manquants` est nul tant que le bac n'est pas revenu — pas zéro.
        // Afficher 0 ici laisserait croire que le compte est bon.
        if (!l.rapproche) return <span className="text-ink-3">—</span>;
        if (!l.manquants) return <span className="text-good-text">0</span>;
        return (
          <span className="text-critical-text font-semibold">{l.manquants}</span>
        );
      },
    },
  ];

  if (chargement && lignes.length === 0)
    return <Chargement quoi="Rapprochement des bulletins" />;

  return (
    <Tableau
      titre="Contrôle de facturation"
      description="Ce qui est parti face à ce qui est revenu, bulletin par bulletin. Un envoi encore chez le prestataire n’a pas de manquant : il a un retour à venir."
      colonnes={colonnes}
      lignes={lignes}
      cle={(l) =>
        `${l.bulletin_expedition}-${l.bulletin_reception ?? 'x'}-${l.type_libelle}-${l.taille}`
      }
      nomExport="controle-facturation"
      vide="Aucune expédition n’a encore été enregistrée."
      tonLigne={(l) =>
        l.rapproche && (l.manquants ?? 0) > 0 ? 'bg-critical-soft/40' : undefined
      }
      entete={
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span>
            <span className="text-ink-3">Pièces non revenues : </span>
            <span
              className={cn(
                'font-semibold tabular',
                perdus > 0 ? 'text-critical-text' : 'text-good-text',
              )}
            >
              {perdus}
            </span>
          </span>
          <span className="text-ink-3">
            {enTransit.length} ligne(s) en attente de retour, non comptées.
          </span>
        </div>
      }
    />
  );
}

/* --- Besoins prévisionnels ------------------------------------------------ */

function Besoins({ onErreur }: { onErreur: (e: string) => void }) {
  const [lignes, , chargement] = useVue<BesoinPrevisionnel>(
    lireBesoinsPrevisionnels,
    onErreur,
  );

  const colonnes: ColonneTableau<BesoinPrevisionnel>[] = [
    { cle: 'type_libelle', entete: 'Type', largeur: 18 },
    { cle: 'taille', entete: 'Taille', nombre: true, largeur: 8 },
    {
      cle: 'demande_quotidienne',
      entete: 'Sorties / jour',
      nombre: true,
      largeur: 13,
    },
    {
      cle: 'duree_cycle_jours',
      entete: 'Cycle (jours)',
      nombre: true,
      largeur: 13,
    },
    { cle: 'parc_reel', entete: 'Parc actuel', nombre: true, largeur: 11 },
    {
      cle: 'parc_recommande',
      entete: 'Parc conseillé',
      nombre: true,
      largeur: 14,
    },
    {
      cle: 'ecart',
      entete: 'À acquérir',
      nombre: true,
      largeur: 11,
      rendu: (l) =>
        l.ecart > 0 ? (
          <span className="text-warning-text font-semibold">{l.ecart}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ];

  if (chargement && lignes.length === 0)
    return <Chargement quoi="Calcul des besoins" />;

  return (
    <div className="space-y-4">
      <Alerte ton="warning">
        <span className="inline-flex items-start gap-2">
          <Info size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
          <span>
            <strong>À lire avec précaution.</strong> Le calcul multiplie la
            demande quotidienne par la durée complète d’un cycle, plus 20 % de
            marge. Il n’a de sens qu’une fois plusieurs cycles complets
            accomplis — comptez deux à trois mois de données. Avant cela, les
            chiffres décrivent le hasard des premières semaines, pas un besoin.
          </span>
        </span>
      </Alerte>

      <Tableau
        titre="Besoins prévisionnels"
        description="Demande quotidienne × durée du cycle × marge de 20 %, comparé au parc réel."
        colonnes={colonnes}
        lignes={lignes}
        cle={(l) => `${l.type_id}-${l.taille}`}
        nomExport="besoins-previsionnels"
        vide="Pas encore assez de mouvements pour estimer quoi que ce soit."
        tonLigne={(l) => (l.ecart > 0 ? 'bg-warning-soft/40' : undefined)}
      />
    </div>
  );
}

/* --- Journal complet ------------------------------------------------------ */

function Journal({ onErreur }: { onErreur: (e: string) => void }) {
  const [lignes, , chargement] = useVue<LigneJournal>(lireJournalComplet, onErreur);
  const [occupe, setOccupe] = useState(false);

  const colonnes: ColonneTableau<LigneJournal>[] = [
    {
      cle: 'horodatage',
      entete: 'Quand',
      largeur: 18,
      rendu: (l) => (
        <span className="tabular whitespace-nowrap">
          {formatHorodatage(l.horodatage)}
        </span>
      ),
    },
    {
      cle: 'type',
      entete: 'Mouvement',
      largeur: 16,
      rendu: (l) => (
        <span className={cn(l.annule && 'line-through text-ink-3')}>
          {LIBELLE_MOUVEMENT[l.type]}
        </span>
      ),
    },
    {
      cle: 'code_barre',
      entete: 'Code-barre',
      largeur: 14,
      rendu: (l) => <span className="tabular">{l.code_barre}</span>,
    },
    { cle: 'type_libelle', entete: 'Type', largeur: 18 },
    { cle: 'taille', entete: 'Taille', nombre: true, largeur: 8 },
    {
      cle: 'operateur',
      entete: 'Opérateur',
      largeur: 20,
      rendu: (l) => l.operateur ?? <span className="text-ink-3">—</span>,
    },
    {
      cle: 'document',
      entete: 'Bulletin',
      largeur: 16,
      rendu: (l) =>
        l.document ? (
          <span className="tabular">{l.document}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      cle: 'annule',
      entete: 'Annulé',
      largeur: 10,
      rendu: (l) =>
        l.annule ? (
          <span className="text-critical-text">oui</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ];

  /** Un classeur unique : le journal plus l'état du parc au moment de l'export. */
  async function exporterTout() {
    setOccupe(true);
    try {
      const [stock, prestataire, utilisation, facturation] = await Promise.all([
        lireStockDisponible(),
        lireChezPrestataire(),
        lireEnUtilisation(),
        lireControleFacturation(),
      ]);
      await exporterClasseur('sauvegarde-vetements', [
        { nom: 'Journal', colonnes: colonnes as never[], lignes },
        {
          nom: 'Stock',
          colonnes: [
            { cle: 'type_libelle', entete: 'Type', largeur: 18 },
            { cle: 'taille', entete: 'Taille' },
            { cle: 'disponible', entete: 'Disponible' },
            { cle: 'chez_prestataire', entete: 'Chez le prestataire' },
            { cle: 'au_rebut', entete: 'Au rebut' },
            { cle: 'parc_total', entete: 'Parc' },
            { cle: 'minimum', entete: 'Seuil' },
            { cle: 'manque', entete: 'Manque' },
          ] as never[],
          lignes: stock,
        },
        {
          nom: 'Chez le prestataire',
          colonnes: [
            { cle: 'code_barre', entete: 'Code-barre' },
            { cle: 'type_libelle', entete: 'Type', largeur: 18 },
            { cle: 'taille', entete: 'Taille' },
            { cle: 'bulletin_expedition', entete: 'Bulletin' },
            { cle: 'envoye_le', entete: 'Envoyé le' },
            { cle: 'jours_chez_prestataire', entete: 'Jours' },
          ] as never[],
          lignes: prestataire,
        },
        {
          nom: 'En utilisation',
          colonnes: [
            { cle: 'code_barre', entete: 'Code-barre' },
            { cle: 'type_libelle', entete: 'Type', largeur: 18 },
            { cle: 'taille', entete: 'Taille' },
            { cle: 'detenteur', entete: 'Détenteur', largeur: 20 },
            { cle: 'sorti_le', entete: 'Sorti le' },
            { cle: 'jours_en_utilisation', entete: 'Jours' },
          ] as never[],
          lignes: utilisation,
        },
        {
          nom: 'Facturation',
          colonnes: [
            { cle: 'bulletin_expedition', entete: 'Expédition' },
            { cle: 'bulletin_reception', entete: 'Réception' },
            { cle: 'type_libelle', entete: 'Type', largeur: 18 },
            { cle: 'taille', entete: 'Taille' },
            { cle: 'envoyes', entete: 'Envoyés' },
            { cle: 'recus', entete: 'Reçus' },
            { cle: 'rapproche', entete: 'Retour arrivé' },
            { cle: 'manquants', entete: 'Manquants' },
          ] as never[],
          lignes: facturation,
        },
      ]);
    } catch (err) {
      onErreur((err as Error).message);
    } finally {
      setOccupe(false);
    }
  }

  if (chargement && lignes.length === 0)
    return <Chargement quoi="Lecture du journal" />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="max-w-2xl">
            <p className="font-medium mb-1">Sauvegarde complète</p>
            <p className="text-sm text-ink-3 leading-relaxed">
              Un classeur Excel réunissant le journal et l’état du parc. Le plan
              Supabase actuel ne permet pas de restaurer la base à un instant
              donné : tant qu’il en est ainsi, ce fichier <em>est</em> la
              sauvegarde. À télécharger régulièrement et à conserver hors de
              l’application — c’est aussi lui qui pèsera face à une facture du prestataire
              contestée.
            </p>
          </div>
          <Button onClick={() => void exporterTout()} disabled={occupe}>
            <Sheet size={16} strokeWidth={1.75} />
            {occupe ? 'Préparation…' : 'Télécharger la sauvegarde'}
          </Button>
        </div>
      </Card>

      <Tableau
        titre="Journal des mouvements"
        description={`${lignes.length} mouvement(s) depuis la mise en service. Un mouvement annulé reste inscrit : le journal se corrige, il ne s’efface pas.`}
        colonnes={colonnes}
        lignes={lignes}
        cle={(l) => l.mouvement_id}
        nomExport="journal-mouvements"
        vide="Aucun mouvement enregistré."
        tonLigne={(l) => (l.annule ? 'bg-critical-soft/40' : undefined)}
      />
    </div>
  );
}
