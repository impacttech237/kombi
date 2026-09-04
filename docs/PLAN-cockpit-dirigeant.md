# Plan de dev — Cockpit dirigeant

Suite au repositionnement discuté avec le DG (2026-09-04, voir [DECISIONS.md D18](DECISIONS.md)) :
Kombi ne doit pas se présenter comme un carnet numérique, mais comme l'outil qui **transforme la
gestion quotidienne en visibilité et en décisions**. Ce document scope ce qui est réellement
construit maintenant, par opposition à la vision complète discutée (beaucoup plus large — budgets,
prévisions, intégrations bancaires, segmentation par métier, reporting automatisé...).

## Principe de tri

Un item entre en Phase 1 seulement s'il coche les trois cases :
1. **Aucune nouvelle saisie utilisateur** — calculé à partir de données déjà en base.
2. **Aucune prédiction** — des faits et des calculs, jamais une projection ou une recommandation
   dont on ne peut pas garantir l'exactitude (voir [DECISIONS.md D18](DECISIONS.md) sur le risque
   des prévisions pour ce segment).
3. **Réutilise l'existant** — `enRetard` (factures/ventes/achats), `cout_unitaire` par ligne de
   vente, notifications actives, marge cumulée... tout ça existe déjà, il manque l'agrégation et
   l'écran.

## Phase 1 — Cockpit (cette itération)

### Backend
- `comparaisonMensuelle()` — CA, marge, dépenses, résultat du mois civil courant vs mois
  précédent, avec variation en % et détail des 3 catégories de dépenses qui varient le plus.
- `margeParProduit()` — CA HT, coût, marge, % marge par produit sur l'exercice ouvert (déjà
  presque identique à `meilleuresVentes()`, ajoute juste le coût).
- `alertesPilotage()` — consolide en un seul appel :
  - créances en retard (déjà calculé dans `listerFacturesImpayees`/`listerVentesACredit`)
  - dettes fournisseurs en retard (déjà calculé dans `listerDettesFournisseurs`)
  - dépenses du mois anormalement hautes par catégorie (vs moyenne des 3 mois précédents)
  - ventes conclues sous le coût de revient (`prix_unitaire < cout_unitaire` sur une ligne de
    vente du mois courant) — jamais bloqué à la vente (la survente reste volontairement non
    bloquante, voir `survente.test.ts`), seulement signalé après coup
- `cockpit()` — agrège tout ce qui précède + `soldesTresorerie()` + `margeCumulee()` en un seul
  appel réseau, pour le nouveau bloc du Dashboard.
- Route `GET /api/pilotage/cockpit` et `GET /api/pilotage/marge-produits`, gardées par
  `compta:read` (même permission qu'États financiers / Pièces justificatives — gérant/comptable/
  admin, pas caissier/employé).

### Frontend
- Dashboard : nouveau bloc "Ce mois-ci vs le mois dernier" (CA/marge/dépenses avec variation et
  cause quand c'est une dépense) + nouveau bloc "À surveiller" (liste d'alertes, chacune avec sa
  gravité et une phrase d'explication — pas juste un chiffre nu).
- Nouvel écran **Rentabilité** (Menu → Administration, à côté de Comptabilité) : table complète
  marge par produit, triée par marge décroissante.

### Explicitement laissé de côté pour cette itération
Stock dormant (nécessite de définir un seuil de jours sans vente — à valider avec un vrai usage
avant de coder un critère arbitraire), concentration du CA par client, incohérences comptables
automatisées. Candidats naturels pour une Phase 1.5 une fois le cockpit lui-même en production.

## Backlog explicite (hors scope, pas oublié — juste pas maintenant)

| Idée | Pourquoi pas maintenant |
|---|---|
| Prévisions de trésorerie 30/60/90j, simulateur "et si..." | Risque de se tromper avec assurance sur un segment à trésorerie irrégulière — voir D18. Revisiter avec du vrai usage pour calibrer. |
| Budgets/objectifs par catégorie, vendeur, agence | Nécessite une nouvelle saisie (l'utilisateur doit définir ses objectifs) — Phase 2 possible après le cockpit. |
| Synthèse narrative en langage naturel (LLM) | Séduisant mais doit être strictement groundé sur les chiffres calculés (jamais laisser un modèle inventer une donnée) — vrai chantier d'ingénierie, pas un ajout léger. |
| Reporting PDF/Excel/WhatsApp automatisé | A du sens une fois le cockpit validé, pas avant. |
| Segmentation par métier (BTP, restauration, multi-agences...) | Le produit vise déjà commerce/service ; se disperser sur 6 verticaux avant d'avoir validé les deux premiers est prématuré. |
| Imports bancaires / Mobile Money / TPE / paie / télédéclaration | Chaque intégration est un projet à part (partenariats, API tierces, conformité) — pas réaliste sans utilisateurs actifs qui le réclament. |
| Interdiction des stocks négatifs | Contredit une décision produit déjà prise et testée (survente volontairement non bloquante). Rejeté, pas juste reporté. |
