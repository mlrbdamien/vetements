# Vêtements de laboratoire — Pharmacie 24

Suivi du parc de vêtements de laboratoire, lavés **et fournis** par Elis.
Remplace une base Microsoft Access.

S'ouvre dans un navigateur sur 2–3 postes fixes (aucune installation possible),
pilotée à la douchette USB en émulation clavier.

## Mise en route

1. Créer un projet Supabase dédié, puis exécuter
   `supabase/schema_vetements_p24.sql` dans le SQL Editor. Le fichier est
   ré-exécutable.
2. Créer deux comptes dans **Authentication → Users** :
   - le compte technique de poste (partagé par les 2–3 postes) ;
   - le compte nominatif de l'administratrice.
3. Déclarer l'administratrice — **cette ligne ne peut pas être créée depuis
   l'app**, c'est ce qui empêche un poste de s'auto-promouvoir :

   ```sql
   insert into administrateur (user_id, nom)
   values ('<uuid du compte d''Annelore>', 'Annelore');
   ```

4. Copier `.env.local.example` vers `.env.local` et le remplir.
5. `npm install` puis `npm run dev`.

Les opérateurs sont amorcés **sans code PIN**. L'administratrice initialise
chaque code depuis l'onglet Opérateurs : il n'y a volontairement aucun code par
défaut partagé.

## Ce que couvre ce lot

- Schéma complet : tables, RPC, vues d'analyse, policies RLS
- Écran Scan (sortie et retour sale), avec annulation dans les 24 h
- Écran admin des opérateurs : création, réinitialisation de PIN,
  désactivation / réactivation

Restent à faire : Expédition, Entrée marchandise et PDF, fiche vêtement,
tableaux de bord, exports CSV/XLSX.

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
