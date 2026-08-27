import { useEffect, useState } from 'react';

/**
 * État de la connexion, fondé sur ce qui échoue réellement.
 *
 * `navigator.onLine` ne rapporte que l'état de l'interface réseau. Le poste
 * peut être parfaitement connecté au réseau de l'établissement pendant que la
 * base est injoignable — c'est même la panne la plus probable, et c'était
 * précisément celle que l'ancienne version ne voyait pas : aucun bandeau, et
 * le scan restait actif alors que plus rien ne partait.
 *
 * On considère donc la connexion perdue dès qu'une requête échoue pour une
 * raison réseau, et retrouvée dès qu'une requête aboutit.
 *
 * Il n'y a toujours pas de file d'attente locale : un mouvement mis en attente
 * serait un mouvement dont on ne peut pas garantir qu'il sera accepté, les
 * transitions étant validées en base pendant que trois postes écrivent.
 */

type Ecouteur = (enLigne: boolean) => void;

const ecouteurs = new Set<Ecouteur>();
let enLigneActuel = true;
let sondeEnCours: ReturnType<typeof setInterval> | null = null;

/** Rappel à exécuter pour vérifier si la base répond de nouveau. */
let sonde: (() => Promise<unknown>) | null = null;

export function definirSonde(f: () => Promise<unknown>) {
  sonde = f;
}

function diffuser(valeur: boolean) {
  if (valeur === enLigneActuel) return;
  enLigneActuel = valeur;
  ecouteurs.forEach((e) => e(valeur));

  // Hors ligne, plus personne n'émet de requête : sans sonde périodique,
  // l'application resterait bloquée même une fois la base revenue.
  if (!valeur && !sondeEnCours) {
    sondeEnCours = setInterval(() => {
      void sonde?.().then(
        () => signalerReseau(true),
        () => undefined,
      );
    }, 10_000);
  }
  if (valeur && sondeEnCours) {
    clearInterval(sondeEnCours);
    sondeEnCours = null;
  }
}

/**
 * Signale l'issue d'une requête.
 *
 * À n'appeler avec `false` que pour une panne de transport — un refus métier
 * de la base prouve au contraire que la connexion fonctionne.
 */
export function signalerReseau(ok: boolean) {
  diffuser(ok);
}

/** Vrai si l'erreur relève du transport et non d'un refus de la base. */
export function estPanneReseau(e: unknown): boolean {
  if (e instanceof TypeError) return true; // fetch échoue ainsi
  const message = e instanceof Error ? e.message.toLowerCase() : '';
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('timeout')
  );
}

export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(enLigneActuel && navigator.onLine);

  useEffect(() => {
    const ecouteur: Ecouteur = setEnLigne;
    ecouteurs.add(ecouteur);

    // L'événement `offline` du navigateur reste utile : il est immédiat quand
    // c'est bien le câble qui a sauté.
    const tomber = () => diffuser(false);
    const monter = () => {
      void sonde?.().then(
        () => diffuser(true),
        () => undefined,
      );
    };
    window.addEventListener('offline', tomber);
    window.addEventListener('online', monter);

    return () => {
      ecouteurs.delete(ecouteur);
      window.removeEventListener('offline', tomber);
      window.removeEventListener('online', monter);
    };
  }, []);

  return enLigne;
}
