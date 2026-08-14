import { useEffect, useState } from 'react';

/**
 * État de la connexion réseau.
 *
 * En v1, il n'y a PAS de file d'attente locale : si la base est injoignable,
 * le scan est bloqué. Un mouvement mis en file serait un mouvement dont on ne
 * peut pas garantir qu'il sera accepté — les transitions sont validées en base,
 * et trois postes écrivent en parallèle. Mieux vaut refuser franchement que
 * promettre un enregistrement qu'on ne peut pas tenir.
 */
export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(navigator.onLine);

  useEffect(() => {
    const monter = () => setEnLigne(true);
    const tomber = () => setEnLigne(false);
    window.addEventListener('online', monter);
    window.addEventListener('offline', tomber);
    return () => {
      window.removeEventListener('online', monter);
      window.removeEventListener('offline', tomber);
    };
  }, []);

  return enLigne;
}
