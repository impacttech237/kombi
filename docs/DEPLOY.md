# Déploiement & CI — Kombi

## En ligne
**https://kombi-api.impacttech237.workers.dev** — un seul Worker Cloudflare sert l'API (Hono),
la PWA (React, même origine) et héberge les Durable Objects (1 base SQLite par entreprise).

## CI/CD (GitHub Actions)
Workflow : [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- **Sur chaque push / pull request** → `pnpm -r typecheck` + `pnpm -r test` (75 tests).
- **Sur push vers `main`** (après succès des tests) → build de la PWA + `wrangler deploy`.

### ⚙️ À configurer UNE fois : le secret GitHub `CLOUDFLARE_API_TOKEN`
Le job de déploiement a besoin d'un jeton d'API Cloudflare. À faire par toi (jamais commité) :

1. **Créer le jeton Cloudflare** — https://dash.cloudflare.com/profile/api-tokens → *Create Token*
   → modèle **« Edit Cloudflare Workers »** (ou permissions : *Account · Workers Scripts · Edit*,
   *Account · Workers R2 Storage · Edit*, *Account · D1 · Edit*, *Account · Workers KV · Edit*).
   Restreindre au compte `Impacttech237@gmail.com`. Copier le jeton (affiché une seule fois).

2. **Ajouter le secret au dépôt GitHub** — repo `impacttech237/kombi` → *Settings* → *Secrets and
   variables* → *Actions* → *New repository secret* :
   - Name : `CLOUDFLARE_API_TOKEN`
   - Secret : (coller le jeton)

3. C'est tout. Le prochain push sur `main` déclenchera le déploiement automatique.
   (L'`account_id` est déjà dans le workflow ; les secrets d'auth du Worker —
   `BETTER_AUTH_SECRET/URL/TRUSTED_ORIGINS` — sont stockés côté Cloudflare et persistent.)

## Déploiement manuel (sans CI)
```bash
pnpm --filter @kombi/web build
cd apps/api && npx wrangler deploy
```

## Secrets du Worker (déjà configurés en prod)
`BETTER_AUTH_SECRET` (aléatoire), `BETTER_AUTH_URL` et `BETTER_AUTH_TRUSTED_ORIGINS`
(= l'URL du Worker). Pour les (re)définir : `npx wrangler secret put <NOM>` depuis `apps/api`.

## Base de données (migrations D1 — control plane)
```bash
cd apps/api && npx wrangler d1 migrations apply kombi-db --remote
```
Les données métier vivent dans les Durable Objects (schéma créé à la volée, pas de migration).
