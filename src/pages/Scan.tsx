import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { ScanLine, Undo2 } from 'lucide-react';
import {
  annulerMouvement,
  enregistrerMouvement,
  lireDerniersMouvements,
} from '../lib/api';
import { formatHorodatage } from '../lib/export';
import { useOperateur } from '../lib/operateur';
import {
  LIBELLE_MOUVEMENT,
  LIBELLE_STATUT,
  nomComplet,
  type LigneJournal,
  type ResultatMouvement,
  type TypeMouvement,
} from '../types';
import { Alerte, Button, cn, inputClass } from '../components/ui';

/* ---------------------------------------------------------------------------
   Reprise du focus sur le champ de scan.

   La douchette est un clavier : elle « tape » le code puis un Entrée. Si le
   focus n'est pas sur le champ au moment où l'opérateur passe le code-barre,
   les caractères partent dans le vide et le scan est perdu — sans que
   personne ne s'en rende compte avant l'inventaire suivant.
   --------------------------------------------------------------------------- */

function useFocusScan(ref: RefObject<HTMLInputElement | null>, actif: boolean) {
  useEffect(() => {
    if (!actif) return;
    ref.current?.focus();

    // TODO(human)
  }, [ref, actif]);
}

/* ------------------------------------------------------------------------- */

const TONS_MOUVEMENT: Record<TypeMouvement, string> = {
  SORTIE: 'bg-accent-soft border-accent/30 text-accent',
  RETOUR_SALE: 'bg-warning-soft border-warning/30 text-warning-text',
  RECEPTION: 'bg-good-soft border-good/25 text-good-text',
  ENVOI_ELIS: 'bg-surface-2 border-line-strong text-ink-2',
};

const PUCES_MOUVEMENT: Record<TypeMouvement, string> = {
  SORTIE: 'bg-accent-soft text-accent',
  RETOUR_SALE: 'bg-warning-soft text-warning-text',
  RECEPTION: 'bg-good-soft text-good-text',
  ENVOI_ELIS: 'bg-surface-2 text-ink-2',
};

