import { useState, type FormEvent } from 'react';
import { Link2, ShieldCheck } from 'lucide-react';
import { useSession } from '../lib/session';
import { Alerte, Button, Card, CardHeader, Field, inputClass } from './ui';

/**
 * Relier ce poste à la base — une fois.
 *
 * Le mot de passe du compte de poste était compilé dans le JavaScript servi,
 * donc lisible par quiconque ouvrait la page, et impossible à changer sans
 * reconstruire l'application. Il est désormais saisi ici, à la main, lors de
 * la mise en service ; Supabase conserve la session sur l'ordinateur, et
 * l'écran ne réapparaît que si elle est perdue.
 */
export function MiseEnService() {
  const { connecterPoste } = useSession();
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      await connecterPoste(email.trim(), mdp);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader icon={Link2} title="Mise en service du poste" />
          <p className="text-sm text-ink-3 mb-5">
            Cet ordinateur n’est pas encore relié à la base. Saisissez le compte
            de poste une seule fois : la connexion est conservée ici, et ne sera
            plus demandée.
          </p>
          <form onSubmit={valider}>
            <Field label="Adresse email du poste">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoFocus
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
              <Link2 size={16} strokeWidth={1.75} />
              Relier ce poste
            </Button>
          </form>
        </Card>

        {erreur && <Alerte>{erreur}</Alerte>}

        <p className="flex items-start gap-2 text-xs text-ink-3">
          <ShieldCheck size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
          Le mot de passe n’est ni enregistré dans l’application ni dans son
          code : seule la session ouverte est conservée sur cet ordinateur.
        </p>
      </div>
    </div>
  );
}
