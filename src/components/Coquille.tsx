import { useEffect, useState, type ReactNode } from 'react';
import {
  ChartNoAxesColumn,
  CircleHelp,
  Lock,
  Menu,
  PackagePlus,
  ScanLine,
  Shirt,
  Truck,
  Users,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { lireCompteurs } from '../lib/api';
import { VITRINE } from '../lib/demo';
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
  ouvert = false,
}: {
  onglet: Onglet;
  onOnglet: (o: Onglet) => void;
  admin: boolean;
  compteurs: Compteurs | null;
  /** Sur écran étroit, le rail est masqué tant qu'on ne l'ouvre pas. */
  ouvert?: boolean;
}) {
  return (
    <nav
      className={cn(
        'rail-navigation shrink-0 bg-rail border-r border-line flex flex-col',
        // En dessous de 768 px le rail sort du flux et se superpose : sur un
        // écran étroit, lui garder 72 px reviendrait à amputer le contenu.
        'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-[264px]',
        'max-md:transition-transform max-md:duration-200 motion-reduce:transition-none',
        ouvert ? 'max-md:translate-x-0 max-md:shadow-modal' : 'max-md:-translate-x-full',
        'md:w-[72px] xl:w-[264px]',
      )}
      aria-label="Navigation principale"
    >
      <div className="px-5 py-5 border-b border-line md:px-4 xl:px-5">
        <p className="font-semibold tracking-[-0.015em] text-[17px] leading-tight md:hidden xl:block">
          Vêtements de laboratoire
        </p>
        <p
          aria-hidden="true"
          className="hidden md:block xl:hidden text-[17px] font-semibold text-center"
        >
          V
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-4">
        {GROUPES.map((g) => (
          <div key={g.titre} className="px-2.5">
            <p className="etiquette px-2 mb-1.5 md:hidden xl:block">{g.titre}</p>
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
                      'group flex items-center gap-2.5 rounded-control px-2.5 py-2.5 text-[15px] transition-colors cursor-pointer text-left',
                      'md:justify-center md:px-0 xl:justify-start xl:px-2.5',
                      actif
                        ? 'bg-surface-1 text-ink font-semibold shadow-rail'
                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <e.icone
                      size={17}
                      strokeWidth={actif ? 2 : 1.75}
                      className={cn('shrink-0', actif ? 'text-accent' : 'text-ink-3')}
                    />
                    <span className="flex-1 truncate md:hidden xl:block">
                      {e.libelle}
                    </span>

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
                        className="donnee text-[13px] text-ink-3 shrink-0 md:hidden xl:inline"
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
                        className="text-ink-3 shrink-0 opacity-60 md:hidden xl:block"
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
    { l: 'Chez le prestataire', n: compteurs.chez_prestataire, mal: false },
  ];

  return (
    <div className="border-t border-line px-5 py-4 md:hidden xl:block">
      <p className="etiquette mb-2">Parc</p>
      <dl className="flex flex-col gap-1">
        {lignes.map((r) => (
          <div key={r.l} className="flex items-baseline justify-between gap-3">
            <dt className="text-[14px] text-ink-2">{r.l}</dt>
            <dd
              className={cn(
                'donnee text-[17px] font-semibold',
                r.mal && 'text-critical-text',
              )}
            >
              {r.n}
            </dd>
          </div>
        ))}
      </dl>
      {compteurs.sous_seuil > 0 && (
        <p className="text-[12.5px] text-critical-text mt-3 leading-snug">
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
  onMenu,
}: {
  titre: string;
  contexte?: ReactNode;
  actions?: ReactNode;
  onAide?: () => void;
  aideOuverte?: boolean;
  /** Ouvre le rail sur écran étroit, où il est masqué. */
  onMenu?: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-6 px-8 h-[60px] border-b border-line bg-surface-1 shrink-0">
      <div className="flex items-baseline gap-3 min-w-0">
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Ouvrir la navigation"
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 transition-colors cursor-pointer self-center -ml-1"
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
        )}
        <h1 className="text-[18px] font-semibold tracking-[-0.02em] shrink-0">
          {titre}
        </h1>
        {contexte && (
          <span className="text-[14px] text-ink-3 truncate">{contexte}</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {onAide && (
          <button
            type="button"
            onClick={onAide}
            aria-pressed={aideOuverte}
            title="Repères de cet écran"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-control transition-colors cursor-pointer',
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

/**
 * Bandeau de la vitrine publique.
 *
 * Il dit trois choses qu'une personne extérieure ne peut pas deviner : les
 * données sont fictives, rien n'est enregistré, et voici les codes pour
 * essayer. Sans lui, un stakeholder croirait voir le parc réel de la
 * l'établissement.
 */
export function BandeauVitrine() {
  if (!VITRINE) return null;
  return (
    <div className="bg-accent text-white px-5 py-2.5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[13.5px] shrink-0">
      <span className="font-semibold">Démonstration</span>
      <span className="opacity-90">
        Données fictives, rien n'est enregistré — un rechargement remet tout à zéro.
      </span>
      <span className="opacity-90">
        Pour scanner : <b>Chantal</b> code <b className="donnee">1234</b>, ou{' '}
        <b>Tanguy</b> code <b className="donnee">5678</b>.
      </span>
    </div>
  );
}

export function BandeauHorsLigne() {
  return (
    <div className="bg-critical text-white px-4 py-2.5 flex items-center justify-center gap-2 text-[15px] font-medium shrink-0">
      <WifiOff size={15} strokeWidth={2} />
      Hors ligne — le scan est suspendu. Rien n’est mis en attente.
    </div>
  );
}


/* ------------------------------------------------------------------------- */


/* ------------------------------------------------------------------------- */

/**
 * Charge les compteurs et les rafraîchit sur demande.
 *
 * `pret` doit être vrai une fois la session de poste ouverte. Sans cette
 * garde, la première lecture partait avant l'authentification — 401 en
 * production, et comme rien ne relançait l'appel ensuite, le pied « Parc »
 * restait vide toute la journée. La vitrine, sans auth, masquait le défaut.
 */
export function useCompteurs(pret: boolean): [Compteurs | null, () => void] {
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);

  const recharger = () => {
    lireCompteurs()
      .then(setCompteurs)
      // Les compteurs sont un confort : leur échec ne doit rien interrompre.
      .catch(() => setCompteurs(null));
  };

  useEffect(() => {
    if (pret) recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret]);
  return [compteurs, recharger];
}
