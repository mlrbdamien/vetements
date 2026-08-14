-- ===========================================================================
-- Gestion des vêtements de laboratoire — Pharmacie 24
-- Schéma Supabase / PostgreSQL
--
-- À exécuter dans le SQL Editor du projet Supabase dédié. Le fichier est
-- ré-exécutable : il ne détruit rien et ne duplique pas les données d'amorce.
--
-- Principe directeur : le journal `mouvement` est la source de vérité.
-- `vetement.statut`, `vetement.nb_lavages` et `vetement.detenteur_id` sont des
-- champs DÉRIVÉS, recalculés par rejeu du journal (`recalculer_vetement`).
-- Aucune écriture directe sur ces trois colonnes en dehors de cette fonction.
--
-- Les messages d'exception sont rédigés en français POUR L'UTILISATEUR FINAL :
-- l'interface les affiche tels quels, sans reformulation.
-- ===========================================================================

-- pgcrypto, pour crypt() et gen_salt() sur les codes PIN.
--
-- Supabase installe ses extensions dans le schéma `extensions`, pas dans
-- `public`. Une fonction dont le search_path se limite à `public` n'y
-- trouverait donc pas crypt() — d'où `extensions` dans le search_path de
-- toutes les fonctions de ce fichier. Sur un Postgres nu, le schéma est créé
-- ici et l'extension y atterrit : le fichier marche dans les deux cas.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to authenticated;

-- ---------------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------------

do $$ begin
  create type statut_vetement as enum
    ('nouveau', 'en_stock', 'en_utilisation', 'sale', 'chez_elis');
exception when duplicate_object then null; end $$;

do $$ begin
  create type type_mouvement as enum
    ('RECEPTION', 'SORTIE', 'RETOUR_SALE', 'ENVOI_ELIS');
exception when duplicate_object then null; end $$;

do $$ begin
  create type genre_document as enum ('expedition', 'reception');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- Administrateurs
--
-- L'app tourne sous un compte Supabase Auth technique partagé « poste
-- pharmacie », qui est donc lui aussi `authenticated`. Sans cette table, rien
-- ne distinguerait un poste de l'administratrice, et une policy
-- `to authenticated` laisserait n'importe quel poste créer un opérateur ou
-- réinitialiser le code PIN d'un collègue.
-- ---------------------------------------------------------------------------

create table if not exists administrateur (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  nom      text not null,
  cree_le  timestamptz not null default now()
);

create or replace function est_admin() returns boolean
  language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from administrateur where user_id = auth.uid());
$$;

comment on function est_admin() is
  'Vrai si le JWT courant est celui de l''administratrice, faux pour le compte de poste partagé.';


-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table if not exists type_vetement (
  id       bigint generated always as identity primary key,
  libelle  text not null unique,
  ordre    smallint not null default 0,
  actif    boolean not null default true
);

insert into type_vetement (libelle, ordre) values
  ('Blouse bleue',   1),
  ('Blouse balance', 2),
  ('Tunique',        3),
  ('Pantalon',       4),
  ('Chaussettes',    5)
on conflict (libelle) do nothing;

comment on table type_vetement is
  'Types éditables depuis l''admin — d''où une table plutôt qu''un enum. Les chaussettes portent un code-barre par PAIRE.';


-- ---------------------------------------------------------------------------
-- Opérateurs
--
-- Pas de compte Supabase Auth : identification par sélection dans une liste
-- puis code PIN à 4 chiffres, vérifié EN BASE via RPC. `pin_hash` ne sort
-- jamais d'ici — voir la vue `operateur_public` et les GRANT en fin de fichier.
-- ---------------------------------------------------------------------------

create table if not exists operateur (
  id       bigint generated always as identity primary key,
  prenom   text not null,
  nom      text not null,
  actif    boolean not null default true,
  pin_hash text,
  cree_le  timestamptz not null default now(),
  unique (prenom, nom)
);

-- PIN volontairement NULL à l'amorce : pas de code par défaut partagé.
-- L'administratrice initialise chaque PIN depuis l'écran Opérateurs, et
-- `verifier_pin` refuse tant que ce n'est pas fait.
insert into operateur (prenom, nom) values
  ('Morgan', ''), ('Sébastien', ''), ('Guillaume', ''), ('Alix', ''),
  ('Anne-Catherine', ''), ('Emily', ''), ('Chantal', ''), ('Tanguy', ''),
  ('Nicolas', ''), ('Gaël', '')
on conflict (prenom, nom) do nothing;

create or replace view operateur_public as
  select id, prenom, nom, actif, (pin_hash is not null) as pin_defini
  from operateur;

comment on view operateur_public is
  'Seule surface exposée au client. La table operateur n''accorde aucun SELECT : c''est le rempart entre pin_hash et le réseau.';


