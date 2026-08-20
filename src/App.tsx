import { useCallback, useState } from 'react';
import { SessionProvider, useSession } from './lib/session';
import { OperateurProvider } from './lib/operateur';
import { useEnLigne } from './lib/connexion';
import { Alerte } from './components/ui';
import { ExigeOperateur } from './components/Identification';
import { ExigeAdmin } from './components/ConnexionAdmin';
import { PanneauAide } from './components/Aide';
import {
  BandeauHorsLigne,
  BandeauVitrine,
  EnteteEcran,
  Rail,
  TITRES,
  useCompteurs,
  type Onglet,
} from './components/Coquille';
import { Scan } from './pages/Scan';
import { Expedition } from './pages/Expedition';
import { Reception } from './pages/Reception';
import { AdminOperateurs } from './pages/AdminOperateurs';
import { Parc } from './pages/Parc';
import { TableauxDeBord } from './pages/TableauxDeBord';

function Corps() {
  const { chargement, erreur, admin } = useSession();
  const enLigne = useEnLigne();
  const [onglet, setOnglet] = useState<Onglet>('scan');
  const [aideOuverte, setAideOuverte] = useState(false);
  const [compteurs, rechargerCompteurs] = useCompteurs();


  const changerOnglet = useCallback((o: Onglet) => {
    setOnglet(o);
    setAideOuverte(false);
  }, []);

  if (chargement) {
    return (
      <div className="min-h-dvh grid place-items-center text-ink-3 text-sm">
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

  return (
    <div className="h-dvh flex flex-col">
      <BandeauVitrine />
      {!enLigne && <BandeauHorsLigne />}

      <div className="flex-1 flex min-h-0">
        <Rail
          onglet={onglet}
          onOnglet={changerOnglet}
          admin={admin}
          compteurs={compteurs}
        />

        <div className="flex-1 flex min-w-0">
          <div className="flex-1 flex flex-col min-w-0">
            <EnteteEcran
              titre={TITRES[onglet]}
              onAide={() => setAideOuverte((o) => !o)}
              aideOuverte={aideOuverte}
            />

            <main className="flex-1 overflow-y-auto px-7 py-6">
              {/* Deux gardes distinctes. Les écrans d'administration demandent
                  un compte Supabase Auth nominatif ; les écrans de terrain
                  demandent un opérateur identifié par son PIN. */}
              {onglet === 'scan' && (
                <ExigeOperateur>
                  <Scan enLigne={enLigne} onMouvement={rechargerCompteurs} />
                </ExigeOperateur>
              )}
              {onglet === 'expedition' && (
                <ExigeAdmin>
                  <Expedition enLigne={enLigne} />
                </ExigeAdmin>
              )}
              {onglet === 'reception' && (
                <ExigeAdmin>
                  <Reception enLigne={enLigne} />
                </ExigeAdmin>
              )}
              {onglet === 'parc' && (
                <ExigeAdmin>
                  <Parc />
                </ExigeAdmin>
              )}
              {onglet === 'bord' && (
                <ExigeAdmin>
                  <TableauxDeBord />
                </ExigeAdmin>
              )}
              {onglet === 'operateurs' && (
                <ExigeAdmin>
                  <AdminOperateurs />
                </ExigeAdmin>
              )}
            </main>
          </div>

          <PanneauAide
            onglet={onglet}
            ouvert={aideOuverte}
            onFermer={() => setAideOuverte(false)}
          />
        </div>
      </div>

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
