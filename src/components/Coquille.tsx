import { useEffect, useState, type ReactNode } from 'react';
import {
  ChartNoAxesColumn,
  CircleHelp,
  Lock,
  PackagePlus,
  ScanLine,
  Shirt,
  Truck,
  Users,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { lireCompteurs } from '../lib/api';
import type { Compteurs } from '../types';
import { cn } from './ui';

/**
 * La coquille de l'application : barre latérale, en-tête d'écran, aide.
 *
 * Les six écrans ne se valent pas. Le Scan occupe l'essentiel de la journée,
 * l'expédition et la réception sont hebdomadaires, le suivi est occasionnel.
 * La barre latérale le dit : deux groupes nommés, et des compteurs qui font de
 * la navigation un tableau de bord permanent — c'est ce qui manquait le plus,
 * on scannait sans jamais voir l'état du parc.
 */

export type Onglet =
  | 'scan'
  | 'expedition'
  | 'reception'
  | 'parc'
  | 'bord'
  | 'operateurs';

type Entree = {
  id: Onglet;
  libelle: string;
  icone: LucideIcon;
  admin?: boolean;
  /** Chiffre affiché à droite du libellé. */
  compteur?: (c: Compteurs) => number | null;
  /** Pastille d'alerte : quelque chose demande une décision. */
  alerte?: (c: Compteurs) => boolean;
};

const GROUPES: { titre: string; entrees: Entree[] }[] = [
  {
    titre: 'Terrain',
    entrees: [
      { id: 'scan', libelle: 'Scan', icone: ScanLine },
      {
        id: 'expedition',
        libelle: 'Expédition',
        icone: Truck,
        admin: true,
        compteur: (c) => c.sale || null,
      },
      {
        id: 'reception',
        libelle: 'Réception',
        icone: PackagePlus,
        admin: true,
        compteur: (c) => c.expeditions_ouvertes || null,
      },
    ],
  },
  {
    titre: 'Suivi',
    entrees: [
      {
        id: 'parc',
        libelle: 'Parc',
        icone: Shirt,
        admin: true,
        compteur: (c) => c.parc_total || null,
        alerte: (c) => c.detenteurs_inactifs > 0,
      },
      {
        id: 'bord',
        libelle: 'Tableaux de bord',
        icone: ChartNoAxesColumn,
        admin: true,
        alerte: (c) => c.sous_seuil > 0,
      },
      { id: 'operateurs', libelle: 'Opérateurs', icone: Users, admin: true },
    ],
  },
];

export const TOUS_LES_ONGLETS: Entree[] = GROUPES.flatMap((g) => g.entrees);

export const TITRES: Record<Onglet, string> = {
  scan: 'Scan',
  expedition: 'Expédition',
  reception: 'Entrée marchandise',
  parc: 'Parc',
  bord: 'Tableaux de bord',
  operateurs: 'Opérateurs',
};

/* ------------------------------------------------------------------------- */

export function Rail({
  onglet,
  onOnglet,
  admin,
  compteurs,
}: {
  onglet: Onglet;
  onOnglet: (o: Onglet) => void;
  admin: boolean;
  compteurs: Compteurs | null;
}) {
  return (
    <nav
      className="rail-navigation w-[232px] shrink-0 bg-rail border-r border-line flex flex-col"
      aria-label="Navigation principale"
    >
      <div className="px-4 py-4 border-b border-line">
        <p className="font-semibold tracking-[-0.015em] text-[15px] leading-tight">
          Vêtements
        </p>
        <p className="text-[11px] text-ink-3 mt-0.5">Pharmacie 24 · Elis</p>
      </div>

      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-4">
        {GROUPES.map((g) => (
          <div key={g.titre} className="px-2.5">
            <p className="etiquette px-2 mb-1.5">{g.titre}</p>
            <div className="flex flex-col gap-0.5">
              {g.entrees.map((e) => {
                const n = compteurs && e.compteur ? e.compteur(compteurs) : null;
                const alerte = compteurs && e.alerte ? e.alerte(compteurs) : false;
                const actif = onglet === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOnglet(e.id)}
                    aria-current={actif ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-control px-2 py-[7px] text-[13px] transition-colors cursor-pointer text-left',
                      actif
                        ? 'bg-surface-1 text-ink font-semibold shadow-rail'
                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <e.icone
                      size={15}
                      strokeWidth={actif ? 2 : 1.75}
                      className={cn('shrink-0', actif ? 'text-accent' : 'text-ink-3')}
                    />
                    <span className="flex-1 truncate">{e.libelle}</span>

                    {alerte && (
                      <span
                        className="h-[6px] w-[6px] rounded-full bg-critical shrink-0"
                        aria-label="demande votre attention"
                      />
                    )}
                    {/* Sans qualificatif, un lecteur d'écran énonce
                        « Expédition 5 » sans dire 5 de quoi. */}
                    {n !== null && (
                      <span
                        className="donnee text-[11px] text-ink-3 shrink-0"
                        aria-label={`${n} en attente`}
                      >
                        {n}
                      </span>
                    )}
                    {/* Un cadenas discret vaut mieux qu'un badge « ADM »
                        répété cinq fois : l'information est la même, le bruit
                        est moindre. */}
                    {e.admin && !admin && (
                      <Lock
                        size={11}
                        strokeWidth={2}
                        className="text-ink-3 shrink-0 opacity-60"
                        aria-label="réservé à l’administratrice"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {compteurs && <EtatParc compteurs={compteurs} />}
    </nav>
  );
}

/** Le pied de la barre : l'état du parc, toujours visible. */
function EtatParc({ compteurs }: { compteurs: Compteurs }) {
  const lignes = [
    { l: 'En stock', n: compteurs.en_stock, mal: compteurs.sous_seuil > 0 },
    { l: 'Sorties', n: compteurs.en_utilisation, mal: false },
    { l: 'Corbeille', n: compteurs.sale, mal: false },
    { l: 'Chez Elis', n: compteurs.chez_elis, mal: false },
  ];

  return (
    <div className="border-t border-line px-4 py-3.5">
      <p className="etiquette mb-2">Parc</p>
      <dl className="flex flex-col gap-1">
        {lignes.map((r) => (
          <div key={r.l} className="flex items-baseline justify-between gap-3">
            <dt className="text-[12px] text-ink-2">{r.l}</dt>
            <dd
              className={cn(
                'donnee text-[13px] font-semibold',
                r.mal && 'text-critical-text',
              )}
            >
              {r.n}
            </dd>
          </div>
        ))}
      </dl>
      {compteurs.sous_seuil > 0 && (
        <p className="text-[11px] text-critical-text mt-2.5 leading-snug">
          {compteurs.sous_seuil} combinaison(s) sous leur seuil
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export function EnteteEcran({
  titre,
  contexte,
  actions,
  onAide,
  aideOuverte,
}: {
  titre: string;
  contexte?: ReactNode;
  actions?: ReactNode;
  onAide?: () => void;
  aideOuverte?: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-6 px-7 h-[52px] border-b border-line bg-surface-1 shrink-0">
      <div className="flex items-baseline gap-3 min-w-0">
        <h1 className="text-[15px] font-semibold tracking-[-0.015em] shrink-0">
          {titre}
        </h1>
        {contexte && (
          <span className="text-[12.5px] text-ink-3 truncate">{contexte}</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions}
        <kbd className="hidden md:inline-block donnee text-[10.5px] text-ink-3 border border-line rounded-control px-1.5 py-[3px] bg-surface-2">
          ⌘K
        </kbd>
        {onAide && (
          <button
            type="button"
            onClick={onAide}
            aria-pressed={aideOuverte}
            title="Repères de cet écran"
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-control transition-colors cursor-pointer',
              aideOuverte
                ? 'bg-accent-soft text-accent'
                : 'text-ink-3 hover:text-ink hover:bg-surface-2',
            )}
          >
            <CircleHelp size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------- */

export function BandeauHorsLigne() {
  return (
    <div className="bg-critical text-white px-4 py-2 flex items-center justify-center gap-2 text-[13px] font-medium shrink-0">
      <WifiOff size={15} strokeWidth={2} />
      Hors ligne — le scan est suspendu. Rien n’est mis en attente.
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Palette de commandes. Sur un poste où la douchette occupe une main, aller
 * d'un écran à l'autre sans lâcher le clavier a une vraie valeur.
 */
export function PaletteCommandes({
  ouverte,
  onFermer,
  onOnglet,
  admin,
}: {
  ouverte: boolean;
  onFermer: () => void;
  onOnglet: (o: Onglet) => void;
  admin: boolean;
}) {
  const [terme, setTerme] = useState('');
  const [curseur, setCurseur] = useState(0);

  const resultats = TOUS_LES_ONGLETS.filter(
    (e) =>
      (admin || !e.admin) &&
      TITRES[e.id].toLowerCase().includes(terme.trim().toLowerCase()),
  );

  useEffect(() => {
    if (ouverte) {
      setTerme('');
      setCurseur(0);
    }
  }, [ouverte]);

  useEffect(() => {
    setCurseur((c) => Math.min(c, Math.max(resultats.length - 1, 0)));
  }, [resultats.length]);

  useEffect(() => {
    if (!ouverte) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onFermer();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCurseur((c) => (c + 1) % Math.max(resultats.length, 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCurseur(
          (c) => (c - 1 + resultats.length) % Math.max(resultats.length, 1),
        );
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const choisi = resultats[curseur];
        if (choisi) {
          onOnglet(choisi.id);
          onFermer();
        }
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouverte, resultats, curseur, onOnglet, onFermer]);

  if (!ouverte) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-black/35 backdrop-blur-[2px] px-4"
      onClick={onFermer}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Aller à un écran"
        className="w-full max-w-md rounded-card bg-surface-1 border border-line shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={terme}
          onChange={(e) => setTerme(e.target.value)}
          placeholder="Aller à…"
          aria-label="Aller à un écran"
          className="w-full px-4 py-3.5 text-[15px] bg-transparent outline-none border-b border-line placeholder:text-ink-3"
        />
        <ul className="py-1.5 max-h-72 overflow-y-auto">
          {resultats.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-ink-3">Aucun écran.</li>
          )}
          {resultats.map((e, i) => (
            <li key={e.id}>
              <button
                type="button"
                onMouseEnter={() => setCurseur(i)}
                onClick={() => {
                  onOnglet(e.id);
                  onFermer();
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2 text-[13.5px] text-left cursor-pointer',
                  i === curseur ? 'bg-accent-soft text-accent' : 'text-ink-2',
                )}
              >
                <e.icone size={15} strokeWidth={1.75} className="shrink-0" />
                {TITRES[e.id]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/** Charge les compteurs et les rafraîchit sur demande. */
export function useCompteurs(): [Compteurs | null, () => void] {
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);

  const recharger = () => {
    lireCompteurs()
      .then(setCompteurs)
      // Les compteurs sont un confort : leur échec ne doit rien interrompre.
      .catch(() => setCompteurs(null));
  };

  useEffect(recharger, []);
  return [compteurs, recharger];
}