-- ---------------------------------------------------------------------------
-- Documents (bulletins d'expédition et de réception)
-- ---------------------------------------------------------------------------

create table if not exists document (
  id                 bigint generated always as identity primary key,
  numero             text not null unique,
  genre              genre_document not null,
  date               date not null default current_date,
  expedition_liee_id bigint references document (id),
  cree_le            timestamptz not null default now(),
  -- Seule une réception se rattache à une expédition ; c'est ce lien qui rend
  -- le contrôle de facturation possible (envoyés vs reçus).
  constraint doc_lien_coherent check (
    expedition_liee_id is null or genre = 'reception'
  )
);

create or replace function prochain_numero_document(p_genre genre_document)
  returns text language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  v_prefixe text := case p_genre when 'expedition' then 'EXP' else 'REC' end;
  v_annee   text := to_char(current_date, 'YYYY');
  v_rang    int;
begin
  -- Verrou consultatif : deux postes qui créent un bulletin à la même seconde
  -- ne doivent pas obtenir le même numéro.
  perform pg_advisory_xact_lock(hashtext('numero_document_' || v_prefixe || v_annee));

  select coalesce(max(substring(numero from '\d+$')::int), 0) + 1
    into v_rang
    from document
   where genre = p_genre and numero like v_prefixe || '-' || v_annee || '-%';

  return v_prefixe || '-' || v_annee || '-' || lpad(v_rang::text, 4, '0');
end $$;


-- ---------------------------------------------------------------------------
-- Vêtements
-- ---------------------------------------------------------------------------

create table if not exists vetement (
  id           bigint generated always as identity primary key,
  code_barre   text not null unique,
  type_id      bigint not null references type_vetement (id),
  taille       smallint not null check (taille between 1 and 8),
  rebut        boolean not null default false,
  -- Champs dérivés — écrits uniquement par recalculer_vetement().
  statut       statut_vetement not null default 'nouveau',
  nb_lavages   integer not null default 0,
  detenteur_id bigint references operateur (id),
  cree_le      timestamptz not null default now()
);

create index if not exists idx_vetement_statut on vetement (statut);
create index if not exists idx_vetement_detenteur on vetement (detenteur_id);

comment on column vetement.rebut is
  'Elis a jugé le vêtement hors d''usage mais le rend propre : il reste dans le parc, réservé aux stagiaires. Booléen, PAS un statut.';
comment on column vetement.nb_lavages is
  'Informatif. Aucun seuil d''usure : la fin de vie est décidée par Elis, pas par la pharmacie.';


-- ---------------------------------------------------------------------------
-- Journal des mouvements — source de vérité
-- ---------------------------------------------------------------------------

create table if not exists mouvement (
  id          bigint generated always as identity primary key,
  vetement_id bigint not null references vetement (id),
  type        type_mouvement not null,
  operateur_id bigint references operateur (id),
  document_id bigint references document (id),
  horodatage  timestamptz not null default now(),
  annule      boolean not null default false,
  annule_le   timestamptz,
  annule_par  bigint references operateur (id),
  annule_admin uuid references auth.users (id)
);

create index if not exists idx_mouvement_vetement on mouvement (vetement_id, horodatage, id);
create index if not exists idx_mouvement_operateur on mouvement (operateur_id, horodatage desc);

-- On n'efface jamais un mouvement : on le marque `annule`. Sinon l'historique
-- qui sert à contester une facture Elis pourrait être réécrit.
create or replace function interdire_suppression_mouvement()
  returns trigger language plpgsql as $$
begin
  raise exception 'Un mouvement ne peut pas être supprimé. Utilisez l''annulation, qui conserve la trace.';
end $$;

drop trigger if exists trg_mouvement_pas_de_suppression on mouvement;
create trigger trg_mouvement_pas_de_suppression
  before delete on mouvement
  for each row execute function interdire_suppression_mouvement();


-- ---------------------------------------------------------------------------
-- Seuils de stock
-- ---------------------------------------------------------------------------

create table if not exists seuil_stock (
  type_id bigint not null references type_vetement (id) on delete cascade,
  taille  smallint not null check (taille between 1 and 8),
  minimum integer not null check (minimum >= 0),
  primary key (type_id, taille)
);


-- ===========================================================================
-- Cœur métier
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Rejeu du journal.
--
-- On ne « défait » jamais l'effet d'un mouvement annulé : on repart de zéro et
-- on rejoue toute la séquence non annulée. L'opération est ainsi idempotente,
-- quel que soit l'ordre dans lequel les annulations ont eu lieu.
--
-- Le rejeu APPLIQUE sans revalider : le contrôle de transition a lieu à
-- l'insertion. Si l'annulation d'un mouvement ancien rend la suite
-- incohérente, l'état recalculé reste déterministe — c'est le dernier
-- mouvement valide qui fait foi.
-- ---------------------------------------------------------------------------

create or replace function recalculer_vetement(p_vetement_id bigint)
  returns void language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  m           record;
  v_statut    statut_vetement := 'nouveau';
  v_lavages   integer := 0;
  v_detenteur bigint := null;
begin
  for m in
    select type, operateur_id
      from mouvement
     where vetement_id = p_vetement_id and not annule
     order by horodatage, id
  loop
    case m.type
      when 'RECEPTION' then
        -- Le compteur ne monte QUE si le vêtement revenait de chez Elis.
        -- Un article neuf qui entre pour la première fois n'a pas été lavé.
        if v_statut = 'chez_elis' then
          v_lavages := v_lavages + 1;
        end if;
        v_statut := 'en_stock';
        v_detenteur := null;
      when 'SORTIE' then
        v_statut := 'en_utilisation';
        v_detenteur := m.operateur_id;
      when 'RETOUR_SALE' then
        v_statut := 'sale';
        v_detenteur := null;
      when 'ENVOI_ELIS' then
        v_statut := 'chez_elis';
        v_detenteur := null;
    end case;
  end loop;

  update vetement
     set statut = v_statut, nb_lavages = v_lavages, detenteur_id = v_detenteur
   where id = p_vetement_id;
end $$;


-- ---------------------------------------------------------------------------
-- Vérification du code PIN. Le PIN circule en clair sur le canal TLS et n'est
-- comparé qu'ici : un hash calculé côté navigateur serait un mot de passe.
-- ---------------------------------------------------------------------------

create or replace function verifier_pin(p_operateur_id bigint, p_pin text)
  returns boolean language plpgsql stable security definer
  set search_path = public, extensions, pg_temp as $$
declare
  o record;
begin
  select prenom, nom, actif, pin_hash into o from operateur where id = p_operateur_id;

  if not found then
    raise exception 'Opérateur inconnu.';
  end if;
  if not o.actif then
    raise exception 'Le compte de % est désactivé.', trim(o.prenom || ' ' || o.nom);
  end if;
  if o.pin_hash is null then
    raise exception 'Aucun code PIN défini pour %. Demandez à l''administratrice de l''initialiser.',
      trim(o.prenom || ' ' || o.nom);
  end if;

  return o.pin_hash = crypt(p_pin, o.pin_hash);
end $$;


-- ---------------------------------------------------------------------------
-- Enregistrement d'un mouvement.
--
-- L'action n'est PAS choisie par l'utilisateur : elle se déduit du statut
-- courant du vêtement. Le contexte (l'écran d'où vient le scan) restreint les
-- déductions autorisées — un vêtement sale scanné depuis l'écran Scan n'a rien
-- à faire là, il attend le prochain envoi Elis.
--
-- La vérification est ici, dans la transaction qui écrit, et pas côté client :
-- trois postes scannent en parallèle, et un contrôle fait côté navigateur peut
-- toujours être doublé entre la lecture du statut et l'écriture.
-- ---------------------------------------------------------------------------

create or replace function enregistrer_mouvement(
  p_code_barre   text,
  p_operateur_id bigint,
  p_pin          text,
  p_contexte     text default 'scan',
  p_document_id  bigint default null
) returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  v            record;
  v_type       type_mouvement;
  v_mouvement  bigint;
  v_depuis     timestamptz;
begin
  if not verifier_pin(p_operateur_id, p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select vt.*, t.libelle as type_libelle
    into v
    from vetement vt
    join type_vetement t on t.id = vt.type_id
   where vt.code_barre = trim(p_code_barre);

  if not found then
    raise exception 'Code-barre inconnu : %. Cette référence doit d''abord être créée en entrée marchandise.',
      trim(p_code_barre);
  end if;

  -- Date du dernier mouvement, pour rendre les messages d'erreur utiles.
  select max(horodatage) into v_depuis
    from mouvement where vetement_id = v.id and not annule;

  -- Déduction de l'action selon le contexte et le statut courant.
  if p_contexte = 'scan' then
    case v.statut
      when 'en_stock'       then v_type := 'SORTIE';
      when 'en_utilisation' then v_type := 'RETOUR_SALE';
      when 'nouveau' then
        raise exception 'Ce vêtement n''a jamais été réceptionné. Passez par l''entrée marchandise.';
      when 'sale' then
        raise exception 'Ce vêtement est déjà dans la corbeille du linge sale, il partira au prochain envoi Elis.';
      when 'chez_elis' then
        raise exception 'Ce vêtement est chez Elis depuis le %. Il doit être réceptionné avant d''être repris.',
          to_char(v_depuis, 'DD.MM.YYYY');
    end case;

  elsif p_contexte = 'expedition' then
    if v.statut <> 'sale' then
      raise exception 'Seul le linge sale part chez Elis. Ce vêtement est actuellement « % ».',
        replace(v.statut::text, '_', ' ');
    end if;
    v_type := 'ENVOI_ELIS';

  elsif p_contexte = 'reception' then
    if v.statut not in ('nouveau', 'chez_elis') then
      raise exception 'Ce vêtement n''était pas chez Elis : il est « % ». Réception impossible.',
        replace(v.statut::text, '_', ' ');
    end if;
    v_type := 'RECEPTION';

  else
    raise exception 'Contexte de scan inconnu : %.', p_contexte;
  end if;

  insert into mouvement (vetement_id, type, operateur_id, document_id)
  values (v.id, v_type, p_operateur_id, p_document_id)
  returning id into v_mouvement;

  perform recalculer_vetement(v.id);

  select vt.*, t.libelle as type_libelle
    into v
    from vetement vt join type_vetement t on t.id = vt.type_id
   where vt.id = v.id;

  return jsonb_build_object(
    'mouvement_id',   v_mouvement,
    'mouvement_type', v_type,
    'vetement_id',    v.id,
    'code_barre',     v.code_barre,
    'type_libelle',   v.type_libelle,
    'taille',         v.taille,
    'rebut',          v.rebut,
    'statut',         v.statut,
    'nb_lavages',     v.nb_lavages,
    'detenteur',      (select trim(prenom || ' ' || nom) from operateur where id = v.detenteur_id)
  );
end $$;


-- ---------------------------------------------------------------------------
-- Annulation. Fenêtre de 24 h pour un opérateur, sur ses propres mouvements.
-- L'administratrice corrige au-delà.
-- ---------------------------------------------------------------------------

create or replace function annuler_mouvement(
  p_mouvement_id bigint,
  p_operateur_id bigint default null,
  p_pin          text default null
) returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  m       record;
  v_admin boolean := est_admin();
begin
  select * into m from mouvement where id = p_mouvement_id;
  if not found then
    raise exception 'Mouvement introuvable.';
  end if;
  if m.annule then
    raise exception 'Ce mouvement a déjà été annulé le %.', to_char(m.annule_le, 'DD.MM.YYYY à HH24:MI');
  end if;

  if not v_admin then
    if p_operateur_id is null or not verifier_pin(p_operateur_id, p_pin) then
      raise exception 'Code PIN incorrect.';
    end if;
    if m.operateur_id is distinct from p_operateur_id then
      raise exception 'Vous ne pouvez annuler que vos propres mouvements.';
    end if;
    if m.horodatage < now() - interval '24 hours' then
      raise exception 'Ce mouvement date du % : passé 24 h, seule l''administratrice peut le corriger.',
        to_char(m.horodatage, 'DD.MM.YYYY');
    end if;
  end if;

  update mouvement
     set annule = true,
         annule_le = now(),
         annule_par = case when v_admin then null else p_operateur_id end,
         annule_admin = case when v_admin then auth.uid() else null end
   where id = p_mouvement_id;

  perform recalculer_vetement(m.vetement_id);

  return (
    select jsonb_build_object(
      'vetement_id', vt.id, 'code_barre', vt.code_barre,
      'statut', vt.statut, 'nb_lavages', vt.nb_lavages)
    from vetement vt where vt.id = m.vetement_id
  );
end $$;


-- ---------------------------------------------------------------------------
-- Création d'une référence — entrée marchandise. Elis fournit les vêtements,
-- un bac contient donc des codes-barres encore inconnus de la base.
-- ---------------------------------------------------------------------------

create or replace function creer_vetement(
  p_code_barre text,
  p_type_id    bigint,
  p_taille     smallint,
  p_rebut      boolean default false
) returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  v_id bigint;
begin
  if exists (select 1 from vetement where code_barre = trim(p_code_barre)) then
    raise exception 'Le code-barre % existe déjà dans le parc.', trim(p_code_barre);
  end if;

  insert into vetement (code_barre, type_id, taille, rebut)
  values (trim(p_code_barre), p_type_id, p_taille, p_rebut)
  returning id into v_id;

  return (
    select jsonb_build_object(
      'vetement_id', vt.id, 'code_barre', vt.code_barre,
      'type_libelle', t.libelle, 'taille', vt.taille,
      'rebut', vt.rebut, 'statut', vt.statut)
    from vetement vt join type_vetement t on t.id = vt.type_id
    where vt.id = v_id
  );
end $$;


-- ===========================================================================
-- Gestion des opérateurs — réservée à l'administratrice
-- ===========================================================================

create or replace function verifier_format_pin(p_pin text)
  returns void language plpgsql immutable as $$
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'Le code PIN doit contenir exactement 4 chiffres.';
  end if;
end $$;

create or replace function creer_operateur(
  p_prenom text,
  p_nom    text,
  p_pin    text
) returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  v_id bigint;
begin
  if not est_admin() then
    raise exception 'Seule l''administratrice peut créer un opérateur.';
  end if;
  perform verifier_format_pin(p_pin);

  if exists (select 1 from operateur
              where lower(prenom) = lower(trim(p_prenom))
                and lower(nom) = lower(trim(coalesce(p_nom, '')))) then
    raise exception 'Un opérateur nommé % existe déjà.', trim(p_prenom || ' ' || coalesce(p_nom, ''));
  end if;

  insert into operateur (prenom, nom, pin_hash)
  values (trim(p_prenom), trim(coalesce(p_nom, '')), crypt(p_pin, gen_salt('bf')))
  returning id into v_id;

  return (select to_jsonb(o) from operateur_public o where o.id = v_id);
end $$;


create or replace function definir_pin_operateur(
  p_operateur_id bigint,
  p_pin          text
) returns void language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
begin
  if not est_admin() then
    raise exception 'Seule l''administratrice peut réinitialiser un code PIN.';
  end if;
  perform verifier_format_pin(p_pin);

  update operateur set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = p_operateur_id;

  if not found then
    raise exception 'Opérateur inconnu.';
  end if;
end $$;


-- On ne supprime jamais un opérateur : chaque ligne de `mouvement` pointe sur
-- lui, et l'effacer viderait de son nom tout l'historique qu'il a produit —
-- précisément ce que l'application est censée conserver.
--
-- La désactivation refuse de s'exécuter tant que l'opérateur détient encore
-- des vêtements : sinon un départ de collaborateur ferait sortir des blouses
-- du radar sans que personne ne les réclame.
create or replace function desactiver_operateur(p_operateur_id bigint)
  returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  o       record;
  v_count integer;
begin
  if not est_admin() then
    raise exception 'Seule l''administratrice peut désactiver un opérateur.';
  end if;

  select * into o from operateur where id = p_operateur_id;
  if not found then
    raise exception 'Opérateur inconnu.';
  end if;

  select count(*) into v_count from vetement where detenteur_id = p_operateur_id;
  if v_count > 0 then
    raise exception '% détient encore % vêtement(s). Enregistrez leur retour avant de désactiver ce compte.',
      trim(o.prenom || ' ' || o.nom), v_count;
  end if;

  update operateur set actif = false where id = p_operateur_id;
  return (select to_jsonb(op) from operateur_public op where op.id = p_operateur_id);
end $$;


create or replace function reactiver_operateur(p_operateur_id bigint)
  returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
begin
  if not est_admin() then
    raise exception 'Seule l''administratrice peut réactiver un opérateur.';
  end if;

  update operateur set actif = true where id = p_operateur_id;
  if not found then
    raise exception 'Opérateur inconnu.';
  end if;

  return (select to_jsonb(op) from operateur_public op where op.id = p_operateur_id);
end $$;


-- ===========================================================================
-- Vues d'analyse
-- ===========================================================================

-- Stock disponible par type et taille, comparé au seuil minimum.
create or replace view v_stock_disponible as
select
  t.id                                                         as type_id,
  t.libelle                                                    as type_libelle,
  v.taille,
  count(*) filter (where v.statut = 'en_stock' and not v.rebut) as disponible,
  count(*) filter (where v.statut = 'en_stock' and v.rebut)     as disponible_rebut,
  s.minimum,
  greatest(coalesce(s.minimum, 0)
           - count(*) filter (where v.statut = 'en_stock' and not v.rebut), 0) as manque
from vetement v
join type_vetement t on t.id = v.type_id
left join seuil_stock s on s.type_id = v.type_id and s.taille = v.taille
group by t.id, t.libelle, v.taille, s.minimum;

comment on view v_stock_disponible is
  'Les vêtements « rebut » sont comptés à part : ils restent dans le parc mais sont réservés aux stagiaires.';


-- Chez Elis depuis X jours — l'argument concret face à une facture contestable.
create or replace view v_chez_elis as
select
  v.id as vetement_id, v.code_barre, t.libelle as type_libelle, v.taille, v.rebut,
  m.horodatage as envoye_le,
  d.numero     as bulletin_expedition,
  (current_date - m.horodatage::date) as jours_chez_elis
from vetement v
join type_vetement t on t.id = v.type_id
join lateral (
  select horodatage, document_id
    from mouvement
   where vetement_id = v.id and type = 'ENVOI_ELIS' and not annule
   order by horodatage desc limit 1
) m on true
left join document d on d.id = m.document_id
where v.statut = 'chez_elis';


-- En utilisation depuis X jours — repère les vêtements jamais rendus.
create or replace view v_en_utilisation as
select
  v.id as vetement_id, v.code_barre, t.libelle as type_libelle, v.taille, v.rebut,
  o.id as detenteur_id,
  trim(o.prenom || ' ' || o.nom) as detenteur,
  o.actif as detenteur_actif,
  m.horodatage as sorti_le,
  (current_date - m.horodatage::date) as jours_en_utilisation
from vetement v
join type_vetement t on t.id = v.type_id
join operateur o on o.id = v.detenteur_id
join lateral (
  select horodatage
    from mouvement
   where vetement_id = v.id and type = 'SORTIE' and not annule
   order by horodatage desc limit 1
) m on true
where v.statut = 'en_utilisation';

comment on view v_en_utilisation is
  'detenteur_actif = false signale un vêtement resté chez un collaborateur désactivé — à récupérer.';


-- Historique complet d'un vêtement, mentions d'annulation comprises.
create or replace view v_historique_vetement as
select
  m.id as mouvement_id, m.vetement_id, v.code_barre,
  m.type, m.horodatage,
  trim(o.prenom || ' ' || o.nom) as operateur,
  d.numero as document,
  m.annule, m.annule_le,
  trim(a.prenom || ' ' || a.nom) as annule_par,
  (m.annule_admin is not null)   as annule_par_admin
from mouvement m
join vetement v on v.id = m.vetement_id
left join operateur o on o.id = m.operateur_id
left join operateur a on a.id = m.annule_par
left join document d on d.id = m.document_id
order by m.vetement_id, m.horodatage, m.id;


-- Besoins prévisionnels : demande quotidienne × durée complète du cycle × 1.2.
--
-- ATTENTION : non significatif tant que le parc n'a pas accompli plusieurs
-- cycles complets. Compter 2 à 3 mois de données avant d'y lire quoi que ce
-- soit — l'interface doit afficher cet avertissement.
create or replace view v_besoins_previsionnels as
with periode as (
  select greatest(current_date - min(horodatage)::date, 1) as jours
    from mouvement where not annule
),
demande as (
  select v.type_id, v.taille, count(*)::numeric / (select jours from periode) as par_jour
    from mouvement m join vetement v on v.id = m.vetement_id
   where m.type = 'SORTIE' and not m.annule
   group by v.type_id, v.taille
),
intervalles as (
  -- Durée d'un cycle : intervalle entre deux réceptions successives du même
  -- vêtement, c'est-à-dire sortie + utilisation + attente + lavage chez Elis.
  -- Le lag() doit être calculé avant l'agrégation, d'où les deux étages.
  select v.type_id, v.taille,
         m.horodatage - lag(m.horodatage)
           over (partition by m.vetement_id order by m.horodatage, m.id) as ecart
    from mouvement m join vetement v on v.id = m.vetement_id
   where m.type = 'RECEPTION' and not m.annule
),
cycles as (
  select type_id, taille, avg(extract(epoch from ecart) / 86400) as jours
    from intervalles where ecart is not null
   group by type_id, taille
),
parc as (
  select type_id, taille, count(*) as parc_reel from vetement group by type_id, taille
)
select
  t.id as type_id, t.libelle as type_libelle, p.taille,
  round(coalesce(d.par_jour, 0), 2) as demande_quotidienne,
  round(coalesce(c.jours, 0)::numeric, 1) as duree_cycle_jours,
  p.parc_reel,
  ceil(coalesce(d.par_jour, 0) * coalesce(c.jours, 0)::numeric * 1.2) as parc_recommande,
  greatest(ceil(coalesce(d.par_jour, 0) * coalesce(c.jours, 0)::numeric * 1.2) - p.parc_reel, 0) as ecart
from parc p
join type_vetement t on t.id = p.type_id
left join demande d on d.type_id = p.type_id and d.taille = p.taille
left join cycles  c on c.type_id = p.type_id and c.taille = p.taille;


-- Contrôle de facturation : envoyés vs reçus, par type et taille, dès qu'un
-- bulletin de réception est rattaché à son expédition.
create or replace view v_controle_facturation as
with envoyes as (
  select m.document_id as expedition_id, v.type_id, v.taille, count(*) as envoyes
    from mouvement m join vetement v on v.id = m.vetement_id
   where m.type = 'ENVOI_ELIS' and not m.annule and m.document_id is not null
   group by 1, 2, 3
),
recus as (
  select d.expedition_liee_id as expedition_id, d.id as reception_id,
         v.type_id, v.taille, count(*) as recus
    from mouvement m
    join vetement v on v.id = m.vetement_id
    join document d on d.id = m.document_id
   where m.type = 'RECEPTION' and not m.annule and d.expedition_liee_id is not null
   group by 1, 2, 3, 4
)
select
  de.numero as bulletin_expedition, de.date as date_expedition,
  dr.numero as bulletin_reception,  dr.date as date_reception,
  t.libelle as type_libelle,
  coalesce(e.taille, r.taille) as taille,
  coalesce(e.envoyes, 0) as envoyes,
  coalesce(r.recus, 0)   as recus,
  coalesce(e.envoyes, 0) - coalesce(r.recus, 0) as manquants
from envoyes e
full outer join recus r
  on r.expedition_id = e.expedition_id and r.type_id = e.type_id and r.taille = e.taille
join type_vetement t on t.id = coalesce(e.type_id, r.type_id)
join document de on de.id = coalesce(e.expedition_id, r.expedition_id)
left join document dr on dr.id = r.reception_id;


-- ===========================================================================
-- Sécurité — RLS et droits
--
-- Le compte de poste partagé et l'administratrice sont tous deux
-- `authenticated`. La lecture et les mouvements sont ouverts aux deux ;
-- l'administration du catalogue passe par est_admin().
-- ===========================================================================

alter table administrateur enable row level security;
alter table type_vetement  enable row level security;
alter table operateur      enable row level security;
alter table vetement       enable row level security;
alter table mouvement      enable row level security;
alter table document       enable row level security;
alter table seuil_stock    enable row level security;

-- Supabase applique des DEFAULT PRIVILEGES qui accordent tout, sur chaque
-- table nouvellement créée dans `public`, aux rôles anon et authenticated.
-- On repart donc de zéro et on ne rouvre que ce qui doit l'être. Sans cette
-- reprise en main, `anon` recevrait des droits qu'aucun GRANT de ce fichier
-- ne lui a donnés.
revoke all on all tables in schema public from anon, authenticated;

-- Le projet est créé avec « Automatically expose new tables » DÉSACTIVÉ :
-- ce fichier doit donc accorder lui-même tout ce dont le client a besoin,
-- y compris l'accès au schéma.
grant usage on schema public to authenticated;

grant select on type_vetement, vetement, mouvement, document, seuil_stock to authenticated;
grant select on operateur_public, v_stock_disponible, v_chez_elis, v_en_utilisation,
                v_historique_vetement, v_besoins_previsionnels, v_controle_facturation
      to authenticated;
grant select on administrateur to authenticated;

-- Écritures directes réservées à l'admin ; les postes écrivent via les RPC
-- SECURITY DEFINER, qui portent leurs propres contrôles métier.
grant insert, update, delete on type_vetement, seuil_stock to authenticated;
grant insert, update on vetement, document to authenticated;

do $$
declare
  r record;
begin
  -- Lecture ouverte à tout compte authentifié.
  for r in select unnest(array['type_vetement','vetement','mouvement','document',
                               'seuil_stock','administrateur']) as t
  loop
    execute format(
      'drop policy if exists "lecture authentifiee" on %I', r.t);
    execute format(
      'create policy "lecture authentifiee" on %I for select to authenticated using (true)', r.t);
  end loop;

  -- Écriture directe sur le catalogue : administratrice uniquement.
  for r in select unnest(array['type_vetement','seuil_stock']) as t
  loop
    execute format('drop policy if exists "admin ecrit" on %I', r.t);
    execute format(
      'create policy "admin ecrit" on %I for all to authenticated using (est_admin()) with check (est_admin())', r.t);
  end loop;
end $$;

-- Le parc et les bulletins : tout poste peut créer et corriger.
drop policy if exists "poste ecrit vetement" on vetement;
create policy "poste ecrit vetement" on vetement
  for all to authenticated using (true) with check (true);

drop policy if exists "poste ecrit document" on document;
create policy "poste ecrit document" on document
  for all to authenticated using (true) with check (true);

-- Aucune policy d'écriture sur mouvement : le journal ne se remplit que par
-- enregistrer_mouvement() et annuler_mouvement().

grant execute on function
  verifier_pin(bigint, text),
  enregistrer_mouvement(text, bigint, text, text, bigint),
  annuler_mouvement(bigint, bigint, text),
  creer_vetement(text, bigint, smallint, boolean),
  prochain_numero_document(genre_document),
  recalculer_vetement(bigint),
  est_admin(),
  creer_operateur(text, text, text),
  definir_pin_operateur(bigint, text),
  desactiver_operateur(bigint),
  reactiver_operateur(bigint)
  to authenticated;


-- ===========================================================================
-- Lot 2 — Expédition vers Elis
-- ===========================================================================

-- La corbeille du linge sale, telle qu'elle s'affiche à l'écran Expédition.
--
-- `jours_depuis_retour` est le cœur de la détection des vêtements égarés : un
-- vêtement rendu sale mais physiquement absent du bac ne sera jamais scanné,
-- restera en `sale`, et son compteur montera bulletin après bulletin.
create or replace view v_linge_sale as
select
  v.id as vetement_id, v.code_barre,
  t.libelle as type_libelle, t.id as type_id,
  v.taille, v.rebut,
  m.horodatage as retour_le,
  (current_date - m.horodatage::date) as jours_depuis_retour
from vetement v
join type_vetement t on t.id = v.type_id
left join lateral (
  select horodatage
    from mouvement
   where vetement_id = v.id and type = 'RETOUR_SALE' and not annule
   order by horodatage desc limit 1
) m on true
where v.statut = 'sale';


-- Enregistre une expédition complète : un bulletin, N mouvements, une seule
-- transaction.
--
-- Atomique à dessein. Une expédition est un événement physique unique — un bac
-- qui part — et le bulletin doit décrire exactement ce qui est parti. Si un
-- vêtement de la liste n'est plus `sale` (un autre poste vient de l'expédier),
-- tout est annulé et le message nomme la pièce : mieux vaut recommencer sur
-- une liste à jour qu'émettre un bulletin qui ne correspond pas au bac.
--
-- Le PIN n'est vérifié qu'UNE fois : bcrypt coûte ~100 ms, le revérifier pour
-- chaque pièce mettrait plusieurs secondes sur un bac de cinquante.
create or replace function enregistrer_expedition(
  p_operateur_id bigint,
  p_pin          text,
  p_vetement_ids bigint[]
) returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  r          record;
  v_doc_id   bigint;
  v_numero   text;
  v_demandes integer;
  v_trouves  integer;
  v_envoyes  integer := 0;
  v_restants integer;
begin
  if not verifier_pin(p_operateur_id, p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  v_demandes := coalesce(cardinality(p_vetement_ids), 0);
  if v_demandes = 0 then
    raise exception 'Aucun vêtement n''a été scanné ni coché : il n''y a rien à envoyer.';
  end if;

  select count(*) into v_trouves from vetement where id = any(p_vetement_ids);
  if v_trouves <> v_demandes then
    raise exception 'La liste contient des vêtements introuvables. Rafraîchissez la page et recommencez.';
  end if;

  v_numero := prochain_numero_document('expedition');
  insert into document (numero, genre) values (v_numero, 'expedition')
  returning id into v_doc_id;

  for r in
    select v.id, v.code_barre, v.statut, v.taille, t.libelle
      from vetement v join type_vetement t on t.id = v.type_id
     where v.id = any(p_vetement_ids)
     order by v.code_barre
  loop
    -- Même règle que enregistrer_mouvement(..., 'expedition') : seul le linge
    -- sale part chez Elis.
    if r.statut <> 'sale' then
      raise exception '% (% taille %) n''est plus dans la corbeille : il est « % ». Rien n''a été envoyé, rafraîchissez la liste.',
        r.code_barre, r.libelle, r.taille, replace(r.statut::text, '_', ' ');
    end if;

    insert into mouvement (vetement_id, type, operateur_id, document_id)
    values (r.id, 'ENVOI_ELIS', p_operateur_id, v_doc_id);

    perform recalculer_vetement(r.id);
    v_envoyes := v_envoyes + 1;
  end loop;

  -- Ce qui reste `sale` après coup : ni scanné ni coché, donc absent du bac.
  select count(*) into v_restants from vetement where statut = 'sale';

  return jsonb_build_object(
    'document_id', v_doc_id,
    'numero',      v_numero,
    'date',        current_date,
    'nb_envoyes',  v_envoyes,
    'nb_restants', v_restants
  );
end $$;

grant select on v_linge_sale to authenticated;
grant execute on function enregistrer_expedition(bigint, text, bigint[]) to authenticated;


-- ===========================================================================
-- Verrouillage final
--
-- DOIT rester en dernier : ce bloc retire les droits implicites que Postgres
-- et Supabase accordent à la création, y compris sur les objets ajoutés par
-- les lots suivants. Tout GRANT légitime a déjà été posé au-dessus.
-- ===========================================================================

-- PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction nouvellement créée.
-- Ces fonctions étant SECURITY DEFINER, les laisser ainsi rendrait
-- `verifier_pin` appelable SANS ÊTRE CONNECTÉ : un code à 4 chiffres offert à
-- la force brute depuis l'extérieur.
revoke execute on all functions in schema public from public, anon;

-- Supabase applique des DEFAULT PRIVILEGES qui accordent tout, sur chaque
-- table ou vue créée dans `public`, aux rôles anon et authenticated.
revoke all on all tables in schema public from anon;

-- Et le rempart principal, répété ici pour qu'il survive à tout ajout futur :
-- pin_hash ne doit jamais être lisible depuis un compte client.
revoke all on operateur from anon, authenticated;

-- PostgREST met son cache de schéma à jour au signal. Sans ça, une fonction
-- fraîchement créée peut répondre « not found in schema cache » quelques
-- minutes durant.
notify pgrst, 'reload schema';
