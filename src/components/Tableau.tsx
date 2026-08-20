import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Sheet, X } from 'lucide-react';
import { exporterCsv, exporterXlsx, type Colonne } from '../lib/export';
import { Button, EmptyState, cn } from './ui';

/**
 * Un tableau de tableau de bord, avec ses deux boutons d'export.
 *
 * Les colonnes servent à la fois au rendu et à l'export : une colonne ajoutée
 * à l'écran part dans le fichier sans autre intervention, et les deux ne
 * peuvent pas diverger.
 */

export type ColonneTableau<T> = Colonne<T> & {
  /** Rendu à l'écran. Absent, la valeur brute est affichée telle quelle. */
  rendu?: (ligne: T) => ReactNode;
  /** Aligne à droite — pour tout ce qui se compare verticalement. */
  nombre?: boolean;
  /** Désactive le tri sur cette colonne. */
  sansTri?: boolean;
  /**
   * Filtre proposé sous l'en-tête.
   *   'texte' — saisie libre, contient
   *   'liste' — liste déroulante des valeurs réellement présentes
   */
  filtre?: 'texte' | 'liste';
  /**
   * Valeur servant au tri et au filtre « liste » quand elle diffère de la
   * donnée brute — un statut affiché « En stock » se trie mieux sur son
   * libellé que sur `en_stock`.
   */
  valeur?: (ligne: T) => string | number;
};

type Tri = { cle: string; sens: 'asc' | 'desc' } | null;

/** Comparaison tolérante : chaînes, nombres, booléens et vides mélangés. */
function comparer(a: unknown, b: unknown): number {
  const vide = (v: unknown) => v === null || v === undefined || v === '';
  if (vide(a) && vide(b)) return 0;
  // Les valeurs absentes finissent toujours en bas, quel que soit le sens :
  // une colonne vide n'est pas « la plus petite », elle n'a pas de valeur.
  if (vide(a)) return 1;
  if (vide(b)) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'fr', { numeric: true });
}

