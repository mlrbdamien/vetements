import type { ReactNode } from 'react';

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

export function Aide({ onglet }: { onglet: string }) {
  const aide = AIDES[onglet];
  if (!aide) return null;

  return (
    <aside className="hidden lg:block w-64 shrink-0 print:hidden">
      <div className="sticky top-7">
        <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3 mb-4">
          {aide.titre} — repères
        </h2>
        <div className="space-y-5">
          {aide.sections.map((s) => (
            <section key={s.titre}>
              <h3 className="text-[13px] font-medium mb-1">{s.titre}</h3>
              {typeof s.texte === 'string' ? (
                <p className="text-xs text-ink-3 leading-relaxed">{s.texte}</p>
              ) : (
                s.texte
              )}
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
