# Kombi — Journal des décisions (ADR-lite)

Chaque décision structurante, avec sa justification et sa source. Ordre chronologique.

## D1 — Nom du produit : Kombi (2026-09-01)
« Kombi » = ami en francanglais camerounais → « l'ami de la gestion d'entreprise ».
Scope npm `@kombi/*`, dépôt `impacttech237/kombi`.

## D2 — Tout sur Cloudflare (2026-09-01)
Frontend **Cloudflare Pages** (React PWA), backend **Hono sur Workers**, base **D1 (SQLite)**,
fichiers **R2**, vectoriel futur **Vectorize**, auth **better-auth**.
**Remplace** le doc d'architecture initial (NestJS + PostgreSQL + pgvector + Supabase).
*Conséquence :* D1 = SQLite → intégrité comptable tenue par triggers SQLite + tests.

## D3 — On n'invente aucune règle fiscale/comptable (2026-09-01)
Toute constante (taux, seuil, barème) provient d'un texte officiel cité dans `docs/reference/`.
Sources : CGI 2026, Guide SYSCOHADA, actes uniformes OHADA. Validation ONECCA avant production.

## D4 — Repositionnement : outil de gestion, compta en sous-produit (2026-09-01)
Retour terrain (président d'association PME). Le point d'entrée devient ventes/stock/commandes ;
la compta et la fiscalité découlent automatiquement en arrière-plan (couche invisible).

## D5 — Produit configurable par secteur, pas produit unique (2026-09-01)
Modèle à 3 niveaux : registre de modules typé (`@kombi/shared/modules.ts`) → presets sectoriels
→ table `module_entreprise` (état réel par entreprise, `config_json` par module). Gating API/UI.
Ajouter un module futur = 1 entrée + 1 mapping, **sans toucher au cœur**. Secteurs MVP :
**commerce / service / mixte**.

## D6 — Vente ≠ Facture (2026-09-01) — source : CGI Art. 150
La facture normalisée exige le NIU du client (impossible pour un client de passage) et ne pèse
que sur les assujettis TVA (Réel). Donc : `vente` = opération source (toujours, produit un reçu) ;
`facture` = document légal numéroté séquentiellement, émis à la demande. Voir `docs/reference/07`.

## D7 — Stock en inventaire permanent + CMP (2026-09-01) — source : Guide SYSCOHADA §1.1.4.1
CMP recalculé après chaque entrée ; sortie valorisée au CMP (CMV). Comptes 311 / 601 / 6031.
Décision du fondateur, confirmée conforme SYSCOHADA. Voir `docs/reference/08`.

## D8 — TVA gérée seulement pour les assujettis (2026-09-01)
Entreprises au Réel : TVA 19,25 % sur facture. Entreprises IGS : pas de TVA (facture HT = TTC).

## D9 — Rôles simples : admin / gérant / caissier (2026-09-01)
Remplace proprietaire/comptable/support. Pas de module paie/CNPS ni de schéma RH complexe au MVP.

## D10 — Exercice = année civile, un seul actif à la fois (MVP) (2026-09-01)
Pas de clôture formelle multi-exercices au MVP.

## D11 — Concevoir pour 100 000 utilisateurs simultanés, shard = entreprise (2026-09-01)
Exigence fondateur : scale ~100k utilisateurs simultanés. Analyse : Workers scalent nativement ;
le goulot est l'écriture D1 (SQLite sérialise les writes d'une base). **La frontière de tenant
`entreprise_id` est la clé de sharding.**
- **MVP** : base D1 partagée (simple, suffit pour les pilotes), MAIS code écrit avec la couture de
  sharding — tout accès porte un `entreprise_id` explicite, **zéro requête cross-tenant, zéro
  compteur global**.
- **À l'échelle** : bascule vers **une base D1 par entreprise** (création programmatique) +
  **Durable Object par entreprise** pour les compteurs chauds (numérotation facture gap-less).
  Rendue mécanique par la couture ci-dessus.
- Leviers : offline-first (writes bufferisés/idempotents → charge serveur divisée), KV/Cache pour
  la donnée de référence (plan comptable, barème IGS).
*Ne pas sur-ingénier : on ne paie la complexité per-tenant que quand le volume la justifie.*

