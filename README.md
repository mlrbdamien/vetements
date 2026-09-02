# Vêtements de laboratoire

Suivi du parc de vêtements de laboratoire, lavés **et fournis** par le prestataire.
Remplace une base Microsoft Access.

S'ouvre dans un navigateur sur 2–3 postes fixes (aucune installation possible),
pilotée à la douchette USB en émulation clavier.

## Mise en route

1. Créer un projet Supabase dédié, puis exécuter
   `supabase/schema_vetements.sql` dans le SQL Editor. Le fichier est
   ré-exécutable.
2. Créer deux comptes dans **Authentication → Users** :
   - le compte technique de poste (partagé par les 2–3 postes) ;
   - le compte nominatif de l'administratrice.
3. Déclarer l'administratrice — **cette ligne ne peut pas être créée depuis
   l'app**, c'est ce qui empêche un poste de s'auto-promouvoir :

   ```sql
   insert into administrateur (user_id, nom)
   values ('<uuid du compte d''l'administratrice>', 'l'administratrice');
   ```

4. Copier `.env.local.example` vers `.env.local` et le remplir — URL et clé
   publique seulement, aucun mot de passe.
5. `npm install` puis `npm run dev`.
6. Au premier lancement sur chaque poste, l'écran **Mise en service** demande
   le compte de poste une fois ; la session est ensuite conservée sur
   l'ordinateur. Le mot de passe ne figure nulle part dans le code ni dans le
   build.

Les opérateurs sont amorcés **sans code PIN**. L'administratrice initialise
chaque code depuis l'onglet Opérateurs : il n'y a volontairement aucun code par
défaut partagé.

## Ce que couvre ce lot

- Schéma complet : tables, RPC, vues d'analyse, policies RLS
- Écran Scan (sortie et retour sale), avec annulation dans les 24 h
- Écran admin des opérateurs : création, réinitialisation de PIN,
  désactivation / réactivation
- Écran Expédition : corbeille du linge sale, scan ou coche pièce par pièce,
  bulletin `EXP-AAAA-NNNN`
- Écran Entrée marchandise : scan du bac, création de référence à la volée pour
  un code inconnu, rattachement au bulletin d'expédition, bulletin
  `REC-AAAA-NNNN` imprimable

- Écran Parc : recherche par code-barre, fiche vêtement et historique complet
- Tableaux de bord : stock et seuils éditables, chez le prestataire, en utilisation,
  contrôle de facturation, besoins prévisionnels
- Exports CSV et XLSX de chaque tableau, et sauvegarde complète en un classeur

Le périmètre du brief est couvert.

Le bulletin s'imprime via le navigateur (`⌘P`), avec une mise en page dédiée —
pas de bibliothèque PDF. À revoir si un fichier doit être généré sans dialogue,
par exemple pour un archivage automatique.

## Mode démonstration

`npm run dev:demo` lance l'app contre un Postgres local plutôt que contre
Supabase, avec un parc fictif de 60 vêtements et 100 jours d'historique — de
quoi voir les tableaux de bord remplis sans toucher aux vraies données. La
configuration vit dans `.env.demo.local` et n'écrase jamais `.env.local`.

Les scripts d'amorce sont hors dépôt (Postgres jetable, pont PostgREST).

## Exports

Séparateur point-virgule et BOM UTF-8 pour le CSV : sans l'un Excel met tout
dans une colonne, sans l'autre les accents se cassent.

SheetJS vient de `cdn.sheetjs.com`, pas de npm — le paquet `xlsx` du registre
est figé à `0.18.5` et porte deux CVE de lecture de fichier. La dépendance
apparaît donc sous forme d'URL dans `package.json` ; c'est la méthode
d'installation officielle. La bibliothèque est chargée à la demande, pas au
démarrage.

## Interface — direction « Console »

Navigation en barre latérale groupée **Terrain** / **Suivi**, avec des compteurs
vivants et une pastille rouge quand quelque chose demande une décision. Le pied
de la barre affiche l'état du parc en permanence : c'est ce qui manquait le
plus, on scannait sans jamais voir le stock, la corbeille ni ce qui dort chez
le prestataire.

L'aide n'occupe plus une colonne fixe — elle s'ouvre depuis l'en-tête de chaque
écran. `⌘K` ouvre une palette pour changer d'écran sans lâcher le clavier.

