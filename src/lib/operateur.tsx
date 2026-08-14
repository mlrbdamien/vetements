import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Operateur } from '../types';

/**
 * L'opérateur qui tient le poste, partagé entre les écrans Scan et Expédition.
 *
 * On s'identifie une fois en début de poste, pas une fois par écran : passer
 * de la corbeille au scan et revenir est un geste courant, et redemander le
 * code à chaque bascule ferait perdre plus de temps que la sécurité gagnée.
 *
 * Le PIN reste en mémoire le temps du poste — chaque RPC le revérifie en base.
 * Il n'est jamais écrit dans localStorage ni dans une URL.
 */
interface EtatOperateur {
  operateur: Operateur | null;
  pin: string;
  identifier: (o: Operateur, pin: string) => void;
  quitter: () => void;
}

const Contexte = createContext<EtatOperateur | null>(null);

export function OperateurProvider({ children }: { children: ReactNode }) {
  const [operateur, setOperateur] = useState<Operateur | null>(null);
  const [pin, setPin] = useState('');

  const identifier = useCallback((o: Operateur, p: string) => {
    setOperateur(o);
    setPin(p);
  }, []);

  const quitter = useCallback(() => {
    setOperateur(null);
    setPin('');
  }, []);

  const valeur = useMemo(
    () => ({ operateur, pin, identifier, quitter }),
    [operateur, pin, identifier, quitter],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useOperateur(): EtatOperateur {
  const c = useContext(Contexte);
  if (!c) throw new Error('useOperateur hors de OperateurProvider');
  return c;
}
