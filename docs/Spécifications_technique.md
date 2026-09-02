# Kombi — Spécifications techniques & fonctionnelles détaillées

**Impact Tech — Douala · Septembre 2026 · Document de travail destiné à l'équipe de développement.**

> Ce cahier décrit **en détail** chaque fonctionnalité de Kombi : objectif, état actuel (existe / partiel / à construire, avec référence au code réel), champs & données, options, parcours utilisateur, cas limites, impact comptable, rôles et phase proposée. Il est rédigé selon **trois regards** : le dirigeant/produit, l'expert-comptable ONECCA, et l'architecte (CTO). La roadmap sera arbitrée **étape par étape** séparément — les « phases » ici ne sont que des propositions.

## Comment lire ce document
- **État actuel** s'appuie sur le code : `apps/api/src/do/entreprise-do.ts` (cœur métier, 1 base SQLite par entreprise), `apps/api/src/routes/*`, `apps/web/src/*`, `packages/*`, migrations D1.
- **Architecture rappel** : control plane **D1** (identité, registre `entreprise`, `membre_entreprise`, auth) + **1 Durable Object SQLite par entreprise** (`EntrepriseDO`, décision D13) = isolation physique. Montants en **entiers FCFA** (pas de décimales), devise `XAF`.
- **Phasage** : **P0** = fondations bloquantes (Top 10 de l'audit) · **P1** = cœur métier étendu / parité marché · **P2** = plateforme & monétisation · **P3** = V2+ (paie, scoring, multi-pays). « MVP+ » = consolidation de l'existant + corrections bloquantes.
- Voir aussi : `docs/parcours.md` (backlog priorisé), artefact « Audit Kombi » (revue 360°), `docs/reference/` (règles fiscales citées).

## Table des matières
- **Partie I — Spécifications fonctionnelles** (profil, documents, utilisateurs, tiers, articles, stock, achats/dépenses, bons de livraison, caisse, facturation, commandes/projets, dashboard, notifications)
- **Partie II — Comptabilité, fiscalité & reporting** (trésorerie multi-comptes, rapprochement « tick and tie », cycle en deux temps, écritures par opération, journaux/clôture, fiscalité, rapports, présentation au comptable)
- **Partie III — Architecture, données & plateforme** (modèle de données par entité, exercices, immuabilité/atomicité, matrice rôles×permissions, offline, back-office, abonnements, intégrations, sécurité, API)
- **Annexe A** — Points à valider ONECCA · **Annexe B** — Priorités P0

---

# Partie I — Spécifications fonctionnelles (produit / dirigeant)

## Conventions de la partie I
- Rôles actuels : `admin`, `gerant`, `caissier` (`ROLE_MEMBRE`). Le cahier des charges demande d'ajouter **comptable** et **employé** (à construire).
- Modules gated : `ventes, tiers, facturation, commandes, comptabilite, fiscalite` (cœur, toujours actifs) + `stock, achats` (optionnels, activés par secteur).

## 1. Profil & entreprise

### 1.1 Identité et coordonnées de l'entreprise
- **Objectif** : renseigner/modifier les informations légales et de contact qui alimentent tous les documents et les calculs fiscaux.
- **État actuel** : *partiel*. La table `entreprise` (D1, `0001_init.sql`) porte `raison_sociale`, `niu`, `forme_juridique`, `secteur`, `nature_activite`, `regime_fiscal`, `systeme_ohada`, `adherent_cga`, `assujetti_tva`, `devise`. MAIS : aucune coordonnée stockée (adresse, ville, téléphone, email, RCCM, logo) ; l'onboarding ne collecte que `raisonSociale`, `secteur`, `natureActivite`, `niu` ; **aucun écran de modification** ; `adherent_cga` et `assujetti_tva` jamais renseignés depuis l'UI alors qu'ils pilotent des règles fiscales majeures.
- **Données & champs** (à compléter dans `entreprise`) : `raison_sociale` (obligatoire), `sigle`/nom commercial, `niu` (obligatoire pour facturer), `rccm`, `forme_juridique` (Ets/GIE/SARL/SA/SAS/SCI/autre), `regime_fiscal` (igs/reel_simplifie/reel_normal), `systeme_ohada` (smt/normal), `adherent_cga` (booléen, **à exposer** — abattement IGS 50 %), `assujetti_tva` (booléen, **à exposer** — TVA), `classe_risque_cnps` (A/B/C, préparation paie), `centre_gestion` (DGE/CIME/CSI/CDI — pilote les échéances DSF), coordonnées (`adresse`, `ville`, `quartier`, `boite_postale`, `telephone`, `telephone_2`, `email`, `site_web`), `logo_r2_key` (R2), `devise` (XAF).
- **Options** : forçage manuel du régime fiscal / système OHADA par un habilité (le système OHADA est déterminé automatiquement à partir du CA, forçage possible par un expert-comptable) ; bascule assujetti/non-assujetti TVA.
- **Parcours** : Réglages → Entreprise → formulaire pré-rempli à sections repliables (Identité légale · Coordonnées · Régime fiscal · Logo) → Enregistrer → les documents reflètent immédiatement les changements.
- **Cas particuliers** : modifier `regime_fiscal`/`systeme_ohada` en cours d'exercice ne s'applique **jamais** rétroactivement sans confirmation explicite (critère CDC §3.3) ; changer `assujetti_tva` n'affecte que les nouvelles opérations ; NIU validable par format, non bloquant tant qu'aucune facture n'est émise.
- **Rôles** : lecture tous ; modification `admin` (`entreprise:manage`). **Phase** : MVP+ (coordonnées + logo + CGA/TVA) ; forçage régime V1.

### 1.2 Secteur & configuration des modules activables
- **Objectif** : adapter les fonctions visibles au métier (un pur prestataire ne voit pas le stock).
- **État actuel** : *existe (base solide)*. `modules.ts` définit `MODULES`, `PROFILS_SECTEUR` (commerce→stock+achats, service→rien, mixte→stock+achats), `modulesActifsPourSecteur()` ; `EntrepriseDO.initialiser()` insère les modules actifs ; `GET /api/entreprises/:id/modules` expose l'état. MAIS aucun écran d'activation/désactivation a posteriori ; `dependancesSatisfaites()` non branché sur l'UI.
- **Options** : activer/désactiver les modules **non-cœur** (`stock`, `achats`, futurs `projets`, `paie`). Cœur jamais désactivable.
- **Parcours** : Réglages → Modules → interrupteurs ; désactiver `stock` avertit que `achats` sera aussi désactivé (dépendance).
- **Cas particuliers** : refuser `achats` sans `stock` ; désactivation = masquage, pas suppression des données. **Rôles** : `admin`. **Phase** : MVP+ (le moteur existe déjà).

### 1.3 Multi-entreprises
- **Objectif** : un utilisateur gère plusieurs entreprises et bascule de l'une à l'autre.
- **État actuel** : *existe*. `GET/POST /api/entreprises`, entreprise active en `localStorage` + en-tête `x-entreprise-id`, isolation A≠B testée.
- **Parcours** : sélecteur d'entreprise active en haut de l'app ; « + Nouvelle entreprise » relance l'onboarding.
- **Cas particuliers** : démarrage hors-ligne → liste d'entreprises cachée (`kombi.logged`). **Phase** : existant ; V1 : vue consolidée multi-entreprises pour le persona expert-comptable.

### 1.4 Gestion du profil utilisateur
- **Objectif** : gérer ses informations personnelles et sa sécurité.
- **État actuel** : *à construire*. `utilisateur` (D1) porte `email`, `nom`, `telephone`, `auth_id`. Pas d'écran de profil, pas de changement de mot de passe exposé, pas de vérification email.
- **Champs** : `nom` (obligatoire), `telephone`, `email` (non modifiable au MVP), langue préférée (fr), avatar (V2).
- **Parcours** : Réglages → Mon profil → éditer nom/téléphone ; « Changer mon mot de passe » (better-auth) ; « Se déconnecter ». **Phase** : MVP+ ; vérification email V1.

## 2. Personnalisation des documents
- **Objectif** : que factures, devis, reçus et bons de livraison portent l'identité et les mentions de l'entreprise, de façon conforme et professionnelle.
- **État actuel** : *partiel (facture uniquement, non personnalisable)*. `facture-pdf.ts` (pdf-lib) génère un PDF avec émetteur+NIU, client+NIU, numéro séquentiel, HT/TVA/TTC. MAIS pas de logo, pas de couleurs configurables, pas de pied de page libre, pas de reçu PDF, pas de BL, pas de modèle de devis distinct.
- **Données & champs** (nouvelle table `parametres_document`) : `logo_r2_key`, `couleur_primaire` (défaut #10B981), `afficher_logo`, `mentions_legales` (RCCM, capital, régime), `pied_de_page` (conditions de paiement, RIB/numéro Mobile Money), `note_bas_facture`, coordonnées émetteur (héritées §1.1) et bloc client, modèle par type de document.
- **Options** : afficher/masquer TVA (selon `assujetti_tva`), afficher échéance, afficher conditions de paiement, langue (fr).
- **Parcours** : Réglages → Documents → aperçu en direct → upload logo + couleur + mentions → Enregistrer → tous les nouveaux PDF utilisent ces réglages.
- **Cas particuliers** : **contrôle des mentions Art. 150** avant émission (NIU émetteur ET client requis) ; empreinte d'intégrité + horodatage à prévoir dès le MVP (anticipation facturation électronique CTC 2026) ; reçu = mentions plus légères (⚖️ à valider ONECCA) ; stockage des PDF émis dans R2 pour réédition à l'identique.
- **Rôles** : config `admin` ; génération par tout habilité. **Phase** : MVP+ (logo + mentions + reçu PDF) ; modèles multiples V2.

## 3. Utilisateurs, rôles & employés

### 3.1 Rôles et permissions
- **Objectif** : contrôler qui peut faire quoi, du caissier au comptable.
- **État actuel** : *partiel*. `authz.ts` : matrice `peut(role, permission)` testée, 3 rôles + 16 permissions ; `requirePermission` appliqué sur tiers, ventes, produits, factures, commandes. MAIS rôles **comptable** et **employé** absents ; route fiscalité non protégée ; navigation front non filtrée par rôle.
- **Options** : extension proposée — **comptable** (`compta:read`, `facture:read`, états, export ; pas de caisse), **employé** (accès terrain restreint, nominatif pour le suivi).
- **Cas particuliers** : `admin` = toutes permissions ; un admin minimum par entreprise (interdiction de se retirer si dernier admin). **Phase** : MVP+ (protéger fiscalité + filtrer nav) ; rôles comptable/employé V1.

### 3.2 Invitation & gestion des membres
- **Objectif** : ajouter un employé/caissier/comptable et lui attribuer un rôle.
- **État actuel** : *à construire*. `authz` et `membre_entreprise` existent, mais **aucune route ni écran d'invitation** (⬜ étape 1).
- **Parcours** : Réglages → Équipe → « Inviter » → email/téléphone + rôle → lien d'invitation (email/WhatsApp) → l'invité crée son compte et rejoint l'entreprise → liste des membres (changer rôle, retirer).
- **Cas particuliers** : email déjà membre → erreur ; retrait du dernier admin interdit ; un utilisateur peut appartenir à plusieurs entreprises avec des rôles différents. **Phase** : V1 (envoi de messages = permission utilisateur).

### 3.3 Suivi « quel employé a vendu quoi »
- **Objectif** : savoir qui a réalisé chaque vente et pour quel montant/quantité.
- **État actuel** : *partiel (donnée capturée, non exploitée)*. `vente.caissier_id` renseigné, mais aucune restitution.
- **Parcours** : Rapports → Ventes par employé (période) : nombre de ventes, CA, panier moyen, quantités.
- **Cas particuliers** : le DO ne stocke que l'`id` du caissier ; afficher le nom nécessite un enrichissement via le control plane. Base pour la paie future. **Phase** : V1.

## 4. Tiers — clients & fournisseurs
- **Objectif** : tenir un fichier complet des clients et fournisseurs avec historique et solde.
- **État actuel** : *partiel*. `tiers` supporte `type IN ('client','fournisseur','les_deux')`, `nom`, `niu`, `telephone`, `email`, `adresse` ; `creerTiers/listerTiers` + routes existent. MAIS le front **force `type:'client'`** (fournisseur impossible) ; pas d'écran Tiers dédié (création inline seulement) ; **pas de fiche tiers** (historique, solde) ; pas de recherche.
- **Champs** : `nom` (obligatoire), `type`, `niu`, `telephone`, `email`, `adresse` ; à ajouter : `categorie` (grossiste/détail/VIP), `ville`, `contact_secondaire`, `plafond_credit`, `conditions_paiement` (jours), `notes`, `actif`.
- **Options** : un tiers peut être **client ET fournisseur** (`les_deux`) ; filtre par type/catégorie/solde.
- **Parcours** : onglet Tiers → liste + recherche instantanée + filtre → « + Nouveau tiers » → fiche à onglets (Coordonnées · Historique · Solde).
- **Cas particuliers** : **solde dû/à payer** calculé à partir des créances 411 / dettes 401 + paiements (nécessite le rattachement systématique du tiers aux opérations — aujourd'hui `tiersId` non envoyé en caisse) ; dédoublonnage sur téléphone/NIU ; suppression interdite si opérations liées → désactivation.
- **Rôles** : `tiers:manage`/`tiers:read`. **Phase** : MVP+ (écran dédié + fournisseur + fiche/solde).

## 5. Articles (produits & services)
- **Objectif** : cataloguer ce que l'entreprise vend (produits stockés, services, autres) pour accélérer la saisie et la valorisation.
- **État actuel** : *partiel (produits stock uniquement)*. `produit` porte `nom`, `sku`, `unite` (défaut « unité »), `prix_vente`, `cout_moyen_pondere`, `stock_actuel`, `seuil_alerte`, `actif`. MAIS pas de **type article** (produit/service/autre — tout est stockable) ; pas de **catégories**, pas d'**image**, pas de **code-barres** exploité, pas de **prix d'achat** distinct du CMP, pas de **variantes** ; unité en texte libre non contraint.
- **Champs** : `nom` (obligatoire), `type_article` (produit/service/autre), `sku`/`code_barres` (à séparer), `categorie`, `unite` (sac/carton/kg/heure/unité — référentiel), `prix_vente`, `prix_achat_reference`, `cout_moyen_pondere` (calculé), `taux_tva` par défaut, `image_r2_key`, `seuil_alerte`, `actif`.
- **Options** : **variantes** (taille/couleur) ; service → pas de stock ni CMP ; actif/inactif.
- **Parcours** : onglet Articles → liste → « + Article » (choisir type ; produit : unité/seuil ; service : prix/heure ou forfait) → détail (marge = prix_vente − CMP, historique mouvements).
- **Cas particuliers** : un **service** ne décrémente pas de stock et n'a pas de CMP ; coût d'achat/CMP/marge **visibles sur la fiche** ; code-barres unique, recherche par scan en caisse.
- **Rôles** : `stock:manage` (produits) ; création de services → proposer `article:manage`. **Phase** : MVP+ (type + catégorie + unités) ; variantes/image/code-barres V2.

## 6. Stock & entrepôts
- **Objectif** : suivre les quantités, valoriser au CMP et alerter sur les ruptures.
- **État actuel** : *partiel (mono-entrepôt, inventaire permanent CMP branché)*. Fonctionnel : entrée + **recalcul CMP**, **sortie automatique à la vente** avec **COGS 6031/311**, `mouvement_stock` (entrée/sortie/ajustement — ajustement non exposé), **alertes de seuil** (badge). MAIS **mono-entrepôt** ; **sur-vente silencieuse** (`stock = MAX(0, …)`, CMV tronqué) ; pas d'**inventaire physique/ajustement** exposé ; pas de **rotation** ; pas de **bon de réception** distinct ; « rupture » (=0) non distingué de « stock bas » (≤ seuil).
- **Données** : `produit.stock_actuel`, `cout_moyen_pondere`, `seuil_alerte` ; `mouvement_stock`. À ajouter : `entrepot` + `stock_par_entrepot` + `mouvement_stock.entrepot_source/destination`.
- **Options** : entrée / sortie / **ajustement** (casse, vol, écart) / **transfert inter-entrepôts** ; valorisation **CMP** (implémentée ; PEPS pour SMT ⚖️).
- **Parcours** : onglet Stock → liste → Approvisionner (quantité + coût + mode → CMP + écriture) → Ajuster l'inventaire (stock physique réel → écart tracé + écriture) → Transférer (source/destination, V2).
- **Cas particuliers** : **bloquer ou tracer la sur-vente** ; écart d'inventaire → écriture 603x (⚖️) ; rotation = CMV période / stock moyen ; bon de réception = entrée liée à une commande d'achat.
- **Rôles** : `stock:manage`/`stock:read`. **Phase** : MVP+ (ajustement/inventaire + anti-survente + rupture/bas) ; multi-entrepôts & transferts V2.

## 7. Achats & dépenses

### 7.1 Achats fournisseurs (approvisionnement)
- **Objectif** : enregistrer les achats de marchandises, comptant ou crédit, et alimenter le stock.
- **État actuel** : *partiel*. `entrerStock` fait entrée + CMP + écriture **au comptant uniquement**. `achat_fournisseur`/`ligne_achat` **existent en base mais ne sont pas utilisées**. Manque : achat **à crédit** (401), **TVA déductible** (4452), multi-lignes, lien commande→réception, retours.
- **Options** : comptant vs crédit ; avec/sans TVA déductible ; réception partielle (V2).
- **Parcours** : Achats → « Nouvel achat » → fournisseur + lignes + mode → validation → écritures + entrées stock.
- **Cas particuliers** : achat à crédit crée une dette 401 ; TVA déductible en 4452 ; retour fournisseur = contre-passation partielle. **Rôles** : `achat:manage`. **Phase** : MVP+ (crédit + TVA + multi-lignes).

### 7.2 Dépenses courantes (ponctuelles)
- **Objectif** : saisir en moins de 3 champs les charges d'exploitation (électricité, eau, papier, transport…) pour un résultat sincère.
- **État actuel** : *à construire (bloquant audit)*. Aucun écran de dépense générique ; les prestataires sans stock ne peuvent enregistrer aucune charge.
- **Champs** : `montant` (obligatoire), `categorie`→compte OHADA (obligatoire), `tiers` (optionnel), `mode_paiement` (obligatoire), `date_operation`, `piece` (référence/photo), TVA déductible optionnelle.
- **Options** : comptant ou à crédit (401) ; catégories mappées aux comptes 60–67 (loyer 622, transport 624, électricité/eau 605, fournitures 605/604, frais bancaires 631/671, salaires 66…).
- **Parcours** : bouton « Dépense » → montant → catégorie (grosses tuiles) → mode de paiement → Valider → écriture automatique.
- **Cas particuliers** : charges saisissables **même sans module stock** ; mapping catégorie→compte à compléter. **Rôles** : `depense:manage`. **Phase** : MVP+ (bloquant).

### 7.3 Dépenses récurrentes (échéancier)
- **Objectif** : automatiser les charges répétitives (loyer, abonnements) avec rappel.
- **Champs** : `libelle`, `montant`, `periodicite` (mensuel/trimestriel/annuel), `jour_echeance`, `categorie`/compte, `tiers`, `date_debut`, `date_fin`, `actif`, `prochaine_echeance`.
- **Parcours** : Dépenses → Récurrentes → définir un modèle → à chaque échéance, notification + génération d'une dépense pré-remplie à confirmer.
- **Cas particuliers** : ne pas générer d'écriture sans confirmation au MVP (éviter les charges fantômes). **Phase** : V1.

### 7.4 Retours fournisseurs
- **Objectif** : corriger un achat (marchandise défectueuse/retournée). **Parcours** : depuis un achat → « Retour » → quantités → contre-passation partielle (stock + compta). **Phase** : V2.

## 8. Bons de livraison
- **Objectif** : matérialiser une livraison, côté client (on livre) et côté fournisseur (on est livré), et la relier aux commandes/factures.
- **État actuel** : *à construire*. Aucune table ni écran BL ; les commandes ont un statut `livree` mais aucun document.
- **Champs** (`bon_livraison`) : `sens` (client/fournisseur), `tiers_id`, `commande_id?`, `facture_id?`, `date`, lignes (article, quantité), `livraison_facturee` (booléen : gratuite ou payante), `frais_livraison`, `statut` (préparé/livré/reçu), preuve/signature.
- **Options** : livraison **gratuite** ou **facturée** (ligne de frais ajoutée) ; BL partiel ; BL sans facture.
- **Parcours** : côté client — depuis commande/facture → « Créer BL » → sélection lignes → PDF BL → partage WhatsApp. Côté fournisseur — à la réception d'un achat → « Bon de réception » → rapproche commandé/reçu → entrée en stock.
- **Cas particuliers** : lien **BL ↔ commande ↔ facture** ; écart quantité signalé ; un BL ne génère pas d'écriture (document logistique) sauf frais de livraison facturés. **Phase** : V1 (BL client) ; bon de réception fournisseur MVP+ si couplé aux achats.

## 9. Ventes & caisse (POS)

### 9.1 Encaissement en caisse
- **Objectif** : encaisser une vente en 2-3 taps et remettre un reçu immédiat.
- **État actuel** : *existe (base terrain), avec limites bloquantes*. `enregistrerVente` crée vente + lignes + **écriture partie double automatique** (débit trésorerie / crédit 701 ou 706, + TVA, + COGS 6031/311 si stock), idempotent (`clientUuid`), **offline-first**. MAIS : **quantité figée à 1** ; **vente à crédit impossible** (`statut='payee'` forcé) ; **client jamais rattaché** ; **paiement partiel / montant reçu / rendu-monnaie absents** ; **aucun reçu remis** ; **remise absente** ; **TVA jamais appliquée** (`tauxTva=0`, `assujetti_tva` non lu).
- **Options** : comptant OU **crédit à X jours** (créance 411) ; **multi-modes** vers des comptes de trésorerie précis ; **paiement partiel + rendu-monnaie** ; remise ligne et globale (montant ou %).
- **Parcours cible** : ajouter articles (recherche/scan/chips) avec **quantité éditable** + remise ligne → (optionnel) rattacher un client + remise globale → choisir Comptant/Crédit → si comptant, mode(s) + montant reçu → **rendu-monnaie** calculé ; si crédit, échéance → Valider → écriture auto + **reçu** (aperçu, impression, partage WhatsApp).
- **Cas particuliers** : vente à crédit = débit 411 / crédit 701 (+TVA) ; TVA seulement si `assujetti_tva`, taux 0 ou 19,25 %, **interdite aux IGS** ; éviter la sur-vente silencieuse ; idempotence offline conservée.
- **Rôles** : `vente:create`. **Phase** : MVP+ (corrections bloquantes).

### 9.2 Retours & annulation de vente
- **Objectif** : corriger une vente erronée ou un retour client.
- **État actuel** : *à construire*. Permission `vente:annuler` + statut `annulee` existent, mais **aucune route ni UI**.
- **Parcours** : historique des ventes du jour → sélectionner → « Annuler / Retour » (total/partiel) → contre-passation comptable + réintégration stock.
- **Cas particuliers** : jamais de suppression (contre-passation) ; retour partiel = lignes sélectionnées. **Phase** : V1.

### 9.3 Session de caisse (Z de caisse)
- **Objectif** : ouvrir la caisse avec un fond, la clôturer et détecter les écarts.
- **Champs** (`session_caisse`) : `caissier_id`, `ouverture_at`, `fond_caisse`, `cloture_at`, `total_theorique` (par mode), `total_compté`, `ecart`, `pay_in`/`pay_out`.
- **Parcours** : Ouvrir la caisse (fond) → vendre → Clôturer → saisir l'espèce comptée → écart + rapport Z (ventes par mode, nb tickets).
- **Cas particuliers** : une session par caissier ; ventes rattachées à la session ouverte ; écart tracé, non bloquant. **Phase** : V2.

## 10. Facturation & devis
- **Objectif** : établir devis et factures conformes, les encaisser et les relancer.
- **État actuel** : *existe (cœur solide)*. Numérotation **gap-less** (`NOM-FAC-2026-0001`), devis/facture + lignes HT/TVA/TTC, **devis non comptabilisé**, émission → statut `envoyee` + **créance 411/701** (+4431), encaissement partiel/total → statut, **PDF conforme DGI**, **WhatsApp** via `wa.me`, machine à états `TRANSITIONS_FACTURE`. MAIS : **avoir** non implémenté ; **conversion devis→facture** absente ; WhatsApp envoie un lien, pas le PDF ; email absent ; **acompte** absent ; émission forcée (pas de vrai brouillon) ; **factures récurrentes** absentes ; relances absentes ; lien « Payer maintenant » absent ; risque de **double comptage CA vente↔facture**.
- **Options** : devis / facture / **avoir** ; échéance ; acompte ; **récurrence** (mensuelle) ; envoi WhatsApp/email ; lien de paiement Mobile Money.
- **Parcours** : Factures → « Nouveau » → devis ou facture → client (ou inline) → lignes → échéance → brouillon modifiable → « Émettre » (numéro + créance) → actions : PDF, WhatsApp, Email, **Encaisser** (partiel/total, mode réel), **Convertir devis→facture**, **Avoir** ; le client règle via « Payer maintenant » → paiement rapproché.
- **Cas particuliers** : numérotation strictement séquentielle non modifiable ; correction uniquement par **avoir** ; **contrôle Art. 150** (NIU client) avant émission ; anticipation **facturation électronique CTC 2026** ; éviter le double comptage ; statut `en_retard` automatique + relances programmées.
- **Rôles** : `facture:manage`/`facture:read`. **Phase** : MVP+ (avoir, conversion, contrôle NIU, brouillon réel, anti-double-comptage) ; récurrentes + relances + « Payer maintenant » + email V1.

## 11. Commandes / missions & projets

### 11.1 Commandes / missions
- **Objectif** : suivre les commandes (commerce) ou missions (services) par statuts, jusqu'à la facturation.
- **État actuel** : *existe*. `commande` (type commande/mission, tiers, libellé, statut, montant, date_prevue, vente_id), CRUD + changement de statut, **libellé sectoriel**, compteur d'actives, écran de suivi. MAIS **conversion commande livrée → vente/facture** absente ; client optionnel non exposé ; échéance/acompte absents.
- **Parcours** : Commandes → créer (libellé, montant, client, date) → faire avancer les statuts → à la livraison, convertir en vente/facture.
- **Cas particuliers** : annulation = statut terminal ; conversion crée l'opération comptable (manquante). **Phase** : MVP+ (conversion + client + échéance).

### 11.2 Gestion de projets & tâches (prestataires)
- **Objectif** : suivre un projet, ses tâches, son temps et sa rentabilité.
- **Champs** : `projet` (client, libellé, budget, statut, dates), `tache` (projet, libellé, statut, temps estimé/passé, assignee), `saisie_temps` (tâche, employé, durée, date).
- **Parcours** : Projets → créer → ajouter tâches → suivre l'avancement → facturer au temps ou forfait → **rentabilité** (revenus − charges/temps). **Phase** : V2.

## 12. Tableau de bord personnalisable
- **Objectif** : donner à chaque utilisateur une page d'accueil avec les indicateurs qui comptent pour lui.
- **État actuel** : *partiel (fixe + faux graphe)*. `Dashboard.tsx` affiche CA exercice, IGS estimé, ventes du jour, compteur commandes. MAIS un **`FauxGraphe`** codé en dur (à retirer) ; **non personnalisable** ; manquent trésorerie du jour, impayés/créances, marge, meilleures ventes, dépenses du jour, alertes stock.
- **Champs** : préférences de widgets par utilisateur (`preference_dashboard` ou `localStorage` : liste ordonnée de widgets).
- **Options — widgets** : Trésorerie (espèces + MoMo/Orange), Comptes/soldes, Factures impayées, Commandes en cours, Créances par ancienneté, Top ventes, Marge, Dépenses du jour, Alertes stock, IGS/échéances fiscales.
- **Parcours** : Dashboard → « Personnaliser » → cocher/réordonner → sauvegarde par utilisateur.
- **Cas particuliers** : état vide clair ; retirer le faux graphe (données réelles seulement) ; widgets respectant les permissions (un caissier ne voit pas la marge). **Phase** : MVP+ (retirer faux graphe + trésorerie + impayés) ; personnalisation complète V1.

## 13. Notifications & échéances
- **Objectif** : rappeler à temps les obligations (fiscales, factures à encaisser/payer, stock bas) in-app et par WhatsApp/SMS.
- **État actuel** : *à construire*. Aucune infrastructure ; alertes stock uniquement en badge visuel.
- **Champs** (`notification`/`echeance`) : `type` (fiscal/facture/stock/depense_recurrente), `libelle`, `date_echeance`, `canal` (in-app/WhatsApp/SMS), `statut`, `frequence` (J-10/J-5/J-1 par défaut).
- **Parcours** : cloche in-app + liste ; échéances fiscales adaptées au centre de gestion (DGE/CIME/CDI) ; rappels factures (à encaisser / en retard), dépenses récurrentes, stock ≤ seuil.
- **Cas particuliers** : envoi WhatsApp/SMS = clés API via `wrangler secret` ; **alerte seuil IGS à 85 %** du plafond 50M ; regrouper les rappels, respecter la fréquence. **Phase** : MVP+ (in-app + alertes) ; WhatsApp/SMS V1.

---

# Partie II — Comptabilité, fiscalité & reporting (expert-comptable ONECCA)

> Référentiel : **SYSCOHADA révisé** et **CGI Cameroun 2026**. Toutes les constantes proviennent de `docs/reference/`. Chaque point sensible porte **À valider ONECCA**.

## 0. Cadre comptable de référence
Le SYSCOHADA impose 8 classes, la partie double, l'intangibilité du bilan d'ouverture, la permanence des méthodes, l'irréversibilité des écritures validées. Le moteur respecte déjà 3 invariants vérifiés par triggers (`schema.ts`) : **équilibre débit = crédit** (`trg_ecriture_equilibre`), **verrou d'immuabilité** (`trg_ligne_verrou`), **totaux maintenus** (`trg_ligne_ins/del`). Manquent au socle : trésorerie **multi-comptes**, cycle **facture→règlement** pour les achats, comptes de **capitaux propres (classe 1)**, **clôture d'exercice**, module de **rapprochement**.

## 1. Trésorerie multi-comptes
- **Objectif** : plusieurs comptes de trésorerie réels (banques, Mobile Money, caisses, wallets) avec solde propre, historique, virements internes, rattachement du mode de paiement à un compte précis — pré-requis du rapprochement (§2) et de la prévision (§7).
- **État actuel** : *à construire*. Le moteur ne connaît qu'un **compte figé par mode** (`especes→571`, `virement/cheque→521`, `mtn_momo→552`, `orange_money→553`). Pas de table `compte_tresorerie`, pas de virement interne ; le **585** est au plan mais jamais mouvementé.
- **Règle comptable (classe 5)** : **521** Banques (sous-comptes 5211… par banque) ; **531** Chèques postaux ; **55x** Mobile Money (551/552 MTN, 553 Orange, 554 Wave — non natif SYSCOHADA, ⚖️) ; **571** Caisse (5711 siège, 5712 boutique 2…) ; **585** Virements de fonds (transit obligatoire inter-comptes). Un compte de trésorerie est **toujours débiteur** (sauf découvert → 564/565 à la clôture, hors MVP).
- **Données** : table `compte_tresorerie` (id, libellé, `compte_comptable_id` → 521x/552/571x, `type` banque/mobile_money/caisse/wallet, `numero_externe`, `solde_initial`, `solde_theorique` dérivé, `devise`, `actif`). Le mode de paiement d'une opération pointe désormais un `compte_tresorerie_id` (défaut par mode, paramétrable) — refactor de `genererRecette`/`genererDepense`.
- **Écrans** : « Comptes » (liste + solde + type) ; détail (solde théorique outil vs réel dernier rapprochement, relevé de mouvements avec statut de pointage).
- **Virement interne via 585** : *Écriture 1 (jour J)* : `585 débit / 571 crédit`. *Écriture 2 (jour J+n)* : `521 débit / 585 crédit`. Le solde de **585 doit revenir à zéro** une fois bouclé (indicateur de contrôle). Frais de transfert → régularisation §4 (631/671).
- **Cas particuliers** : frais Mobile Money au retrait (débit destination = net + **631** commission) ; virement non abouti (585 débiteur → alerte) ; multi-devises hors MVP mais champ `devise` dès maintenant.
- **Phase** : **P1** (bloquant §2 et §7). **⚖️** sous-comptes MoMo, rôle du 585, reclassement des découverts.

## 2. Rapprochement bancaire « tick and tie » (pointer & vérifier)
- **Objectif** : faire converger le **solde de l'outil** vers le **solde réel** de chaque compte, en associant chaque transaction réelle importée à un enregistrement. « Ce que Kombi affiche = ce que la banque affiche. »
- **État actuel** : *à construire intégralement*. Le schéma prévoit la valeur `import_bancaire` dans `ecriture.source` (intention), mais aucune table d'import ni de rapprochement.
- **Principe** : importer un **relevé** (CSV/OFX banque, export MoMo/Orange, ou saisie) → file de **transactions réelles** non pointées → associer chacune. **3 voies** :
  - **(a) Association automatique — « OK » vert.** Correspondance déterministe sur **montant + date (±fenêtre) + référence** (n° facture/chèque, motif MoMo). Un seul candidat exact → statut `rapproche_auto`, pastille **verte**, aucune action.
  - **(b) Suggestions de règles bancaires (récurrent).** Pour les transactions récurrentes sans facture (loyer, abonnement, frais mensuels), proposer une **règle** : « libellé contient *ENEO* → contact ENEO + compte **6052 Électricité**, en dépense ». Une fois acceptée, les prochaines similaires génèrent **automatiquement** l'écriture et sont pointées. Statut `rapproche_regle`.
  - **(c) Création manuelle.** Si rien ne correspond, l'utilisateur **crée l'écriture à la volée** (recette/dépense, catégorie→compte, tiers). Statut `rapproche_manuel`.
- **Objectif de bouclage** : après traitement, `solde_theorique(outil) == solde_releve(réel)`. L'écran affiche l'**écart** en temps réel ; il doit tomber à **0**.
- **Données** : `import_releve` (compte, source, période, solde_debut/fin déclaré) ; `transaction_bancaire` (date, libellé, montant signé, référence, `statut` non_rapproche/rapproche_auto/regle/manuel/ignore, `ecriture_id`) ; `regle_bancaire` (pattern, tiers, compte, sens, actif). **Écran** : deux colonnes (transactions réelles / mouvements outil non pointés), bandeau **Solde outil / Solde relevé / Écart**.
- **Workflow** : importer → matching auto → accepter/refuser les règles → traiter le reliquat à la main → écart = 0 → **clôturer le rapprochement** (horodaté, fige le solde réel).
- **Cas particuliers** : paiement partiel (pointe partiellement la créance, facture `payee_partiellement`) ; frais/agios non anticipés (création manuelle sur **631/671**) ; écart de change/arrondi MoMo (658/758 ou 6312) ; transaction en double (dédup, `ignore`) ; virement interne vu des deux côtés via les deux écritures 585.
- **Phase** : **P1** (import CSV/manuel), **P2** (connecteurs API MoMo/Orange). **⚖️** traitement des écarts irréductibles (47 vs 658).

## 3. Principe fondamental : le cycle en deux temps (fait générateur puis règlement)
- **Objectif** : enregistrer **d'abord l'opération** (naissance de la dette/créance) **puis le flux d'argent**. C'est ce qui alimente la **prévision de trésorerie** : dès qu'une facture d'achat est saisie, on sait qu'une sortie viendra, avant même de payer.
- **État actuel** : *partiel, asymétrique*. **Ventes** : cycle en deux temps existe pour les factures (`emettreFacture` → 411/701(+4431), puis `payerFacture` → trésorerie/411) ; la vente caisse est un comptant direct trésorerie/701 (correct pour du comptant). **Achats** : cycle absent — `entrerStock` passe directement 601/trésorerie ; `achat_fournisseur` n'est reliée ni à 401 ni à un règlement différé.
- **Cycle achat à crédit** : *Temps 1 (facture reçue)* : `601/6xx (HT) + 4452 TVA récup. / 401 (TTC)`. *Temps 2 (règlement)* : `401 / trésorerie`.
- **Cycle vente à crédit** : symétrique, déjà en place (411/701(+4431) puis trésorerie/411).
- **Impact prévision** : solde **401** = sorties futures certaines ; solde **411** = entrées futures certaines ; couplés aux échéances → échéancier (§7). Le comptant ne passe pas par 401/411.
- **Données** : généraliser `achat_fournisseur` (`date_echeance`, `statut` recu/paye_partiellement/paye, table `paiement_achat` symétrique de `paiement_facture`). Écran Achats : distinguer **« payé maintenant »** (601/trésorerie) et **« à payer plus tard »** (601/401).
- **Phase** : **P1/P2** — construire le cycle achat à crédit (401) est prioritaire.

## 4. Écritures automatiques par opération (schémas complets)
L'utilisateur saisit en langage simple (recette/dépense, catégorie) ; le moteur produit l'écriture équilibrée via la table `catégorie → compte OHADA`. Montants HT, TVA **19,25 %** (Réel) ou **0** (IGS).

| # | Opération | Débit | Crédit | État |
|---|---|---|---|---|
| 4.1 | Vente comptant (IGS) | 571/55x (TTC=HT) | 701 | existe |
| 4.2 | Vente comptant (Réel) | 571/521 (TTC) | 701 (HT) ; 4431 TVA | existe |
| 4.3 | Vente à crédit (facture) | 411 (TTC) | 701/706 (HT) ; 4431 | existe |
| 4.4 | Encaissement client | Trésorerie | 411 | existe |
| 4.5 | Achat/dépense comptant | 6xx (HT) ; 4452 | Trésorerie (TTC) | existe |
| 4.6 | Achat/dépense à crédit | 6xx (HT) ; 4452 | 401 (TTC) | **à construire** |
| 4.7 | Règlement fournisseur | 401 | Trésorerie | **à construire** |
| 4.8 | Entrée stock (achat) | 311 (coût) | 6031 | existe |
| 4.9 | Sortie stock (vente, CMV) | 6031 (CMV) | 311 (CMV) | existe |
| 4.10 | Retour client (avoir) | 701 (HT) ; 4431 | 411 (ou trésorerie) ; **et** 311/6031 réintégration | **à construire** |
| 4.11 | Retour fournisseur (avoir) | 401 | 601 (HT) ; 4452 ; **et** 6031/311 sortie | **à construire** |
| 4.12 | Virement interne | 585/source puis destination/585 | | **à construire** |
| 4.13a | Agios/frais bancaires | 631 (ou 6312) | 521 | **à construire** |
| 4.13b | Intérêts sur découvert | 671 | 521 | **à construire** |
| 4.13c | RRR obtenus sur achats | 401 | 601/6019 | **à construire** |
| 4.13d | RRR accordés sur ventes | 701/7019 | 411 | **à construire** |
| 4.13e | Escompte obtenu | 401 | 773 | **à construire** |
| 4.13f | Escompte accordé | 673 | 411 | **à construire** |
| 4.13g | Écart d'inventaire | 6031/311 (mali) ou 311/6031 (boni) | | **à construire** ⚖️ |
| 4.14 | Acompte reçu client | Trésorerie | 4191 Clients avances reçues | **à construire** |
| 4.15 | Acompte versé fournisseur | 4091 Fournisseurs avances versées | Trésorerie | **à construire** |

- CMP recalculé après chaque entrée : `(valeur_avant + valeur_entrée)/(qté_avant + qté_entrée)`. À l'entrée `311/6031`, à la sortie `6031/311` (Guide SYSCOHADA §29).
- L'**avoir** porte un **numéro séquentiel propre** et référence la facture d'origine (`avoir_de_id`).
- **Phase** : 4.6–4.7, 4.10–4.11 en P2 ; 4.13–4.15 en P3. **⚖️** comptes RRR/escomptes, écarts d'inventaire, sous-comptes frais MoMo.

## 5. Journaux, livres, plan comptable & clôture
- **Objectif** : livres légaux SYSCOHADA (livre-journal, grand-livre, balance), immuabilité, journaux auxiliaires, **clôture d'exercice**, **capitaux propres** (classe 1), point de départ propre sans compta antérieure.
- **État actuel** : *partiel*. Existent : plan par défaut (sous-ensemble), écritures immuables (triggers), **compte de résultat et bilan** dérivés du grand-livre (`etatsFinanciers`). Manquent : **journaux auxiliaires** exposés (le champ `source` existe), **grand-livre et balance** comme rapports, **comptes classe 1** (ni 101 Capital, ni 11 Report à nouveau, ni 12 Résultat matérialisé), **clôture** (le statut `cloture` existe mais aucune procédure).
- **Livres** : **livre-journal** (chronologique), **journaux auxiliaires** (VE/AC/BQ/CA/MoMo/OD, chacun sa numérotation de pièces), **grand-livre** (par compte + solde progressif), **balance** (totaux D/C + solde, équilibrée = contrôle). **Immuabilité** : correction par **extourne** uniquement. **Capitaux propres** : 101 Capital, 104 Primes, 106 Réserves, 11 Report à nouveau, 12/131 Résultat, 16 Emprunts — à ajouter au plan.
- **Clôture — procédure** : (1) contrôles (balance équilibrée, aucun brouillon, 585 soldé, rapprochements à jour) ; (2) détermination du résultat via **8xx** puis solde en **131** (aujourd'hui calculé « à la volée » — la clôture doit le matérialiser) ; (3) affectation N+1 (`131 → 11`/réserves/dividendes) ; (4) **à-nouveaux** (soldes de bilan classes 1-5 repris à l'ouverture N+1 ; 6/7 repartent à zéro) ; (5) `statut='cloture'` → **gel**.
- **Bilan d'ouverture (reprise sans compta antérieure)** : écran de saisie des soldes de départ (trésorerie par compte, stock, 411, 401, capital) → **écriture d'à-nouveau** équilibrée, contrepartie de bouclage en **101** (ou 11). Lien avec `solde_initial` des comptes de trésorerie (§1).
- **Phase** : balance/grand-livre P2 ; capitaux propres + bilan d'ouverture P2 ; clôture/à-nouveaux P3. **⚖️** regroupement 8xx (SMT vs Normal), comptes d'affectation, forme de l'écriture d'à-nouveau.

## 6. Fiscalité (IGS, TVA, IS, DSF, régimes, CGA)
- **État actuel** : *moteur solide, déclaratif à construire*. `packages/fiscal` : barème IGS + CGA + CAC + trimestrialisation ; détermination de régime + **maintien 2 ans** ; projection de franchissement ; TVA 19,25 %/0 ; IS 25/30 % + minimum 2,2 %. `calcul_igs` présent. Manquent : **liquidation TVA mensuelle**, **retenue à la source**, **alerte 85 %**, suivi **par établissement**, **DSF/liasse**, IS complet.
- **6.1 IGS** : assis sur le **CA annuel HT** ; `tarif = barème(CA)` → ÷2 si CGA → ×1,10 CAC ; **CA ≥ 50M ⇒ Réel**. Périodicité : annuelle **15 avril** ou trimestrielle. **Par établissement** (Art. C 42). **Alerte 85 %** : quand le CA cumulé projeté atteint **42,5M**, avertir d'anticiper le passage au Réel.
- **6.2 CGA** : adhésion + comptabilité ⇒ **tarif IGS ÷ 2**. **Afficher l'économie** (« IGS de X → X/2, soit Y FCFA économisés »).
- **6.3 TVA** : 19,25 % ; 0 % export ; uniquement au **Réel**. **Liquidation mensuelle** : `TVA due = collectée (4431/4432) − déductible (4452/4453)` ; si négatif → **crédit reportable** ; écriture de liquidation `4431 / 4452 et 4441 (ou 4449 crédit)`. **Retenue à la source** (Art. 149-2, post-MVP). Écran « Rapport TVA » mensuel.
- **6.4 IS (Réel)** : **25 %** (CA ≤ 3 Md) ou **30 %** ; **minimum 2,2 %** ; `isDu = max(bénéfice×taux, minimum)` ; acompte/AIR 2,2 %. Passage **résultat comptable → fiscal** fléché V1.
- **6.5 DSF & liasse** (V1) : agrégation des états au format DGI ; poser dès le MVP la traçabilité codes postes ↔ comptes.
- **6.6 Régimes & bascule IGS↔Réel** : seuils 50M/30M libéral + secteurs toujours au Réel ; **règle des 2 ans** ; non-rétroactivité du changement de système.
- **Phase** : alerte 85 % + liquidation TVA + par-établissement P2 ; retenue source + DSF + IS complet V1. **⚖️** base du CAC, périodicité/écriture TVA, base du minimum IS, réintégrations/déductions, secteurs toujours au Réel.

## 7. États & rapports (personnalisables + exportables)
- **Objectif** : rapports **filtrables** (période, compte, projet/mission, tiers) et **exportables** (PDF, Excel/CSV, formats DGI), lecture métier (rentabilité fine) autant que comptable.
- **État actuel** : `etatsFinanciers()` produit déjà **compte de résultat** (détaillé) et **bilan** (équilibre) globaux. Manquent : filtres, profit par catégorie/projet, capitaux propres dédiés, **prévision de trésorerie**, rapports de paiements, rapport TVA, grand-livre/balance, exports.
- **7.1 Compte de résultat global** *(existe)* : enrichir avec bornage période + **SIG** (marge commerciale, valeur ajoutée, EBE, résultat d'exploitation) pour le Normal ; version simplifiée SMT.
- **7.2 Profit par catégorie / projet / mission** *(à construire)* : dimension analytique (`projet_id`/`categorie`) sur les écritures (relier `commande`/`mission` aux ventes/achats). Rapport : produits − charges **par projet**, marge par catégorie, top clients rentables — **différenciateur « gestion »**.
- **7.3 Bilan** *(existe)* : compléter avec la classe 1 (capitaux propres réels).
- **7.4 Capitaux propres (espace dédié)** *(à construire)* : capital, réserves, report à nouveau, résultat, variation d'un exercice à l'autre.
- **7.5 Prévision de trésorerie / cash-flow projeté (échéancier)** *(à construire — pièce maîtresse)* : à partir des **créances 411** (entrées futures), **dettes 401** (sorties futures), **récurrences** (règles §2) et du **solde courant** (§1) → courbe de solde projeté par semaine/mois montrant **ce qui rentrera/sortira avant paiement effectif**, pour **anticiper le besoin en fonds de roulement**. Alerte « trésorerie projetée négative le 15/03 ». Aboutissement du cycle en deux temps (§3).
- **7.6 Rapports de paiements (payé à / reçu de)** *(à construire)* : à partir de `paiement_facture` + paiements d'achats : « reçu de » par client, « payé à » par fournisseur, par période/mode/compte.
- **7.7 Rapport taxes de vente (TVA)** *(à construire)* : collectée/déductible/à décaisser ou crédit, mensuel, exportable.
- **7.8 Balance & grand-livre** *(à construire comme rapports)*.
- **Filtres & exports** : bandeau commun (période, compte, tiers, projet, compte de trésorerie) ; exports PDF, CSV/Excel, formats réglementaires.
- **Phase** : filtres + TVA + paiements P2 ; prévision + profit/projet + capitaux propres P2/P3.

## 8. Présentation au comptable / CGA
- **Objectif** : accès dédié + exports normalisés + vue multi-clients pour l'expert-comptable / le CGA.
- **État actuel** : *à construire* (l'auth + isolation multi-entreprises existe = socle).
- **Livrables** : **rôle « comptable »** (lecture GL/balance/journaux/états d'une ou plusieurs entreprises, écriture d'OD/extournes selon droits) ; **vue de contrôle multi-clients** (statut de clôture, alertes rapprochement/brouillons/585/échéances) ; **exports** FEC, DSF/liasse (V1), balance/GL/journaux (Excel/PDF) ; **mentions DGI** (Art. 150).
- **Parcours** : le dirigeant invite son comptable → rôle comptable → bascule entre clients → exporte FEC/DSF.
- **Phase** : rôle comptable + exports balance/GL P2 ; FEC P3 ; DSF/liasse V1. **⚖️** structure FEC/DSF attendue par la DGI.

---

# Partie III — Architecture, données & plateforme (CTO)

> Fondé sur l'existant : control plane **D1** + **1 Durable Object SQLite par entreprise** (`EntrepriseDO`, D13). snake_case, montants entiers XAF, horodatage TEXT ISO. Invariants à préserver : le DO **est** la frontière de tenant (pas de colonne `entreprise_id` dans les tables tenant) ; partie double + triggers d'équilibre/verrou ; idempotence via `client_uuid UNIQUE` ; séquences gap-less sérialisées par le DO.

## 0. Conventions transverses
- **Montants** `INTEGER` XAF ; seul `taux_tva REAL` (0 ou 0.1925), tout autre taux interdit par CHECK + Zod.
- **Dates d'opération** : paramètre explicite `date_operation`, défaut = date locale **Africa/Douala** (et non `date('now')` UTC — corrige le bug audit). Util `dateComptable(tz='Africa/Douala')`.
- **Identifiants** : `crypto.randomUUID()` (déjà `uid()`).
- **Enveloppe API** : succès `{ "data": <T>, "meta": { page, parPage, total } }` ; erreur `{ "erreur": { code, message, details } }`. Codes : `VALIDATION` (400), `NON_AUTHENTIFIE` (401), `PERMISSION` (403), `MODULE_INACTIF` (403), `PLAN_REQUIS` (402), `INTROUVABLE` (404), `CONFLIT` (409), `LIMITE` (429), `INTERNE` (500).
- **Idempotence write** : middleware `idempotency-key` → `client_uuid` (généraliser au-delà de la vente).
- **Versioning schéma DO** : voir §9. Toute nouvelle table = migration DO ordonnée, jamais un simple `IF NOT EXISTS` implicite.
- **Phase** : P0.

## 1. Modèle de données par entité
Chaque entité précise **où elle vit** (DO entreprise = données métier isolées ; D1 control plane = transverse/identité/plateforme).

### 1.1 Trésorerie — `compte_tresorerie`, `mouvement_tresorerie`, `virement_interne` (DO)
```sql
CREATE TABLE compte_tresorerie (
  id TEXT PRIMARY KEY, libelle TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('caisse','banque','mobile_money','cheque_postal')),
  compte_comptable_id TEXT NOT NULL REFERENCES compte_comptable(id),
  numero_compte_bancaire TEXT,
  fournisseur_mm TEXT CHECK (fournisseur_mm IN ('mtn','orange','wave') OR fournisseur_mm IS NULL),
  solde_initial INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL );
CREATE TABLE mouvement_tresorerie (
  id TEXT PRIMARY KEY, compte_tresorerie_id TEXT NOT NULL REFERENCES compte_tresorerie(id),
  date_operation TEXT NOT NULL, sens TEXT NOT NULL CHECK (sens IN ('entree','sortie')),
  montant INTEGER NOT NULL CHECK (montant > 0), ecriture_id TEXT REFERENCES ecriture(id),
  reference TEXT, libelle TEXT, rapprochement_id TEXT REFERENCES rapprochement(id), created_at TEXT NOT NULL );
CREATE TABLE virement_interne (
  id TEXT PRIMARY KEY, compte_source_id TEXT NOT NULL REFERENCES compte_tresorerie(id),
  compte_dest_id TEXT NOT NULL REFERENCES compte_tresorerie(id),
  montant INTEGER NOT NULL CHECK (montant > 0), date_operation TEXT NOT NULL,
  ecriture_id TEXT REFERENCES ecriture(id), created_at TEXT NOT NULL );
```
Le mode de paiement référence un `compte_tresorerie_id` (plus la constante figée). Migration : créer 1 compte par mode existant. **Solde = `solde_initial + Σ mouvements`, jamais matérialisé** (cache reconstructible). **Phase P1.**

### 1.2 Rapprochement — `transaction_importee`, `regle_bancaire`, `rapprochement` (DO)
```sql
CREATE TABLE transaction_importee (
  id TEXT PRIMARY KEY, compte_tresorerie_id TEXT NOT NULL REFERENCES compte_tresorerie(id),
  source TEXT NOT NULL CHECK (source IN ('banque','mtn_momo','orange_money','wave','csv')),
  date_valeur TEXT NOT NULL, libelle_brut TEXT NOT NULL, montant INTEGER NOT NULL,
  reference_externe TEXT, hash_ligne TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'a_pointer' CHECK (statut IN ('a_pointer','rapproche','ignore')),
  rapprochement_id TEXT REFERENCES rapprochement(id), import_lot_id TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (compte_tresorerie_id, hash_ligne) );
CREATE TABLE regle_bancaire (
  id TEXT PRIMARY KEY, ordre INTEGER NOT NULL DEFAULT 0, motif_regex TEXT NOT NULL,
  sens TEXT CHECK (sens IN ('entree','sortie') OR sens IS NULL),
  compte_comptable_id TEXT REFERENCES compte_comptable(id), tiers_id TEXT REFERENCES tiers(id),
  categorie_depense_id TEXT REFERENCES categorie_depense(id), actif INTEGER NOT NULL DEFAULT 1 );
CREATE TABLE rapprochement (
  id TEXT PRIMARY KEY, compte_tresorerie_id TEXT NOT NULL REFERENCES compte_tresorerie(id),
  transaction_importee_id TEXT REFERENCES transaction_importee(id),
  mouvement_tresorerie_id TEXT REFERENCES mouvement_tresorerie(id), ecriture_id TEXT REFERENCES ecriture(id),
  type TEXT NOT NULL CHECK (type IN ('auto','manuel','ecart')), ecart_montant INTEGER NOT NULL DEFAULT 0,
  date_pointage TEXT NOT NULL, utilisateur_id TEXT NOT NULL );
```
Dédup sur `reference_externe` sinon `hash_ligne` (inclure un compteur d'occurrence). Le rapprochement **annote**, ne modifie pas l'écriture. **Phase P1** (CSV/manuel), **P2** (API opérateurs).

### 1.3 Produit enrichi — variantes, unités, catégories, code-barres (DO)
```sql
CREATE TABLE categorie_produit ( id TEXT PRIMARY KEY, nom TEXT NOT NULL, parent_id TEXT REFERENCES categorie_produit(id) );
ALTER TABLE produit ADD COLUMN categorie_id TEXT REFERENCES categorie_produit(id);
ALTER TABLE produit ADD COLUMN code_barres TEXT;
ALTER TABLE produit ADD COLUMN a_variantes INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_produit_codebarres ON produit(code_barres) WHERE code_barres IS NOT NULL;
CREATE TABLE variante_produit (
  id TEXT PRIMARY KEY, produit_id TEXT NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL, sku TEXT UNIQUE, code_barres TEXT,
  prix_vente INTEGER, cout_moyen_pondere INTEGER NOT NULL DEFAULT 0, stock_actuel INTEGER NOT NULL DEFAULT 0 );
CREATE TABLE unite_mesure ( id TEXT PRIMARY KEY, code TEXT NOT NULL, vers_unite_base REAL NOT NULL DEFAULT 1 );
```
Stock/CMP au niveau **variante** si `a_variantes=1`, sinon produit. `mouvement_stock` gagne `variante_id`. Sur-vente à **bloquer ou tracer**. **Phase P1** (catégories/code-barres/unités), **P2** (variantes).

### 1.4 Multi-entrepôts — `entrepot`, transfert (DO)
```sql
CREATE TABLE entrepot ( id TEXT PRIMARY KEY, nom TEXT NOT NULL, adresse TEXT, est_principal INTEGER NOT NULL DEFAULT 0, actif INTEGER NOT NULL DEFAULT 1 );
CREATE TABLE stock_entrepot (
  produit_id TEXT NOT NULL REFERENCES produit(id), variante_id TEXT REFERENCES variante_produit(id),
  entrepot_id TEXT NOT NULL REFERENCES entrepot(id), quantite INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (produit_id, variante_id, entrepot_id) );
-- mouvement_stock : + entrepot_id (+ entrepot_dest_id pour type='transfert')
```
Transfert = sortie A + entrée B, **sans impact compta** (même 311, même CMP). `produit.stock_actuel` devient vue agrégée. **Phase P2.**

### 1.5 Achats — `commande_fournisseur`, `ligne_commande_fournisseur`, `reception` (DO)
```sql
CREATE TABLE commande_fournisseur (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id), tiers_id TEXT NOT NULL REFERENCES tiers(id),
  numero TEXT, statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','envoyee','partiellement_recue','recue','annulee')),
  date_commande TEXT, date_livraison_prevue TEXT, total_ht INTEGER, total_tva INTEGER, total_ttc INTEGER, created_at TEXT NOT NULL );
CREATE TABLE ligne_commande_fournisseur (
  id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commande_fournisseur(id) ON DELETE CASCADE,
  produit_id TEXT REFERENCES produit(id), designation TEXT NOT NULL,
  quantite_commandee INTEGER NOT NULL, quantite_recue INTEGER NOT NULL DEFAULT 0,
  cout_unitaire INTEGER NOT NULL, taux_tva REAL NOT NULL DEFAULT 0 );
CREATE TABLE reception (
  id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commande_fournisseur(id),
  entrepot_id TEXT REFERENCES entrepot(id), date_reception TEXT NOT NULL, ecriture_id TEXT REFERENCES ecriture(id) );
CREATE TABLE ligne_reception (
  id TEXT PRIMARY KEY, reception_id TEXT NOT NULL REFERENCES reception(id) ON DELETE CASCADE,
  ligne_commande_id TEXT NOT NULL REFERENCES ligne_commande_fournisseur(id),
  quantite INTEGER NOT NULL CHECK (quantite > 0), cout_unitaire INTEGER NOT NULL );
```
La réception recalcule le CMP et impute 601/401 (crédit) ou 601/trésorerie ; TVA **4452**. Réceptions partielles → statut dérivé. **Phase P1.**

### 1.6 Dépenses — `depense`, `categorie_depense` (DO)
```sql
CREATE TABLE categorie_depense (
  id TEXT PRIMARY KEY, libelle TEXT NOT NULL, compte_comptable_id TEXT NOT NULL REFERENCES compte_comptable(id),
  taux_tva_defaut REAL NOT NULL DEFAULT 0, actif INTEGER NOT NULL DEFAULT 1 );
CREATE TABLE depense (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  categorie_id TEXT NOT NULL REFERENCES categorie_depense(id), tiers_id TEXT REFERENCES tiers(id),
  date_operation TEXT NOT NULL, montant_ht INTEGER NOT NULL, montant_tva INTEGER NOT NULL DEFAULT 0,
  mode_reglement TEXT CHECK (mode_reglement IN ('especes','mtn_momo','orange_money','virement','cheque','a_credit')),
  compte_tresorerie_id TEXT REFERENCES compte_tresorerie(id),
  recurrence TEXT NOT NULL DEFAULT 'ponctuelle' CHECK (recurrence IN ('ponctuelle','mensuelle','trimestrielle','annuelle')),
  prochaine_echeance TEXT, justificatif_r2_key TEXT, ecriture_id TEXT REFERENCES ecriture(id),
  client_uuid TEXT UNIQUE, created_at TEXT NOT NULL );
```
Mapping **catégorie→compte** dans `categorie_depense.compte_comptable_id` (seed : loyer→622, transport→624, publicité→627, frais bancaires→631, salaires→661). Écriture charge/trésorerie (ou charge/401), TVA **4452**. Saisissable **sans module stock**. Récurrence via Cron + alarme DO. **Phase P0** (ponctuelle), **P1** (récurrence).

### 1.7 Bons de livraison — `bon_livraison` (DO)
```sql
CREATE TABLE bon_livraison (
  id TEXT PRIMARY KEY, sens TEXT NOT NULL CHECK (sens IN ('client','fournisseur')),
  tiers_id TEXT NOT NULL REFERENCES tiers(id), numero TEXT,
  nature TEXT NOT NULL CHECK (nature IN ('payant','gratuit')), facture_id TEXT REFERENCES facture(id),
  date_livraison TEXT NOT NULL, entrepot_id TEXT REFERENCES entrepot(id),
  statut TEXT NOT NULL DEFAULT 'prepare' CHECK (statut IN ('prepare','livre','facture','annule')), created_at TEXT NOT NULL );
CREATE TABLE ligne_bon_livraison (
  id TEXT PRIMARY KEY, bon_id TEXT NOT NULL REFERENCES bon_livraison(id) ON DELETE CASCADE,
  produit_id TEXT REFERENCES produit(id), variante_id TEXT REFERENCES variante_produit(id),
  designation TEXT NOT NULL, quantite INTEGER NOT NULL CHECK (quantite > 0) );
```
BL payant → sortie de stock + facturation différée. BL gratuit → sortie valorisée en charge (échantillons 6017/dons) sans produit. Éviter double sortie stock BL↔facture. **Phase P2.**

### 1.8 Retours & avoirs — `retour_client`, `retour_fournisseur` (DO)
Réutilise `facture.avoir_de_id`. L'**avoir** = une `facture` de `type='avoir'` (étendre le CHECK à `('devis','facture','avoir','acompte')`) avec `avoir_de_id` renseigné, écriture inverse (produit débité, 411 crédité, stock ré-entré au CMP si `remet_en_stock`). L'avoir ne modifie **jamais** la facture d'origine ; numérotation propre (préfixe AVO). **Phase P1.**

### 1.9 Facture enrichie — récurrence, acompte, échéance, relance (DO)
```sql
ALTER TABLE facture ADD COLUMN modele_recurrent_id TEXT REFERENCES facture_recurrente(id);
ALTER TABLE facture ADD COLUMN acompte_de_id TEXT REFERENCES facture(id);
ALTER TABLE facture ADD COLUMN parametres_document_id TEXT REFERENCES parametres_document(id);
CREATE TABLE facture_recurrente (
  id TEXT PRIMARY KEY, tiers_id TEXT NOT NULL REFERENCES tiers(id),
  frequence TEXT NOT NULL CHECK (frequence IN ('mensuelle','trimestrielle','annuelle')),
  jour_emission INTEGER, prochaine_emission TEXT, date_fin TEXT, gabarit_json TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1 );
CREATE TABLE echeance_facture ( id TEXT PRIMARY KEY, facture_id TEXT NOT NULL REFERENCES facture(id) ON DELETE CASCADE, date_echeance TEXT NOT NULL, montant INTEGER NOT NULL, regle INTEGER NOT NULL DEFAULT 0 );
CREATE TABLE relance ( id TEXT PRIMARY KEY, facture_id TEXT NOT NULL REFERENCES facture(id), niveau INTEGER NOT NULL, canal TEXT NOT NULL CHECK (canal IN ('sms','whatsapp','email')), envoyee_le TEXT, statut TEXT NOT NULL DEFAULT 'planifiee' CHECK (statut IN ('planifiee','envoyee','echec')) );
```
Passage auto en **`en_retard`** via alarme DO (`ctx.storage.setAlarm()`). Récurrence via alarme DO par entreprise (le Cron global ne connaît pas les DO). Éviter le double comptage vente↔facture. **Phase P1** (échéance/relance/acompte), **P2** (récurrence).

### 1.10 Projets & tâches — `projet`, `tache` (DO)
```sql
CREATE TABLE projet ( id TEXT PRIMARY KEY, tiers_id TEXT REFERENCES tiers(id), nom TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','termine','archive')), budget INTEGER, taux_horaire INTEGER, date_debut TEXT, date_fin TEXT, created_at TEXT NOT NULL );
CREATE TABLE tache ( id TEXT PRIMARY KEY, projet_id TEXT NOT NULL REFERENCES projet(id) ON DELETE CASCADE, libelle TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire','en_cours','fait')), employe_id TEXT REFERENCES employe(id), temps_estime_min INTEGER, temps_passe_min INTEGER NOT NULL DEFAULT 0, facturable INTEGER NOT NULL DEFAULT 1 );
```
Facturation : `temps_passe_min × taux_horaire` non facturé → lignes de facture. Recoupe `commandes` (type mission) : recommandation — `projet` = conteneur long, `commande/mission` = livrable ponctuel. **Phase P2.**

### 1.11 Employés — `employe` (split control plane / DO)
L'accès applicatif reste `membre_entreprise` (D1, identité + rôle). Le DO porte `employe` (RH métier, peut exister sans compte utilisateur) : `nom`, `telephone`, `membre_utilisateur_id` (lien logique optionnel vers `utilisateur.id`), `poste`, `date_embauche`, `actif`. `vente.caissier_id` → FK logique `employe.id`. Paie/CNPS hors MVP (D9). **Phase P1.**

### 1.12 `parametres_document` (DO)
`logo_r2_key`, `couleur_primaire` (défaut #10B981), `pied_de_page`, `mentions_legales`, `coordonnees_bancaires`, `prefixe_numero` (remplace le `prefixe` passé à `emettreFacture`). Logo dans **R2**. Singleton par entreprise. **Phase P1.**

### 1.13 `dashboard_config` (widgets par utilisateur, DO)
`utilisateur_id` (PK, ref control plane), `widgets_json` (ordre + visibilité), `updated_at`. Fallback config par défaut dérivée des modules actifs. Retire le `FauxGraphe`. **Phase P2.**

### 1.14 Notifications — `notification` (DO génère, control plane envoie)
`type` (echeance_facture/alerte_stock/echeance_fiscale/relance_client/abonnement), `cible_id`, `canal` (in_app/sms/whatsapp/email), `destinataire`, `message`, `date_prevue`, `statut`. Envoi effectif par alarme DO ou Cron balayant les DO. Idempotence d'envoi. **Phase P1** (in-app + WhatsApp), **P2** (SMS programmés).

### 1.15 Plan comptable étendu + mapping catégorie→compte
Étendre le seed `plan-comptable.ts` : 604, 605, 6031, 61x, 62x, 63x, 64x, 66x, 67x, 78x, 13 résultat, 10x capital. Les mappings deviennent des **tables** (`compte_tresorerie`, `categorie_depense`) plutôt que des constantes. Toute constante cite `docs/reference/05` (D3). **Phase P0** (charges de base), **P1** (extension complète). **⚖️** validation ONECCA.

### 1.16 Exercice — cycle de vie & clôture
Voir **§2**. Table `exercice` à enrichir (`date_cloture`, `report_a_nouveau_json`, `verrouille`).

### 1.17 `audit_log` immuable (DO, append-only)
```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, utilisateur_id TEXT NOT NULL, role TEXT NOT NULL,
  action TEXT NOT NULL, entite TEXT, entite_id TEXT, avant_json TEXT, apres_json TEXT,
  hash_precedent TEXT, hash TEXT NOT NULL );
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'audit_log immuable'); END;
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'audit_log immuable'); END;
```
Chaînage `hash = SHA-256(hash_precedent + payload)` (toute altération casse la chaîne). Écrit dans la **même transaction** que l'opération métier. **Phase P0.**

## 2. Cycle de vie des exercices (corrige « l'app casse au 1er janvier »)
- **Extension** : `exercice` + `date_cloture`, `report_a_nouveau_json`, `verrouille`.
- **Création auto N+1** : à la 1ère opération dont `date_operation.year > exercice_ouvert.annee`, le DO crée l'exercice N+1 (`INSERT OR IGNORE`) sans clôturer N ; alternative : alarme DO au 1er janvier Africa/Douala.
- **`exerciceOuvert()` → `exercicePourDate(date)`** : sélectionner l'exercice couvrant la date (corrige `caCumule` non filtré par exercice).
- **Clôture** : contrôles (brouillons validés, 585 soldé, rapprochements) → résultat via 8xx → 131 → **à-nouveaux** (soldes bilan 1-5 repris) → `verrouille=1`.
- **Verrouillage** : un exercice clos refuse toute écriture (trigger `WHEN verrouille=1`).
- **Points d'attention** : D10 (« un seul exercice, pas de clôture MVP ») est dépassé par l'audit ; autoriser 2 exercices ouverts en période de chevauchement ; à-nouveaux = point ONECCA. **Phase P0** (création auto + filtrage par date), **P1** (clôture formelle).

## 3. Immuabilité & atomicité
```sql
CREATE TRIGGER trg_ecriture_no_update_validee BEFORE UPDATE ON ecriture WHEN OLD.statut='validee' AND NEW.statut='validee'
  BEGIN SELECT RAISE(ABORT,'Ecriture validee immuable'); END;
CREATE TRIGGER trg_ecriture_no_delete_validee BEFORE DELETE ON ecriture WHEN OLD.statut='validee'
  BEGIN SELECT RAISE(ABORT,'Ecriture validee : suppression interdite'); END;
CREATE TRIGGER trg_ligne_no_delete BEFORE DELETE ON ligne_ecriture WHEN (SELECT statut FROM ecriture WHERE id=OLD.ecriture_id)='validee'
  BEGIN SELECT RAISE(ABORT,'Ligne d''ecriture validee immuable'); END;
```
- **Correction = contre-passation** (jamais UPDATE/DELETE ; source `contrepassation`, lien `annule_ecriture_id`).
- **Atomicité** : envelopper chaque opération multi-écritures dans `ctx.storage.transactionSync(() => { … })`. Aujourd'hui `enregistrerVente`/`entrerStock`/`emettreFacture` enchaînent des `sql.exec` **sans transaction** → état partiel possible.
- **Point d'attention** : `transactionSync` exige des callbacks **synchrones** ; or `enregistrerVente` fait `await ctx.storage.get('secteur')`. Solution : lire le secteur **avant** la transaction (cache mémoire du DO), puis exécuter tous les `sql.exec` en synchrone. **Phase P0.**

## 4. Matrice rôles × permissions (5 rôles)
Ajouter à `ROLE_MEMBRE` : `comptable`, `employe`. Étendre `PERMISSIONS` : `depense:manage`, `tresorerie:manage/read`, `rapprochement:manage`, `etats:read`, `exercice:cloturer`, `projet:manage`, `plateforme:admin`.

| Action / Permission | admin | gérant | comptable | caissier | employé |
|---|:--:|:--:|:--:|:--:|:--:|
| Ventes — créer (`vente:create`) | ✅ | ✅ | — | ✅ | ✅ |
| Ventes — annuler (`vente:annuler`) | ✅ | ✅ | — | — | — |
| Ventes — lire (`vente:read`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dépenses (`depense:manage`) | ✅ | ✅ | ✅ | — | — |
| Stock (`stock:manage`) | ✅ | ✅ | — | — | — |
| Stock — lire (`stock:read`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Achats (`achat:manage`) | ✅ | ✅ | ✅ | — | — |
| Factures (`facture:manage`) | ✅ | ✅ | ✅ | — | — |
| Factures — lire (`facture:read`) | ✅ | ✅ | ✅ | ✅ | — |
| Trésorerie (`tresorerie:manage`) | ✅ | ✅ | ✅ | — | — |
| Rapprochement (`rapprochement:manage`) | ✅ | — | ✅ | — | — |
| États & compta (`etats:read`,`compta:read`) | ✅ | ✅ | ✅ | — | — |
| Clôture exercice (`exercice:cloturer`) | ✅ | — | ✅ | — | — |
| Tiers (`tiers:manage`) | ✅ | ✅ | ✅ | — | — |
| Commandes/projets (`commande:manage`) | ✅ | ✅ | — | ✅ | ✅ |
| Paramètres entreprise (`entreprise:manage`) | ✅ | — | — | — | — |
| Employés & rôles (`membre:manage`) | ✅ | — | — | — | — |
| Back-office plateforme (`plateforme:admin`) | —¹ | — | — | — | — |

¹ `plateforme:admin` = flag `utilisateur.est_staff` (staff Impact Tech, control plane) — voir §6. Le **comptable** = lecture compta + saisie financière sans caisse ni gestion des membres ; l'**employé** = caissier restreint. Appliqué via `requirePermission(...)` sur **chaque** route (la route fiscalité n'est pas protégée aujourd'hui) ; nav front filtrée par `peut(role, perm)`. Comptable partenaire externe = une ligne `membre_entreprise` par entreprise consentante. **Phase P0** (protéger routes + comptable), **P1** (employé, partenaire externe).

## 5. Stratégie offline par module
- **File de mutations étendue** : `TypeMutation = 'vente' | 'depense' | 'facture' | 'encaissement' | 'tiers' | 'produit' | 'entree_stock' | 'commande'` (idempotence `client_uuid`).

| Module | Écriture offline | Lecture offline (cache) | Mode dégradé |
|---|---|---|---|
| Ventes/caisse | ✅ (existant) | produits, tiers, comptes | reçu = client_uuid local |
| Dépenses | ✅ | catégories | photo bufferisée → R2 à la synchro |
| Tiers | ✅ | liste | — |
| Produits/stock | ✅ appro & ajustement | catalogue | CMP recalculé serveur à la synchro |
| Factures | ⚠️ brouillon | modèles, tiers | **numéro définitif reporté** (séquence DO) |
| Encaissement facture | ✅ | factures ouvertes | — |
| Rapprochement | — (import réseau) | transactions pointées | lecture seule |
| Commandes | ✅ | liste | — |

- **Cache lecture** : miroir IndexedDB (Dexie) des référentiels peu volatils (produits, tiers, comptes, catégories, terminologie), rafraîchi via `updated_at`/ETag. Payloads légers (D12).
- **Numérotation dégradée** : la séquence gap-less exige la sérialisation par le DO → **pas de n° de facture définitif hors-ligne** (facture reste brouillon local ; à la synchro, `emettreFacture` attribue le n°). Le **reçu de caisse** (non numéroté légalement) reste 100 % offline.
- **Conflits multi-appareils** : la plupart des mutations sont des **inserts idempotents** (pas de conflit) ; pour les **éditions** (tiers, produit, config) → **LWW horodatée** (`updated_at`) + notification en cas d'écrasement. Écritures immuables : on ajoute, on ne modifie pas.
- **Robustesse synchro** : ajouter **backoff exponentiel + plafond de tentatives** (`sync.ts` n'exploite pas `tentatives`) ; au-delà de N, `en_echec` remonté à l'utilisateur.
- **Phase P1** (dépense, encaissement, tiers, produit offline), **P2** (conflits avancés, cache complet).

## 6. Back-office administrateur (plateforme Impact Tech)
L'isolation par DO **interdit** toute requête cross-tenant. Le back-office repose sur une **collecte d'événements** :
1. **Émission** : chaque DO publie, sur opération significative, un événement compact vers une **Cloudflare Queue** (`env.METRIQUES.send({...})`) — jamais de donnée nominative, seulement des agrégats (entreprise_id, type, montant, ts).
2. **Consommation** : un Worker consumer écrit dans **D1** (`metrique_entreprise`) et/ou **Workers Analytics Engine**.
3. **Restitution** : le back-office lit D1/Analytics, **jamais** les DO (sauf support ciblé via le stub).
```sql
CREATE TABLE metrique_entreprise ( entreprise_id TEXT NOT NULL, jour TEXT NOT NULL, nb_ventes INTEGER DEFAULT 0, ca_jour INTEGER DEFAULT 0, nb_factures INTEGER DEFAULT 0, nb_utilisateurs_actifs INTEGER DEFAULT 0, PRIMARY KEY (entreprise_id, jour) );
CREATE TABLE staff_action_log ( id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, action TEXT NOT NULL, entreprise_id TEXT, ts TEXT NOT NULL );
```
- **Gestion des comptes** : suspendre/réactiver (`entreprise.statut` actif/suspendu/supprime), impersonation encadrée (loggée), reset abonnement. **Supervision** : santé des DO (`EntrepriseDO.diagnostic()`), volumétrie, erreurs (Observability). **Accès** : `utilisateur.est_staff=1` + `plateforme:admin`, sur `/admin/**`.
- **Points d'attention** : confidentialité (aucun croisement inter-entreprises), collecte **best-effort** (Queue, ne pas coupler la latence des ventes), RGPD/loi camerounaise (minimiser). **Phase P2.**

## 7. Abonnements & plans (Gratuit / Essentiel / Pro) — control plane D1
```sql
CREATE TABLE plan ( code TEXT PRIMARY KEY CHECK (code IN ('gratuit','essentiel','pro')), prix_mensuel INTEGER NOT NULL, features_json TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1 );
CREATE TABLE abonnement ( id TEXT PRIMARY KEY, entreprise_id TEXT NOT NULL REFERENCES entreprise(id), plan_code TEXT NOT NULL REFERENCES plan(code), statut TEXT NOT NULL CHECK (statut IN ('essai','actif','suspendu','expire','annule')), debut TEXT NOT NULL, fin_periode TEXT NOT NULL, essai_fin TEXT, renouvellement_auto INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL );
CREATE TABLE paiement_abonnement ( id TEXT PRIMARY KEY, abonnement_id TEXT NOT NULL REFERENCES abonnement(id), montant INTEGER NOT NULL, canal TEXT NOT NULL CHECK (canal IN ('mtn_momo','orange_money','wave','manuel')), reference_operateur TEXT, statut TEXT NOT NULL CHECK (statut IN ('en_attente','confirme','echec')), paye_le TEXT );
```
- **Deux couches de gating indépendantes** : `requireModule('stock')` (secteur, existant) **et** `requirePlan('pro')` (nouveau middleware, lit `abonnement` D1, caché en session). Matrice indicative : Gratuit = 1 utilisateur, caisse+compta, quota 50 factures/mois ; Essentiel = multi-utilisateurs, factures illimitées, dépenses ; Pro = rapprochement, récurrent/relances, multi-boutiques, projets, IA.
- **Quotas** : compteurs mensuels D1 ; middleware renvoie `PLAN_REQUIS` (402) au dépassement.
- **Paiement mobile money de l'abonnement** : **réserve réglementaire** (aucune commission avant sécurisation) ; MVP = paiement manuel validé par le staff. **Phase P2.**

## 8. Intégrations externes
- **Mobile Money — 3 usages** : (1) *encaissement direct* (compte de trésorerie + webhook de confirmation) ; (2) *lien « Payer maintenant »* sur facture (URL opérateur + webhook → `payerFacture` ; table `lien_paiement`) ; (3) *import des transactions* → `transaction_importee` (§1.2). Webhooks sur `/webhooks/momo`, signature vérifiée, idempotents.
- **WhatsApp Business API** : envoi du **PDF** (aujourd'hui simple `wa.me`). PDF en **R2** → URL signée temporaire → message template + media. Secrets via `wrangler secret`.
- **SMS** : API locale pour relances/échéances, déclenchée par `notification`.
- **Export FEC / DSF** : FEC-like = export du livre-journal (CSV/TXT) ; DSF = agrégation annuelle à la clôture (P3). Route `GET /api/exports/fec?exercice=...`, stocké en R2.
- **Points d'attention** : secrets via `wrangler secret` ; webhooks = surface d'attaque (signature + idempotence obligatoires) ; commission MoMo bloquée réglementairement ; FEC/DSF ⚖️ ONECCA/DGI. **Phase P2** (WhatsApp PDF, lien paiement, SMS, FEC), **P3** (DSF, connecteur DGI).

## 9. Sécurité & non-fonctionnel
- **CORS restreint** (audit 🔴) : remplacer `cors({ origin: (o) => o })` (reflète toute origine) par une **allow-list** : `cors({ origin: (o) => ORIGINES_AUTORISEES.includes(o) ? o : '', credentials: true })`.
- **Rate limiting** (🟠) : au minimum `/api/auth/**` (DO compteur par IP ou Cloudflare Rate Limiting) → `429`.
- **Validation Zod par entité** (🟠) : schémas partagés `@kombi/shared` (montants entiers ≥ 0, `taux_tva ∈ {0,0.1925}`, dates ISO, énumérations) ; middleware `validerBody(schema)` sur chaque write.
- **Audit log** : §1.17.
- **Chiffrement** : TLS 1.3 natif ; au repos chiffré par Cloudflare ; chiffrement applicatif pour données très sensibles (coordonnées bancaires) ; MFA obligatoire comptes Pro (better-auth).
- **Sauvegarde / RGPD** (⚪) : les DO **n'ont pas** de backup auto → job d'export périodique (Cron) sérialisant chaque DO → **R2** ; restauration testée ; export RGPD par entreprise ; suppression = tombstone + purge différée (sauf pièces légales).
- **i18n (FR/EN)** : clés + FR par défaut, EN pour le Cameroun anglophone.
- **Performance / coût** : *point chaud D1* (control plane lu à chaque requête) → **cache session** (rôle + entreprises) en KV/Cache API/cookie, TTL court, invalidé au changement de rôle ; référentiels (barème IGS, plan) en **KV/Cache** ; pagination systématique ; writes DO sérialisés **par entreprise** (atout scale D13) ; archivage des exercices clos en R2.
- **Versioning du schéma DO** (🔴, **prérequis de tout §1**) : aujourd'hui `statementsSchema()` en `IF NOT EXISTS` sans migration. Introduire une table `schema_version` + runner ordonné :
```ts
const MIGRATIONS_DO = [ {v:1, sql:[...]}, {v:2, sql:['ALTER TABLE produit ADD COLUMN categorie_id ...']} ];
// au démarrage (blockConcurrencyWhile) : lire schema_version, appliquer les migrations > version, mettre à jour la version
```
Migrations **idempotentes et ordonnées** (milliers de DO migrés paresseusement à leur réveil) ; `ALTER TABLE` SQLite limité (parfois recréer/copier). Le cache session ne doit jamais servir un rôle périmé (invalidation explicite). **Phase P0** (CORS, rate limiting, Zod, versioning DO), **P1** (cache session, backup DO, i18n), **P2** (MFA Pro, RGPD complet).

## 10. Surface d'API par module
Convention : `authentifier` + `tenant` + `requireModule(...)` + `requirePermission(...)` + `validerBody(...)`. En-tête `x-entreprise-id`. **Existant** : `/api/auth/**`, `/api/entreprises`, `/api/fiscalite/**`, `/api/ventes/**`, `/api/produits/**`, `/api/tiers/**`, `/api/factures/**`, `/api/commandes/**`, `/api/etats/**`.

| Module | Route | Permission | Gate module |
|---|---|---|---|
| Membres | `POST /api/membres`, `PATCH /api/membres/:id`, `GET /api/membres` | `membre:manage` | — |
| Tiers | `GET/POST /api/tiers`, `GET/PATCH /api/tiers/:id`, `/:id/historique`, `/:id/solde` | `tiers:read`/`manage` | tiers |
| Ventes | `POST /api/ventes`, `GET /api/ventes[/jour]`, `POST /api/ventes/:id/annuler` | `vente:*` | ventes |
| Produits/stock | `GET/POST /api/produits`, `PATCH /:id`, `POST /:id/entree`, `/:id/ajustement`, `GET /:id/mouvements` | `stock:*` | stock |
| Entrepôts | `GET/POST /api/entrepots`, `POST /api/transferts` | `stock:manage` | stock |
| Achats | `GET/POST /api/achats/commandes`, `POST /api/achats/commandes/:id/reception` | `achat:manage` | achats |
| Dépenses | `GET/POST /api/depenses`, `GET/POST /api/categories-depense` | `depense:manage` | comptabilite |
| Trésorerie | `GET/POST /api/tresorerie/comptes`, `POST /api/tresorerie/virements`, `GET /api/tresorerie/mouvements` | `tresorerie:*` | comptabilite |
| Rapprochement | `POST /api/rapprochement/import`, `GET /a-pointer`, `POST /pointer`, `GET/POST /regles` | `rapprochement:manage` | comptabilite |
| Factures | `GET/POST /api/factures`, `GET /:id`, `POST /:id/emettre|payer|avoir`, `POST /api/devis/:id/convertir`, `GET /:id/pdf`, `POST /:id/envoyer`, `GET/POST /api/factures-recurrentes` | `facture:*` | facturation |
| Commandes/projets | `GET/POST /api/commandes`, `PATCH /:id/statut`, `GET/POST /api/projets`, `/:id/taches` | `commande:*` | commandes |
| Retours | `POST /api/retours/client`, `/fournisseur` | `facture/achat:manage` | facturation/achats |
| États | `GET /api/etats/resultat|bilan|balance|grand-livre|journal` | `etats:read` | comptabilite |
| Exercices | `GET /api/exercices`, `POST /:id/cloturer` | `exercice:cloturer` | comptabilite |
| Fiscalité | `GET /api/fiscalite/igs|tva` | `compta:read` | fiscalite |
| Paramètres doc | `GET/PUT /api/parametres-document` | `entreprise:manage` | — |
| Dashboard | `GET /api/dashboard`, `PUT /api/dashboard/config` | `vente:read` | — |
| Abonnement | `GET /api/abonnement`, `POST /api/abonnement/payer` | `entreprise:manage` | — |
| Exports | `GET /api/exports/fec|dsf` | `etats:read` | comptabilite |
| Webhooks | `POST /webhooks/momo|whatsapp` | (signature, hors auth) | — |
| Back-office | `GET /admin/entreprises|metriques`, `POST /admin/entreprises/:id/suspendre` | `plateforme:admin` | — |

Chaque write DOIT chaîner `requirePermission` + `validerBody` (aujourd'hui incomplet) ; webhooks hors `authentifier`/`tenant` (signature) ; back-office gardé par `est_staff`. **Phase P0** (protéger l'existant : permission fiscalité/etats, Zod), **P1** (dépenses, trésorerie, retours, membres), **P2** (rapprochement, récurrentes, abonnement, exports, webhooks, back-office).

---

# Annexe A — Points à valider par l'ONECCA (avant « la compta est juste »)
1. Sous-comptes Mobile Money (551/552/553/554) et rôle du **585** (transit).
2. Traitement des écarts de rapprochement et d'inventaire (47 / 603x / 658-758).
3. Comptes RRR, escomptes (773/673), frais MoMo (6312).
4. Regroupement **8xx** à la clôture (SMT vs Normal) ; forme de l'écriture d'à-nouveau de reprise.
5. Base du **CAC sur l'IGS** ; périodicité et forme de la **liquidation TVA**.
6. Base du **minimum de perception IS** ; périmètre des réintégrations/déductions ; liste des secteurs « toujours au Réel ».
7. Structure **FEC** et **DSF** attendues par la DGI camerounaise ; mentions minimales d'un reçu de caisse vs facture normalisée.
8. Choix **CMP vs PEPS** pour les entités au SMT.

# Annexe B — Priorités P0 (fondations bloquantes)
1. **Versioning du schéma DO** (§III-9) — *prérequis technique de tout le reste du modèle de données.*
2. **Cycle de vie des exercices** (§III-2) — création auto N+1 + `exercicePourDate` + `caCumule` filtré.
3. **Immuabilité & atomicité** (§III-3) — triggers UPDATE/DELETE + `transactionSync`.
4. **Écran/entité Dépenses** (§I-7.2, §III-1.6) + charges au plan comptable — résultat sincère.
5. **Rôles étendus + protection des routes** (§III-4) — rôle comptable, `requirePermission` partout (fiscalité incluse), nav filtrée.
6. **Sécurité** (§III-9) — CORS allow-list, rate limiting auth, validation Zod.
7. **`audit_log` immuable** (§III-1.17) — exigence NFR + traçabilité.
8. **Caisse — corrections bloquantes** (§I-9.1) — quantité éditable, vente à crédit (411), client, remise, reçu, TVA conditionnée.

---
*Document vivant. Sources : audits 360° (technique, dirigeant PME, expert-comptable), code réel du dépôt, `docs/reference/` (règles fiscales citées), cahier des charges (`docs/_sources/cdc.txt`).*