export function Scan({
  enLigne,
  onMouvement,
}: {
  enLigne: boolean;
  /** Prévient la coquille qu'un compteur a bougé. */
  onMouvement?: () => void;
}) {
  const { operateur, pin, quitter } = useOperateur();
  const [code, setCode] = useState('');
  const [resultat, setResultat] = useState<ResultatMouvement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [journal, setJournal] = useState<LigneJournal[]>([]);

  const champScan = useRef<HTMLInputElement>(null);
  useFocusScan(champScan, enLigne);

  const rafraichirJournal = useCallback(() => {
    lireDerniersMouvements(9)
      .then(setJournal)
      // Le journal est un confort : son échec ne doit pas masquer le scan.
      .catch(() => setJournal([]));
  }, []);

  useEffect(rafraichirJournal, [rafraichirJournal]);

  const apresEcriture = useCallback(() => {
    rafraichirJournal();
    onMouvement?.();
  }, [rafraichirJournal, onMouvement]);

  const scanner = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const codeBarre = code.trim();
      if (!codeBarre || !operateur || occupe) return;

      setOccupe(true);
      setErreur(null);
      try {
        const r = await enregistrerMouvement(codeBarre, operateur.id, pin);
        setResultat(r);
        setCode('');
        apresEcriture();
      } catch (err) {
        // Message de la base affiché tel quel : il porte la date, le statut
        // ou le nom qui rendent l'erreur compréhensible sans explication.
        setErreur((err as Error).message);
        setResultat(null);
        setCode('');
      } finally {
        setOccupe(false);
        champScan.current?.focus();
      }
    },
    [code, operateur, pin, occupe, apresEcriture],
  );

  const annuler = useCallback(async () => {
    if (!resultat || !operateur) return;
    setOccupe(true);
    setErreur(null);
    try {
      await annulerMouvement(resultat.mouvement_id, operateur.id, pin);
      setResultat(null);
      apresEcriture();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setOccupe(false);
      champScan.current?.focus();
    }
  }, [resultat, operateur, pin, apresEcriture]);

  return (
    <div className="flex gap-6 items-start">
      {/* --- Colonne de travail ------------------------------------------- */}
      <div className="flex-1 min-w-0 flex flex-col gap-5 max-w-3xl">
        <form onSubmit={scanner} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor="champ-scan" className="etiquette">
              Code-barre
            </label>
            <p className="text-[12px] text-ink-3">
              Poste tenu par{' '}
              <span className="text-ink-2 font-medium">
                {operateur ? nomComplet(operateur) : '—'}
              </span>
              <button
                type="button"
                onClick={quitter}
                className="ml-3 text-accent hover:underline cursor-pointer"
              >
                changer
              </button>
            </p>
          </div>

          <input
            id="champ-scan"
            ref={champScan}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={!enLigne || occupe}
            autoComplete="off"
            spellCheck={false}
            aria-label="Code-barre du vêtement"
            className={cn(
              inputClass,
              'champ-scan py-4 px-5 bg-surface-1 border-line-strong',
              'focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-ring)]',
              'disabled:opacity-50',
            )}
            placeholder="—"
          />

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={!enLigne || occupe || !code.trim()}
            >
              <ScanLine size={16} strokeWidth={1.75} />
              Valider
            </Button>
            <p className="text-[12px] text-ink-3">
              Passez la douchette, ou tapez le code à la main s’il est illisible.
            </p>
          </div>
        </form>

        {erreur && <Alerte>{erreur}</Alerte>}

        {resultat && (
          <div className="rounded-card border border-line bg-surface-1 shadow-card overflow-hidden">
            <div
              className={cn(
                'border-b px-6 py-5 flex items-start justify-between gap-6',
                TONS_MOUVEMENT[resultat.mouvement_type],
              )}
            >
              <div>
                <p className="verdict">
                  {LIBELLE_MOUVEMENT[resultat.mouvement_type]}
                </p>
                <p className="text-[17px] mt-1.5">
                  {resultat.type_libelle} · taille {resultat.taille}
                  {resultat.detenteur && ` · ${resultat.detenteur}`}
                </p>
              </div>
              <div className="donnee text-[12px] text-right leading-relaxed shrink-0 opacity-80">
                {resultat.code_barre}
                <br />
                {resultat.nb_lavages} lavage(s)
              </div>
            </div>

            <div className="px-6 py-3.5 flex items-center justify-between gap-4">
              <p className="text-[13px] text-ink-2">
                Statut&nbsp;:{' '}
                <span className="font-medium text-ink">
                  {LIBELLE_STATUT[resultat.statut]}
                </span>
                {resultat.rebut && (
                  <span className="ml-3 rounded-full bg-warning-soft text-warning-text text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5">
                    Rebut · stagiaires
                  </span>
                )}
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={annuler}
                disabled={occupe}
              >
                <Undo2 size={14} strokeWidth={1.75} />
                Annuler
              </Button>
            </div>
          </div>
        )}

        <JournalSession lignes={journal} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Les derniers mouvements enregistrés, tous postes confondus.
 *
 * Sans ce journal, on scanne sans mémoire : une erreur ne se voit qu'au
 * moment où quelqu'un cherche un vêtement qui n'est pas là.
 */
function JournalSession({ lignes }: { lignes: LigneJournal[] }) {
  if (lignes.length === 0) return null;

  return (
    <section className="rounded-card border border-line bg-surface-1 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-line">
        <h2 className="etiquette">Derniers mouvements</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="etiquette text-left border-b border-line">
              <th className="font-semibold px-5 py-2">Heure</th>
              <th className="font-semibold px-5 py-2">Code</th>
              <th className="font-semibold px-5 py-2">Pièce</th>
              <th className="font-semibold px-5 py-2">Mouvement</th>
              <th className="font-semibold px-5 py-2">Opérateur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lignes.map((m) => (
              <tr key={m.mouvement_id} className={cn(m.annule && 'opacity-50')}>
                <td className="px-5 py-2 donnee text-ink-3 whitespace-nowrap">
                  {formatHorodatage(m.horodatage).slice(-5)}
                </td>
                <td className="px-5 py-2 donnee">{m.code_barre}</td>
                <td className="px-5 py-2 text-ink-2 whitespace-nowrap">
                  {m.type_libelle} · {m.taille}
                </td>
                <td className="px-5 py-2">
                  <span
                    className={cn(
                      'inline-block rounded px-2 py-0.5 text-[11px] font-semibold',
                      PUCES_MOUVEMENT[m.type],
                      m.annule && 'line-through',
                    )}
                  >
                    {LIBELLE_MOUVEMENT[m.type]}
                  </span>
                </td>
                <td className="px-5 py-2 text-ink-3 whitespace-nowrap">
                  {m.operateur ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
