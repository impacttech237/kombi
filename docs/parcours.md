# Kombi — Parcours de développement (tracklist)

Backlog granulaire de **tout ce qui reste à faire** pour le MVP, puis pistes V1+.
Cocher au fur et à mesure. Voir aussi [PROGRESS.md](PROGRESS.md) (vue synthétique) et
[DECISIONS.md](DECISIONS.md) (décisions).

Légende : ⬜ à faire · 🚧 en cours · ✅ fait · 🔒 bloqué (dépendance) · ⚖️ à valider ONECCA/juriste

---

## 🎨 Refonte design system (2026-09-03, en cours)
Décision du porteur du projet après revue de l'interface existante : l'ancienne identité (Space
Grotesk/DM Sans, palette émeraude claire) est **abandonnée**. Nouvelle cible : le prototype
Figma Make dans `docs/Interface application gestion PME/` (thème sombre, accent citron vert
`#b4e033`, Inter + DM Mono) — à reproduire **fidèlement**, écran par écran, sans dévier de son
design ni de son parcours utilisateur.
- ✅ **Fondations posées** : Tailwind CSS v4 ajouté à `apps/web` (`@tailwindcss/vite`), nouvelle
  palette/typo dans `theme.css`, set d'icônes trait fin porté (`components/icons.tsx`), shell de
  navigation porté fidèlement (`components/Shell.tsx` : Sidebar desktop + TopBar/BottomNav mobile
  avec sheet de notifications) et branché sur les vraies données (entreprise, rôle, notifications).
  Pont de compatibilité temporaire dans `theme.css` (anciennes variables/classes remappées sur la
  nouvelle palette) pour que les écrans pas encore portés restent lisibles pendant la migration.
- ⬜ **Écrans à porter un par un** depuis le prototype : Dashboard, Ventes/Caisse, Factures,
  Stock, Trésorerie, Clients, Comptabilité, onboarding (CompanySetup).
- ⚠️ **Écart de couverture non résolu** : le prototype n'a pas d'emplacement de navigation pour
  Commandes/Dépenses/Équipe/Paramètres fiscaux (5 primaires + 2 secondaires seulement). En
  attendant une décision, ces écrans restent accessibles via une rangée de boutons sous le
  contenu principal (`App.tsx`) — à intégrer proprement à la nouvelle IA au fil du portage.
- ⬜ Supprimer le pont de compatibilité une fois tous les écrans portés.

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
- ✅ Client optionnel + date prévue dans le formulaire de création (audit UX 2026-09-03 — le
  backend (`creerCommande`) les acceptait déjà, aucun champ ne les exposait ; toute commande créée
  affichait donc systématiquement « Sans client »). Confirmation ajoutée avant « Annuler » (seule
  action destructive de l'app qui n'en avait pas). Idempotence `client_uuid` ajoutée (migration DO
  v10) en prévision d'un futur rattachement à la file offline.
- ⬜ Conversion commande livrée → vente/facture

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
- ✅ **Un caissier peut créer un client à la volée depuis la caisse** (audit UX 2026-09-03) :
  bouton « Nouveau » à côté du sélecteur client dans `Caisse.tsx` (nom seul, création rapide) ;
  `tiers:manage` accordé au rôle caissier (route `POST /api/tiers` ne permettait que la lecture),
  sans risque d'édition/suppression puisqu'aucune route de ce type n'existe encore.
- ✅ **Facturer a posteriori une vente déjà encaissée** (audit UX 2026-09-03) : le moteur
  (`creerFactureDepuisVente`) existait et était testé côté API mais n'avait aucun déclencheur
  côté UI. Bouton « Facturer » dans `Ventes.tsx` (visible si vente payée, sans facture, avec un
  client associé).
- ✅ Steppers de quantité et champ de remise agrandis (28px → 44px/40px) pour un usage tactile
  fiable en caisse (audit UX 2026-09-03, sous le seuil recommandé de 44px auparavant).
