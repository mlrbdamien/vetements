import { useState } from 'react';
import { PackagePlus, ScanLine, Truck, Users, WifiOff } from 'lucide-react';
import { SessionProvider, useSession } from './lib/session';
import { OperateurProvider } from './lib/operateur';
import { useEnLigne } from './lib/connexion';
import { Alerte, cn } from './components/ui';
import { ExigeOperateur } from './components/Identification';
import { ExigeAdmin } from './components/ConnexionAdmin';
import { Scan } from './pages/Scan';
import { Expedition } from './pages/Expedition';
import { Reception } from './pages/Reception';
import { AdminOperateurs } from './pages/AdminOperateurs';

type Onglet = 'scan' | 'expedition' | 'reception' | 'operateurs';

function Corps() {
  const { chargement, erreur, admin } = useSession();
  const enLigne = useEnLigne();
  const [onglet, setOnglet] = useState<Onglet>('scan');

  if (chargement) {
    return (
      <div className="min-h-dvh grid place-items-center text-ink-3">
        Connexion au poste…
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <div className="max-w-md">
          <Alerte>{erreur}</Alerte>
        </div>
      </div>
    );
  }

  const onglets: {
    id: Onglet;
    libelle: string;
    icone: typeof ScanLine;
    admin?: boolean;
  }[] = [
    { id: 'scan', libelle: 'Scan', icone: ScanLine },
    { id: 'expedition', libelle: 'Expédition', icone: Truck, admin: true },
    { id: 'reception', libelle: 'Réception', icone: PackagePlus, admin: true },
    { id: 'operateurs', libelle: 'Opérateurs', icone: Users, admin: true },
  ];

  return (
    <div className="min-h-dvh">
      {/* Bandeau hors ligne : persistant, pleine largeur, impossible à rater.
          Le scan est bloqué tant qu'il est affiché. */}
      {!enLigne && (
        <div className="bg-critical text-white px-4 py-3 flex items-center justify-center gap-2 font-medium">
          <WifiOff size={18} strokeWidth={2} />
          Hors ligne — le scan est suspendu. Rien n'est mis en attente.
        </div>
      )}

      <header className="border-b border-line bg-surface-1">
        <div className="px-6 lg:px-8 py-3.5 flex items-center justify-between gap-6">
          <div>
            <h1 className="font-semibold tracking-[-0.01em] whitespace-nowrap">
              Vêtements de laboratoire
            </h1>
            <p className="text-xs text-ink-3">Pharmacie 24 · Elis</p>
          </div>
          <nav className="flex gap-1 shrink-0">
            {onglets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOnglet(o.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-control px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer',
                  onglet === o.id
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-3 hover:text-ink hover:bg-surface-2',
                )}
              >
                <o.icone size={16} strokeWidth={1.75} />
                {o.libelle}
                {o.admin && admin && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-good-text">
                    admin
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 lg:px-8 py-7">
        {/* Deux gardes distinctes. Les écrans d'administration demandent un
            compte Supabase Auth nominatif ; les écrans de terrain demandent un
            opérateur identifié par son PIN. Personne ne fait les deux. */}
        {onglet === 'operateurs' && (
          <ExigeAdmin>
            <AdminOperateurs />
          </ExigeAdmin>
        )}
        {onglet === 'reception' && (
          <ExigeAdmin>
            <Reception enLigne={enLigne} />
          </ExigeAdmin>
        )}
        {onglet === 'expedition' && (
          <ExigeAdmin>
            <Expedition enLigne={enLigne} />
          </ExigeAdmin>
        )}
        {onglet === 'scan' && (
          <ExigeOperateur>
            <Scan enLigne={enLigne} />
          </ExigeOperateur>
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <SessionProvider>
      <OperateurProvider>
        <Corps />
      </OperateurProvider>
    </SessionProvider>
  );
}