## D12 — Parcours user-friendly, simple et fluide (2026-09-01)
Exigence fondateur. Principes appliqués partout : mobile-first, gros boutons (usage terrain au
doigt) ; saisie minimale (< 3 champs pour vente/dépense) ; jargon comptable invisible (l'utilisateur
voit « vente », pas « débit 571 ») ; caisse en 2-3 taps + reçu immédiat ; offline transparent
(indicateur réseau + file à synchroniser, jamais de blocage) ; terminologie adaptée au secteur ;
payloads légers (coût data mobile CEMAC).

## D13 — 1 base par entreprise = Durable Object SQLite par entreprise (2026-09-01)
Réalisation de la bascule sharding (D11), demandée maintenant. Sur Cloudflare, « une base par
entreprise » se fait nativement avec **un Durable Object par entreprise, chacun avec son propre
SQLite embarqué** (`ctx.storage.sql`) — D1 est lui-même bâti sur ce mécanisme.
- **Control plane (D1 global unique)** : auth (user/session/account/verification), `utilisateur`,
  `entreprise` (registre), `membre_entreprise`. Données transverses par nature.
- **Données de l'entreprise (DO `EntrepriseDO`, 1 par entreprise)** : exercice, plan comptable,
  modules, tiers, ventes, écritures, factures, stock, commandes… `idFromName(entrepriseId)`.
- **Bénéfices** : isolation **physique** (plus de `WHERE entreprise_id` oubliable) ; écritures
  **sérialisées par entreprise** (numérotation facture gap-less native, sans verrou global) ;
  scale horizontal automatique vers ~100k.
- La colonne `entreprise_id` disparaît des tables tenant (redondante : le DO EST la frontière).
- `TenantDb` (couture applicative) est retirée : remplacée par la frontière physique du DO.

## D14 — Validation ONECCA des 8 points ouverts (2026-09-03)
Réponses transmises par le porteur du projet, basées sur le SYSCOHADA révisé, le CGI camerounais
et les pratiques DGI/ONECCA. Détail complet : `docs/reference/09-validations-onecca.md`.
Résumé des actions :
- **Correctif appliqué** : sous-comptes Mobile Money — MTN MoMo et Orange Money partagent le même
  compte racine **552** (subdivisé en `5521`/`5522`), pas deux comptes racine distincts comme
  précédemment modélisé (`552` vs `553` — `553` est en réalité « carte péage », sans rapport).
- **Correctif à appliquer** : le reçu de caisse doit porter le NIU du vendeur (mention minimale
  confirmée) — absent aujourd'hui de `EntrepriseResume` et du reçu généré par `Caisse.tsx`.
- **Confirmé déjà conforme, aucun changement** : CAC 10 % sur l'IGS (`igs.ts`), minimum de
  perception IS 2 %/2,2 % (`is.ts`, pas encore branché à une route), secteurs toujours au Réel
  (`regime.ts`), CMP comme méthode de valorisation stock, facture PDF (NIU + numérotation +
  HT/TVA/TTC).
- **Comptes réservés pour une implémentation future** (rien à construire immédiatement) : RRR
  609/709, escomptes 673/773, frais Mobile Money 6312, écarts 658/758/47, compte 890 pour
  l'écriture d'à-nouveau à la clôture.

## D15 — Sauvegarde des Durable Objects : snapshot logique, restauration manuelle non self-service (2026-09-03)
Risque n°1 identifié par l'audit du 2026-09-03 (`docs/AUDIT_2026-09-03.md`) : une entreprise = un
seul Durable Object, sans réplique Cloudflare native. Décisions de conception :
- **Snapshot logique (JSON), pas byte-à-byte** : `EntrepriseDO.exporterDonnees()` lit toutes les
  tables SQL + l'état clé/valeur (secteur, schema_version) et les sérialise. Plus portable qu'un
  dump binaire SQLite, et permet de restaurer même après un changement de schéma mineur.
- **Cron quotidien vers R2, rétention 30 jours glissants** (`services/sauvegarde.ts`,
  `wrangler.toml [triggers]`) — suffisant pour un incident détecté sous un mois ; pas de politique
  de rétention longue durée (archivage légal) pour l'instant, à revoir si la DGI l'exige.
