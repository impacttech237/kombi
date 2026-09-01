# Kombi — l'ami de la gestion d'entreprise pour PME (zone CEMAC)

Conforme au référentiel **SYSCOHADA révisé** et à la **fiscalité camerounaise** (IGS, régime du
Réel, TVA, DSF). Architecture **100 % Cloudflare**, **offline-first**.

## Stack
| Couche | Technologie |
|---|---|
| Frontend | React PWA + Service Workers → **Cloudflare Pages** |
| Backend | **Hono** sur **Cloudflare Workers** (API REST) |
| Base de données | **Cloudflare D1** (SQLite) |
| Fichiers (PDF) | **Cloudflare R2** |
| Auth | better-auth (à intégrer) |
| IA vectorielle (post-MVP) | Cloudflare Vectorize |

## Structure (monorepo pnpm + Turborepo)
```
apps/
  api/          Hono/Workers — routes, middleware tenant, migrations D1
  web/          React PWA — offline queue (Dexie), synchro
packages/
  shared/       Enums, types, argent (FCFA), source de vérité front/back
  fiscal/       Moteur fiscal PUR (IGS, régimes, TVA, IS) + tests   ← cœur réglementaire
  comptable/    Plan comptable OHADA + génération d'écritures partie double
docs/reference/ Règles fiscales/comptables extraites des TEXTES OFFICIELS (source de vérité)
```

## Principe : on n'invente rien
Toute constante fiscale/comptable provient d'un texte officiel cité dans
[`docs/reference/`](docs/reference/00-index.md) (CGI 2026, SYSCOHADA). Toute règle de calcul
fiscal/social doit être **validée ONECCA avant production**.

## Démarrage
```bash
pnpm install
pnpm test          # 43 tests (moteur fiscal + comptable)
pnpm typecheck
```

### API (Workers + D1)
```bash
cd apps/api
wrangler d1 create compta_db                 # coller le database_id dans wrangler.toml
pnpm db:migrate:local                         # applique le schéma en local
pnpm dev                                      # http://localhost:8787
```

### Web (PWA)
```bash
cd apps/web
pnpm dev                                      # http://localhost:5173
```

## Produit modulaire par secteur
Outil de **gestion quotidienne** (ventes, stock, commandes) dont la compta/fiscalité découle
automatiquement. Configuration par secteur (`commerce` / `service` / `mixte`) : registre de modules
typé (`packages/shared/modules.ts`) + table `module_entreprise` + gating API/UI. Ajouter un module
futur ne touche pas le cœur. Voir [docs/reference/07](docs/reference/07-ventes-facturation.md) (vente≠facture)
et [08](docs/reference/08-stock-inventaire-permanent.md) (inventaire permanent + CMP).

## État d'avancement
- [x] Source de vérité extraite/vérifiée (IGS, régimes, TVA, IS, plan OHADA, systèmes, vente/facture, stock)
- [x] Moteur fiscal `packages/fiscal` + 39 tests (barème IGS conforme CGI Art. C40)
- [x] `packages/comptable` : écritures partie double + CMP (inventaire permanent) + tests
- [x] Config modulaire par secteur (registre typé + presets + gating) + tests
- [x] Schéma D1 complet (config + gestion) + triggers d'intégrité vérifiés ; onboarding sectoriel
- [x] PWA shell + file de mutations hors-ligne + synchro idempotente
- [ ] Auth better-auth · Ventes/caisse · Stock · Facturation · Commandes · États financiers

**52 tests verts. `pnpm test` / `pnpm typecheck`.**
