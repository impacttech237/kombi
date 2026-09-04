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

## D17 — Bascule IGS↔Réel : persistée, réévaluée une fois par exercice, pas de cron de clôture (2026-09-03)
Point 3 de l'audit fiscal du 2026-09-03 : `determinerRegime()` (correcte, testée dans
`packages/fiscal`) n'était jamais appelée avec `regimePrecedent`/`ansSousSeuil` côté API — la
règle de maintien 2 ans (CGI Art. 93 quinquies) ne s'appliquait donc jamais. Décisions :
- **Le régime se décide sur le CA de l'exercice CLOS précédent**, pas sur le CA en cours
  d'accumulation de l'exercice courant (celui déjà affiché en direct dans `caCumule`/le
  dashboard). Nouvelle méthode DO `caCumuleAnnee(annee)` pour lire le CA d'un exercice précis.
- **Réévaluation lazy, une fois par année civile**, marquée par la nouvelle colonne
  `entreprise.regime_annee_maj` — pas à chaque requête (le régime légal ne change pas en cours
  d'année). Déclenchée au premier appel de l'année à `GET /api/fiscalite/igs`, sur le même motif
  que la création paresseuse d'exercice (`exercicePourAnnee`).
- **Pas de cron de clôture d'exercice dédié.** Une vraie « clôture » (à-nouveaux, verrouillage de
  l'exercice précédent) est une fonctionnalité distincte, encore à construire (`docs/parcours.md`
  § États financiers). Ce correctif se limite à ce que l'audit a identifié : rendre la bascule
  réellement effective, pas construire la clôture complète. Limite acceptée : si personne ne
  consulte l'écran fiscalité pendant toute une année, la bascule de cette année-là ne se
  déclenche qu'au prochain appel (rattrapage automatique dès qu'il a lieu, aucune donnée perdue).
- **`ansSousSeuil` remis à 0 dans deux cas distincts** : bascule effective en IGS (maintien
  épuisé) OU CA repassé solidement au-dessus du seuil (Réel de plein droit, plus besoin de
  maintien). Les deux sont sémantiquement différents mais aboutissent au même compteur à 0.

## D18 — Repositionnement : Kombi vend le pilotage, la gestion reste le moteur invisible (2026-09-04)
Échange avec le DG : « outil de gestion » décrit ce que fait Kombi, pas la valeur qu'il apporte.
Le vrai besoin d'un dirigeant n'est pas d'enregistrer une vente, c'est de savoir où en est son
entreprise et quoi faire. Décisions :
- **Positionnement** : Kombi transforme les opérations quotidiennes (ventes, dépenses, stock,
  créances) en visibilité et en décisions — pas juste un carnet numérique.
