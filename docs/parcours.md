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

## Étape 3 — Ventes & caisse (cœur, point d'entrée terrain) ✅ (base terrain)
- ✅ Générateur d'écriture de vente (débit trésorerie / crédit produit 701|706 + TVA) dans le DO
- ✅ Méthode DO `enregistrerVente` : vente + lignes + écriture auto validée (trigger d'équilibre)
- ✅ Route `POST /api/ventes` (gated module ventes + permission) + `GET /api/ventes/jour`
- ✅ Écran caisse : ajout d'articles (ligne libre), total en direct, gros boutons
- ✅ Choix mode de paiement (espèces / MTN MoMo / Orange Money / virement)
- ✅ Écran de confirmation « Encaissé ! » (reçu) + dashboard qui reflète CA/ventes du jour
- ✅ Idempotence via clientUuid (prépare l'offline)
- ✅ 🧪 Tests : vente espèces/momo → écriture équilibrée + CA reflété + idempotence + compte 706 (services)
- ✅ **Vérifié end-to-end dans le navigateur** : signup → onboarding → vente 2500 → CA/stats à jour
- ⬜ Sortie de stock au CMP si module stock actif (→ Étape 4) · reçu PDF · émettre facture (→ Étape 5)
- ⬜ Annulation de vente (contre-passation) · sélection produit (→ Étape 4)
- ⬜ File offline branchée sur POST /api/ventes (→ Étape 7)

## Étape 4 — Stock (module optionnel, gated) ✅
- ✅ CRUD produit (nom, prix vente, seuil alerte) — méthodes DO + route `/api/produits`
- ✅ Approvisionnement `POST /api/produits/:id/entree` → entrée stock + **recalcul CMP** + écriture (601/trésorerie + 311/6031)
- ✅ **Sortie de stock automatique à la vente** au CMP + **COGS 6031/311** dans l'écriture de vente
- ✅ Mouvements de stock (entrée/sortie) enregistrés
- ✅ **Alertes de rupture** (stock ≤ seuil) : badge rouge dans la liste
- ✅ Écran stock (liste + création + approvisionnement) — **masqué pour les services purs**
- ✅ Sélecteur de produits dans la caisse (chips) → vente sur stock
- ✅ 🧪 Tests : CMP pondéré, vente décrémente + COGS équilibré, alerte rupture (12 tests API)
- ✅ **Vérifié end-to-end** : produit → appro 20@3000 → vente 1 → stock 19, compta à jour
- ⬜ Ajustement d'inventaire · historique des mouvements (écran) · achats multi-lignes / à crédit (401)

## Étape 5 — Facturation & devis (cœur) ✅
- ✅ Numéro **gap-less** (`sequence_numerotation`, sérialisé par le DO), format `NOM-FAC-2026-0001`
- ✅ Création devis + facture + lignes (HT/TVA/TTC) ; devis NON comptabilisé
- ✅ Émission → statut envoyée + **créance client 411/701** (facture) ; encaissement partiel/total → statut
- ✅ **Génération PDF conforme DGI** (émetteur+NIU, client+NIU, n° séquentiel, HT/TVA/TTC) via pdf-lib
- ✅ **Envoi WhatsApp** (lien wa.me) + bouton PDF
- ✅ Écran Factures (liste + création+émission + actions PDF/WhatsApp/Encaisser) ; onglet nav dédié
- ✅ 🧪 Tests : numérotation gap-less, créance 411, paiement partiel/total, devis non comptabilisé
- ✅ **Vérifié end-to-end** : facture BOUTIQUE-FAC-2026-0001 émise + PDF valide avec toutes les mentions
- ⬜ Avoir (correction) · conversion devis→facture · stockage R2 · envoi email · ⚖️ valider mentions DGI

## Étape 6 — Commandes / missions (cœur, libellé adaptatif) ✅
- ✅ CRUD commande (type commande|mission selon secteur), statuts en_attente→en_cours→livrée/annulée
- ✅ Libellé/vocabulaire adapté au secteur (TERMINOLOGIE : commande/mission)
- ✅ Écran suivi (liste + avancement des statuts) accessible depuis la carte « Commandes » du dashboard
- ✅ Compteur de commandes actives sur le dashboard
- ✅ 🧪 Tests : création, changement de statut, compteur d'actives, type mission (service)
- ✅ **Vérifié end-to-end** : commande créée → Démarrer → En cours → Terminée
- ⬜ Conversion commande livrée → vente/facture · client optionnel dans le formulaire · échéance

## Étape 7 — Offline (le plus critique terrain) ✅ (caisse offline-first)
- ✅ File de mutations Dexie (IndexedDB) branchée sur la **caisse** (offline-first : enregistre puis synchronise)
- ✅ Rejeu **idempotent** via `clientUuid` (dédup côté DO) — **0 doublon** même si rejoué plusieurs fois (vérifié)
- ✅ Synchro auto : au démarrage, sur l'événement `online`, après chaque saisie
- ✅ Indicateur réseau + file (`OfflineBanner` : « Hors ligne / N en attente » + bouton Synchroniser)
- ✅ **Démarrage hors-ligne** : cache session (`kombi.logged`) + liste d'entreprises → l'app s'ouvre au dernier espace
- ✅ Précache app shell (Service Worker via vite-plugin-pwa, actif en production)
- ✅ **Vérifié** : rejeu même clientUuid → CA +montant une seule fois ; Dexie + caches en place
- ⬜ Étendre la file aux autres écrans (stock, factures) · cache lecture produits/tiers · test en conditions réseau réelles

## Étape 8 — Couche invisible : états & fiscalité (consultation) ✅
- ✅ Génération **Compte de résultat** (produits classe 7 − charges classe 6/8) depuis le grand livre
- ✅ Génération **Bilan** (actif/passif par solde de compte) + résultat au passif
- ✅ Écran **Comptabilité** (onglet Compta) : bascule Résultat / Bilan, détail par compte, badge d'équilibre
- ✅ Écran **IGS** déjà présent sur le dashboard (classe, montant)
- ✅ 🧪 Tests de cohérence : bilan **équilibré** (actif = passif), résultat = produits − charges
- ✅ **Vérifié** sur données réelles : Produits 17 000 − Charges 3 000 = Résultat 14 000 ; Actif = Passif = 64 500
- ⬜ Modèles Bilan/CR détaillés SYSCOHADA (Normal/SMT) · balance complète · export PDF · ⚖️ validation ONECCA

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
