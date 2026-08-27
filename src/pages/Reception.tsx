import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link2, PackagePlus, Printer, Sparkles, Trash2 } from 'lucide-react';
import {
  chercherVetement,
  enregistrerReception,
  listerExpeditionsOuvertes,
  listerTypes,
} from '../lib/api';
import type {
  ExpeditionOuverte,
  LigneReception,
  ResultatReception,
  TypeVetement,
} from '../types';
import {
  Alerte,
  Button,
  Card,
  Chargement,
  CardHeader,
  EmptyState,
  Field,
  IconButton,
  Modal,
  cn,
  inputClass,
} from '../components/ui';

export function Reception({ enLigne }: { enLigne: boolean }) {
  const [types, setTypes] = useState<TypeVetement[]>([]);
  const [expeditions, setExpeditions] = useState<ExpeditionOuverte[]>([]);
  const [expeditionId, setExpeditionId] = useState<number | null>(null);
  const [referencePrestataire, setReferencePrestataire] = useState('');

  const [lignes, setLignes] = useState<LigneReception[]>([]);
  const [code, setCode] = useState('');
  const [inconnu, setInconnu] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bulletin, setBulletin] = useState<ResultatReception | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [chargement, setChargement] = useState(true);
  const champScan = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([listerTypes(), listerExpeditionsOuvertes()])
      .then(([t, e]) => {
        setTypes(t.filter((x) => x.actif));
        setExpeditions(e);
      })
      .catch((err: Error) => setErreur(err.message))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => {
    if (enLigne && !bulletin && !inconnu) champScan.current?.focus();
  }, [enLigne, bulletin, inconnu]);

  const scanner = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const c = code.trim();
      if (!c || occupe) return;
      setErreur(null);

      if (lignes.some((l) => l.code_barre.toLowerCase() === c.toLowerCase())) {
        setErreur(`${c} est déjà dans ce bac.`);
        setCode('');
        return;
      }

      setOccupe(true);
      try {
        const v = await chercherVetement(c);
        setCode('');
        if (v) {
          const t = types.find((x) => x.id === v.type_id);
          setLignes((l) => [
            ...l,
            {
              code_barre: v.code_barre,
              connu: true,
              taille: v.taille,
              rebut: v.rebut,
              type_libelle: t?.libelle,
            },
          ]);
        } else {
          // Le prestataire fournit les vêtements : un code inconnu est le cas normal,
          // pas une erreur. On demande de quoi créer la référence.
          setInconnu(c);
        }
      } catch (err) {
        setErreur((err as Error).message);
      } finally {
        setOccupe(false);
        champScan.current?.focus();
      }
    },
    [code, lignes, types, occupe],
  );

  const enregistrer = useCallback(async () => {
    if (lignes.length === 0 || occupe) return;
    setOccupe(true);
    setErreur(null);
    try {
      setBulletin(
        await enregistrerReception(lignes, expeditionId, referencePrestataire.trim() || null),
      );
      setLignes([]);
      setExpeditions(await listerExpeditionsOuvertes());
    } catch (err) {
      // La base a tout annulé : le bac reste à l'écran, rien n'est perdu.
      setErreur((err as Error).message);
    } finally {
      setOccupe(false);
    }
  }, [lignes, expeditionId, referencePrestataire, occupe]);

  if (bulletin) {
    return (
      <BulletinReception
        bulletin={bulletin}
        onSuivant={() => {
          setBulletin(null);
          setExpeditionId(null);
          setReferencePrestataire('');
        }}
      />
    );
  }

  const nouveaux = lignes.filter((l) => !l.connu).length;

  // Sans les types, la fenêtre de création d'une référence inconnue serait
  // vide : mieux vaut dire qu'on charge que d'afficher un formulaire inutilisable.
  if (chargement && types.length === 0)
    return <Chargement quoi="Préparation de l’entrée marchandise" />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={PackagePlus}
          title="Entrée marchandise"
          action={
            <span className="text-sm text-ink-3 tabular">
              {lignes.length} pièce{lignes.length > 1 ? 's' : ''}
            </span>
          }
        />

        <Field
          label="Bulletin d'expédition correspondant"
          hint="Sans ce lien, le contrôle de facturation ne peut pas comparer ce qui est parti à ce qui revient."
        >
          <select
            value={expeditionId ?? ''}
            onChange={(e) =>
              setExpeditionId(e.target.value ? Number(e.target.value) : null)
            }
            className={inputClass}
          >
            <option value="">Aucun — livraison sans envoi préalable</option>
            {expeditions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.numero} · {e.nb_envoyes} pièces · envoyé il y a {e.jours} j
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Bon de livraison du prestataire"
          hint="Leur numéro de document. C'est la référence commune qui permet de rapprocher notre bulletin du leur en cas de litige."
        >
          <input
            value={referencePrestataire}
            onChange={(e) => setReferencePrestataire(e.target.value)}
            className={inputClass}
            placeholder="facultatif"
          />
        </Field>

        <form onSubmit={scanner}>
          <div className="flex gap-2 items-stretch">
            <input
              ref={champScan}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!enLigne || occupe}
              autoComplete="off"
              spellCheck={false}
              aria-label="Code-barre reçu"
              className={cn(inputClass, 'champ-scan py-4 disabled:opacity-50')}
              placeholder="—"
            />
            <Button
              type="submit"
              variant="ghost"
              disabled={!enLigne || occupe || !code.trim()}
              className="shrink-0"
            >
              Ajouter
            </Button>
          </div>
          <p className="text-xs text-ink-3 mt-1.5">
            Scannez chaque pièce du bac. Un code inconnu ouvre la création de la
            référence.
          </p>
        </form>
      </Card>

      {erreur && <Alerte>{erreur}</Alerte>}

      {lignes.length === 0 ? (
        <Card>
          <EmptyState icon={PackagePlus} titre="Bac vide">
            Scannez la première pièce pour commencer.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {lignes.map((l, i) => (
                <li
                  key={l.code_barre}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {l.type_libelle ?? '—'}{' '}
                      <span className="text-ink-3">· taille {l.taille}</span>
                      {l.rebut && (
                        <span className="ml-2 align-middle rounded-full bg-warning-soft text-warning-text text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                          Rebut
                        </span>
                      )}
                      {!l.connu && (
                        <span className="ml-2 align-middle rounded-full bg-good-soft text-good-text text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                          <Sparkles size={9} className="inline -mt-0.5 mr-0.5" />
                          nouvelle
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-3 tabular">{l.code_barre}</p>
                  </div>
                  <IconButton
                    icon={Trash2}
                    label={`Retirer ${l.code_barre} du bac`}
                    tone="danger"
                    onClick={() =>
                      setLignes((ls) => ls.filter((_, j) => j !== i))
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-3">
              {nouveaux > 0
                ? `${nouveaux} référence${nouveaux > 1 ? 's' : ''} à créer`
                : 'Aucune nouvelle référence'}
            </p>
            <Button onClick={enregistrer} disabled={!enLigne || occupe}>
              <PackagePlus size={16} strokeWidth={1.75} />
              Enregistrer la réception
            </Button>
          </div>
        </>
      )}

      <CreationReference
        codeBarre={inconnu}
        types={types}
        onAnnuler={() => setInconnu(null)}
        onCreer={(ligne) => {
          setLignes((l) => [...l, ligne]);
          setInconnu(null);
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Création d'une référence à la volée.

   Rien n'est écrit en base ici : la ligne rejoint le bac à l'écran, et c'est
   `enregistrer_reception` qui crée tout en une transaction. Un bac interrompu
   ne laisse donc aucune référence orpheline.
   --------------------------------------------------------------------------- */

function CreationReference({
  codeBarre,
  types,
  onAnnuler,
  onCreer,
}: {
  codeBarre: string | null;
  types: TypeVetement[];
  onAnnuler: () => void;
  onCreer: (l: LigneReception) => void;
}) {
  const [typeId, setTypeId] = useState<number | null>(null);
  const [taille, setTaille] = useState<number | null>(null);
  const [rebut, setRebut] = useState(false);

  useEffect(() => {
    setTypeId(null);
    setTaille(null);
    setRebut(false);
  }, [codeBarre]);

  if (!codeBarre) return null;

  return (
    <Modal open onClose={onAnnuler} title="Code-barre inconnu">
      <p className="text-sm text-ink-3 mb-1">
        Cette pièce n'existe pas encore dans le parc.
      </p>
      <p className="tabular font-medium mb-5">{codeBarre}</p>

      <Field label="Type">
        <select
          value={typeId ?? ''}
          onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : null)}
          className={inputClass}
          autoFocus
        >
          <option value="">Choisir…</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.libelle}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Taille">
        <div className="grid grid-cols-8 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTaille(t)}
              className={cn(
                'rounded-control border py-2.5 text-sm font-medium transition-colors cursor-pointer',
                taille === t
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface-2 hover:bg-line',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
        <input
          type="checkbox"
          checked={rebut}
          onChange={(e) => setRebut(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm">
          Rebut
          <span className="block text-xs text-ink-3">
            le prestataire l'a jugé hors d'usage mais le rend propre. La pièce reste dans
            le parc et continue son cycle, réservée aux stagiaires.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Button
          disabled={!typeId || !taille}
          onClick={() =>
            onCreer({
              code_barre: codeBarre,
              connu: false,
              type_id: typeId!,
              taille: taille!,
              rebut,
              type_libelle: types.find((t) => t.id === typeId)?.libelle,
            })
          }
        >
          Ajouter au bac
        </Button>
        <Button variant="ghost" onClick={onAnnuler}>
          Annuler
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------- */

function BulletinReception({
  bulletin,
  onSuivant,
}: {
  bulletin: ResultatReception;
  onSuivant: () => void;
}) {
  const manquantsTotal = bulletin.ecarts.reduce((n, e) => n + e.manquants, 0);

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer size={16} strokeWidth={1.75} />
          Imprimer
        </Button>
        <Button onClick={onSuivant}>Nouvelle réception</Button>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <div className="border-b border-line pb-4 mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
            Bulletin de réception
          </p>
          <p className="text-3xl font-semibold tracking-[-0.02em] tabular mt-1">
            {bulletin.numero}
          </p>
          <div className="text-sm text-ink-2 mt-2 space-y-0.5">
            <p>{new Date(bulletin.date).toLocaleDateString('fr-CH')}</p>
            {bulletin.expedition && (
              <p>
                <Link2 size={13} className="inline -mt-0.5 mr-1" />
                En retour de notre envoi{' '}
                <span className="tabular font-medium">{bulletin.expedition}</span>
              </p>
            )}
            {bulletin.reference_prestataire && (
              <p>
                Bon de livraison du prestataire&nbsp;:{' '}
                <span className="tabular font-medium">
                  {bulletin.reference_prestataire}
                </span>
              </p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-4 text-sm mb-6">
          <div>
            <dt className="text-ink-3">Pièces reçues</dt>
            <dd className="text-xl font-semibold tabular">{bulletin.nb_recus}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Revenues de lavage</dt>
            <dd className="text-xl font-semibold tabular">{bulletin.nb_laves}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Nouvelles références</dt>
            <dd className="text-xl font-semibold tabular">{bulletin.nb_crees}</dd>
          </div>
        </dl>

        {/* L'écart n'existe que si la réception est rattachée à un envoi.
            C'est ce tableau qui fait du bulletin un argument face à une
            facture, et pas seulement un récapitulatif de ce qui est arrivé. */}
        {bulletin.ecarts.length > 0 && (
          <section className="mb-7">
            <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3 mb-2">
              Écart avec notre envoi {bulletin.expedition}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left text-ink-3">
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Taille</th>
                  <th className="pb-2 font-medium text-right">Envoyés</th>
                  <th className="pb-2 font-medium text-right">Reçus</th>
                  <th className="pb-2 font-medium text-right">Manquants</th>
                </tr>
              </thead>
              <tbody>
                {bulletin.ecarts.map((e) => (
                  <tr
                    key={e.type_libelle + e.taille}
                    className="border-b border-line/60"
                  >
                    <td className="py-2">{e.type_libelle}</td>
                    <td className="py-2 tabular">{e.taille}</td>
                    <td className="py-2 tabular text-right">{e.envoyes}</td>
                    <td className="py-2 tabular text-right">{e.recus}</td>
                    <td
                      className={cn(
                        'py-2 tabular text-right font-medium',
                        e.manquants > 0 && 'text-critical-text',
                      )}
                    >
                      {e.manquants > 0 ? e.manquants : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {manquantsTotal > 0 && (
              <p className="text-sm mt-3 text-critical-text font-medium">
                {manquantsTotal} pièce{manquantsTotal > 1 ? 's' : ''} envoyée
                {manquantsTotal > 1 ? 's' : ''} chez le prestataire {manquantsTotal > 1 ? 'ne sont' : "n'est"}{' '}
                pas revenue{manquantsTotal > 1 ? 's' : ''} dans ce bac.
              </p>
            )}
          </section>
        )}

        {/* Détail pièce par pièce, code-barre en tête : c'est la colonne qu'on
            pointe en dépilant le bac, et celle qui permet de retrouver une
            pièce contestée dans l'historique. */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3 mb-2">
            Détail des {bulletin.lignes.length} pièces
          </h3>
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
                  Total
                </td>
                <td className="pt-2 tabular text-right font-semibold">
                  {bulletin.nb_recus}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div className="mt-10 pt-6 border-t border-line grid grid-cols-2 gap-8 text-xs text-ink-3">
          <div>
            Contrôlé par
            <div className="mt-8 border-b border-line-strong" />
          </div>
          <div>
            Date et signature
            <div className="mt-8 border-b border-line-strong" />
          </div>
        </div>
      </Card>
    </div>
  );
}
