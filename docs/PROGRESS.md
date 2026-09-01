# Kombi — Suivi d'avancement

> Mis à jour au fil du développement. Une case cochée = fait **et vérifié** (tests/typecheck/migration).

## Légende
- ✅ fait et vérifié · 🚧 en cours · ⬜ à faire

## Socle
| État | Élément | Vérification |
|---|---|---|
| ✅ | Monorepo pnpm + Turborepo | `pnpm build` |
| ✅ | Package `@kombi/shared` (enums, money, modules) | typecheck |
| ✅ | Source de vérité réglementaire `docs/reference/` (8 fiches, citées) | revue |
| ✅ | Moteur `@kombi/fiscal` (IGS, régimes, TVA, IS) | 39 tests |
| ✅ | Moteur `@kombi/comptable` (écritures partie double + CMP) | 8 tests |
| ✅ | Config modulaire par secteur (registre + presets + gating) | 5 tests |
| ✅ | Schéma D1 complet + triggers d'intégrité (débit=crédit) | migrations 0001+0002 appliquées, trigger prouvé |
| ✅ | Squelette API Hono + middleware tenant + requireModule | typecheck |
| ✅ | Service onboarding sectoriel (`planCreationEntreprise`) | typecheck |
| ✅ | PWA shell + file de mutations offline (Dexie) + synchro idempotente | typecheck |

**Total tests : 52 verts.**

## Modules de gestion (à implémenter)
| État | Étape | Description |
|---|---|---|
| ⬜ | 1 | Auth (better-auth) + onboarding réel (écran choix secteur) + **test d'isolation multi-entreprises** |
| ⬜ | 2 | Tiers (clients/fournisseurs) + historique |
| ⬜ | 3 | Ventes & caisse → reçu/facture + écriture auto (+ mouvement stock si actif) |
| ⬜ | 4 | Stock (gated) : produits, mouvements, alertes seuil, achats fournisseurs (CMP) |
| ⬜ | 5 | Facturation/devis : numérotation `NOM-FAC-2026-0001`, PDF, envoi WhatsApp/email |
| ⬜ | 6 | Commandes/missions : statuts, libellé sectoriel |
| ⬜ | 7 | Offline complet sur le parcours vente/caisse |
| ⬜ | 8 | Écrans couche invisible : IGS, bilan, compte de résultat |

## Infra / déploiement
| État | Élément |
|---|---|
| 🚧 | Ressources Cloudflare (D1 `kombi-db`, R2 `kombi-documents`, Pages `kombi`) |
| 🚧 | Dépôt GitHub `impacttech237/kombi` |
| ⬜ | CI GitHub Actions (test + typecheck + deploy) |

## Hors périmètre (rappel)
Paie/CNPS (pas de schéma RH complexe), IA conversationnelle, OCR, scoring, connecteur DGI,
mobile money comme moyen d'encaissement de l'abonnement.