- **Restauration volontairement non exposée en API self-service.** Ce MVP n'a pas de rôle
  super-admin (le « back-office admin Impact Tech » est explicitement Phase P2 — voir section
  « Décisions structurantes »), donc aucun rôle n'a l'autorité légitime pour restaurer une
  entreprise sans supervision. `importerDonnees()` existe et est testé (`test/sauvegarde.test.ts`,
  round-trip complet), mais reste un outil pour le porteur du projet, pas un bouton produit.
- **Garde-fou anti-écrasement avec deux exceptions documentées** : `importerDonnees()` refuse si
  une table métier de la cible n'est pas vide, sauf `compte_comptable` (pré-semée par la migration
  v9 — comptes Mobile Money) et `module` (pré-semée par la migration v3 — module « dépenses » actif
  par défaut), qui existent déjà dans tout DO neuf avant même `initialiser()`. `INSERT OR IGNORE`
  y absorbe le chevauchement sans le traiter comme une preuve de données vivantes.
- **`PRAGMA defer_foreign_keys = ON`** pendant la restauration : l'ordre des tables retourné par
  `sqlite_master` n'est pas garanti stable (les migrations v5/v6 ont recréé `vente`/
  `achat_fournisseur` sous un nom temporaire avant renommage, ce qui les repousse en fin d'ordre
  naturel) — reporter la vérification des clés étrangères à la fin de la transaction évite un tri
  topologique manuel des 20+ tables.
- **Écritures déjà validées réinsérées via le parcours normal** : `ecriture.statut = 'validee'`
  bloquerait l'insertion de ses `ligne_ecriture` (`trg_ligne_verrou`, même règle qu'en usage
  normal) — la restauration insère donc en `'brouillon'`, insère les lignes, puis revalide,
  exactement comme le reste de l'application.

## D16 — Cache TTL en mémoire d'isolate pour réduire la contention D1 (2026-09-03)
Point 7 de l'audit du 2026-09-03 : D1 interrogé 3 à 5 fois par requête métier (session
better-auth, résolution utilisateur, vérification tenant, rate-limit) avant même d'atteindre le
Durable Object shardé — contredit la stratégie de scalabilité par sharding à 100k utilisateurs
simultanés (D11). Décisions de conception :
- **Cache en mémoire d'isolate (`lib/cache-isolate.ts`), pas KV ni Cache API.** Pas de nouvelle
  ressource Cloudflare à provisionner, zéro changement de `wrangler.toml`, latence quasi nulle
  (pas d'appel réseau). Contrepartie assumée : *best-effort*, pas une garantie forte — un isolate
  froid repart à vide (dégradation propre, re-lecture D1), et il n'y a aucune coordination entre
  isolates. Le bénéfice réel dépend de la réutilisation d'isolates chauds sous charge soutenue —
  précisément le scénario visé (haute volumétrie), mais à re-mesurer une fois un trafic réel
  observable ; si le taux de succès du cache s'avère trop faible en production, KV (cohérence
  éventuelle, coordonné entre isolates) est l'étape suivante logique.
- **TTL différencié par sensibilité** : profil utilisateur (`auth_id → utilisateur.id`, 5 min — ne
  change jamais une fois créé) vs rôle dans une entreprise (30s — peut changer, et un accès révoqué
  doit cesser de fonctionner dans un délai raisonnable).
- **Invalidation ciblée à la mutation**, pas seulement le TTL : ajout/retrait/changement de rôle
  d'un membre (`routes/entreprises.ts`) invalide immédiatement l'entrée concernée, pour qu'un
  accès révoqué cesse tout de suite plutôt que d'attendre 30s. Testé (`test/cache-role.test.ts`).
- **Jamais utilisé pour une donnée où l'incohérence inter-isolate serait dangereuse** (paiement,
  écriture comptable) — ces opérations passent exclusivement par le Durable Object, jamais par ce
  cache. Le cache ne couvre que des lectures d'autorisation à faible enjeu et forte volumétrie.
- Le `getSession()` de better-auth lui-même n'est PAS mis en cache par-dessus (risque de rejouer
  une session expirée/révoquée par better-auth) — seule la résolution du profil métier qui en
  découle l'est.

## Décisions ouvertes (restantes)
- Décompte exact des « 2 ans » de maintien de régime (exercices civils vs glissants).
