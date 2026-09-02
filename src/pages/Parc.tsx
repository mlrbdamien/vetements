import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Search, TriangleAlert } from 'lucide-react';
import { chercherParc, lireHistorique } from '../lib/api';
import { formatHorodatage } from '../lib/export';
import {
  LIBELLE_MOUVEMENT,
  LIBELLE_STATUT,
  type LigneHistorique,
  type StatutVetement,
  type Vetement,
} from '../types';
import { Tableau, type ColonneTableau } from '../components/Tableau';
import { Alerte, Button, Card, cn, inputClass } from '../components/ui';

const TON_STATUT: Record<StatutVetement, string> = {
  nouveau: 'bg-surface-2 text-ink-2',
  en_stock: 'bg-good-soft text-good-text',
  en_utilisation: 'bg-accent-soft text-accent',
  sale: 'bg-warning-soft text-warning-text',
  chez_prestataire: 'bg-surface-2 text-ink-2',
  rebut: 'bg-critical-soft text-critical-text',
};

export function Badge({
  statut,
  className,
}: {
  statut: StatutVetement;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        TON_STATUT[statut],
        className,
      )}
    >
      {LIBELLE_STATUT[statut]}
    </span>
  );
}

export function Parc() {
  const [terme, setTerme] = useState('');
  const [parc, setParc] = useState<Vetement[]>([]);
  const [choisi, setChoisi] = useState<Vetement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(async (t: string) => {
    setChargement(true);
    try {
      setParc(await chercherParc(t));
      setErreur(null);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setChargement(false);
    }
  }, []);

  // La recherche part sur le serveur après une pause de frappe : la douchette
  // envoie un code entier en quelques millisecondes, inutile d'interroger la
  // base à chaque caractère.
  useEffect(() => {
    const t = setTimeout(() => void recharger(terme), 250);
    return () => clearTimeout(t);
  }, [terme, recharger]);

  if (choisi) {
    return <Fiche vetement={choisi} onRetour={() => setChoisi(null)} />;
  }

  const colonnes: ColonneTableau<Vetement>[] = [
    {
      cle: 'code_barre',
      entete: 'Code-barre',
      largeur: 14,
      filtre: 'texte',
      rendu: (v) => <span className="tabular font-medium">{v.code_barre}</span>,
    },
    { cle: 'type_libelle', entete: 'Type', largeur: 18, filtre: 'liste' },
    { cle: 'taille', entete: 'Taille', nombre: true, largeur: 8, filtre: 'liste' },
    {
      cle: 'statut',
      entete: 'Statut',
      largeur: 18,
      filtre: 'liste',
      // On trie et on filtre sur le libellé affiché, pas sur `en_stock` :
      // c'est « En stock » que l'utilisatrice lit et cherche.
      valeur: (v) => LIBELLE_STATUT[v.statut],
      rendu: (v) => <Badge statut={v.statut} />,
    },
    {
      cle: 'detenteur',
      entete: 'Détenteur',
      largeur: 20,
      filtre: 'liste',
      rendu: (v) =>
        v.detenteur ? (
          <span className={cn(!v.detenteur_actif && 'text-critical-text')}>
            {v.detenteur}
            {!v.detenteur_actif && ' (désactivé)'}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    { cle: 'nb_lavages', entete: 'Lavages', nombre: true, largeur: 9 },
    {
      cle: 'rebut',
      entete: 'Rebut',
      largeur: 8,
      filtre: 'liste',
      valeur: (v) => (v.rebut ? 'oui' : 'non'),
      rendu: (v) =>
        v.rebut ? (
          <span className="text-warning-text font-medium">oui</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      cle: 'dernier_mouvement_le',
      entete: 'Dernier mouvement',
      largeur: 20,
      rendu: (v) => (
        <span className="text-ink-3">
          {formatHorodatage(v.dernier_mouvement_le)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <label className="flex items-center gap-3">
          <Search size={18} strokeWidth={1.75} className="text-ink-3 shrink-0" />
          <input
            value={terme}
            onChange={(e) => setTerme(e.target.value)}
            placeholder="Code-barre — passez la douchette pour ouvrir une fiche"
            autoComplete="off"
            aria-label="Rechercher un vêtement"
            className={cn(inputClass, 'text-base')}
          />
        </label>
      </Card>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Tableau
        titre="Parc"
        description={
          chargement
            ? 'Chargement…'
            : `${parc.length} vêtement(s). Cliquez un en-tête pour trier, une ligne pour ouvrir la fiche.`
        }
        colonnes={colonnes}
        lignes={parc}
        cle={(v) => v.vetement_id}
        nomExport="parc-vetements"
        vide={
          // Pendant la lecture, affirmer que le parc est vide est faux — et
          // c'est ce que voit l'utilisateur pendant toute la durée de la
          // requête, d'autant plus longtemps que la connexion est lente.
          chargement
            ? 'Lecture du parc…'
            : terme
              ? `Aucun vêtement ne correspond à « ${terme} ».`
              : 'Le parc est vide.'
        }
        onLigne={setChoisi}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Fiche({
  vetement,
  onRetour,
}: {
  vetement: Vetement;
  onRetour: () => void;
}) {
  const [historique, setHistorique] = useState<LigneHistorique[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    lireHistorique(vetement.vetement_id)
      .then(setHistorique)
      .catch((e: Error) => setErreur(e.message));
  }, [vetement.vetement_id]);

  const colonnes: ColonneTableau<LigneHistorique>[] = [
    {
      cle: 'horodatage',
      entete: 'Quand',
      largeur: 18,
      rendu: (m) => (
        <span className="tabular whitespace-nowrap">
          {formatHorodatage(m.horodatage)}
        </span>
      ),
    },
    {
      cle: 'type',
      entete: 'Mouvement',
      largeur: 18,
      rendu: (m) => (
        <span className={cn('font-medium', m.annule && 'line-through text-ink-3')}>
          {LIBELLE_MOUVEMENT[m.type]}
        </span>
      ),
    },
    {
      cle: 'operateur',
      entete: 'Opérateur',
      largeur: 20,
      rendu: (m) => m.operateur ?? <span className="text-ink-3">—</span>,
    },
    {
      cle: 'document',
      entete: 'Bulletin',
      largeur: 16,
      rendu: (m) =>
        m.document ? (
          <span className="tabular">{m.document}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      cle: 'annule',
      entete: 'Annulation',
      largeur: 30,
      rendu: (m) =>
        m.annule ? (
          <span className="text-critical-text text-xs">
            annulé le {formatHorodatage(m.annule_le)}
            {m.annule_par_admin
              ? ' par l’administratrice'
              : m.annule_par
                ? ` par ${m.annule_par}`
                : ''}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ];

  const annules = historique.filter((m) => m.annule).length;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onRetour}>
        <ArrowLeft size={15} strokeWidth={1.75} />
        Retour au parc
      </Button>

      <Card>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-3xl font-semibold tracking-[-0.02em] tabular">
              {vetement.code_barre}
            </p>
            <p className="text-lg text-ink-2 mt-1">
              {vetement.type_libelle} · taille {vetement.taille}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge statut={vetement.statut} />
            {vetement.rebut && (
              <span className="rounded-full bg-warning-soft text-warning-text px-2.5 py-1 text-xs font-medium">
                Rebut · stagiaires
              </span>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-5 mt-6 pt-5 border-t border-line text-sm">
          <div>
            <dt className="text-ink-3 text-xs">Détenteur</dt>
            <dd className="font-medium mt-0.5">
              {vetement.detenteur ?? '—'}
              {vetement.detenteur && !vetement.detenteur_actif && (
                <span className="block text-xs text-critical-text font-normal mt-0.5">
                  compte désactivé
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3 text-xs">Lavages</dt>
            <dd className="font-medium tabular mt-0.5">{vetement.nb_lavages}</dd>
          </div>
          <div>
            <dt className="text-ink-3 text-xs">Entré dans le parc</dt>
            <dd className="font-medium tabular mt-0.5">
              {formatHorodatage(vetement.cree_le)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3 text-xs">Dernier mouvement</dt>
            <dd className="font-medium tabular mt-0.5">
              {formatHorodatage(vetement.dernier_mouvement_le)}
            </dd>
          </div>
        </dl>
      </Card>

      {vetement.detenteur && !vetement.detenteur_actif && (
        <Alerte ton="warning">
          <span className="inline-flex items-start gap-2">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            Cette pièce est détenue par un collaborateur désactivé. Elle ne
            reviendra pas d’elle-même : il faut la réclamer, puis enregistrer
            son retour depuis l’écran Scan.
          </span>
        </Alerte>
      )}

      {erreur && <Alerte>{erreur}</Alerte>}

      <Tableau
        titre="Historique"
        description={
          <>
            Tous les mouvements de cette pièce, du plus récent au plus ancien.
            {annules > 0 && (
              <>
                {' '}
                <span className="text-critical-text">
                  {annules} mouvement(s) annulé(s)
                </span>{' '}
                — ils restent affichés : le journal ne s’efface jamais, il se
                corrige.
              </>
            )}
          </>
        }
        colonnes={colonnes}
        lignes={historique}
        cle={(m) => m.mouvement_id}
        nomExport={`historique-${vetement.code_barre}`}
        vide="Aucun mouvement enregistré."
        tonLigne={(m) => (m.annule ? 'bg-critical-soft/40' : undefined)}
      />
    </div>
  );
}