- ⬜ 🟡 Fond de caisse + clôture journalière (Z de caisse) — **Phase V2 dans la spec elle-même**
  (§9.3), reporté délibérément : nécessite une nouvelle table `session_caisse` + notion de session
  active par caissier rattachée à chaque vente, changement de modèle plus large qu'un correctif
  ponctuel. Les autres items 🟡 du même palier (retours, encaissement facture, etc.) sont MVP+/V1
  et traités en priorité.
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
- ✅ Encaissement facture : sélecteur de mode de paiement réel (`Factures.tsx` envoyait toujours
  `modePaiement: 'especes'` en dur alors que `payerFacture()` côté API acceptait déjà n'importe
  quel mode et un montant partiel) — le montant partiel était déjà possible, seul le mode manquait.
- ⬜ 🟡 Lettrage 411/401 + rapprochement bancaire

## Dépenses & achats
- ✅ Écran de dépense courante générique (catégorie → compte OHADA) : 13 catégories (loyer, eau,
  électricité, télécom, fournitures, transport, assurance, publicité, frais bancaires, salaires,
  charges sociales, impôts & taxes, autre), module cœur `depenses`, écriture générée automatiquement
  (débit charge / crédit trésorerie), atomique et immuable comme toute écriture.
- ✅ Charges saisissables même sans stock (prestataires) — le module `depenses` est cœur, actif quel
  que soit le secteur (commerce/service/mixte).
- ✅ Achat à crédit fournisseur (401) + TVA déductible (4452)
- ✅ **Champ « date de la dépense »/« date de réception » exposé dans l'UI** (`Depenses.tsx`,
  `Stock.tsx` → Approvisionner) : `dateOperation` était déjà accepté et testé côté API depuis
  l'étape 11 mais aucun champ ne permettait de le saisir — le correctif restait inutilisable en
  pratique (audit UX 2026-09-03). Filet aussi côté offline (`sync.ts` transmettait déjà le reste
  du payload mais pas `dateOperation`).