- **Ce n'est pas un changement d'architecture** : la chaîne reste gestion → données fiables →
  indicateurs → décisions. La gestion (saisie quotidienne) demeure le point d'entrée et le seul
  moyen de nourrir le cockpit — un cockpit ne peut rien montrer sans données, donc l'acquisition
  (comment on fait ouvrir l'appli le jour 1) reste centrée sur la gestion, même si le discours de
  vente met en avant le pilotage.
- **Périmètre volontairement restreint pour cette itération** (voir
  [PLAN-cockpit-dirigeant.md](PLAN-cockpit-dirigeant.md)) : seuls les indicateurs calculables à
  partir de données déjà saisies, sans aucune prédiction. Explicitement écarté pour l'instant :
  prévisions de trésorerie et simulateurs — sur un segment à trésorerie irrégulière (PME
  informelles/semi-formelles CEMAC), un chiffre prédit et faux détruit la confiance plus vite
  qu'un chiffre constaté n'en construit. À revisiter une fois qu'on a du vrai usage pour calibrer.
- **La survente reste volontairement non bloquante** (décision antérieure, testée) — la
  proposition d'« interdire les stocks négatifs » du DG est rejetée, pas juste reportée : elle
  contredirait un choix produit déjà pris. Une vente en survente devient une alerte a posteriori,
  pas un blocage a priori.

## D19 — Cookie cache better-auth activé : le vrai goulot d'étranglement à l'échelle n'était pas le DO, c'était D1 (2026-09-04)
Audit de scalabilité demandé (« 10k utilisateurs connectés en même temps, ultra fluide »). Le
DO par entreprise (D13) isole bien chaque PME et scale horizontalement comme prévu — **ce n'est
pas** le point faible. Le vrai point faible : `authentifier` (middleware/auth.ts) appelait
`auth.api.getSession()` sans le cookie cache de better-auth activé → **chaque requête
authentifiée** (page vue, clic, appel API) lisait la table `session` de **D1**, la seule base
NON shardée du système (control-plane partagé). Les caches déjà en place (rôle 30s, profil
5 min, voir D16) protègent la DEUXIÈME et la TROISIÈME lecture D1 par requête, pas la première.
- **Activé `session.cookieCache`** (`auth/auth.ts`), `maxAge: 60` — la session se valide depuis
  un cookie signé tant qu'il n'a pas expiré, sans lecture D1. Vérifié en direct (curl) : le
  cookie `better-auth.session_data` est bien émis avec `Max-Age=60`, et une requête authentifiée
  ultérieure fonctionne normalement.
- **`maxAge` volontairement court** (même ordre de grandeur que le cache de rôle 30s, D16) : un
  compte désactivé/une session révoquée reste valide au plus 60s après coup — compromis assumé
  entre charge D1 et fraîcheur de la révocation, pas une négligence.
- **Toujours pas de test de charge réel.** Cette correction lève le goulot le plus évident
  identifié par lecture de code, mais « tient à 10k utilisateurs » reste une hypothèse de
  conception tant qu'un vrai test de charge n'a pas été fait (toujours ⬜ dans `docs/parcours.md`).
- **Secondaire, non traité** : `listerTiers`/`listerProduits`/`listerFactures`/`listerDepenses`
  n'ont pas de pagination — sans impact au volume de données actuel d'une PME, mais à surveiller
  pour une entreprise très active après plusieurs années. Pas de D1 read replicas configurés
  non plus (`wrangler.toml`) — à envisager si D1 redevient un point chaud malgré le cache.

## D20 — Rapports & Analyses, À décider, Budgets/Prévisions, Dépenses enrichies (2026-09-04)
Suite à l'audit de la vision « pilotage » du dirigeant, quatre lacunes demandées en bloc, dans
un seul commit/push :
1. **Module Rapports & Analyses** (`/api/rapports`, page `Rapports.tsx`) : rapports
   mensuel/trimestriel/annuel/comparaison, réutilisant `analyseDepenses`,
   `margeParProduit`/`margeParClient`/`delaiMoyenPaiement` — ces trois dernières généralisées
   pour accepter une période optionnelle (comportement par défaut inchangé pour le cockpit).
2. **Page « À décider »** (`problemesPrioritaires()`, `/api/decisions`, page `ADecider.tsx`) :
   synthèse quotidienne des 3 problèmes au plus fort impact financier (créances/dettes en
   retard, dépense anormale, vente à perte, dépassement de budget, trésorerie prévisionnelle
   négative), avec cause, urgence et action suggérée — bannière compacte sur le Dashboard.
   Réservée `decision:read` (admin/gérant uniquement, pas comptable/caissier).
3. **Budgets & prévisions** (`budget_mensuel`, `/api/budgets`, onglet « Budgets » dans
   Comptabilité) — module entièrement nouveau (aucune table n'existait) : objectifs du mois (CA
   cible, plafond dépenses, marge cible), prévision de trésorerie à 30/60/90 j (à partir des
   échéances déjà connues + moyenne des dépenses récurrentes — pas un modèle statistique),
   seuil de rentabilité, simulations « et si » (baisse de ventes, recrutement/investissement)
   calculées à la volée, sans état persisté.
4. **Dépenses enrichies** (`analyseDepenses()`, onglet « Analyse » dans `Depenses.tsx`, fiche
   détail complétée) : répartition par catégorie, évolution 6 mois, comparaison au budget,
   postes en hausse, récurrentes, top fournisseurs, dépenses inhabituelles, sans justificatif,
   par agence. Colonnes ajoutées à `depense` (migration v17) : `agence` (texte libre — pas un
   module « projet » à part entière, hors scope) et `cree_par` (résolu en nom via
   `listerMembres`, déjà utilisé par l'écran Équipe — pas de jointure côté DO, qui ne connaît
   pas les comptes utilisateurs, gérés en D1).
- **Export « Excel » = CSV** (UTF-8 + BOM), pas un vrai `.xlsx` : aucune lib xlsx/exceljs dans
  le repo, et Cloudflare Workers n'a pas l'environnement Node dont ces libs ont souvent besoin.
  Le CSV s'ouvre nativement dans Excel/Sheets sans dépendance supplémentaire. Le PDF réutilise
  le pattern `pdf-lib` déjà en place pour les factures (`apps/api/src/pdf/rapport-pdf.ts`).
- Nouvelles permissions : `rapport:read`, `budget:read`, `budget:manage`, `decision:read` —
  grants détaillés dans `packages/shared/src/authz.ts`.
- Migrations DO v17 (`depense.agence`/`cree_par`) et v18 (`budget_mensuel`), suivant le pattern
  recreate-don't-rename documenté dans `schema.ts` pour v17 (table référencée par rien, mais
  gardée cohérente avec le pattern existant par prudence).

