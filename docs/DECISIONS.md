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

## Décisions ouvertes (restantes)
- Décompte exact des « 2 ans » de maintien de régime (exercices civils vs glissants).
