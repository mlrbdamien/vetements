import { useState, type FormEvent, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useSession } from '../lib/session';
import { Alerte, Button, Card, CardHeader, Field, inputClass } from './ui';

/**
 * Garde les écrans d'administration.
 *
 * Le menu et cette barrière ne sont qu'un confort d'affichage : la vraie garde
 * est `est_admin()` en base, sur chaque RPC. Contourner cet écran ne donnerait
 * aucun droit supplémentaire.
 */
export function ExigeAdmin({ children }: { children: ReactNode }) {
  const { admin } = useSession();
  return admin ? <>{children}</> : <Connexion />;
}

function Connexion() {
  const { connecterAdmin } = useSession();
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      await connecterAdmin(email, mdp);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <Card>
        <CardHeader icon={ShieldAlert} title="Espace administration" />
        <p className="text-sm text-ink-3 mb-5">
          Réservé à l'administratrice. Le compte du poste ne suffit pas.
        </p>
        <form onSubmit={valider}>
          <Field label="Adresse email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className={inputClass}
            />
          </Field>
          <Field label="Mot de passe">
            <input
              type="password"
              value={mdp}
              onChange={(e) => setMdp(e.target.value)}
              autoComplete="current-password"
              className={inputClass}
            />
          </Field>
          <Button type="submit" disabled={occupe || !email || !mdp}>
            Se connecter
          </Button>
        </form>
      </Card>
      {erreur && <Alerte>{erreur}</Alerte>}
    </div>
  );
}
