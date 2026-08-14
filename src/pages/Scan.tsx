import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { ScanLine, Undo2 } from 'lucide-react';
import { annulerMouvement, enregistrerMouvement } from '../lib/api';
import { useOperateur } from '../lib/operateur';
import {
  LIBELLE_MOUVEMENT,
  LIBELLE_STATUT,
  type ResultatMouvement,
} from '../types';
import { BandeauOperateur } from '../components/Identification';
import { Alerte, Button, Card, Field, cn, inputClass } from '../components/ui';

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

const TONS_MOUVEMENT = {
  SORTIE: 'bg-accent-soft border-accent/30 text-accent',
  RETOUR_SALE: 'bg-warning-soft border-warning/30 text-warning-text',
  RECEPTION: 'bg-good-soft border-good/25 text-good-text',
  ENVOI_ELIS: 'bg-surface-2 border-line-strong text-ink-2',
} as const;

export function Scan({ enLigne }: { enLigne: boolean }) {
  const { operateur, pin } = useOperateur();
  const [code, setCode] = useState('');
  const [resultat, setResultat] = useState<ResultatMouvement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const champScan = useRef<HTMLInputElement>(null);
  useFocusScan(champScan, enLigne);

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
    [code, operateur, pin, occupe],
  );

  const annuler = useCallback(async () => {
    if (!resultat || !operateur) return;
    setOccupe(true);
    setErreur(null);
    try {
      await annulerMouvement(resultat.mouvement_id, operateur.id, pin);
      setResultat(null);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setOccupe(false);
      champScan.current?.focus();
    }
  }, [resultat, operateur, pin]);

  return (
    <div className="max-w-3xl space-y-5">
      <BandeauOperateur />

      <Card>
        <form onSubmit={scanner}>
          <Field
            label="Code-barre"
            hint="Passez la douchette, ou tapez le code à la main s'il est illisible."
          >
            <input
              ref={champScan}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!enLigne || occupe}
              autoComplete="off"
              spellCheck={false}
              aria-label="Code-barre du vêtement"
              className={cn(inputClass, 'champ-scan py-4 disabled:opacity-50')}
              placeholder="—"
            />
          </Field>
          <Button type="submit" size="lg" disabled={!enLigne || occupe || !code.trim()}>
            <ScanLine size={18} strokeWidth={1.75} />
            Valider
          </Button>
        </form>
      </Card>

      {erreur && <Alerte>{erreur}</Alerte>}

      {resultat && (
        <Card padded={false}>
          <div
            className={cn(
              'border-b rounded-t-card px-6 py-5',
              TONS_MOUVEMENT[resultat.mouvement_type],
            )}
          >
            <p className="text-3xl font-semibold tracking-[-0.02em]">
              {LIBELLE_MOUVEMENT[resultat.mouvement_type]}
            </p>
            {resultat.detenteur && (
              <p className="text-lg mt-1">Pris par {resultat.detenteur}</p>
            )}
          </div>

          <div className="px-6 py-5 space-y-3">
            <p className="text-2xl font-medium">
              {resultat.type_libelle}{' '}
              <span className="text-ink-3">· taille {resultat.taille}</span>
              {resultat.rebut && (
                <span className="ml-3 align-middle rounded-full bg-warning-soft text-warning-text text-xs font-semibold uppercase tracking-wide px-2.5 py-1">
                  Rebut · stagiaires
                </span>
              )}
            </p>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-ink-3">Code-barre</dt>
                <dd className="tabular font-medium">{resultat.code_barre}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Statut</dt>
                <dd className="font-medium">{LIBELLE_STATUT[resultat.statut]}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Lavages</dt>
                <dd className="tabular font-medium">{resultat.nb_lavages}</dd>
              </div>
            </dl>

            <div className="pt-2">
              <Button variant="danger" size="sm" onClick={annuler} disabled={occupe}>
                <Undo2 size={14} strokeWidth={1.75} />
                Annuler ce mouvement
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