## Stock
- ✅ Sur-vente **tracée, pas bloquée** (spec §4 : « bloquer ou tracer » — le terrain ne doit jamais
  être bloqué en caisse) : le CMV n'est plus tronqué au stock affiché (`Math.min(quantite,
  stock_actuel)` → `quantite` pleine), sinon le coût — et donc la marge — de la partie vendue
  au-delà du stock connu était silencieusement sous-évalué. `enregistrerVente()` renvoie
  `enSurvente`, et la caisse affiche un avertissement non bloquant par ligne quand la quantité
  demandée dépasse le stock affiché.
- ✅ Coût d'achat / CMP / marge visibles sur la fiche produit (`Stock.tsx`, écran réservé aux rôles
  avec `stock:read`). **Corrigé** (audit sécurité 2026-09-03) : le filtre de navigation
  (`App.tsx`) ne masquait l'onglet Stock que si `secteur === 'service'`, sans jamais vérifier la
  permission — un caissier d'une entreprise commerce/mixte voyait donc l'onglet (l'API le
  bloquait bien en 403, mais l'écran affichait silencieusement « aucun produit », trompeur).
  Filtre désormais `secteur === 'service' || !peut(role, 'stock:read')`.
- ✅ « Rupture » vs « Stock bas » (distinguer ≤ seuil de = 0) : `listerProduits()` expose
  désormais `en_rupture` (stock = 0) en plus de `en_alerte` (stock ≤ seuil) ; `Stock.tsx` affiche
  la puce « Rupture » seulement à 0, « Stock bas » entre 1 et le seuil.
- ✅ Inventaire / ajustement (casse, vol, écart) : `ajusterStock()` corrige le stock physique
  (`mouvement_stock` type `ajustement`, déjà prévu au schéma mais jamais exposé) et génère
  l'écriture symétrique de l'inventaire permanent — perte = débit 6031 / crédit 311, surplus =
  débit 311 / crédit 6031, au CMP courant (le CMP n'est pas recalculé, un écart n'est pas une
  nouvelle entrée à un coût différent). Compte 6031 **validé ONECCA**
  (`docs/reference/09-validations-onecca.md` §2) : router les cas anormaux/significatifs (vol
  notamment) vers 658 en plus resterait une amélioration future, pas un correctif requis. Écran
  dans `Stock.tsx` (bouton « Ajuster » par produit, perte/surplus + motif).
- ⬜ 🟡 Unités réelles (sac/carton/kg) + variantes
- ⬜ ⚪ Code-barres · multi-entrepôts

## Facturation & devis
- ✅ Mécanisme d'avoir (`creerAvoir`) — contre-passation intégrale, partage la numérotation des
  factures (préfixe AVO), bouton dans `Factures.tsx`
- ✅ Conversion devis → facture : `convertirDevisEnFacture()` crée une NOUVELLE facture (brouillon,
  sa propre numérotation FAC-xxx à l'émission) à partir des lignes du devis, liée via
  `facture.devis_id` (migration DO v7, simple `ALTER TABLE ADD COLUMN`) — le devis d'origine n'est
  jamais modifié ni comptabilisé (il garde son éventuel DEV-xxx). Un seul devis ne peut être
  converti qu'une fois. Bouton « Convertir en facture » dans `Factures.tsx`, badge « Convertie ».
- ✅ **Facture restée en brouillon récupérable** (audit UX 2026-09-03) : `creer()` enchaînait
  création + émission sans étape intermédiaire — si `emettreFacture()` échouait (ex. NIU client
  manquant), la facture existait en base au statut `brouillon` sans aucun moyen de la reprendre.
  Bouton « Émettre » ajouté dans `CarteFacture` pour toute facture au statut `brouillon`.
- ✅ WhatsApp envoie réellement le PDF (destinataire + fichier) : partage natif (`navigator.share`
  avec le PDF en pièce jointe réelle — pas un lien vers un endpoint authentifié que le
  destinataire ne pourrait pas ouvrir) sur mobile, avec repli sur un lien `wa.me` pré-rempli avec
  le numéro du client (`tiers.telephone`, indicatif CEMAC 237 par défaut) si le partage natif
  n'est pas supporté (desktop).
- ⬜ 🟡 Acompte (facture / commande)
- ✅ Contrôle des mentions Art. 150 (NIU client) avant émission : `emettreFacture()` refuse
  d'émettre une **facture** (pas un devis) sans NIU client, mais seulement pour les entreprises
  **assujetties TVA au régime réel** (`regime_fiscal !== 'igs' && assujetti_tva === 1`) —
  conforme à `docs/reference/07-ventes-facturation.md` : l'obligation de facture normalisée pèse
  sur les assujettis TVA, pas sur les TPE à l'IGS (qui peuvent facturer un client anonyme).
- ✅ NIU vendeur sur le reçu de caisse (mentions minimales, `docs/reference/09-validations-
  onecca.md` §7) : `EntrepriseResume` ne portait pas le NIU (seule la facture l'exposait) — le
  reçu WhatsApp et le reçu imprimé de `Caisse.tsx` n'affichaient jamais le NIU de l'entreprise.
  Ajouté au `SELECT` de `GET /api/entreprises`, à l'interface TS, et aux deux rendus du reçu.
- ⬜ ⚪ Vrai brouillon modifiable (émission non forcée)

## Paramètres entreprise
- ✅ 🔴 **CGA/TVA enfin modifiables après l'onboarding** — trouvé en relisant `Spécifications_
  technique.md` §1.1 face au code réel : `adherent_cga` et `assujetti_tva` n'étaient exposés
  **nulle part en écriture** après la création de l'entreprise (l'onboarding ne les collecte pas
  non plus). Concrètement, **aucune entreprise réelle ne pouvait bénéficier de la réduction IGS
  CGA** (pourtant documentée comme « fonctionnalité gratuite phare » dans `packages/fiscal/src/
  igs.ts`) ni activer la TVA — un défaut silencieux qui fausse le calcul fiscal pour toute
  entreprise adhérente d'un CGA ou assujettie TVA au régime réel. Corrigé : `PATCH /api/
  entreprises/:id` (NIU, `adherentCga`, `assujettiTva` — `entreprise:manage`, admin uniquement)
  + `GET /api/entreprises/:id/parametres`, écran `Parametres.tsx` (bouton « Paramètres fiscaux »
  à côté d'Équipe). `regime_fiscal` reste volontairement hors de cet écran : un changement de
  régime ne doit jamais s'appliquer rétroactivement sans un vrai parcours de confirmation (spec
  §1.1), pas un simple interrupteur.
- ✅ **CGA proposé dès l'onboarding** (audit UX 2026-09-03) : même une fois modifiable après coup
  (item précédent), rien ne signalait à un dirigeant fraîchement inscrit et déjà adhérent d'un
  CGA qu'il devait aller chercher l'écran Paramètres fiscaux pour diviser son IGS par deux —
  risque financier silencieux. Case à cocher ajoutée à l'étape 2 de `Onboarding.tsx`, appliquée
  via `PATCH /api/entreprises/:id` juste après la création (best-effort, n'empêche pas la
  création si l'appel échoue).
- ⬜ 🟠 Coordonnées entreprise (adresse, ville, téléphone, email, RCCM) + logo — aucune colonne
  D1 pour l'instant (`entreprise` ne porte que l'identité fiscale), nécessite une migration.
  Alimente aussi la personnalisation des documents PDF (logo, couleur, mentions — spec §2).
- ⬜ ⚪ Profil utilisateur (nom/téléphone éditables, changement de mot de passe) — spec §1.4.

## Tiers (clients / fournisseurs)
- ✅ Écran Tiers dédié (liste/recherche globale) : `Tiers.tsx`, accessible depuis le bouton
  « Clients & fournisseurs » (gérant/admin/comptable via `tiers:read`) — recherche par nom,
  création (nom, type, téléphone, NIU, email, adresse — `creerTiers` acceptait déjà `type`,
  email/adresse manquaient à la création).
  (fournisseur créable depuis le formulaire d'approvisionnement), mais pas d'écran de gestion à part
- ✅ Fiche tiers (historique, solde dû, NIU, téléphone) : `getTiersDetail()` calcule le solde
  (« nous doit » = ventes à crédit + factures impayées non soldées par avoir ; « on lui doit » =
  achats à crédit) et liste les 20 dernières ventes/factures/achats liés — accessible en cliquant
  un tiers dans l'écran dédié.

## Pilotage / tableau de bord
- ✅ Retirer le faux graphe (`FauxGraphe`) → vraies données (`tendance7Jours`, 7 derniers jours)
- ✅ Trésorerie du jour (espèces + MoMo/Orange) : `tresorerieDuJour()` agrège le mouvement net
  (débit − crédit) des comptes 571/5521/5522/521 pour les écritures datées aujourd'hui — capture
  toute opération qui les mouvemente (vente comptant, dépense, encaissement de créance, règlement
  de dette), peu importe sa source, puisqu'elles postent toutes sur ces mêmes comptes. Carte
  dashboard réservée à `compta:read`.
- ✅ Impayés / créances en tête d'accueil : cartes « On me doit » / « Ce que je dois » sur le dashboard
- ✅ Marge, meilleures ventes, dépenses du jour, alertes stock : `margeCumulee()` (CA net − coût
  réel des articles vendus, calculé ligne à ligne — pas via le solde 6031 qui mesure la variation
  de stock de toute la période et serait faussé par les achats non encore revendus),
  `meilleuresVentes()` (top 5 par CA HT, ventes annulées exclues), `depensesDuJour()`, et un
  compteur d'alertes stock (issu de `listerProduits().en_alerte`) — 4 nouvelles cartes sur le
  tableau de bord, la marge réservée à `compta:read` (un caissier ne la voit pas, comme demandé
  par la spec §12).

## Multi-utilisateurs & rôles
- ✅ Écran Équipe : ajout d'un membre par email + changement de rôle + retrait (`membre:manage`,
  admin uniquement) ; rôles étendus `comptable` (lecture financière seule) et `employe`
  (commandes/tiers, hors caisse/finance). **Corrigé** (audit UX 2026-09-03) : le retrait d'un
  membre se faisait en un clic sans confirmation (action irréversible, coupe l'accès d'un
  collègue) — `confirm()` ajouté, alignée sur les autres actions destructives de l'app.
- ✅ Navigation filtrée par permissions (onglets Compta/Caisse/Factures masqués si non autorisés)
  + route fiscalité protégée (`requirePermission('compta:read')`). Accès direct à
  Commandes/Dépenses/Créances/Dettes ajouté à la rangée de raccourcis (audit UX 2026-09-03) :
  auparavant seulement atteignables depuis les cartes du tableau de bord, aucun raccourci
  n'existait depuis les autres écrans.
- ✅ Journal d'audit consultable (exigence NFR) : `audit_log` append-only, chaîné par hash SHA-256
  (`hash = sha256(hash_precedent + payload)`), écrit dans la même transaction que l'opération
  qu'il trace (vente, dépense, entrée stock, émission/paiement facture). Consultable dans
  Comptabilité → Journal (`audit:read`, admin + comptable), avec badge d'intégrité de la chaîne.

## Comptabilité — écritures
- ✅ Écritures immuables (triggers UPDATE/DELETE) + atomicité (transactions)
- ✅ Double comptage CA vente ↔ facture supprimé (`creerFactureDepuisVente` — facture-document
  réutilisant l'écriture de la vente, sans écran « historique des ventes » pour le déclencher
  pour l'instant : l'API existe, reste à l'exposer dans l'UI)
- ✅ 🔴 Date d'opération réelle (paramètre + heure locale Africa/Douala) : `enregistrerVente`,
  `entrerStock` et `creerDepense` acceptent tous `dateOperation` et sélectionnent le bon exercice
  au lieu d'écrire `date('now')`. Les factures gardent volontairement `date('now')` à l'émission
  (numérotation gap-less = instant réel d'émission, pas une date arbitraire).
- ✅ TVA déductible 4452 à l'achat · TVA services en 4432 · taux contraint à {0 ; 0,1925}
- ⬜ 🟡 Régularisations (agios/frais 631/671, RRR, escomptes, écarts inventaire)
- ⬜ 🟡 Amortissements & provisions (immobilisations)
- ⬜ 🟡 Étendre le plan comptable par défaut + mapping catégorie → compte

## Fiscalité
- ✅ 🔴 Cycle des exercices : création auto N+1 (`exercicePourAnnee`) + sélection par date ; `caCumule` et états **filtrés par exercice**
- ⬜ 🟠 Liquidation TVA déclarative (collectée − déductible, mensuelle, crédit reportable) —
  **Phase P2 explicite dans la spec** (§6.2), et périodicité/forme ⚖️ à valider ONECCA ; reporté.
- ⬜ 🟠 Alerte de seuil à **85 %** du plafond 50M (règle CDC) — **Phase P2 explicite dans la spec**
  (§6.1 : « alerte 85 % + liquidation TVA + par-établissement P2 »), reporté avec le point ci-dessus.
- ⬜ 🟡 Assiette IGS précise (produits accessoires ? dé-doublonnage)
- ⬜ 🟡 IS / DSF : passage résultat comptable → fiscal, acomptes/AIR
- ✅ 🟡 **Bascule IGS↔Réel câblée** (audit produit/fiscal 2026-09-03) : `determinerRegime()`
  (correcte depuis le début) n'était jamais appelée avec `regimePrecedent`/`ansSousSeuil` — la
  règle de maintien 2 ans (CGI Art. 93 quinquies) ne s'appliquait donc jamais en pratique, une
  entreprise repassant sous le seuil basculait immédiatement en IGS. Migration D1 `0006` ajoute
  `ans_sous_seuil`/`regime_annee_maj` sur `entreprise` ; `services/bascule-regime.ts` réévalue et
  persiste la bascule une seule fois par changement d'année civile (pas à chaque requête), sur le
  CA de l'exercice CLOS précédent (`caCumuleAnnee`, nouvelle méthode DO) — pas le CA en cours
  d'accumulation. Déclenché paresseusement au premier appel de l'année à `GET /api/fiscalite/
  igs` (même motif que la création paresseuse d'exercice, `exercicePourAnnee`) : pas de cron de
  clôture d'exercice dédié, qui reste une fonctionnalité distincte à construire (voir point
  ci-dessous). Testé (`test/bascule-regime.test.ts`) : maintien 1ère année, bascule IGS au bout de
  2 ans, remise à 0 si le CA repasse solidement au-dessus du seuil, idempotence intra-année.
- ⬜ 🟡 Séparer `regimeFiscal {igs,reel}` et `systemeOhada {smt,normal}`

## États financiers
- ⬜ 🟠 Bilan/CR au format SYSCOHADA à rubriques (table postes ↔ comptes) — regroupement 8xx et
  comptes d'affectation ⚖️ à valider ONECCA ; `etatsFinanciers()` produit déjà un CR/bilan
  fonctionnel (par compte), la mise en forme à rubriques normalisées reste à faire.
- ⬜ 🟠 Livre-journal, grand-livre, balance (obligatoires Art. 19) — **Phase P2 explicite dans la
  spec** (§0/§10 : « balance/grand-livre P2 »), reporté.
- ⬜ 🟡 Soldes intermédiaires de gestion (marge, VA, EBE…)
- ⬜ 🟡 Système Minimal de Trésorerie (bilan/CR simplifié TPE)
- ⬜ 🟡 Clôture d'exercice + à-nouveaux

## Technique · archi · sécurité
- ✅ CORS restreint aux origines de confiance (`BETTER_AUTH_TRUSTED_ORIGINS`, même liste que better-auth)
- ✅ 🔴 Versioning du schéma des Durable Objects (`MIGRATIONS_DO` + `schema_version`, appliqué au boot)
- ✅ Validation Zod sur les bodies à risque financier (ventes, dépenses, produits, factures) —
  montants entiers positifs, taux TVA bornés 0–1, dates ISO strictes
- ✅ Rate limiting sur `/api/auth/*` (POST) : 10 req/min/IP, fenêtre fixe en D1
- ✅ Offline étendu (Phase P1 spec §5.2 : dépense, encaissement, tiers, produit) : la file de
  mutations (`offline/db.ts`/`sync.ts`, jusqu'ici réservée à la vente) couvre maintenant la
  création de dépense, la création de tiers (écran dédié — pas la création rapide en ligne
  ailleurs, qui a besoin de l'ID immédiatement), l'entrée de stock comptant/à crédit (hors
  création d'un nouveau fournisseur à la volée), et les trois encaissements (vente à crédit,
  facture, dette fournisseur). Idempotence côté DO via `client_uuid` (migration v8 : colonnes +
  index uniques partiels sur `paiement_vente`/`paiement_facture`/`paiement_achat`/`tiers`/
  `mouvement_stock`, sur le même principe que vente/dépense). Les écrans de liste ne vident plus
  leur contenu affiché si un rechargement échoue hors-ligne (`setListe(p => p ?? [])` au lieu de
  `setListe([])`) — dégradation propre plutôt qu'un faux état vide. Cache lecture complet (revoir
  des données déjà chargées sans réseau) volontairement hors scope de ce lot : un chantier
  distinct plus large que le P1 « écriture hors-ligne » ciblé ici.
- ✅ 🟡 **Cache TTL du rôle et du profil utilisateur** (audit infra 2026-09-03, point 7 : D1
  interrogé 3 à 5 fois par requête métier avant même d'atteindre le Durable Object shardé,
  contredisant l'objectif du sharding par entreprise à 100k utilisateurs simultanés).
  `lib/cache-isolate.ts` : cache TTL en mémoire à l'échelle de l'isolate Worker (best-effort,
  dégrade proprement sur isolate froid — jamais utilisé pour une donnée où l'incohérence
  inter-isolate serait dangereuse). Profil utilisateur (`auth_id → utilisateur.id`, TTL 5 min,
  ne change jamais) dans `middleware/auth.ts` ; rôle dans une entreprise (TTL 30s, borne la
  fenêtre d'un accès révoqué) dans `middleware/tenant.ts`, invalidé immédiatement à l'ajout/
  retrait/changement de rôle d'un membre (`routes/entreprises.ts`). Round-trip d'invalidation
  testé (`test/cache-role.test.ts`) : un membre retiré ou dont le rôle change perd/gagne l'accès
  immédiatement, pas après expiration du TTL.
- ✅ Icônes PWA (installabilité) : `apps/web/public/icon-192.png`/`icon-512.png` générées (le
  manifeste les référençait déjà mais les fichiers n'existaient pas → PWA non installable/icône
  cassée), reprenant le design du logo (carré émeraude arrondi + « K » — `Logo` dans `ui.tsx`) ;
  variante `purpose: maskable` ajoutée pour Android.
- ⬜ 🟡 Vérification email + limiter l'auto-provisioning — nécessite de choisir un fournisseur
  d'envoi d'e-mails (Resend, Mailgun…) et sa clé API, décision produit/infra qui revient à
  l'utilisateur ; reporté en attendant ce choix plutôt que de câbler un fournisseur au hasard.
- ✅ Observabilité (onError Hono, logs structurés, ID de requête) : middleware posant un
  `x-request-id` (renvoyé au client) sur chaque requête, `app.onError` loggant en JSON structuré
  (requestId/méthode/chemin/message) et renvoyant une réponse JSON uniforme au lieu de la page
  texte brute par défaut de Hono — corrèle un rapport utilisateur à une trace serveur précise.
- ⬜ ⚪ Backoff + plafond de tentatives sur la synchro offline
- ✅ 🔴 **Sauvegarde des Durable Objects** (audit infra 2026-09-03, point 1 — risque n°1 identifié :
  aucune réplique Cloudflare native, une entreprise = un seul DO). `EntrepriseDO.exporterDonnees()`
  exporte un instantané logique complet (toutes les tables SQL + l'état clé/valeur secteur/
  schema_version) ; `importerDonnees()` restaure dans un DO neuf (refuse si une table métier n'est
  pas vide — jamais utilisé pour écraser une entreprise vivante). Cron quotidien
  (`wrangler.toml [triggers]`, 02:00 UTC) sauvegarde toutes les entreprises vers R2 avec rétention
  glissante de 30 jours (`services/sauvegarde.ts`). Déclenchement à la demande + consultation de
  l'historique exposés à l'admin de sa propre entreprise (`POST`/`GET /api/entreprises/:id/
  sauvegardes`). **Restauration volontairement non exposée en self-service** (pas de rôle
  super-admin dans ce MVP — le « back-office admin » est explicitement Phase P2) : à déclencher
  manuellement par le porteur du projet en cas d'incident réel, via `importerDonnees()`.
  Round-trip export→import testé (`test/sauvegarde.test.ts`) : écritures, tiers, trésorerie
  identiques après restauration dans un DO neuf ; garde-fou anti-écrasement vérifié.
- ⬜ ⚪ Export / sauvegarde RGPD à la demande de l'utilisateur (droit à la portabilité) — distinct
  du point ci-dessus (sauvegarde technique interne) ; nécessite un format d'export utilisateur et
  un parcours dédié, hors scope de ce correctif.
- ⬜ ⚪ Tests : isolation tenant, permissions par rôle, offline, multi-exercices
- ✅ Rate limiting rendu atomique (`middleware/rate-limit.ts`) : lecture-puis-écriture D1 en deux
  requêtes séparées remplacée par un UPSERT SQLite unique avec `RETURNING` — fermait une fenêtre
  de course exploitable par des requêtes concurrentes sur `/api/auth/*` (audit sécurité 2026-09-03).
- ✅ Fenêtre de course fermée dans `enregistrerVente`/`emettreFacture`/`creerAvoir`
  (`entreprise-do.ts`) : la lecture async de `secteur` (seul point de suspension avant la
  transaction) est désormais faite AVANT la vérification d'idempotence/statut, pas après — aucun
  `await` ne sépare plus la vérification de la transaction synchrone.
- ✅ Idempotence `client_uuid` étendue à `creerFacture` et `creerCommande` (migration DO v10 pour
  `commande`) ; `convertirDevisEnFacture` rendu idempotent nativement (retourne la facture déjà
  créée au lieu d'échouer sur un rejeu).
- ✅ Validation Zod généralisée à `POST /api/entreprises` et `POST /api/commandes` (jusqu'ici
  validation manuelle, incohérente avec le reste des routes — `Number(x)` silencieusement `NaN`).
- ✅ PDF facture (`facture-pdf.ts`) : sanitisation de tout texte utilisateur avant `drawText` — la
  police standard Helvetica de pdf-lib plantait (500) sur tout caractère hors WinAnsi (emoji,
  script non-latin saisi dans une désignation ou un nom de client).

## Produit & modèle économique
- ⬜ 🔴 Back-office admin « Impact Tech » + collecte d'agrégats cross-entreprises — **Phase P2
  explicite dans la spec** (§6 : pipeline Cloudflare Queue → D1), reporté délibérément (voir
  section « Décisions structurantes »)
- ✅ 🔴 Gestion d'abonnements / plans (Gratuit/Essentiel/Pro) + feature-gating par offre : tables
  D1 `plan`/`abonnement`, essai gratuit 30j à la création, quota 50 factures/mois sur Gratuit
  (402 à l'émission au-delà), changement de plan par l'admin (`POST /api/abonnement/plan`)
- ✅ Notifications d'échéances — **in-app** (spec §13, Phase MVP+ ; WhatsApp/SMS reste V1) :
  cloche dans `TopBar` avec badge (rouge si au moins une critique), calculée à la volée
  (`notificationsActives()`, pas de table persistée — rien ne justifie encore un état à
  synchroniser) : factures en retard/à échéance ≤5j, produits en rupture/stock bas, échéance de
  déclaration IGS ≤30j (15 avril, régime IGS uniquement).
- ✅ 🟡 **Pièce justificative (photo/scan) + OCR texte brut sur les dépenses** (2026-09-03,
  demande explicite du porteur du projet). OCR **côté navigateur** (Tesseract.js, aucune clé/API
  externe, gratuit et sans compte à créer) : lit le texte d'une photo de reçu pour aider à
  recopier montant/fournisseur, rien n'est rempli automatiquement (scope volontairement limité —
  pas d'extraction structurée, trop fragile sur des factures très variées). L'image est
  redessinée sur un canvas avant l'OCR (`normaliserImage`) : le décodeur PNG interne de
  Tesseract.js (Leptonica/WASM) est plus strict que celui du navigateur et échoue sur certains
  fichiers pourtant valides — passer par un canvas normalise systématiquement le format. La pièce
  elle-même (fichier tel quel, JPEG/PNG/WebP/PDF, 10 Mo max) est stockée dans **R2**
  (`kombi-documents`, jusqu'ici inutilisé) via `POST/GET/DELETE /api/depenses/:id/piece`,
  attachée après la création de la dépense (pas dans le flux offline — un fichier binaire
  nécessite le réseau). Migration DO v11 (`depense.piece_cle`). Testé (`test/piece-depense.test.ts`) :
  upload/consultation/remplacement/retrait, type de fichier refusé, dépense inexistante. Limité
  aux **dépenses** pour l'instant — les achats fournisseurs n'ont pas d'écran de liste complet
  (seul `Dettes.tsx` liste les impayés) pour accrocher la même fonctionnalité proprement ; à
  étendre le jour où un tel écran existe.
- ⬜ 🟡 Couche IA (catégorisation auto, chatbot) — replanifier (l'OCR de reçus est fait, voir ci-dessus)
- ⬜ 🟡 Import bancaire / mobile money — réintégrer
- ⬜ ⚪ Version anglaise (Cameroun anglophone)

## ✅ Validation ONECCA des 8 points ouverts (2026-09-03)
Réponses transmises par le porteur du projet (SYSCOHADA révisé + CGI Cameroun + pratiques
DGI/ONECCA) sur les 8 points listés ci-dessus. Détail des 8 réponses et de l'impact code par
point : `docs/reference/09-validations-onecca.md` (voir aussi `DECISIONS.md` D14). Un seul point
reste réellement ouvert : le décompte exact des « 2 ans » de maintien de régime (exercices civils
vs glissants). Ce qui a changé dans le code suite à cette validation :
- 🔧 **Comptes Mobile Money corrigés** : `552`/`553` étaient traités à tort comme deux comptes
  racine distincts (un par opérateur) ; en réalité 552 « Téléphone portable » est le compte racine
  unique du Mobile Money, à subdiviser par opérateur, et 553 est sans rapport (carte péage).
  Introduit `5521` (Orange Money) / `5522` (MTN MoMo), migration DO v9 (backfill des entreprises
  déjà créées, `initialiser()` ne s'exécutant qu'une fois), `COMPTE_TRESORERIE_PAR_MODE` et
  `tresorerieDuJour()` mis à jour. Voir `packages/comptable/src/plan-comptable.ts` et
  `apps/api/src/do/entreprise-do.ts`.
- ✅ Le reste (ajustement de stock sur 6031, base de l'IS = CA HT exercice précédent, CAC sur IGS
  et TVA, secteurs toujours au Réel) confirme le code existant sans changement requis, seuls les
  commentaires « à valider ONECCA » ont été retirés.

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