export function Tableau<T>({
  titre,
  description,
  colonnes,
  lignes,
  cle,
  nomExport,
  vide = 'Rien à afficher.',
  tonLigne,
  entete,
  onLigne,
}: {
  titre: string;
  description?: ReactNode;
  colonnes: ColonneTableau<T>[];
  lignes: T[];
  cle: (ligne: T) => string | number;
  /** Base du nom de fichier, sans horodatage ni extension. */
  nomExport: string;
  vide?: string;
  /** Couleur de fond d'une ligne à signaler. */
  tonLigne?: (ligne: T) => string | undefined;
  /** Contenu libre entre le titre et le tableau. */
  entete?: ReactNode;
  /** Rend les lignes sélectionnables — au clic et au clavier. */
  onLigne?: (ligne: T) => void;
}) {
  const [tri, setTri] = useState<Tri>(null);
  const [filtres, setFiltres] = useState<Record<string, string>>({});

  const valeurDe = (c: ColonneTableau<T>, l: T): unknown =>
    c.valeur ? c.valeur(l) : l[c.cle];

  const aDesFiltres = colonnes.some((c) => c.filtre);

  /** Valeurs réellement présentes, pour les listes déroulantes. */
  const choix = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of colonnes) {
      if (c.filtre !== 'liste') continue;
      const vues = new Set<string>();
      for (const l of lignes) {
        const v = valeurDe(c, l);
        vues.add(v === null || v === undefined || v === '' ? '—' : String(v));
      }
      m[c.cle] = [...vues].sort((a, b) => comparer(a, b));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colonnes, lignes]);

  const visibles = useMemo(() => {
    let sortie = lignes;

    for (const c of colonnes) {
      const f = filtres[c.cle];
      if (!f) continue;
      sortie = sortie.filter((l) => {
        const brut = valeurDe(c, l);
        const texte = brut === null || brut === undefined || brut === '' ? '—' : String(brut);
        return c.filtre === 'liste'
          ? texte === f
          : texte.toLowerCase().includes(f.toLowerCase());
      });
    }

    if (tri) {
      const c = colonnes.find((x) => x.cle === tri.cle);
      if (c) {
        // Copie avant tri : `lignes` appartient à l'appelant.
        sortie = [...sortie].sort((a, b) => {
          const r = comparer(valeurDe(c, a), valeurDe(c, b));
          return tri.sens === 'asc' ? r : -r;
        });
      }
    }
    return sortie;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, colonnes, filtres, tri]);

  function basculerTri(c: ColonneTableau<T>) {
    if (c.sansTri) return;
    setTri((t) =>
      t?.cle !== c.cle
        ? { cle: c.cle, sens: 'asc' }
        : t.sens === 'asc'
          ? { cle: c.cle, sens: 'desc' }
          // Troisième clic : retour à l'ordre d'origine, qui porte souvent
          // du sens (le plus ancien d'abord, le plus urgent en tête).
          : null,
    );
  }

  const filtresActifs = Object.values(filtres).filter(Boolean).length;

  return (
    <section className="rounded-card bg-surface-1 border border-line shadow-card">
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line">
        <div className="min-w-0">
          <h3 className="font-medium">{titre}</h3>
          {description && (
            <p className="text-xs text-ink-3 mt-1 leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0 print:hidden">
          <Button
            variant="ghost"
            size="sm"
            disabled={visibles.length === 0}
            onClick={() => exporterCsv(nomExport, colonnes, visibles)}
          >
            <Download size={14} strokeWidth={1.75} />
            CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={visibles.length === 0}
            onClick={() => void exporterXlsx(nomExport, colonnes, visibles, titre)}
          >
            <Sheet size={14} strokeWidth={1.75} />
            Excel
          </Button>
        </div>
      </div>

      {entete && <div className="px-5 py-4 border-b border-line">{entete}</div>}

      {/* Dire combien de lignes sont masquées, sinon un filtre oublié fait
          croire que le parc a rétréci. */}
      {filtresActifs > 0 && (
        <div className="px-5 py-2.5 border-b border-line flex items-center justify-between gap-4 bg-accent-soft/50 print:hidden">
          <p className="text-[13px] text-ink-2">
            <span className="font-semibold tabular">{visibles.length}</span> ligne(s)
            sur <span className="tabular">{lignes.length}</span>
            {' · '}
            {filtresActifs} filtre(s) actif(s)
          </p>
          <button
            type="button"
            onClick={() => setFiltres({})}
            className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline cursor-pointer"
          >
            <X size={13} strokeWidth={2} />
            Tout afficher
          </button>
        </div>
      )}

      {visibles.length === 0 ? (
        <EmptyState
          titre={lignes.length === 0 ? vide : 'Aucune ligne ne correspond aux filtres.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="print:table-header-group">
              <tr className="border-b border-line">
                {colonnes.map((c) => {
                  const actif = tri?.cle === c.cle;
                  const Fleche = !actif
                    ? ChevronsUpDown
                    : tri.sens === 'asc'
                      ? ArrowUp
                      : ArrowDown;
                  return (
                    <th
                      key={c.cle}
                      scope="col"
                      // aria-sort dit au lecteur d'écran ce que la flèche
                      // montre à l'œil.
                      aria-sort={
                        actif
                          ? tri.sens === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : c.sansTri
                            ? undefined
                            : 'none'
                      }
                      className={cn(
                        'px-5 py-2 whitespace-nowrap align-bottom',
                        c.nombre && 'text-right',
                      )}
                    >
                      {c.sansTri ? (
                        <span className="etiquette">{c.entete}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => basculerTri(c)}
                          title={`Trier par ${c.entete.toLowerCase()}`}
                          className={cn(
                            'etiquette inline-flex items-center gap-1.5 rounded-control px-1 -mx-1 py-0.5 cursor-pointer transition-colors hover:text-ink',
                            c.nombre && 'flex-row-reverse',
                            actif && 'text-accent',
                          )}
                        >
                          {c.entete}
                          <Fleche
                            size={12}
                            strokeWidth={2.25}
                            className={cn(
                              'shrink-0 transition-opacity',
                              actif ? 'opacity-100' : 'opacity-35',
                            )}
                          />
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>

              {/* Ligne de filtres, seulement si au moins une colonne en
                  déclare un — un tableau sans filtre n'a pas à porter une
                  rangée de champs vides. */}
              {aDesFiltres && (
                <tr className="border-b border-line print:hidden">
                  {colonnes.map((c) => (
                    <th key={c.cle} scope="col" className="px-5 pb-2.5 pt-0.5">
                      {c.filtre === 'liste' ? (
                        <select
                          value={filtres[c.cle] ?? ''}
                          onChange={(e) =>
                            setFiltres((f) => ({ ...f, [c.cle]: e.target.value }))
                          }
                          aria-label={`Filtrer par ${c.entete.toLowerCase()}`}
                          className={cn(
                            'w-full rounded-control border border-line bg-surface-2 px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent focus:bg-surface-1 cursor-pointer',
                            !filtres[c.cle] && 'text-ink-3',
                          )}
                        >
                          <option value="">Tous</option>
                          {(choix[c.cle] ?? []).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : c.filtre === 'texte' ? (
                        <input
                          value={filtres[c.cle] ?? ''}
                          onChange={(e) =>
                            setFiltres((f) => ({ ...f, [c.cle]: e.target.value }))
                          }
                          placeholder="Filtrer…"
                          aria-label={`Filtrer par ${c.entete.toLowerCase()}`}
                          className="w-full min-w-[90px] rounded-control border border-line bg-surface-2 px-2 py-1 text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:bg-surface-1"
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-line">
              {visibles.map((l) => (
                <tr
                  key={cle(l)}
                  className={cn(
                    tonLigne?.(l),
                    onLigne && 'cursor-pointer hover:bg-surface-2',
                  )}
                  // Une ligne cliquable doit aussi être atteignable au clavier :
                  // c'est un poste fixe, et la douchette occupe déjà la souris.
                  tabIndex={onLigne ? 0 : undefined}
                  role={onLigne ? 'button' : undefined}
                  onClick={onLigne ? () => onLigne(l) : undefined}
                  onKeyDown={
                    onLigne
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onLigne(l);
                          }
                        }
                      : undefined
                  }
                >
                  {colonnes.map((c) => (
                    <td
                      key={c.cle}
                      className={cn(
                        'px-5 py-2.5',
                        c.nombre && 'text-right tabular',
                      )}
                    >
                      {c.rendu ? c.rendu(l) : String(l[c.cle] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