## D21 — Correctifs de la première revue QA du cockpit pilotage (2026-09-04)
Retour testeur sur D20 (7 points), dont deux qui touchent des décisions déjà actées :
- **Survente bloquée en caisse — révise D18.** D18 disait « la survente reste volontairement
  non bloquante », rejetée pas juste reportée. Le testeur a signalé qu'un panier de 12 sacs pour
  un stock de 10 laissait quand même « Encaisser » actif, et a demandé de bloquer. **Décision
  explicitement redemandée et confirmée au dirigeant avant de coder** (pas une réinterprétation
  silencieuse d'une décision déjà actée) : `Caisse.tsx` bloque désormais l'ajout au-delà du stock
  (bouton produit désactivé, `+` désactivé une fois le stock atteint) et l'encaissement. **Le
  blocage reste côté UI uniquement** — `enregistrerVente` (DO) n'est PAS touché : il reste
  volontairement non bloquant côté serveur, pour deux raisons qui n'ont rien à voir avec le
  souhait du dirigeant : (1) la synchronisation offline rejoue des ventes créées hors-ligne
  contre un stock qui a pu changer entre-temps — les rejeter après coup casserait la promesse
  offline-first ; (2) la valorisation du CMV sur la quantité réellement vendue (pas tronquée au
  stock affiché, voir commentaire `enregistrerVente`) dépend de ce chemin non bloquant et a sa
  propre justification comptable. Un utilisateur qui contourne l'UI (appel API direct) peut
  toujours survendre — accepté comme limite connue, pas un oubli.
- **Remise ≥ 100 % bloquait déjà mathématiquement le total à 0, mais laissait « Encaisser 0
  FCFA » actif** — le vrai bug n'était pas l'absence de borne (déjà présente, `Math.min(100,
  ...)`) mais l'absence de blocage d'une vente à 0 FCFA. `canConfirm` refuse maintenant un total
  nul ; la saisie du % de remise est en plus bornée dès la frappe (l'utilisateur ne voit jamais
  « 150 » s'afficher).
- **Période comparative fausse (durée en jours au lieu d'un décalage calendaire)** —
  `periodePrecedente` (Rapports.tsx) soustrayait la durée en millisecondes de la période
  courante, ce qui décale d'un jour dès qu'un mois de longueur différente est impliqué. Remplacé
  par une arithmétique entière sur (année, mois), jamais de `Date.setMonth`/soustraction de
  durée.
- **Rapport annuel : évolution des dépenses tronquée à 6 mois, mois futurs inclus** —
  `analyseDepenses` calculait toujours les 6 mois trainants avant `fin`, y compris pour un
  rapport annuel (`fin` = 1er janvier suivant → juillet-décembre de l'année, pas janvier-juin).
  `moisEvolution` est maintenant un paramètre (6 par défaut, 12 pour un rapport annuel).
- **Cause d'alerte trésorerie fausse quand rien n'est prévu** — l'alerte affirmait
  systématiquement « décaissements attendus supérieurs aux encaissements attendus », y compris
  quand les deux valent 0 (trésorerie déjà négative, sans aucun mouvement à venir dans
  l'horizon). `problemesPrioritaires` distingue maintenant : déjà négative sans mouvement prévu ;
  déjà négative avec mouvements prévus ; deviendrait négative (sorties > entrées, mathématiquement
  le seul cas possible quand le solde actuel est positif).
- **Recommandation « anticiper la trésorerie » ouvrait Comptabilité > États** — sans moyen
  d'atteindre l'onglet Budgets (prévisions/simulations) depuis là. Nouveau code de navigation
  interne `compta-budgets` (pas dans le menu, atteint uniquement via une action « À décider ») ;
  `Comptabilite` accepte une prop `vueInitiale`.
- **Sélection de période dans Rapports** — jusqu'ici toujours calée sur aujourd'hui. Ajout d'une
  navigation (mois via `<input type="month">`, trimestre/année via précédent/suivant) + retour
  rapide à la période courante. Plage personnalisée et filtre par agence/projet/activité restent
  hors scope de ce correctif (demandés par le testeur en P2, pas urgents).
- **« Disponible aujourd'hui » pouvait afficher un montant négatif** — libellé et couleur du
  Dashboard changent automatiquement en « Découvert de trésorerie » (rouge) quand le solde total
  est négatif.
- **Non traité dans ce correctif** (P2, hors urgence) : drill-down cliquable sur une catégorie de
  dépense (transactions/justificatifs/utilisateur/fournisseur/écriture liés), filtre agence/
  projet/activité dans Rapports. Voir le retour testeur complet pour le détail.

## Décisions ouvertes (restantes)
- Décompte exact des « 2 ans » de maintien de régime (exercices civils vs glissants).
