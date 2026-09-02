import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { definirAdminActif, supabaseAdmin, supabasePoste } from './supabase';
import { estAdmin as verifierEstAdmin } from './api';
import { VITRINE } from './demo';

/**
 * Trois niveaux d'identité, à ne pas confondre :
 *
 *  1. LE POSTE — compte Supabase Auth technique, relié une fois à la main
 *     depuis l'écran de mise en service. Sa session est conservée sur
 *     l'ordinateur ; le mot de passe ne vit nulle part dans le code.
 *
 *  2. L'ADMINISTRATRICE — compte Supabase Auth nominatif, session limitée à
 *     l'onglet. Elle cohabite avec celle du poste : quitter l'admin ne
 *     déconnecte pas le poste.
 *
 *  3. L'OPÉRATEUR courant — une sélection dans une liste, confirmée par un
 *     PIN vérifié en base. Aucun compte Auth.
 */
interface EtatSession {
  session: Session | null;
  admin: boolean;
  chargement: boolean;
  erreur: string | null;
  /** Vrai tant que ce poste n'a jamais été relié à la base. */
  posteAConfigurer: boolean;
  connecterPoste: (email: string, motDePasse: string) => Promise<void>;
  connecterAdmin: (email: string, motDePasse: string) => Promise<void>;
  quitterAdmin: () => Promise<void>;
}

const Contexte = createContext<EtatSession | null>(null);

/** Traduit les refus de GoTrue en phrases qui disent quoi faire. */
function messageDeConnexion(code: string | undefined, message: string): string {
  // « Identifiants invalides » et « compte non confirmé » se corrigent très
  // différemment ; masquer le second derrière le premier envoie chercher un
  // mot de passe qui est bon.
  if (code === 'email_not_confirmed') {
    return "Ce compte n'a jamais été confirmé. Dans Supabase, ouvrez Authentication → Users, puis confirmez-le.";
  }
  if (code === 'invalid_credentials') return 'Email ou mot de passe incorrect.';
  return `Connexion refusée par Supabase : ${message}`;
}

async function seConnecter(client: SupabaseClient, email: string, motDePasse: string) {
  const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw new Error(messageDeConnexion(error.code, error.message));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionAdmin, setSessionAdmin] = useState<Session | null>(null);
  const [admin, setAdmin] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // Vitrine : aucun backend, donc aucune session à ouvrir. Tous les écrans
    // sont accessibles — les parties prenantes doivent pouvoir tout parcourir
    // sans qu'on leur distribue un mot de passe.
    if (VITRINE) {
      setAdmin(true);
      setChargement(false);
      return;
    }

    if (!supabasePoste || !supabaseAdmin) {
      setErreur(
        "L'application n'est pas configurée : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont absents.",
      );
      setChargement(false);
      return;
    }

    let vivant = true;

    // On lit ce que l'ordinateur a conservé. Rien n'est ouvert automatiquement :
    // un poste jamais relié affichera l'écran de mise en service.
    (async () => {
      const [{ data: p }, { data: a }] = await Promise.all([
        supabasePoste.auth.getSession(),
        supabaseAdmin.auth.getSession(),
      ]);
      if (!vivant) return;
      setSession(p.session);
      setSessionAdmin(a.session);
      setChargement(false);
    })();

    const { data: subPoste } = supabasePoste.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    );
    const { data: subAdmin } = supabaseAdmin.auth.onAuthStateChange((_e, s) =>
      setSessionAdmin(s),
    );
    return () => {
      vivant = false;
      subPoste.subscription.unsubscribe();
      subAdmin.subscription.unsubscribe();
    };
  }, []);

  // Le menu Admin n'est qu'un confort d'affichage : la vraie garde est
  // est_admin() en base, sur chaque RPC d'administration. On aiguille d'abord
  // les requêtes vers le client admin, puis on demande à la base son avis.
  useEffect(() => {
    if (VITRINE) return;
    definirAdminActif(sessionAdmin !== null);
    if (!sessionAdmin) {
      setAdmin(false);
      return;
    }
    verifierEstAdmin()
      .then(setAdmin)
      .catch(() => setAdmin(false));
  }, [sessionAdmin]);

  const connecterPoste = useCallback(async (email: string, motDePasse: string) => {
    if (!supabasePoste) throw new Error('Application non configurée.');
    await seConnecter(supabasePoste, email, motDePasse);
  }, []);

  const connecterAdmin = useCallback(async (email: string, motDePasse: string) => {
    if (!supabaseAdmin) throw new Error('Application non configurée.');
    await seConnecter(supabaseAdmin, email, motDePasse);
  }, []);

  // Quitter l'admin ne touche pas au poste : sa session est ailleurs.
  const quitterAdmin = useCallback(async () => {
    if (!supabaseAdmin) return;
    await supabaseAdmin.auth.signOut();
  }, []);

  return (
    <Contexte.Provider
      value={{
        session,
        admin,
        chargement,
        erreur,
        posteAConfigurer: !VITRINE && !chargement && !erreur && session === null,
        connecterPoste,
        connecterAdmin,
        quitterAdmin,
      }}
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
