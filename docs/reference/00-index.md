# Référence réglementaire — source de vérité

Ce dossier contient les **règles fiscales et comptables extraites des textes officiels**,
avec citation de l'article source. Les moteurs `packages/fiscal` et `packages/comptable`
doivent implémenter **exactement** ces règles — aucune valeur codée en dur ailleurs.

## Règle d'or
> On n'invente rien. Toute constante fiscale/comptable (taux, seuil, barème) provient d'un
> texte cité ici. Toute règle touchant au calcul fiscal ou social doit être **validée par
> l'expert-comptable ONECCA avant mise en production** (cf. cahier des charges §1.2).

## Textes sources (dossier racine du projet)
| Fichier | Contenu | Usage MVP |
|---|---|---|
| `CGI 2026.pdf` | Code Général des Impôts Cameroun (éd. 2025/2026) | IGS, TVA, IS, régimes ✅ |
| `Guide-d-application-du-SYSCOHADA.pdf` | Plan comptable OHADA, écritures, états financiers | Compta, bilan, CR ✅ |
| `Nouvel acte uniforme OHADA Droit comptable.pdf` | Cadre légal comptable OHADA révisé | Systèmes (normal/minimal), obligations |
| `DROIT_COMPTABLE.pdf` | Synthèse droit comptable | Complément |
| `Acte uniforme ... Sociétés Commerciales et GIE.pdf` | Formes juridiques | Profil entreprise |
| `Acte uniforme ... Recouvrement et Voies d'Exécution.pdf` | Recouvrement de créances | Relances factures (post-MVP) |
| `SYSCEBNL.pdf` | Comptabilité des entités à but non lucratif | ❌ hors périmètre PME |

## Fichiers de règles
- [01-regimes-imposition.md](01-regimes-imposition.md) — détermination du régime (IGS / Réel), seuils, règle de maintien 2 ans
- [02-igs.md](02-igs.md) — barème IGS, CGA, CAC, périodicité
- [03-tva.md](03-tva.md) — taux TVA, champ d'application, retenue à la source
- [04-is.md](04-is.md) — impôt sur les sociétés (régime du Réel)
- [05-plan-comptable-ohada.md](05-plan-comptable-ohada.md) — 8 classes, comptes MVP, génération d'écritures
- [06-etats-financiers.md](06-etats-financiers.md) — Système Normal / SMT (le « allégé » n'existe plus), seuils
- [07-ventes-facturation.md](07-ventes-facturation.md) — vente ≠ facture (CGI Art. 150), numérotation
- [08-stock-inventaire-permanent.md](08-stock-inventaire-permanent.md) — inventaire permanent, CMP, comptes 31/601/6031

## Discipline de maintenance
- Chaque règle porte : **valeur + article source + date de validité**.
- À **chaque loi de finances annuelle**, réviser ce dossier avant tout le reste.
- Les tests de `packages/fiscal` référencent le numéro d'article dans leur description.
