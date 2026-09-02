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
- ✅ **Journal d'audit** : table `audit_log` (qui a fait quoi) — utile compta/fiscal
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

---

# 🔧 Backlog post-audit (revue 360° — 2026-09-01)

Consolidé à partir de 3 audits (chef de dev, dirigeant PME, expert-comptable). Rapport complet :
artefact « Audit Kombi ». Sévérité : 🔴 Bloquant/Critique · 🟠 Élevé · 🟡 Moyen · ⚪ Détail.

## ⭐ Ordre d'attaque recommandé (Top 10)
1. 🚧 🔴 **Cycle de vie des exercices** : ✅ création auto de l’exercice N+1 + sélection par date (fait) ; ⬜ clôture / report à nouveau (P1).
2. ✅ **Écritures immuables + atomiques** : triggers interdisant UPDATE/DELETE d'une écriture validée + transactions (`ctx.storage.transactionSync`) autour de chaque opération.
3. ✅ **Écran Dépenses** (charges 60-67) : loyer, transport, salaires, élec, frais bancaires → résultat sincère + charges pour les prestataires.
4. ✅ **Crédit clients & dettes fournisseurs** : vente/achat à crédit (411/401) + écrans « on me doit » / « ce que je dois », factures impayées avec retard calculé.
5. ✅ **Chaîne TVA** : 4452 (déductible, achats/dépenses) ; 4431/4432 selon secteur (biens/services,
   au lieu de toujours 4431) ; taux contraint à {0 ; 0,1925} (Zod) ; TVA interdite à l'IGS (rejet
   serveur, régime lu en D1 — jamais mis en cache côté DO) ; double comptage vente↔facture supprimé
   (`creerFactureDepuisVente` réutilise l'écriture existante au lieu d'en créer une seconde).
6. ✅ **Caisse comptoir** : quantités éditables, vente à crédit (411), client rattaché, montant
   reçu + rendu-monnaie, reçu imprimable + partage WhatsApp, remise ligne/globale, TVA conditionnée
   par `assujetti_tva` et interdite à l'IGS. §9.1 de la spec technique intégralement livré.
7. ✅ **Sécurité** : CORS restreint aux origines de confiance + rate-limiting auth (D1, 10 req/min/IP) + validation Zod (montants/taux/dates) sur ventes/dépenses/produits/factures.
8. ✅ **Employés & rôles** : rôles comptable/employé, écran Équipe (ajout par email + changement de rôle + retrait), nav filtrée par rôle, route fiscalité protégée (`requirePermission('compta:read')`).
9. ⬜ 🟠 **États & livres légaux** : livre-journal, grand-livre, balance + bilan/CR au format SYSCOHADA à rubriques + SIG ; date d'opération réelle (locale, pas UTC).
10. 🚧 🔴 **Décisions structurantes** : ✅ versioning du schéma DO ; ✅ mécanisme d'avoir (`creerAvoir`,
    contre-passation intégrale, `caCumule` désormais net crédits−débits) ; ✅ vrai tableau de bord
    (`tendance7Jours`, le faux graphe SVG statique a disparu) ; ✅ plans d'abonnement (Gratuit/
    Essentiel/Pro — table `plan`/`abonnement`, essai gratuit 30j à la création, quota 50 factures/
    mois sur Gratuit avec rejet 402, changement de plan par l'admin) ; ⬜ back-office « Impact Tech »
    + collecte d'agrégats cross-entreprises — **explicitement phase P2 dans la spec elle-même**
    (§6 : pipeline Cloudflare Queue → D1, hors scope d'un MVP à un seul niveau de risque raisonnable
    à ce stade ; les plans/quotas ci-dessus couvrent la partie immédiatement actionnable).

