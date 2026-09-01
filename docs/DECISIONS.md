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

## Décisions ouvertes (à trancher / valider ONECCA)
- **Bascule sharding** : quand et comment passer à une D1 par entreprise + DO (seuil de volume).
- Décompte exact des « 2 ans » de maintien de régime (exercices civils vs glissants).
- Base précise du minimum de perception IS (2 % de quoi).
- Mentions minimales d'un reçu de caisse (vs facture normalisée).
- Acceptabilité de l'inventaire permanent pour une TPE au SMT (sinon repli intermittent).
