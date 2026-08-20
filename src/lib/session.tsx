import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { estAdmin as verifierEstAdmin } from './api';
import { VITRINE } from './demo';

/**
 * Deux niveaux d'identité, à ne pas confondre :
 *
 *  1. La SESSION SUPABASE AUTH — soit le compte technique partagé
 *     « poste pharmacie », ouvert automatiquement au démarrage, soit le compte
 *     nominatif de l'administratrice. C'est elle qui satisfait les policies RLS.
 *
 *  2. L'OPÉRATEUR courant — une simple sélection dans une liste, confirmée par
 *     un PIN vérifié en base. Aucun compte Auth : c'est ce qui permet à dix
 *     personnes de se relayer sur le même poste sans dix mots de passe.
 */
interface EtatSession {
  session: Session | null;
  admin: boolean;
  chargement: boolean;
  erreur: string | null;
  connecterAdmin: (email: string, motDePasse: string) => Promise<void>;
  quitterAdmin: () => Promise<void>;
}

const Contexte = createContext<EtatSession | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Ouverture automatique de la session de poste au démarrage : personne ne
  // doit taper un mot de passe pour scanner une blouse.
  const ouvrirSessionPoste = useCallback(async () => {
    if (!supabase) return null;
    const email = import.meta.env.VITE_POSTE_EMAIL;
    const motDePasse = import.meta.env.VITE_POSTE_MOT_DE_PASSE;
    if (!email || !motDePasse) return null;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
    if (error) {
      setErreur(`Connexion du poste impossible : ${error.message}`);
      return null;
    }
    return data.session;
  }, []);

  useEffect(() => {
    // Vitrine : aucun backend, donc aucune session à ouvrir. Tous les écrans
    // sont accessibles — les parties prenantes doivent pouvoir tout parcourir
    // sans qu'on leur distribue un mot de passe.
    if (VITRINE) {
      setAdmin(true);
      setChargement(false);
      return;
    }

    if (!supabase) {
      setErreur(
        "L'application n'est pas configurée : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont absents.",
      );
      setChargement(false);
      return;
    }

    let vivant = true;

    (async () => {
      const { data } = await supabase!.auth.getSession();
      const s = data.session ?? (await ouvrirSessionPoste());
      if (vivant) {
        setSession(s);
        setChargement(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    );
    return () => {
      vivant = false;
      sub.subscription.unsubscribe();
    };
  }, [ouvrirSessionPoste]);

  // Le menu Admin n'est qu'un confort d'affichage : la vraie garde est
  // est_admin() en base, sur chaque RPC d'administration.
  useEffect(() => {
    if (VITRINE) return;
    if (!session) {
      setAdmin(false);
      return;
    }
    verifierEstAdmin()
      .then(setAdmin)
      .catch(() => setAdmin(false));
  }, [session]);

  const connecterAdmin = useCallback(
    async (email: string, motDePasse: string) => {
      if (!supabase) throw new Error('Application non configurée.');
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: motDePasse,
      });
      // Distinguer les causes : « identifiants invalides » et « compte non
      // confirmé » se corrigent très différemment, et masquer la seconde
      // derrière la première envoie chercher un mot de passe qui est bon.
      if (error) {
        const code = error.code ?? '';
        if (code === 'email_not_confirmed') {
          throw new Error(
            "Ce compte n'a jamais été confirmé. Dans Supabase, ouvrez Authentication → Users, puis confirmez-le.",
          );
        }
        throw new Error(
          code === 'invalid_credentials'
            ? 'Email ou mot de passe incorrect.'
            : `Connexion refusée par Supabase : ${error.message}`,
        );
      }
    },
    [],
  );

  // Quitter l'admin ne déconnecte pas le poste : on rebascule sur le compte
  // technique, sinon l'écran Scan deviendrait inutilisable après coup.
  const quitterAdmin = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(await ouvrirSessionPoste());
  }, [ouvrirSessionPoste]);

  return (
    <Contexte.Provider
      value={{ session, admin, chargement, erreur, connecterAdmin, quitterAdmin }}
    >
      {children}
    </Contexte.Provider>
  );
}

export function useSession(): EtatSession {
  const c = useContext(Contexte);
  if (!c) throw new Error('useSession hors de SessionProvider');
  return c;
}
