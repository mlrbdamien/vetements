import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { LogIn, RotateCcw, ScanLine, ShieldCheck, Undo2 } from 'lucide-react';
import {
  annulerMouvement,
  enregistrerMouvement,
  listerOperateurs,
  verifierPin,
} from '../lib/api';
import {
  LIBELLE_MOUVEMENT,
  LIBELLE_STATUT,
  nomComplet,
  type Operateur,
  type ResultatMouvement,
} from '../types';
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
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [operateur, setOperateur] = useState<Operateur | null>(null);
  // Le PIN reste en mémoire le temps du poste : chaque RPC le revérifie en
  // base. Il n'est jamais écrit dans localStorage ni dans une URL.
  const [pin, setPin] = useState('');

  const [code, setCode] = useState('');
  const [resultat, setResultat] = useState<ResultatMouvement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const champScan = useRef<HTMLInputElement>(null);
  const identifie = operateur !== null;
  useFocusScan(champScan, identifie && enLigne);

  useEffect(() => {
    listerOperateurs()
      .then((tous) => setOperateurs(tous.filter((o) => o.actif)))
      .catch((e: Error) => setErreur(e.message));
  }, []);

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

  if (!identifie) {
    return (
      <Identification
        operateurs={operateurs}
        erreur={erreur}
        onErreur={setErreur}
        onIdentifie={(o, p) => {
          setOperateur(o);
          setPin(p);
          setErreur(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          Poste tenu par{' '}
          <span className="font-medium text-ink">{nomComplet(operateur)}</span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOperateur(null);
            setPin('');
            setResultat(null);
            setErreur(null);
          }}
        >
          <RotateCcw size={14} strokeWidth={1.75} />
          Changer d'opérateur
        </Button>
      </div>

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

/* ---------------------------------------------------------------------------
   Identification en début de poste : sélection dans la liste + PIN.
   Le PIN n'est jamais comparé ici — verifierPin() interroge la base.
   --------------------------------------------------------------------------- */

function Identification({
  operateurs,
  erreur,
  onErreur,
  onIdentifie,
}: {
  operateurs: Operateur[];
  erreur: string | null;
  onErreur: (e: string | null) => void;
  onIdentifie: (o: Operateur, pin: string) => void;
}) {
  const [choisi, setChoisi] = useState<Operateur | null>(null);
  const [pin, setPin] = useState('');
  const [occupe, setOccupe] = useState(false);
  const champPin = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (choisi) champPin.current?.focus();
  }, [choisi]);

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!choisi || pin.length !== 4 || occupe) return;
    setOccupe(true);
    onErreur(null);
    try {
      if (await verifierPin(choisi.id, pin)) {
        onIdentifie(choisi, pin);
      } else {
        onErreur('Code PIN incorrect.');
        setPin('');
      }
    } catch (err) {
      onErreur((err as Error).message);
      setPin('');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <p className="font-medium mb-1">Qui tient le poste ?</p>
        <p className="text-sm text-ink-3 mb-4">
          Sélectionnez votre nom, puis saisissez votre code à 4 chiffres.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {operateurs.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setChoisi(o);
                setPin('');
                onErreur(null);
              }}
              className={cn(
                'rounded-control border px-3 py-3 text-sm font-medium transition-colors cursor-pointer text-left',
                choisi?.id === o.id
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface-2 hover:bg-line',
              )}
            >
              {nomComplet(o)}
              {!o.pin_defini && (
                <span className="block text-[11px] font-normal text-ink-3 mt-0.5">
                  code à initialiser
                </span>
              )}
            </button>
          ))}
        </div>

        {choisi && (
          <form onSubmit={valider} className="mt-5 pt-5 border-t border-line">
            <Field label={`Code de ${nomComplet(choisi)}`}>
              <input
                ref={champPin}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className={cn(inputClass, 'champ-scan text-center py-4')}
                placeholder="••••"
              />
            </Field>
            <Button type="submit" size="lg" disabled={pin.length !== 4 || occupe}>
              <LogIn size={18} strokeWidth={1.75} />
              Ouvrir le poste
            </Button>
          </form>
        )}
      </Card>

      {erreur && <Alerte>{erreur}</Alerte>}

      <p className="flex items-start gap-2 text-xs text-ink-3">
        <ShieldCheck size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
        Le code n'est jamais vérifié sur ce poste : il est comparé dans la base,
        où seule son empreinte est conservée.
      </p>
    </div>
  );
}
