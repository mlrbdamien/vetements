/**
 * Exports CSV et XLSX.
 *
 * Deux détails décident si le fichier s'ouvre correctement sur les postes :
 *
 *  - Le séparateur du CSV est le POINT-VIRGULE. Excel en configuration
 *    française ou suisse lit la virgule comme un séparateur décimal ; avec des
 *    virgules, tout le fichier atterrit dans une seule colonne.
 *  - Le CSV commence par un BOM UTF-8. Sans lui, Excel suppose Windows-1252 et
 *    « Blouse bleue · taille 3 » devient « Blouse bleue Â· taille 3 ».
 *
 * XLSX n'a aucun de ces problèmes — c'est le format à privilégier — mais le
 * CSV reste le seul qui se relise sans Excel, ce qui compte pour un fichier
 * qui tient lieu de sauvegarde.
 *
 * SheetJS pèse ~400 ko et ne sert qu'au moment d'un export Excel : il est
 * chargé à la demande plutôt qu'au démarrage, pour ne pas faire payer ce poids
 * à chaque ouverture de l'application.
 */

const chargerXlsx = () => import('xlsx');

export type Colonne<T> = {
  cle: keyof T & string;
  entete: string;
  /** Largeur indicative de la colonne XLSX, en caractères. */
  largeur?: number;
};

/** Horodatage suisse, lisible et triable à l'œil : 14.08.2026 09:35. */
export function formatHorodatage(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDate(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Rend une valeur pour l'export. Les booléens deviennent « oui »/« non » et
 * les dates ISO passent au format suisse : le fichier est lu par des humains,
 * pas réimporté par un programme.
 */
function cellule(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return formatHorodatage(v);
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return formatDate(v);
  }
  return String(v);
}

function nomFichier(base: string, extension: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const horo = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `${base}-${horo}.${extension}`;
}

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Libéré au tour de boucle suivant : révoquer immédiatement annulerait le
  // téléchargement dans certains navigateurs.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exporterCsv<T>(base: string, colonnes: Colonne<T>[], lignes: T[]) {
  const echapper = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };

  const contenu = [
    colonnes.map((c) => echapper(c.entete)).join(';'),
    ...lignes.map((l) => colonnes.map((c) => echapper(cellule(l[c.cle]))).join(';')),
  ].join('\r\n');

  // ﻿ : le BOM qui dit à Excel « ceci est de l'UTF-8 ».
  telecharger(
    new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8' }),
    nomFichier(base, 'csv'),
  );
}

export async function exporterXlsx<T>(
  base: string,
  colonnes: Colonne<T>[],
  lignes: T[],
  onglet = 'Données',
) {
  await exporterClasseur(base, [
    { nom: onglet, colonnes: colonnes as Colonne<never>[], lignes },
  ]);
}

/** Un classeur XLSX à plusieurs onglets — c'est aussi le cas à une feuille. */
export async function exporterClasseur(
  base: string,
  feuilles: { nom: string; colonnes: Colonne<never>[]; lignes: unknown[] }[],
) {
  const XLSX = await chargerXlsx();
  const classeur = XLSX.utils.book_new();

  for (const f of feuilles) {
    const donnees = [
      f.colonnes.map((c) => c.entete),
      ...f.lignes.map((l) =>
        f.colonnes.map((c) => cellule((l as Record<string, unknown>)[c.cle])),
      ),
    ];
    const feuille = XLSX.utils.aoa_to_sheet(donnees);
    feuille['!cols'] = f.colonnes.map((c) => ({ wch: c.largeur ?? 16 }));
    // Fige la ligne d'en-tête : un journal fait des milliers de lignes.
    feuille['!freeze'] = { xSplit: 0, ySplit: 1 };
    // Excel refuse un nom d'onglet de plus de 31 caractères.
    XLSX.utils.book_append_sheet(classeur, feuille, f.nom.slice(0, 31));
  }

  XLSX.writeFile(classeur, nomFichier(base, 'xlsx'), { compression: true });
}
