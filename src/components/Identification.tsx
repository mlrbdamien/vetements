import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { listerOperateurs, verifierPin } from '../lib/api';
import { useOperateur } from '../lib/operateur';
import { nomComplet, type Operateur } from '../types';
import { Alerte, Button, cn, inputClass } from './ui';

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
    // L'écran occupe toute la largeur disponible : c'est le premier que voit
    // quiconque arrive au poste, et une carte étroite au milieu d'un grand
    // écran donne l'impression que l'application n'est pas finie.
    <div className="flex flex-col gap-7">
      <div>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em]">
          Qui tient le poste ?
        </h2>
        <p className="text-[15px] text-ink-3 mt-1.5">
          Sélectionnez votre nom, puis saisissez votre code à 4 chiffres.
        </p>
      </div>

      {/* Des tuiles larges, pas des boutons : on les vise debout, parfois avec
          une douchette dans l'autre main. */}
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
        {operateurs.map((o) => {
          const actif = choisi?.id === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setChoisi(o);
                setPin('');
                setErreur(null);
              }}
              aria-pressed={actif}
              className={cn(
                'rounded-card border px-5 py-4 text-left transition-colors cursor-pointer min-h-[76px] flex flex-col justify-center',
                actif
                  ? 'border-accent bg-accent-soft text-accent shadow-card'
                  : 'border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2',
              )}
            >
              <span className="text-[17px] font-medium tracking-[-0.01em]">
                {nomComplet(o)}
              </span>
              {!o.pin_defini && (
                <span className="text-[12.5px] font-normal text-ink-3 mt-1">
                  code à initialiser
                </span>
              )}
            </button>
          );
        })}
      </div>

      {choisi && (
        <form
          onSubmit={valider}
          className="rounded-card border border-line bg-surface-1 shadow-card p-6 flex flex-wrap items-end gap-5"
        >
          <div className="flex-1 min-w-[260px] max-w-sm">
            <label htmlFor="champ-pin" className="etiquette block mb-2">
              Code de {nomComplet(choisi)}
            </label>
            <input
              id="champ-pin"
              ref={champPin}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className={cn(
                inputClass,
                'champ-scan text-center py-4 tracking-[0.35em]',
                'focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-ring)]',
              )}
              placeholder="••••"
            />
          </div>

          <Button type="submit" size="lg" disabled={pin.length !== 4 || occupe}>
            <LogIn size={18} strokeWidth={1.75} />
            Ouvrir le poste
          </Button>

          <p className="flex items-start gap-2 text-[13px] text-ink-3 flex-1 min-w-[280px] max-w-md">
            <ShieldCheck size={15} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            Le code n’est jamais vérifié sur ce poste : il est comparé dans la
            base, où seule son empreinte est conservée.
          </p>
        </form>
      )}

      {erreur && <Alerte>{erreur}</Alerte>}
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