Accent `#21568C`, le bleu de la blouse. Les neutres penchent vers cet accent
plutôt que vers un gris pur. Toute donnée machine — code-barre, compteur,
taille, heure — se compose en chasse fixe et chiffres alignés (classe `donnee`).

## Principes à ne pas contourner

- **Le journal `mouvement` est la source de vérité.** `vetement.statut`,
  `nb_lavages` et `detenteur_id` sont recalculés par rejeu
  (`recalculer_vetement`). Ne jamais les écrire directement.
- **On n'efface jamais un mouvement** — on le marque `annule`. Un trigger
  refuse le `DELETE`.
- **On ne supprime jamais un opérateur** — on le désactive. Son nom reste
  attaché à ses mouvements.
- **Les transitions sont validées en base**, pas côté navigateur : trois postes
  écrivent en parallèle.
- **Les messages d'exception sont affichés tels quels.** Ils sont rédigés en
  français pour l'utilisateur final et portent la date, le nom ou le décompte
  qui les rendent actionnables.
- **`operateur.pin_hash` n'est jamais exposé** : la table n'accorde aucun
  `SELECT`, le front passe par `operateur_public` et les RPC.
- **Une expédition est atomique** : un bulletin, N mouvements, une transaction.
  Le bulletin doit décrire exactement le bac qui part. Ce qui n'est ni scanné
  ni coché reste `sale` et revient au bulletin suivant — c'est le mécanisme de
  détection des vêtements égarés, pas un oubli.

## Hébergement

Projet Supabase dédié, région **Zurich** — les données restent en Suisse.

**Plan gratuit, assumé pour le moment** (décision d'août 2026). Il n'offre pas
de restauration à un instant donné, et met le projet en pause après une semaine
sans activité. Le journal `mouvement` étant ce qui donne du poids face à une
facture du prestataire contestable, l'export périodique du journal hors de Supabase
devient la sauvegarde de fait — à mettre en place avec le lot d'exports.
À rouvrir avant une vraie mise en service.

## Seuils à confirmer avec l'administratrice

- `JOURS_SUSPECT` dans `src/pages/Expedition.tsx` (14 jours) : au-delà, une
  pièce qui traîne en corbeille est signalée comme probablement égarée. Valeur
  provisoire, la cadence réelle des envois chez le prestataire n'est pas connue.
- Les seuils de stock minimum par type et taille. La table `seuil_stock` est
  encore vide en production : tant qu'elle l'est, aucun manque ne peut être
  signalé. Ils se saisissent depuis la colonne « Seuil » du tableau de bord.
- `JOURS_UTILISATION_SUSPECT` (21 jours) et `JOURS_PRESTATAIRE_SUSPECT` (14 jours)
  dans `src/pages/TableauxDeBord.tsx` : seuils d'alerte visuelle, provisoires.
- Le parc et les tableaux de bord sont réservés à l'administratrice, comme le
  prévoit le brief. À rediscuter : un opérateur qui cherche où est passée une
  blouse n'a aujourd'hui aucun moyen de le savoir seul.

## Vitrine publique

`npm run dev:vitrine` — ou le déploiement automatique sur GitHub Pages à chaque
push sur `main`, via `.github/workflows/vitrine.yml`.

C'est un build **sans backend** : la couche de données est un modèle en mémoire
(`src/lib/demo.ts`) qui rejoue en JavaScript le cycle de vie, les transitions
interdites, le rejeu du journal et les messages d'erreur du schéma SQL. Un
rechargement remet tout à zéro.

Deux barrières empêchent les identifiants réels d'y entrer :

1. `vite.config.ts` écrase les variables `VITE_SUPABASE_*`
   en mode `vitrine`. C'est indispensable : Vite charge `.env.local` dans tous
   les modes, et `.env.local` a priorité sur `.env.vitrine` — sans ce blocage,
   les vrais identifiants seraient compilés en clair dans la page publique.
2. `src/lib/supabase.ts` refuse de construire un client en mode vitrine, même
   si une variable réapparaissait.

**Avant chaque publication**, vérifier que le build ne contient aucun secret :

```
npm run build:vitrine && grep -r "supabase.co" dist/ && echo FUITE || echo propre
```

Rappel : une variable `VITE_*` n'est pas une configuration, c'est une chaîne
littérale insérée dans le JavaScript servi. Tout ce qui porte ce préfixe doit
être considéré comme affiché en clair.
