# Kombi — Parcours de développement (tracklist)

Backlog granulaire de **tout ce qui reste à faire** pour le MVP, puis pistes V1+.
Cocher au fur et à mesure. Voir aussi [PROGRESS.md](PROGRESS.md) (vue synthétique) et
[DECISIONS.md](DECISIONS.md) (décisions).

Légende : ⬜ à faire · 🚧 en cours · ✅ fait · 🔒 bloqué (dépendance) · ⚖️ à valider ONECCA/juriste

---

## Déjà fait (rappel)
- ✅ Monorepo, `@kombi/shared`, `@kombi/fiscal` (52 tests), `@kombi/comptable`, config modulaire
- ✅ Schéma D1 (0001 + 0002) + triggers d'intégrité · API Hono (tenant + requireModule) · onboarding sectoriel
- ✅ PWA shell + file offline (Dexie) + synchro · docs/reference (8 fiches) · Cloudflare (D1/R2/Pages) · GitHub

---

## Contraintes non-fonctionnelles (permanentes — voir DECISIONS D11/D12)
### Scale — concevoir pour ~100k utilisateurs simultanés (shard = entreprise)
- ✅ **1 base par entreprise** : Durable Object SQLite par entreprise (`EntrepriseDO`) — isolation
  PHYSIQUE (test A≠B vérifié), écritures sérialisées par entreprise, scale horizontal (D13)
