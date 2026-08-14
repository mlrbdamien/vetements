import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { listerOperateurs, verifierPin } from '../lib/api';
import { useOperateur } from '../lib/operateur';
import { nomComplet, type Operateur } from '../types';
import { Alerte, Button, Card, Field, cn, inputClass } from './ui';

/**
 * Garde les écrans opérateur : affiche l'identification tant que personne
 * n'a ouvert le poste, puis laisse passer.
 */
export function ExigeOperateur({ children }: { children: ReactNode }) {
  const { operateur } = useOperateur();
  return operateur ? <>{children}</> : <Identification />;
}

function Identification() {
  const { identifier } = useOperateur();
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [choisi, setChoisi] = useState<Operateur | null>(null);
  const [pin, setPin] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const champPin = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listerOperateurs()
      // Un opérateur désactivé disparaît d'ici, mais reste partout dans
      // l'historique : désactiver n'efface pas le passé.
      .then((tous) => setOperateurs(tous.filter((o) => o.actif)))
      .catch((e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    if (choisi) champPin.current?.focus();
  }, [choisi]);

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!choisi || pin.length !== 4 || occupe) return;
    setOccupe(true);
    setErreur(null);
    try {
      if (await verifierPin(choisi.id, pin)) {
        identifier(choisi, pin);
      } else {
        setErreur('Code PIN incorrect.');
        setPin('');
      }
    } catch (err) {
      setErreur((err as Error).message);
      setPin('');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-8.5rem)] flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-5">
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
                setErreur(null);
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
    </div>
  );
}

/** Bandeau « poste tenu par X » + sortie, commun aux écrans opérateur. */
export function BandeauOperateur() {
  const { operateur, quitter } = useOperateur();
  if (!operateur) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-ink-2">
        Poste tenu par{' '}
        <span className="font-medium text-ink">{nomComplet(operateur)}</span>
      </p>
      <Button variant="ghost" size="sm" onClick={quitter}>
        Changer d'opérateur
      </Button>
    </div>
  );
}