11. ✅ 🔴 **Date d'opération réelle** (dépenses, achats/approvisionnements) : `entrerStock()` et
    `creerDepense()` acceptent désormais `dateOperation` (comme `enregistrerVente()` depuis
    l'étape des exercices), et sélectionnent le bon exercice via `exercicePourAnnee()` au lieu de
    toujours écrire `date('now')`. Permet de saisir le soir un achat/une dépense survenu(e) plus
    tôt (ou la veille) sans fausser la date comptable. Les factures gardent volontairement
    `date('now')` à l'émission : leur numérotation gap-less doit refléter l'instant réel
    d'émission, pas une date arbitraire.

## Caisse & ventes
- ✅ Vente à crédit (411) : `enregistrerVente({ aCredit: true, tiersId })` débite la créance client
  au lieu de la trésorerie (comme une facture émise) ; `payerVente()` encaisse ensuite (total ou
  partiel), statut `a_credit` → `payee_partiellement` → `payee` ; écran « on me doit »
  (`listerVentesACredit`) exposé via `GET /api/ventes/credit`.
- ✅ Quantité éditable dans `Caisse.tsx` (steppers +/− par ligne du panier, plus figée à 1)
- ✅ Client rattaché à la vente : sélecteur de client dans la caisse, bug corrigé côté rejeu
  offline (`sync.ts` ne transmettait ni `tiersId` ni `aCredit` lors de la resynchronisation)
- ✅ Montant reçu + rendu-monnaie (calculé côté caisse, bloque l'encaissement si insuffisant)
- ✅ Reçu imprimable (bouton « Imprimer le reçu », CSS `@media print` dédiée)
- ✅ Remise ligne (%) + remise globale (%), appliquées côté caisse avant envoi (prix unitaire net
  envoyé au serveur — aucune notion de remise à porter côté comptable, l'écriture reflète le net facturé)
- ✅ TVA conditionnée par `assujetti_tva` **et** interdite au régime IGS (Art. 142) — taux 19,25 %
  appliqué automatiquement en caisse seulement si l'entreprise y est éligible, sinon 0 %
- ✅ Partage du reçu par WhatsApp (`wa.me`, comme les factures) en plus de l'impression
- ✅ Retour / annulation de vente : `annulerVente()` contre-passe intégralement l'écriture d'origine
  (immuabilité respectée, comme `creerAvoir()`) et remet la marchandise en stock au coût de sortie
  (recalcule le CMP comme un approvisionnement) ; refusée si une facture a déjà été émise pour la
  vente (l'avoir sur facture prend le relais) ou si déjà annulée. Écran « Historique des ventes »
  (`Ventes.tsx`, accessible depuis la Caisse) : bouton Annuler visible seulement pour les rôles
  ayant `vente:annuler` (admin/gérant — pas caissier, contrôle anti-fraude volontaire).
- ⬜ 🟡 Fond de caisse + clôture journalière (Z de caisse)
- ⬜ ⚪ Sélecteur d'article : recherche + code-barres

## Créances & dettes
- ✅ Écran créances clients (« on me doit ») : `Creances.tsx` unifie ventes à crédit
  (`listerVentesACredit`) et factures impayées (`listerFacturesImpayees`), encaissement partiel/total
  inline (réutilise `payerVente`/`payerFacture`).
- ✅ Dettes fournisseurs (401) + écran « ce que je dois » (`Dettes.tsx`) : `entrerStock({ aCredit,
  tiersId })` crédite 401 au lieu de la trésorerie (symétrique de la vente à crédit), peuple enfin
  `achat_fournisseur`/`ligne_achat` (schéma présent depuis v1 mais jamais rempli jusqu'ici) ;
  `payerAchat()` règle total/partiel ; formulaire d'approvisionnement (`Stock.tsx`) propose
  désormais « à crédit » + sélection/création de fournisseur (`creerTiers` acceptait déjà un type
  côté API, seul le frontend forçait `client`).
- ✅ Statut « en retard » calculé à la volée sur les factures (`date_echeance < aujourd'hui`),
  sans tâche planifiée — un vrai statut persisté + relances restent à faire (🟡).
- ⬜ 🟡 Encaissement facture bridé (montant/mode en dur) → partiel + mode réel
- ⬜ 🟡 Lettrage 411/401 + rapprochement bancaire

## Dépenses & achats
- ✅ Écran de dépense courante générique (catégorie → compte OHADA) : 13 catégories (loyer, eau,
  électricité, télécom, fournitures, transport, assurance, publicité, frais bancaires, salaires,
  charges sociales, impôts & taxes, autre), module cœur `depenses`, écriture générée automatiquement
  (débit charge / crédit trésorerie), atomique et immuable comme toute écriture.
- ✅ Charges saisissables même sans stock (prestataires) — le module `depenses` est cœur, actif quel
  que soit le secteur (commerce/service/mixte).
- ✅ Achat à crédit fournisseur (401) + TVA déductible (4452)

## Stock
- ⬜ 🟠 Sur-vente silencieuse (CMV tronqué + stock plancher 0) → bloquer ou tracer
- ⬜ 🟠 Coût d'achat / CMP / marge visibles sur la fiche produit
- ⬜ 🟡 « Rupture » vs « Stock bas » (distinguer ≤ seuil de = 0)
- ⬜ 🟡 Inventaire / ajustement (casse, vol) + valorisation du stock
- ⬜ 🟡 Unités réelles (sac/carton/kg) + variantes
- ⬜ ⚪ Code-barres · multi-entrepôts

## Facturation & devis
- ✅ Mécanisme d'avoir (`creerAvoir`) — contre-passation intégrale, partage la numérotation des
  factures (préfixe AVO), bouton dans `Factures.tsx`
- ⬜ 🟠 Conversion devis → facture
- ⬜ 🟠 WhatsApp envoie réellement le PDF (destinataire + lien)
- ⬜ 🟡 Acompte (facture / commande)
- ⬜ 🟡 Contrôle des mentions Art. 150 (NIU client) avant émission
- ⬜ ⚪ Vrai brouillon modifiable (émission non forcée)

## Tiers (clients / fournisseurs)
- ⬜ 🟠 Écran Tiers dédié (liste/recherche globale) — `creerTiers` accepte maintenant `type`
  (fournisseur créable depuis le formulaire d'approvisionnement), mais pas d'écran de gestion à part
- ⬜ 🟠 Fiche tiers (historique, solde dû, NIU, téléphone)

## Pilotage / tableau de bord
- ✅ Retirer le faux graphe (`FauxGraphe`) → vraies données (`tendance7Jours`, 7 derniers jours)
- ⬜ 🟠 Trésorerie du jour (espèces + MoMo/Orange)
- ✅ Impayés / créances en tête d'accueil : cartes « On me doit » / « Ce que je dois » sur le dashboard
- ⬜ 🟡 Marge, meilleures ventes, dépenses du jour, alertes stock

## Multi-utilisateurs & rôles
- ✅ Écran Équipe : ajout d'un membre par email + changement de rôle + retrait (`membre:manage`,
  admin uniquement) ; rôles étendus `comptable` (lecture financière seule) et `employe`
  (commandes/tiers, hors caisse/finance).
- ✅ Navigation filtrée par permissions (onglets Compta/Caisse/Factures masqués si non autorisés)
  + route fiscalité protégée (`requirePermission('compta:read')`).
- ✅ Journal d'audit consultable (exigence NFR) : `audit_log` append-only, chaîné par hash SHA-256
  (`hash = sha256(hash_precedent + payload)`), écrit dans la même transaction que l'opération
  qu'il trace (vente, dépense, entrée stock, émission/paiement facture). Consultable dans
  Comptabilité → Journal (`audit:read`, admin + comptable), avec badge d'intégrité de la chaîne.

## Comptabilité — écritures
- ✅ Écritures immuables (triggers UPDATE/DELETE) + atomicité (transactions)
- ✅ Double comptage CA vente ↔ facture supprimé (`creerFactureDepuisVente` — facture-document
  réutilisant l'écriture de la vente, sans écran « historique des ventes » pour le déclencher
  pour l'instant : l'API existe, reste à l'exposer dans l'UI)
- ⬜ 🔴 Date d'opération réelle (paramètre + heure locale Africa/Douala) — fait pour `enregistrerVente`
  uniquement ; dépenses/achats/factures utilisent encore `date('now')` (UTC serveur)
- ✅ TVA déductible 4452 à l'achat · TVA services en 4432 · taux contraint à {0 ; 0,1925}
- ⬜ 🟡 Régularisations (agios/frais 631/671, RRR, escomptes, écarts inventaire)
- ⬜ 🟡 Amortissements & provisions (immobilisations)
- ⬜ 🟡 Étendre le plan comptable par défaut + mapping catégorie → compte

## Fiscalité
- ✅ 🔴 Cycle des exercices : création auto N+1 (`exercicePourAnnee`) + sélection par date ; `caCumule` et états **filtrés par exercice**
- ⬜ 🟠 Liquidation TVA déclarative (collectée − déductible, mensuelle, crédit reportable)
- ⬜ 🟠 Alerte de seuil à **85 %** du plafond 50M (règle CDC) — aujourd'hui 100 %
- ⬜ 🟡 Assiette IGS précise (produits accessoires ? dé-doublonnage)
- ⬜ 🟡 IS / DSF : passage résultat comptable → fiscal, acomptes/AIR
- ⬜ 🟡 Bascule IGS↔Réel câblée (persister `ansSousSeuil`, exécuter à la clôture)
- ⬜ 🟡 Séparer `regimeFiscal {igs,reel}` et `systemeOhada {smt,normal}`

## États financiers
- ⬜ 🟠 Bilan/CR au format SYSCOHADA à rubriques (table postes ↔ comptes)
- ⬜ 🟠 Livre-journal, grand-livre, balance (obligatoires Art. 19)
- ⬜ 🟡 Soldes intermédiaires de gestion (marge, VA, EBE…)
- ⬜ 🟡 Système Minimal de Trésorerie (bilan/CR simplifié TPE)
- ⬜ 🟡 Clôture d'exercice + à-nouveaux

## Technique · archi · sécurité
- ✅ CORS restreint aux origines de confiance (`BETTER_AUTH_TRUSTED_ORIGINS`, même liste que better-auth)
- ✅ 🔴 Versioning du schéma des Durable Objects (`MIGRATIONS_DO` + `schema_version`, appliqué au boot)
- ✅ Validation Zod sur les bodies à risque financier (ventes, dépenses, produits, factures) —
  montants entiers positifs, taux TVA bornés 0–1, dates ISO strictes
- ✅ Rate limiting sur `/api/auth/*` (POST) : 10 req/min/IP, fenêtre fixe en D1
- ⬜ 🟠 Offline étendu (factures/tiers/produits/encaissements) + cache lecture
- ⬜ 🟡 Cache session (rôle + entreprises) pour soulager D1 à l'échelle
- ⬜ 🟡 Icônes PWA (installabilité)
- ⬜ 🟡 Vérification email + limiter l'auto-provisioning
- ⬜ 🟡 Observabilité (onError Hono, logs structurés, ID de requête)
- ⬜ ⚪ Backoff + plafond de tentatives sur la synchro offline
- ⬜ ⚪ Export / sauvegarde / RGPD (les DO ne sont pas sauvegardés)
- ⬜ ⚪ Tests : isolation tenant, permissions par rôle, offline, multi-exercices

## Produit & modèle économique
- ⬜ 🔴 Back-office admin « Impact Tech » + collecte d'agrégats cross-entreprises
- ⬜ 🔴 Gestion d'abonnements / plans (Gratuit/Essentiel/Pro) + feature-gating par offre
- ⬜ 🟠 Notifications d'échéances (SMS + WhatsApp, J-10/J-5/J-1)
- ⬜ 🟡 Couche IA (OCR reçus, catégorisation, chatbot) — replanifier
- ⬜ 🟡 Import bancaire / mobile money — réintégrer
- ⬜ ⚪ Version anglaise (Cameroun anglophone)

## ⚖️ À valider ONECCA avant « la compta est juste »
Base du CAC sur l'IGS · base du minimum de perception IS · assiette exacte du CA IGS ·
réintégrations/déductions IS · CMP vs PEPS pour SMT · écarts d'inventaire · mentions minimales
reçu vs facture · liste des secteurs « toujours au Réel ».

---

# 🔭 Veille outils de gestion — ce à quoi on passe à côté (2026-09-01)

Benchmark concurrents (Cameroun : Omamori, Nkap Control, Velko POS, GestionsPro, Alivaon, KiboERP,
SmartERP/WEBGRAM) + standards SaaS (Wave, Zoho Books, QuickBooks, Square). Fonctionnalités
attendues du marché **absentes** de Kombi (au-delà de l'audit) :

- ⬜ **« Payer maintenant » sur la facture** : lien de paiement Mobile Money intégré (le client paie en 1 clic). *Wave/Zoho + prévu au CDC.*
- ⬜ **Factures récurrentes / abonnements clients** (loyers, contrats mensuels). *Wave/Zoho/QuickBooks.*
- ⬜ **Relances de paiement automatiques** (rappels programmés aux clients en retard).
- ⬜ **Rapprochement bancaire (auto)** + import relevés — *tous les concurrents l'ont ; on l'a retiré.*
- ⬜ **Portail client** : le client consulte/paie ses factures, accepte un devis en ligne, télécharge ses relevés. *Zoho/QuickBooks.*
- ⬜ **Multi-établissements + transfert de stock entre boutiques**, un seul login. *Velko POS.*
- ⬜ **Gestion des shifts caissier** (ouverture/clôture de tiroir, pay-in/pay-out, écart) — recoupe le « Z de caisse ». *Standard POS.*
- ⬜ **Fidélité client + historique d'achat au checkout** (CRM léger, segments, promos ciblées). *Standard POS.*
- ⬜ **Wave** comme moyen de paiement (en plus de MTN/Orange). *Velko POS.*
- ⬜ **Paie / DSF** — les concurrents OHADA (Omamori, GestionsPro) l'ont ; fort argument d'adoption. *CDC V2.*
- ⬜ **Time tracking / facturation au temps par projet** (prestataires de services). *Standard services.*
- ⬜ **Catégorisation IA des transactions** + saisie assistée. *Standard 2026 (Wave/Zoho).*
- ⬜ **Rapports & analytics** : meilleures ventes, tendances, marge par produit, comparatifs. *Standard.*
- ⬜ **Intégrations / export** (CRM, e-commerce, export comptable FEC). *Standard.*

Sources : alivaon.com (comparatif Cameroun), omamori.cm, nkapcontrol.com, velko-pos.com,
capterra/getapp (Wave vs Zoho vs QuickBooks), theretailexec.com (POS), squareup.com.

> Lecture stratégique : nos **différenciateurs** (compta auto invisible, offline réel, 1 base/entreprise,
> IGS gratuit) sont solides et rares. Nos **retards de parité** : paiement en ligne sur facture,
> récurrent/relances, rapprochement bancaire, portail client, multi-boutiques, fidélité, paie/DSF.
