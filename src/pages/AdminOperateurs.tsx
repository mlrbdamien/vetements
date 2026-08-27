import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  KeyRound,
  LogOut,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
} from 'lucide-react';
import {
  creerOperateur,
  definirPinOperateur,
  desactiverOperateur,
  listerOperateurs,
  reactiverOperateur,
  vetementsDetenus,
} from '../lib/api';
import { nomComplet, type Operateur } from '../types';
import { useSession } from '../lib/session';
import {
  Alerte,
  Button,
  Card,
  CardHeader,
  Chargement,
  Field,
  IconButton,
  Modal,
  cn,
  inputClass,
} from '../components/ui';

export function AdminOperateurs() {
  const { quitterAdmin } = useSession();
  return <Liste onQuitter={quitterAdmin} />;
}

/* ------------------------------------------------------------------------- */

type Dialogue =
  | { genre: 'creation' }
  | { genre: 'pin'; operateur: Operateur }
  | null;

function Liste({ onQuitter }: { onQuitter: () => Promise<void> }) {
  const [operateurs, setOperateurs] = useState<Operateur[]>([]);
  const [chargement, setChargement] = useState(true);
  // UX-6 : la désactivation partait au clic, dans une liste où l'icône
  // voisine ouvre une fenêtre. On nomme la personne avant d'agir.
  const [aDesactiver, setADesactiver] = useState<Operateur | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // Vêtements encore détenus, quand une désactivation a été refusée.
  const [bloquants, setBloquants] = useState<
    { code_barre: string; type_libelle: string; taille: number }[]
  >([]);

  const recharger = useCallback(async () => {
    setChargement(true);
    try {
      setOperateurs(await listerOperateurs());
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const basculer = useCallback(
    async (o: Operateur) => {
      setErreur(null);
      setSucces(null);
      setBloquants([]);
      try {
        if (o.actif) {
          await desactiverOperateur(o.id);
          setSucces(`${nomComplet(o)} est désactivé.`);
        } else {
          await reactiverOperateur(o.id);
          setSucces(`${nomComplet(o)} est de nouveau actif.`);
        }
        await recharger();
      } catch (err) {
        setErreur((err as Error).message);
        // La base a refusé parce qu'il détient encore des vêtements : on les
        // liste, sinon l'admin n'a aucun moyen de savoir lesquels réclamer.
        if (o.actif) {
          try {
            setBloquants(await vetementsDetenus(o.id));
          } catch {
            /* la liste est un confort, son échec ne doit rien casser */
          }
        }
      }
    },
    [recharger],
  );

  if (chargement && operateurs.length === 0)
    return <Chargement quoi="Lecture des opérateurs" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {operateurs.filter((o) => o.actif).length} opérateur(s) actif(s)
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setDialogue({ genre: 'creation' })}>
            <UserPlus size={15} strokeWidth={1.75} />
            Nouvel opérateur
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void onQuitter()}>
            <LogOut size={15} strokeWidth={1.75} />
            Quitter l'admin
          </Button>
        </div>
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}
      {succes && <Alerte ton="good">{succes}</Alerte>}

      {bloquants.length > 0 && (
        <Card>
          <CardHeader title="Vêtements encore détenus" />
          <ul className="text-sm space-y-1.5">
            {bloquants.map((v) => (
              <li key={v.code_barre} className="flex justify-between gap-4">
                <span>
                  {v.type_libelle} · taille {v.taille}
                </span>
                <span className="tabular text-ink-3">{v.code_barre}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-3 mt-4">
            Enregistrez leur retour depuis l'écran Scan, puis désactivez le
            compte.
          </p>
        </Card>
      )}

      <Card padded={false}>
        <ul className="divide-y divide-line">
          {operateurs.map((o) => (
            <li
              key={o.id}
              className={cn(
                'flex items-center justify-between gap-4 px-5 py-3.5',
                !o.actif && 'opacity-55',
              )}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{nomComplet(o)}</p>
                <p className="text-xs text-ink-3">
                  {o.actif ? 'Actif' : 'Désactivé'}
                  {!o.pin_defini && ' · code PIN à initialiser'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton
                  icon={KeyRound}
                  label={`Définir le code de ${nomComplet(o)}`}
                  onClick={() => setDialogue({ genre: 'pin', operateur: o })}
                />
                <IconButton
                  icon={o.actif ? UserRoundX : UserRoundCheck}
                  label={
                    o.actif
                      ? `Désactiver ${nomComplet(o)}`
                      : `Réactiver ${nomComplet(o)}`
                  }
                  tone={o.actif ? 'danger' : 'muted'}
                  onClick={() =>
                    o.actif ? setADesactiver(o) : void basculer(o)
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-ink-3">
        Un opérateur n'est jamais supprimé : son nom reste attaché aux
        mouvements qu'il a enregistrés. La désactivation le retire seulement de
        la liste de l'écran Scan.
      </p>

      <Modal
        open={aDesactiver !== null}
        onClose={() => setADesactiver(null)}
        title="Désactiver cet opérateur ?"
      >
        <p className="text-sm text-ink-2 mb-5">
          <span className="font-medium text-ink">
            {aDesactiver ? nomComplet(aDesactiver) : ''}
          </span>{' '}
          disparaîtra de la liste de l’écran Scan. Son nom reste attaché aux
          mouvements qu’il a déjà enregistrés, et vous pourrez le réactiver à
          tout moment.
        </p>
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() => {
              const o = aDesactiver;
              setADesactiver(null);
              if (o) void basculer(o);
            }}
          >
            Désactiver
          </Button>
          <Button variant="ghost" onClick={() => setADesactiver(null)}>
            Annuler
          </Button>
        </div>
      </Modal>

      <DialogueOperateur
        dialogue={dialogue}
        onFermer={() => setDialogue(null)}
        onFait={(message) => {
          setDialogue(null);
          setErreur(null);
          setBloquants([]);
          setSucces(message);
          void recharger();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function DialogueOperateur({
  dialogue,
  onFermer,
  onFait,
}: {
  dialogue: Dialogue;
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    setPrenom('');
    setNom('');
    setPin('');
    setConfirmation('');
    setErreur(null);
  }, [dialogue]);

  if (!dialogue) return null;
  const creation = dialogue.genre === 'creation';

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!dialogue) return;
    // Double saisie : un PIN mal tapé enfermerait l'opérateur dehors sans
    // qu'il puisse le constater avant son prochain poste.
    if (pin !== confirmation) {
      setErreur('Les deux codes saisis ne correspondent pas.');
      return;
    }
    setOccupe(true);
    setErreur(null);
    try {
      if (dialogue.genre === 'creation') {
        await creerOperateur(prenom, nom, pin);
        onFait(`${prenom} ${nom}`.trim() + ' a été créé.');
      } else {
        await definirPinOperateur(dialogue.operateur.id, pin);
        onFait(`Le code de ${nomComplet(dialogue.operateur)} a été redéfini.`);
      }
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setOccupe(false);
    }
  }

  const pinValide = /^\d{4}$/.test(pin);

  return (
    <Modal
      open
      onClose={onFermer}
      title={
        creation
          ? 'Nouvel opérateur'
          : `Code de ${nomComplet(dialogue.operateur)}`
      }
    >
      <form onSubmit={valider}>
        {creation && (
          <>
            <Field label="Prénom">
              <input
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </Field>
            <Field label="Nom">
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className={inputClass}
              />
            </Field>
          </>
        )}

        <Field label="Code PIN" hint="Exactement 4 chiffres.">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className={cn(inputClass, 'text-center tracking-[0.4em]')}
            autoFocus={!creation}
          />
        </Field>
        <Field label="Confirmer le code">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value.replace(/\D/g, ''))}
            className={cn(inputClass, 'text-center tracking-[0.4em]')}
          />
        </Field>

        {erreur && (
          <div className="mb-4">
            <Alerte>{erreur}</Alerte>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={
              occupe ||
              !pinValide ||
              confirmation.length !== 4 ||
              (creation && !prenom.trim())
            }
          >
            {creation ? 'Créer' : 'Enregistrer'}
          </Button>
          <Button variant="ghost" onClick={onFermer}>
            Annuler
          </Button>
        </div>
      </form>
    </Modal>
  );
}
