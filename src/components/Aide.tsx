import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Colonne d'aide contextuelle, à gauche du contenu.
 *
 * On y met ce qui n'est pas devinable en regardant l'écran : les règles qui
 * vivent en base, les effets de bord, et ce que signifie *ne rien faire*.
 * Pas de mode d'emploi des boutons — ils se lisent tout seuls.
 */

type Section = { titre: string; texte: ReactNode };

const CYCLE = [
  ['Réception', 'Elis livre — la pièce entre en stock'],
  ['Sortie', 'un opérateur la prend, elle lui est rattachée'],
  ['Retour sale', 'elle rejoint la corbeille'],
  ['Envoi Elis', 'elle part au lavage'],
] as const;

function Cycle() {
  return (
    <ol className="space-y-2.5">
      {CYCLE.map(([nom, quoi], i) => (
        <li key={nom} className="flex gap-2.5">
          <span className="shrink-0 grid place-items-center h-5 w-5 rounded-full bg-surface-2 text-[11px] font-semibold text-ink-3 tabular">
            {i + 1}
          </span>
          <span className="text-xs leading-relaxed">
            <span className="font-medium text-ink-2">{nom}</span>
            <span className="block text-ink-3">{quoi}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export const AIDES: Record<string, { titre: string; sections: Section[] }> = {
  scan: {
    titre: 'Scan',
    sections: [
      {
        titre: 'Vous ne choisissez pas l’action',
        texte:
          'Elle se déduit du statut de la pièce : en stock elle sort, en utilisation elle revient sale. Si le scan est refusé, le message dit pourquoi.',
      },
      { titre: 'Le cycle d’un vêtement', texte: <Cycle /> },
      {
        titre: 'Compteur de lavages',
        texte:
          'Il ne monte qu’au retour de chez Elis. Une pièce neuve qui entre pour la première fois n’a pas été lavée.',
      },
      {
        titre: 'Erreur de scan',
        texte:
          'Vous pouvez annuler votre propre mouvement pendant 24 h, depuis le bouton sous le résultat. Au-delà, seule l’administratrice corrige.',
      },
      {
        titre: 'Code-barre illisible',
        texte: 'Tapez-le à la main dans le même champ, puis validez.',
      },
    ],
  },

  expedition: {
    titre: 'Expédition',
    sections: [
      {
        titre: 'Ce qui est listé',
        texte:
          'Tout ce qui a été rendu sale et n’est pas encore parti. Les plus anciennes pièces sont en tête.',
      },
      {
        titre: 'Ce que vous ne cochez pas',
        texte:
          'reste dans la corbeille et repart au bulletin suivant. C’est voulu : une pièce marquée sale mais absente du bac ne sera jamais scannée, et son compteur de jours montera — c’est ainsi qu’on repère les vêtements égarés.',
      },
      {
        titre: 'Le bulletin part avec le bac',
        texte:
          'Il liste chaque code-barre confié à Elis et porte une zone de signature. C’est la preuve de ce qu’on leur a remis.',
      },
      {
        titre: 'Tout ou rien',
        texte:
          'L’envoi est enregistré en une seule fois. Si une pièce n’est plus dans la corbeille, rien n’est enregistré et le message la nomme.',
      },
    ],
  },

  reception: {
    titre: 'Entrée marchandise',
    sections: [
      {
        titre: 'Code-barre inconnu',
        texte:
          'C’est normal : Elis fournit les vêtements autant qu’il les lave. Une fenêtre s’ouvre pour créer la référence — type, taille, rebut.',
      },
      {
        titre: 'Rattacher à un envoi',
        texte:
          'Sans ce lien, impossible de comparer ce qui est parti à ce qui revient. Le bulletin affichera alors l’écart, pièce manquante comprise.',
      },
      {
        titre: 'Bon de livraison Elis',
        texte:
          'Leur numéro de document. C’est la référence commune sans laquelle nos deux papiers ne se parlent pas en cas de litige.',
      },
      {
        titre: 'Rebut',
        texte:
          'Elis a jugé la pièce hors d’usage mais la rend propre. Elle reste dans le parc et continue son cycle, réservée aux stagiaires.',
      },
      {
        titre: 'Rien n’est écrit avant validation',
        texte:
          'Le bac vit à l’écran. Un scan interrompu ne laisse aucune référence à moitié créée.',
      },
    ],
  },

  parc: {
    titre: 'Parc',
    sections: [
      {
        titre: 'Chercher une pièce',
        texte:
          'Passez la douchette dans le champ, ou tapez quelques caractères du code-barre. Sans terme, tout le parc s’affiche.',
      },
      {
        titre: 'La fiche',
        texte:
          'Cliquez une ligne pour l’ouvrir : identité, statut courant, détenteur, nombre de lavages et historique complet.',
      },
      {
        titre: 'Mouvements annulés',
        texte:
          'Ils restent visibles, barrés, avec la date et l’auteur de l’annulation. Le journal se corrige, il ne s’efface pas — c’est ce qui le rend opposable.',
      },
      {
        titre: 'Détenteur désactivé',
        texte:
          'Signalé en rouge. Ces pièces ne reviendront pas d’elles-mêmes : personne ne les réclame plus.',
      },
    ],
  },

  bord: {
    titre: 'Tableaux de bord',
    sections: [
      {
        titre: 'Stock et seuils',
        texte:
          'La colonne « Seuil » s’édite directement. Sans seuil, aucun manque ne peut être signalé — c’est pour cela que des combinaisons apparaissent sans alerte.',
      },
      {
        titre: 'Les rebuts ne comblent pas un manque',
        texte:
          'Ils sont comptés à part : réservés aux stagiaires, ils ne remplacent pas une pièce ordinaire.',
      },
      {
        titre: 'Facturation',
        texte:
          'Un bac encore chez Elis n’a pas de manquant, il a un retour à venir. Seuls les envois dont la réception est arrivée produisent un écart chiffré.',
      },
      {
        titre: 'Besoins prévisionnels',
        texte:
          'Indicatif seulement. Avant deux à trois mois de données, ces chiffres décrivent le hasard des premières semaines.',
      },
      {
        titre: 'Sauvegarde',
        texte:
          'L’onglet Journal produit un classeur réunissant le journal et l’état du parc. Tant que l’hébergement n’offre pas de restauration, ce fichier est la seule sauvegarde — téléchargez-le régulièrement.',
      },
    ],
  },

  operateurs: {
    titre: 'Opérateurs',
    sections: [
      {
        titre: 'Ce ne sont pas des comptes',
        texte:
          'Un opérateur, c’est un nom dans la liste et un code à 4 chiffres. Aucune adresse email, aucun mot de passe à gérer.',
      },
      {
        titre: 'Le code PIN',
        texte:
          'Vous le définissez ici. Il n’est jamais lisible ensuite, pas même par vous — seule son empreinte est conservée. En cas d’oubli, redéfinissez-en un.',
      },
      {
        titre: 'Désactiver, jamais supprimer',
        texte:
          'Le nom reste attaché aux mouvements déjà enregistrés. La désactivation retire seulement de la liste de l’écran Scan.',
      },
      {
        titre: 'Départ d’un collaborateur',
        texte:
          'La désactivation est refusée tant qu’il détient des vêtements. Enregistrez leur retour d’abord, sinon les pièces sortent du radar.',
      },
    ],
  },
};

/**
 * Panneau escamotable, ouvert depuis l'en-tête de l'écran.
 *
 * L'aide occupait auparavant une colonne fixe à gauche — 25 % de la largeur,
 * à l'endroit où l'œil se pose en premier. Utile le premier jour, du bruit
 * dès le troisième, et impossible à faire taire. Elle est désormais là quand
 * on la demande, et invisible le reste du temps.
 */
export function PanneauAide({
  onglet,
  ouvert,
  onFermer,
}: {
  onglet: string;
  ouvert: boolean;
  onFermer: () => void;
}) {
  const aide = AIDES[onglet];
  if (!aide || !ouvert) return null;

  return (
    <aside className="panneau-aide w-[288px] shrink-0 border-l border-line bg-surface-1 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 px-5 h-[52px] border-b border-line sticky top-0 bg-surface-1">
        <h2 className="etiquette">{aide.titre} — repères</h2>
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer les repères"
          className="inline-flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer -mr-1.5"
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-5 py-5 flex flex-col gap-5">
        {aide.sections.map((s) => (
          <section key={s.titre}>
            <h3 className="text-[13px] font-semibold mb-1 tracking-[-0.005em]">
              {s.titre}
            </h3>
            {typeof s.texte === 'string' ? (
              <p className="text-[12.5px] text-ink-3 leading-relaxed">{s.texte}</p>
            ) : (
              s.texte
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}