- ✅ **Control plane** séparé (D1 : auth + registre entreprises + appartenances)
- ✅ **Pas de compteur global** : numérotation facture dans le DO de l'entreprise (sérialisée nativement)
- ⬜ **Cache lecture** : barème IGS / référentiels en KV ou Cache API (à l'échelle)
- ⬜ **Payloads légers** + pagination systématique
- ⬜ Test de charge avant montée en charge (pas au MVP)
- ⬜ Déploiement : re-déployer le Worker (DO) + nettoyer les tables tenant obsolètes de la D1 distante

### UX — simple, fluide, mobile-first (user friendly)
- ⬜ Mobile-first, **gros boutons** (usage terrain au doigt), nav à une main
- ⬜ **Saisie < 3 champs** pour vente/dépense ; jargon comptable **invisible**
- ⬜ Caisse en **2-3 taps** + reçu immédiat
- ⬜ **Offline transparent** : indicateur réseau + « N à synchroniser », jamais de blocage
- ⬜ Terminologie adaptée au secteur (commande/mission, produit/prestation)
- ⬜ États de chargement/erreur clairs, non techniques

## Transverse (à cadrer tôt, impacte toutes les étapes)
- ⬜ **Conventions API** : format d'erreur unifié, pagination, codes HTTP, enveloppe de réponse
- ⬜ **Validation** : schémas Zod partagés (`@kombi/shared`) pour chaque DTO entrée/sortie
- ⬜ **Helper D1** : wrapper requêtes (binding auto `entreprise_id`), gestion transactions/batch
- ⬜ **Idempotence** : middleware lisant `idempotency-key` → dédup sur `client_uuid` (write routes)
- ⬜ **Terminologie** : hook front `useTerminologie(secteur)` (commande/mission, produit/prestation)
- ⬜ **Design system léger** : composants UI (bouton, champ, liste, modale) pensés mobile-first / gros doigts
- ⬜ **i18n** : français par défaut ; prévoir la structure (pas de traduction au MVP)
- ⬜ **Journal d'audit** : table `audit_log` (qui a fait quoi) — utile compta/fiscal
- ⬜ **Seed de démo** : entreprise fictive par secteur pour tests manuels

---

## Étape 1 — Authentification & multi-entreprises 🚧 (backend fait, front à faire)
- ✅ Intégrer **better-auth** sur D1 (Kysely/D1) — email + mot de passe
- ✅ Migration D1 `0003_auth.sql` (tables better-auth, schéma dérivé de getAuthTables) + `utilisateur.auth_id`
- ✅ Inscription/connexion/session (vérifié end-to-end en test workerd)
- ✅ Middleware auth réel `authentifier` → pose `utilisateurId` (bridge auth→profil métier)
- ✅ Route `POST /api/entreprises` → `planCreationEntreprise` (batch D1 atomique) + `GET /api/entreprises`
- ✅ **Autorisation par rôle** : matrice `peut(role, permission)` (`@kombi/shared/authz`, testée)
- ✅ Couture de sharding `TenantDb` (filtre entreprise_id auto, whitelist anti-injection, testée)
- ✅ 🧪 **Test d'isolation multi-entreprises** : A ne lit jamais B (vérifié sur D1 réelle)
- ✅ 🧪 Tests : onboarding crée modules + plan comptable + exercice selon secteur (commerce≠service)
- ✅ Écran **onboarding** (front) : choix secteur (grandes cartes) + infos entreprise (NIU, nature)
- ✅ Sélecteur d'entreprise active (front, localStorage) + envoi `x-entreprise-id`
- ✅ Écrans connexion/inscription (front) branchés sur better-auth (design vert/blanc validé visuellement)
- ✅ Design system Kombi (thème vert/blanc, composants : Bouton, Champ, CarteStat, TopBar, BottomNav)
- ✅ Dashboard shell (cartes stats + IGS temps réel + nav pill) — style des modèles fournis
- ⬜ Gestion des membres : inviter un utilisateur, assigner rôle (route + écran)
- ⬜ Appliquer `requirePermission` sur les routes métier au fil des étapes
- **Critère d'acceptation** : ✅ backend — commerce a stock actif, service non, A≠B étanche, auth réelle.
  Reste le front (onboarding + login + sélecteur).

## Étape 2 — Tiers (clients & fournisseurs)
- ⬜ CRUD tiers (nom, type, NIU, téléphone, email, adresse)
- ⬜ Recherche/filtre rapide (mobile)
- ⬜ Historique des transactions d'un tiers (ventes, achats, factures, paiements)
- ⬜ Solde tiers (ce qu'il doit / ce qu'on lui doit)
- ⬜ 🧪 Tests CRUD + isolation

## Étape 3 — Ventes & caisse (cœur, point d'entrée terrain)
- ⬜ Générateur d'écriture de vente dans `@kombi/comptable` (produit + trésorerie + TVA si Réel)
- ⬜ Générateur écriture + **sortie de stock au CMP** si module stock actif (6031/311)
- ⬜ Route `POST /api/ventes` : crée vente + lignes + écriture (batch atomique) + mouvement stock
- ⬜ Écran caisse : ajout d'articles (produit ou ligne libre), quantité, total en direct
- ⬜ Choix mode de paiement (espèces / MTN MoMo / Orange Money / …)
- ⬜ Génération **reçu** (simple) — PDF léger ou vue imprimable
- ⬜ Bouton « émettre une facture » depuis une vente (→ Étape 5)
- ⬜ Annulation de vente (contre-passation d'écriture, jamais suppression)
- ⬜ 🧪 Tests : vente espèces → écriture équilibrée 571/701 ; vente stock → CMV correct + stock décrémenté
- **Critère** : une vente en caisse produit CA + écriture + (si stock) mouvement, hors-ligne compris.

## Étape 4 — Stock (module optionnel, gated)
- ⬜ CRUD produit (nom, SKU, unité, prix vente, seuil alerte)
- ⬜ Route `POST /api/achats` : achat fournisseur → entrée stock + **recalcul CMP** + écriture (601/311/6031/401)
- ⬜ Mouvements de stock (entrée/sortie/ajustement) + historique
- ⬜ **Alertes de rupture** (stock ≤ seuil) : liste + badge
- ⬜ Ajustement d'inventaire (écart → écriture)
- ⬜ Écran stock (liste produits, niveaux, alertes) — masqué si module off
- ⬜ 🧪 Tests : achat met à jour CMP ; requireModule bloque un service pur ; écritures stock équilibrées
- **Critère** : achat incrémente le stock au bon CMP ; vente le décrémente ; service pur n'a aucun écran stock.

## Étape 5 — Facturation & devis (cœur)
- ⬜ Attribution numéro **gap-less** en transaction (`sequence_numerotation`), format `NOM-FAC-2026-0001`
- ⬜ CRUD devis + facture + lignes (HT/TVA/TTC selon assujettissement)
- ⬜ Machine à états des statuts (brouillon→envoyée→payée…) + **avoir** (jamais suppression)
- ⬜ Encaissement (paiement partiel/total) → écriture + maj statut
- ⬜ **Génération PDF conforme DGI** (NIU émetteur+client, mentions obligatoires, séquentiel)
- ⬜ Stockage PDF sur **R2** + lien
- ⬜ **Envoi WhatsApp** (lien/API) + **email**
- ⬜ Conversion devis → facture
- ⬜ 🧪 Tests : numérotation sans trou même en concurrence ; PDF contient les mentions Art. 150
- ⬜ ⚖️ Valider les mentions PDF avec l'expert / la DGI
- **Critère** : facture numérotée non modifiable, PDF conforme, envoyée par WhatsApp.

## Étape 6 — Commandes / missions (cœur, libellé adaptatif)
- ⬜ CRUD commande (type commande|mission selon secteur), statuts (en_attente→en_cours→livrée→annulée)
- ⬜ Libellé/vocabulaire adapté (terminologie)
- ⬜ Conversion commande livrée → vente
- ⬜ Écran suivi (kanban simple ou liste par statut)
- ⬜ 🧪 Tests statuts + terminologie

## Étape 7 — Offline complet (le plus critique terrain)
- ⬜ Câbler la file de mutations sur les vraies routes (ventes, tiers, achats, factures)
- ⬜ Route `POST /api/sync` idempotente (rejeu par `client_uuid`, retourne conflits)
- ⬜ **Résolution de conflits** (dernière écriture gagnante ? verrou séquence facture côté serveur)
- ⬜ Cache lecture (produits, tiers, plan comptable) en IndexedDB pour consultation offline
- ⬜ Indicateur d'état réseau + file en attente (badge « N opérations à synchroniser »)
- ⬜ Précache app shell (Service Worker) validé installable
- ⬜ 🧪 Test end-to-end : saisie avion → reconnexion → 0 doublon, séquence facture cohérente
- **Critère** : une journée de caisse sans réseau se synchronise sans perte ni doublon.

## Étape 8 — Couche invisible : états & fiscalité (consultation)
- ⬜ Extraire du Guide SYSCOHADA les **modèles** Bilan / Compte de résultat (Système Normal + SMT)
- ⬜ Table de correspondance **Postes ↔ Comptes** (Système Normal, chap. 7)
- ⬜ Génération **Balance** (soldes par compte)
- ⬜ Génération **Compte de résultat** (soldes intermédiaires de gestion) selon système
- ⬜ Génération **Bilan** selon système (Normal/SMT)
- ⬜ Écran **IGS** (déjà calculé) : classe, montant, échéance, alerte franchissement de seuil
- ⬜ Écran **régime & système** (déterminés auto, forçage expert)
- ⬜ Export PDF des états (R2)
- ⬜ 🧪 Tests de cohérence (bilan équilibré, CR = produits − charges)
- ⬜ ⚖️ **Validation ONECCA** de tous les calculs fiscaux/états avant production

---

## Infra & qualité
- ⬜ **CI GitHub Actions** : install + typecheck + test à chaque push/PR
- ⬜ **CD** : deploy Worker (`wrangler deploy`) + Pages sur merge `main`
- ⬜ Environnements **dev / staging / production** (bases D1 séparées)
- ⬜ Déployer l'API + le front (première mise en ligne)
- ⬜ Secrets (clés API WhatsApp, etc.) via `wrangler secret`
- ⬜ Monitoring/erreurs (observability Workers déjà activée)
- ⬜ Icônes PWA (`icon-192.png`, `icon-512.png`) + splash
- ⬜ Sauvegarde/export D1 (dump régulier)
- ⬜ Renommer le dossier local `Compta` → `kombi` (cosmétique)

## Conformité & contenu réglementaire (à finaliser)
- ⬜ ⚖️ Faire valider `docs/reference/` (IGS, TVA, IS, régimes, états) par l'expert ONECCA
- ⬜ Compléter la table catégorie utilisateur → compte OHADA (mapping complet)
- ⬜ Confirmer traitement mobile money en compta (comptes 55x) — ⚖️
- ⬜ Procédure de révision à chaque **loi de finances** annuelle

## Hors MVP (V1/V2/V3 — ne pas commencer)
- Paie / CNPS (DIPE, bulletins) — brique dédiée plus tard
- Assistant IA conversationnel (RAG) · OCR de reçus (Vision/Tesseract)
- Import bancaire CSV/Excel + rapprochement automatique (était MVP compta, repoussé)
- Scoring de crédit · connecteur facturation électronique DGI
- Mobile money comme moyen d'encaissement de l'abonnement (sous réserve réglementaire)
- Marketplace experts-comptables / CGA · prévisions de trésorerie (Prophet)
