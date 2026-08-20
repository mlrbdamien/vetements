import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  CheckCheck,
  PackageCheck,
  Printer,
  ScanLine,
  Square,
  TriangleAlert,
  Truck,
} from 'lucide-react';
import { enregistrerExpedition, listerLingeSale } from '../lib/api';
import type { LingeSale, ResultatExpedition } from '../types';
import {
  Alerte,
  Button,
  Card,
  CardHeader,
  EmptyState,
  cn,
  inputClass,
} from '../components/ui';

/**
 * Au-delà de ce délai, un vêtement qui traîne dans la corbeille sans jamais
 * être scanné est probablement égaré : il est marqué sale dans l'app mais
 * absent du bac.
 *
 * Seuil provisoire — la cadence réelle des envois chez le prestataire n'est pas connue.
 * À confirmer avec l'administratrice une fois quelques bulletins passés.
 */
const JOURS_SUSPECT = 14;

export function Expedition({ enLigne }: { enLigne: boolean }) {
  const [linge, setLinge] = useState<LingeSale[]>([]);
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [bulletin, setBulletin] = useState<ResultatExpedition | null>(null);
  const [occupe, setOccupe] = useState(false);
  const champScan = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    try {
      setLinge(await listerLingeSale());
      setCoches(new Set());
    } catch (err) {
      setErreur((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    if (enLigne && !bulletin) champScan.current?.focus();
  }, [enLigne, bulletin]);

  /**
   * Scanner ne déclenche AUCUN appel réseau : ça coche la ligne, rien de plus.
   * L'expédition entière part en une fois, à la confirmation — sinon un bac
   * interrompu à mi-parcours laisserait un bulletin qui ne correspond à rien.
   */
  const scanner = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const cherche = code.trim().toLowerCase();
      if (!cherche) return;

      const trouve = linge.find((l) => l.code_barre.toLowerCase() === cherche);
      setCode('');
      champScan.current?.focus();

      if (!trouve) {
        setErreur(
          `Le code ${code.trim()} n'est pas dans la corbeille. Vérifiez qu'il a bien été rendu sale, ou saisissez-le à l'écran Scan.`,
        );
        return;
      }
      setErreur(null);
      setCoches((s) => new Set(s).add(trouve.vetement_id));
    },
    [code, linge],
  );

  const basculer = useCallback((id: number) => {
    setCoches((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const confirmer = useCallback(async () => {
    if (coches.size === 0 || occupe) return;
    setOccupe(true);
    setErreur(null);
    try {
      setBulletin(await enregistrerExpedition([...coches]));
      await charger();
    } catch (err) {
      setErreur((err as Error).message);
      // La base a tout annulé : on repart d'une liste à jour.
      await charger();
    } finally {
      setOccupe(false);
    }
  }, [coches, occupe, charger]);

  const restants = useMemo(
    () => linge.filter((l) => !coches.has(l.vetement_id)),
    [linge, coches],
  );

  if (bulletin) {
    return (
      <BulletinEmis
        bulletin={bulletin}
        onSuivant={() => {
          setBulletin(null);
          void charger();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={Truck}
          title="Expédition vers le prestataire"
          action={
            <span className="text-sm text-ink-3 tabular">
              {coches.size} / {linge.length}
            </span>
          }
        />
        <form onSubmit={scanner}>
          <div className="flex gap-2 items-stretch">
            <input
              ref={champScan}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!enLigne || occupe || linge.length === 0}
              autoComplete="off"
              spellCheck={false}
              aria-label="Code-barre à confirmer"
              className={cn(inputClass, 'champ-scan py-4 disabled:opacity-50')}
              placeholder="—"
            />
            {/* La douchette envoie un Entrée, mais une saisie manuelle — code
                illisible — n'a pas d'autre issue sans ce bouton. */}
            <Button
              type="submit"
              variant="ghost"
              disabled={!enLigne || occupe || !code.trim()}
              className="shrink-0"
            >
              Cocher
            </Button>
          </div>
          <p className="text-xs text-ink-3 mt-1.5">
            Scannez chaque pièce en la posant dans le bac, ou cochez-la à la
            main. Ce qui n'est ni scanné ni coché reste dans la corbeille.
          </p>
        </form>
      </Card>

      {erreur && <Alerte>{erreur}</Alerte>}

      {linge.length === 0 ? (
        <Card>
          <EmptyState icon={PackageCheck} titre="La corbeille est vide">
            Rien n'attend de partir chez le prestataire.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCoches(
                  coches.size === linge.length
                    ? new Set()
                    : new Set(linge.map((l) => l.vetement_id)),
                )
              }
            >
              {coches.size === linge.length ? (
                <>
                  <Square size={15} strokeWidth={1.75} />
                  Tout décocher
                </>
              ) : (
                <>
                  <CheckCheck size={15} strokeWidth={1.75} />
                  Tout cocher
                </>
              )}
            </Button>
            <Button
              size="md"
              onClick={confirmer}
              disabled={!enLigne || occupe || coches.size === 0}
            >
              <ScanLine size={16} strokeWidth={1.75} />
              Confirmer l'envoi de {coches.size} pièce
              {coches.size > 1 ? 's' : ''}
            </Button>
          </div>

          <Card padded={false}>
            <ul className="divide-y divide-line">
              {linge.map((l) => {
                const coche = coches.has(l.vetement_id);
                const suspect = (l.jours_depuis_retour ?? 0) >= JOURS_SUSPECT;
                return (
                  <li key={l.vetement_id}>
                    <button
                      type="button"
                      onClick={() => basculer(l.vetement_id)}
                      aria-pressed={coche}
                      // Le contenu de la ligne est purement visuel (colonnes,
                      // pastille, badge) : sans ce libellé, la ligne s'annonce
                      // « bouton » et rien d'autre.
                      aria-label={`${l.type_libelle} taille ${l.taille}, ${l.code_barre}`}
                      className={cn(
                        'w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors cursor-pointer',
                        coche ? 'bg-accent-soft' : 'hover:bg-surface-2',
                      )}
                    >
                      <span
                        className={cn(
                          'grid place-items-center h-5 w-5 rounded border-2 shrink-0 transition-colors',
                          coche
                            ? 'bg-accent border-accent text-white'
                            : 'border-line-strong',
                        )}
                        aria-hidden
                      >
                        {coche && <CheckCheck size={12} strokeWidth={3} />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">
                          {l.type_libelle}{' '}
                          <span className="text-ink-3">· taille {l.taille}</span>
                          {l.rebut && (
                            <span className="ml-2 align-middle rounded-full bg-warning-soft text-warning-text text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                              Rebut
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-ink-3 tabular">
                          {l.code_barre}
                        </span>
                      </span>

                      <span
                        className={cn(
                          'text-xs shrink-0 text-right',
                          suspect ? 'text-critical-text font-medium' : 'text-ink-3',
                        )}
                      >
                        {suspect && (
                          <TriangleAlert
                            size={13}
                            strokeWidth={2}
                            className="inline mr-1 -mt-0.5"
                          />
                        )}
                        {l.jours_depuis_retour === 0
                          ? "aujourd'hui"
                          : `${l.jours_depuis_retour} j`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {restants.length > 0 && coches.size > 0 && (
            <Alerte ton="warning">
              {restants.length} pièce{restants.length > 1 ? 's' : ''} ne partira
              {restants.length > 1 ? 'ont' : ''} pas et restera
              {restants.length > 1 ? 'ont' : ''} dans la corbeille pour le
              prochain bulletin.
            </Alerte>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function BulletinEmis({
  bulletin,
  onSuivant,
}: {
  bulletin: ResultatExpedition;
  onSuivant: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer size={16} strokeWidth={1.75} />
          Imprimer
        </Button>
        <Button onClick={onSuivant}>Retour à la corbeille</Button>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <div className="border-b border-line pb-4 mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
            Bulletin d'expédition
          </p>
          <p className="text-3xl font-semibold tracking-[-0.02em] tabular mt-1">
            {bulletin.numero}
          </p>
          <p className="text-sm text-ink-2 mt-2">
            {new Date(bulletin.date).toLocaleDateString('fr-CH')} ·{' '}
            {bulletin.nb_envoyes} pièce{bulletin.nb_envoyes > 1 ? 's' : ''} confiée
            {bulletin.nb_envoyes > 1 ? 's' : ''} au lavage
          </p>
        </div>

        {/* Code-barre en tête : c'est la colonne qu'on pointe en remplissant
            le bac, et la référence à citer si une pièce ne revient pas. */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-ink-3">
              <th className="pb-2 font-medium">Code-barre</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Taille</th>
              <th className="pb-2 font-medium text-right">Lavages</th>
            </tr>
          </thead>
          <tbody>
            {bulletin.lignes.map((l) => (
              <tr key={l.code_barre} className="border-b border-line/60">
                <td className="py-2 tabular font-medium text-[15px]">
                  {l.code_barre}
                </td>
                <td className="py-2">
                  {l.type_libelle}
                  {l.rebut && <span className="text-ink-3"> (rebut)</span>}
                </td>
                <td className="py-2 tabular">{l.taille}</td>
                <td className="py-2 tabular text-right">{l.nb_lavages}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-2 font-semibold" colSpan={3}>
                Total confié
              </td>
              <td className="pt-2 tabular text-right font-semibold">
                {bulletin.nb_envoyes}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-10 pt-6 border-t border-line grid grid-cols-2 gap-8 text-xs text-ink-3">
          <div>
            Remis par
            <div className="mt-8 border-b border-line-strong" />
          </div>
          <div>
            Date et signature du prestataire
            <div className="mt-8 border-b border-line-strong" />
          </div>
        </div>
      </Card>

      {/* Hors du bulletin, et hors de l'impression : ce qui n'est pas parti
          regarde l’établissement, pas le prestataire. C'est le signal des égarés. */}
      {bulletin.restants.length > 0 && (
        <Card className="print:hidden">
          <CardHeader
            icon={TriangleAlert}
            title={`${bulletin.restants.length} pièce${
              bulletin.restants.length > 1 ? 's' : ''
            } restée${bulletin.restants.length > 1 ? 's' : ''} en corbeille`}
          />
          <ul className="text-sm divide-y divide-line">
            {bulletin.restants.map((r) => (
              <li
                key={r.code_barre}
                className="flex items-center justify-between gap-4 py-2"
              >
                <span>
                  {r.type_libelle}{' '}
                  <span className="text-ink-3">· taille {r.taille}</span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="tabular text-ink-3">{r.code_barre}</span>
                  <span
                    className={cn(
                      'tabular text-xs w-14 text-right',
                      (r.jours ?? 0) >= JOURS_SUSPECT
                        ? 'text-critical-text font-medium'
                        : 'text-ink-3',
                    )}
                  >
                    {r.jours} j
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-3 mt-4">
            Ces pièces sont marquées sales dans l'app mais n'étaient pas dans le
            bac. Elles reviendront au prochain bulletin ; si le compteur de
            jours continue de monter, elles sont probablement égarées.
          </p>
        </Card>
      )}
    </div>
  );
}
