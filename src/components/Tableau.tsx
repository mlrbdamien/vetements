import type { ReactNode } from 'react';
import { Download, Sheet } from 'lucide-react';
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
};

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
            disabled={lignes.length === 0}
            onClick={() => exporterCsv(nomExport, colonnes, lignes)}
          >
            <Download size={14} strokeWidth={1.75} />
            CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={lignes.length === 0}
            onClick={() => void exporterXlsx(nomExport, colonnes, lignes, titre)}
          >
            <Sheet size={14} strokeWidth={1.75} />
            Excel
          </Button>
        </div>
      </div>

      {entete && <div className="px-5 py-4 border-b border-line">{entete}</div>}

      {lignes.length === 0 ? (
        <EmptyState titre={vide} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 border-b border-line">
                {colonnes.map((c) => (
                  <th
                    key={c.cle}
                    className={cn(
                      'font-medium px-5 py-2.5 whitespace-nowrap',
                      c.nombre && 'text-right',
                    )}
                  >
                    {c.entete}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lignes.map((l) => (
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
